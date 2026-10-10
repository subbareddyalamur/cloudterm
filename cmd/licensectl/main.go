package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"cloudterm-go/internal/license"
)

func main() {
	addr := flag.String("addr", ":8090", "listen address")
	path := flag.String("file", "licenses.json", "license store")
	flag.Parse()

	ctrl, err := license.NewController(*path, []byte(os.Getenv("LICENSE_SEED")))
	if err != nil {
		log.Fatal(err)
	}
	ctrl.SetAllowInternal(os.Getenv("LICENSE_ALLOW_INTERNAL") == "true")

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			LicenseKey   string `json:"license_key"`
			DeploymentID string `json:"deployment_id"`
			Version      string `json:"version"`
			Seats        int    `json:"seats"`
			OpenSessions int    `json:"open_sessions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		ent, sig, err := ctrl.Heartbeat(body.LicenseKey, body.DeploymentID, body.Seats)
		if err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		writeJSON(w, map[string]any{"entitlement": ent, "signature": sig})
	})
	mux.HandleFunc("POST /v1/redeem", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			LicenseKey string `json:"license_key"`
			Code       string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := ctrl.Redeem(body.LicenseKey, body.Code); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]string{"status": "redeemed"})
	})
	adminToken := os.Getenv("LICENSE_ADMIN_TOKEN")
	if len(adminToken) < 24 {
		log.Fatal("LICENSE_ADMIN_TOKEN must be set (24+ characters); it protects /v1/issue")
	}
	mux.HandleFunc("POST /v1/issue", func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !hmac.Equal([]byte(got), []byte(adminToken)) {
			http.Error(w, "admin token required", http.StatusUnauthorized)
			return
		}
		var body struct {
			DeploymentID string `json:"deployment_id"`
			Plan         string `json:"plan"`
			Days         int    `json:"days"`
			Seats        int    `json:"seats"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Days == 0 {
			body.Days = 30
		}
		if body.Seats == 0 {
			body.Seats = 5
		}
		if body.Plan == "" {
			body.Plan = "lab"
		}
		rec, err := ctrl.Issue(body.DeploymentID, body.Plan, body.Days, body.Seats)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, rec)
	})
	mux.HandleFunc("GET /v1/public-key", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"public_key": ctrl.PublicKeyB64()})
	})
	mux.HandleFunc("POST /v1/stripe", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		secret := os.Getenv("STRIPE_WEBHOOK_SECRET")
		if secret == "" || !validStripeSignature(secret, r.Header.Get("Stripe-Signature"), body) {
			http.Error(w, "invalid stripe signature", http.StatusUnauthorized)
			return
		}
		var event struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		}
		if err := json.Unmarshal(body, &event); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Printf("stripe %s %s", event.Type, event.ID)
		writeJSON(w, map[string]string{"received": event.ID})
	})

	log.Printf("license controller on %s", *addr)
	log.Printf("deployments verify entitlements with LICENSE_PUBLIC_KEY=%s", ctrl.PublicKeyB64())
	if os.Getenv("LICENSE_SEED") == "" {
		log.Printf("warning: LICENSE_SEED is unset; the signing key is a fixed development key")
	}
	log.Fatal(http.ListenAndServe(*addr, mux))
}

func validStripeSignature(secret, header string, body []byte) bool {
	var ts, sig string
	for _, part := range strings.Split(header, ",") {
		k, v, ok := strings.Cut(part, "=")
		if !ok {
			continue
		}
		switch k {
		case "t":
			ts = v
		case "v1":
			sig = v
		}
	}
	if ts == "" || sig == "" {
		return false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || time.Since(time.Unix(sec, 0)) > 5*time.Minute {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(ts + "." + string(body)))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sig))
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
