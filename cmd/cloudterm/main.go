package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"path/filepath"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/auth"
	"cloudterm-go/internal/aws"
	"cloudterm-go/internal/config"
	"cloudterm-go/internal/handlers"
	"cloudterm-go/internal/license"
	"cloudterm-go/internal/session"
	"cloudterm-go/internal/suggest"
	"cloudterm-go/internal/vault"
)

func main() {
	cfg := config.Load()

	logger := log.New(os.Stdout, "[cloudterm] ", log.LstdFlags|log.Lshortfile)

	// Ensure data directories exist.
	for _, dir := range []string{cfg.SessionRecordingDir, cfg.TerminalExportDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			logger.Printf("warning: failed to create directory %s: %v", dir, err)
		}
	}

	// Initialize AWS discovery service
	discovery := aws.NewDiscovery(cfg, logger)

	// Initialize session manager
	sessionMgr := session.NewManager(logger, cfg.SessionRecordingDir, cfg.AutoRecord)

	// Initialize audit logger
	auditLogger := audit.NewLogger(cfg.AuditLogFile)

	// Initialize AWS account store
	accountStore := aws.NewAccountStore(cfg.AWSAccountsFile)
	discovery.SetAccountStore(accountStore)

	var encKey []byte
	if cfg.SuggestEncryptionKey != "" {
		encKey = []byte(cfg.SuggestEncryptionKey)
		if len(encKey) < 32 {
			padded := make([]byte, 32)
			copy(padded, encKey)
			encKey = padded
		} else if len(encKey) > 32 {
			encKey = encKey[:32]
		}
	}
	suggestEngine, err := suggest.New(suggest.Config{
		Enabled:       cfg.SuggestEnabled,
		DataDir:       cfg.SuggestDataDir,
		EncryptionKey: encKey,
	})
	if err != nil {
		logger.Printf("warning: suggest engine init failed: %v", err)
	}

	vaultStore, err := vault.Open(cfg.SuggestDataDir, encKey)
	if err != nil {
		logger.Printf("warning: vault init failed: %v", err)
	}

	handler := handlers.New(cfg, discovery, sessionMgr, logger, auditLogger, accountStore, suggestEngine, vaultStore)
	assumer := aws.NewAssumer(cfg.ExternalID)
	discovery.SetAssumer(assumer)
	if cfg.AWSAccessMode == "hub" {
		assumer.UseHub(cfg.HubProfile)
		logger.Printf("AWS access: hub mode. ~/.aws is not read; accounts are reached through CloudTermAccess roles")
	}

	secret, err := auth.LoadSecret(cfg.AuthSecret, filepath.Join(cfg.DataDir, "auth.key"))
	if err != nil {
		logger.Fatalf("auth secret: %v", err)
	}
	opts := auth.Options{
		MaxAge: time.Duration(cfg.SessionMaxHours) * time.Hour,
		Idle:   time.Duration(cfg.SessionIdleMinutes) * time.Minute,
	}
	var idents *auth.Service
	var authErr error
	if cfg.DatabaseURL != "" {
		idents, authErr = auth.OpenPostgres(context.Background(), cfg.DatabaseURL, secret, opts)
	} else {
		idents, authErr = auth.Open(filepath.Join(cfg.DataDir, "users.json"), secret, opts)
	}
	if authErr != nil {
		logger.Fatalf("auth init failed: %v", authErr)
	}
	if idents.InitialAdminPassword != "" {
		logger.Printf("Break-glass admin created: admin@local / %s  (shown once; set CLOUDTERM_ADMIN_PASSWORD to choose it)", idents.InitialAdminPassword)
	}
	idps, err := loadIdentityProviders(cfg)
	if err != nil {
		logger.Fatalf("sign-in providers: %v", err)
	}
	for _, p := range idps.Providers() {
		logger.Printf("Sign-in provider: %s (%s, id %s)", p.Label, strings.ToUpper(p.Type), p.ID)
	}
	for _, w := range cfg.Warnings {
		logger.Printf("warning: %s", w)
	}
	if idps.Enabled() {
		if !strings.HasPrefix(cfg.PublicURL, "https://") {
			for _, p := range idps.Providers() {
				if p.Type == "saml" {
					logger.Printf("warning: provider %s speaks SAML but PUBLIC_URL is not https; the browser-binding cookie is skipped and assertions cross the network in the clear", p.ID)
					break
				}
			}
		}
		if len(cfg.TrustedProxies) == 0 && strings.HasPrefix(cfg.PublicURL, "https://") {
			logger.Printf("note: TRUSTED_PROXIES is unset, so X-Forwarded-* headers are honored from any peer; set it to the proxy address before exposing the port directly")
		}
		logger.Printf("note: SAML pending requests and session state live in this process; run one replica or use sticky sessions")
	}
	handler.SetIdentity(idents, idps)
	if cfg.RequireAuth {
		logger.Printf("Sign-in required for every route")
	} else {
		logger.Printf("warning: REQUIRE_AUTH=false; anyone who can reach this port can use it")
	}
	lic := &license.Client{}
	if pub, err := license.ParsePublicKey(cfg.LicensePublicKey); err == nil {
		lic.SetPublicKey(pub)
	}
	_ = lic.Load(filepath.Join(cfg.DataDir, "entitlement.json"))
	handler.SetLicense(lic)

	// Start background scanner and the license heartbeat.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pollLicense(ctx, cfg, lic, logger, sessionMgr.OpenCount)
	go discovery.BackgroundScanLoop(ctx)

	// Build HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      handler.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // WebSocket needs no write timeout
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Printf("Starting CloudTerm on :%d (RDP mode: %s)", cfg.Port, cfg.RDPMode)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	logger.Println("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	sessionMgr.CloseAll()
	if suggestEngine != nil {
		suggestEngine.Close()
	}
	if vaultStore != nil {
		vaultStore.Close()
	}
	cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Printf("Shutdown error: %v", err)
	}
	logger.Println("Server stopped")
}

func pollLicense(ctx context.Context, cfg *config.Config, lic *license.Client, logger *log.Logger, openSessions func() int) {
	if cfg.LicenseControllerURL == "" || cfg.LicenseKey == "" {
		return
	}
	cachePath := filepath.Join(cfg.DataDir, "entitlement.json")
	once := func() {
		body, _ := json.Marshal(map[string]any{
			"license_key":   cfg.LicenseKey,
			"deployment_id": cfg.DeploymentID,
			"version":       cfg.Version,
			"seats":         cfg.SeatCount,
			"open_sessions": openSessions(),
		})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.LicenseControllerURL+"/v1/heartbeat", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			logger.Printf("license heartbeat: %v", err)
			return
		}
		defer resp.Body.Close()
		var parsed struct {
			Entitlement license.Entitlement `json:"entitlement"`
			Signature   string              `json:"signature"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
			logger.Printf("license decode: %v", err)
			return
		}
		if lic.HasPublicKey() {
			if err := lic.StoreSigned(parsed.Signature); err != nil {
				logger.Printf("license signature: %v", err)
				return
			}
		} else {
			lic.Store(parsed.Entitlement)
		}
		if err := lic.Save(cachePath); err != nil {
			logger.Printf("license cache: %v", err)
		}
	}
	once()
	tick := time.NewTicker(15 * time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			once()
		}
	}
}

// loadIdentityProviders reads SSO_PROVIDERS_FILE (default DATA_DIR/sso-providers.json)
// and keeps the single-provider OIDC_* variables working as provider "oidc".
func loadIdentityProviders(cfg *config.Config) (*auth.Registry, error) {
	path := cfg.SSOProvidersFile
	if path == "" {
		path = filepath.Join(cfg.DataDir, "sso-providers.json")
	}
	providers, err := auth.LoadProviders(path)
	if err != nil {
		return nil, err
	}
	if cfg.OIDCIssuer != "" && cfg.OIDCClientID != "" {
		verified := cfg.OIDCRequireVerified
		providers = append(providers, auth.ProviderConfig{
			ID: "oidc", Type: "oidc", Label: cfg.OIDCLabel,
			Issuer: cfg.OIDCIssuer, ClientID: cfg.OIDCClientID, ClientSecret: cfg.OIDCClientSecret,
			RedirectURL:     cfg.OIDCRedirectURL,
			GroupsAttribute: cfg.OIDCGroupsClaim,
			AllowedDomains:  cfg.OIDCAllowedDomains,
			AdminGroups:     cfg.OIDCAdminGroups, OperatorGroups: cfg.OIDCOperatorGroups, ViewerGroups: cfg.OIDCViewerGroups,
			DefaultRole:          auth.Role(cfg.OIDCDefaultRole),
			RequireEmailVerified: &verified,
		})
	}
	return auth.NewRegistry(providers, auth.RegistryOptions{PublicURL: cfg.PublicURL, DataDir: cfg.DataDir})
}
