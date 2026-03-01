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
)

func main() {
	cfg := config.Load()

	logger := log.New(os.Stdout, "[cloudterm] ", log.LstdFlags|log.Lshortfile)

	// Initialize AWS discovery service
	discovery := aws.NewDiscovery(cfg, logger)

	// Initialize session manager
	sessionMgr := session.NewManager(logger)

	// Initialize audit logger
	auditLogger := audit.NewLogger(cfg.AuditLogFile)

	// Initialize HTTP/WS handler
	handler := handlers.New(cfg, discovery, sessionMgr, logger, auditLogger)

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
	cancel() // stop background scanner

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Printf("Shutdown error: %v", err)
	}
	logger.Println("Server stopped")
}
