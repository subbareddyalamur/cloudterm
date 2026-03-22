package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/aws"
	"cloudterm-go/internal/config"
	"cloudterm-go/internal/handlers"
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

	// Start background scanner
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
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
