package k8s

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// newHTTPClient creates an HTTP client with custom timeouts suitable for slow K8s clusters
func newHTTPClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Dial: (&net.Dialer{
				Timeout:   60 * time.Second,
				KeepAlive: 30 * time.Second,
			}).Dial,
			TLSHandshakeTimeout: 60 * time.Second,
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
		},
	}
}

// ClusterConnection holds a Kubernetes client and its metadata.
type ClusterConnection struct {
	Client    *kubernetes.Clientset
	RestCfg   *rest.Config
	AccountID string
	Region    string
	Cluster   string
	CreatedAt time.Time
}

// TokenRefresher generates a fresh bearer token for a cluster.
type TokenRefresher func(accountID, region, clusterName string) (string, error)

// ClientPool manages cached Kubernetes client connections keyed by cluster.
type ClientPool struct {
	clients  map[string]*ClusterConnection
	mu       sync.RWMutex
	logger   *log.Logger
	refreshr TokenRefresher
	stopCh   chan struct{}
}

func NewClientPool(logger *log.Logger, refresher TokenRefresher) *ClientPool {
	p := &ClientPool{
		clients:  make(map[string]*ClusterConnection),
		logger:   logger,
		refreshr: refresher,
		stopCh:   make(chan struct{}),
	}
	go p.tokenRefreshLoop()
	return p
}

func poolKey(accountID, region, cluster string) string {
	return fmt.Sprintf("%s:%s:%s", accountID, region, cluster)
}

// Connect creates or returns a cached Kubernetes clientset for the given cluster.
func (p *ClientPool) Connect(accountID, region, cluster, endpoint, token, caCertB64 string) (*ClusterConnection, error) {
	key := poolKey(accountID, region, cluster)

	p.mu.RLock()
	if conn, ok := p.clients[key]; ok {
		p.mu.RUnlock()
		return conn, nil
	}
	p.mu.RUnlock()

	caData, err := base64.StdEncoding.DecodeString(caCertB64)
	if err != nil {
		return nil, fmt.Errorf("decode CA cert: %w", err)
	}

	// Create custom transport with longer timeouts for slow K8s clusters
	tlsConfig := &tls.Config{
		InsecureSkipVerify: len(caData) == 0,
	}
	if len(caData) > 0 {
		if caCertPool, err := x509.SystemCertPool(); err == nil {
			caCertPool.AppendCertsFromPEM(caData)
			tlsConfig.RootCAs = caCertPool
		}
	}

	transport := &http.Transport{
		Dial: (&net.Dialer{
			Timeout:   60 * time.Second,
			KeepAlive: 30 * time.Second,
		}).Dial,
		TLSClientConfig:     tlsConfig,
		TLSHandshakeTimeout: 60 * time.Second,
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
	}

	cfg := &rest.Config{
		Host:        endpoint,
		BearerToken: token,
		Transport:   transport,
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}

	conn := &ClusterConnection{
		Client:    clientset,
		RestCfg:   cfg,
		AccountID: accountID,
		Region:    region,
		Cluster:   cluster,
		CreatedAt: time.Now(),
	}

	p.mu.Lock()
	p.clients[key] = conn
	p.mu.Unlock()

	p.logger.Printf("K8s: connected to %s (%s/%s)", cluster, accountID, region)
	return conn, nil
}

// Get returns a cached connection if it exists.
func (p *ClientPool) Get(accountID, region, cluster string) (*ClusterConnection, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	conn, ok := p.clients[poolKey(accountID, region, cluster)]
	return conn, ok
}

// Disconnect removes a cluster connection from the pool.
func (p *ClientPool) Disconnect(accountID, region, cluster string) {
	key := poolKey(accountID, region, cluster)
	p.mu.Lock()
	delete(p.clients, key)
	p.mu.Unlock()
	p.logger.Printf("K8s: disconnected from %s", cluster)
}

// Stop shuts down the token refresh loop.
func (p *ClientPool) Stop() {
	close(p.stopCh)
}

// tokenRefreshLoop refreshes bearer tokens every 10 minutes for all active connections.
func (p *ClientPool) tokenRefreshLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.refreshAllTokens()
		}
	}
}

func (p *ClientPool) refreshAllTokens() {
	p.mu.RLock()
	keys := make([]string, 0, len(p.clients))
	conns := make([]*ClusterConnection, 0, len(p.clients))
	for k, c := range p.clients {
		keys = append(keys, k)
		conns = append(conns, c)
	}
	p.mu.RUnlock()

	for i, conn := range conns {
		token, err := p.refreshr(conn.AccountID, conn.Region, conn.Cluster)
		if err != nil {
			p.logger.Printf("WARN: token refresh for %s: %v", keys[i], err)
			continue
		}
		p.mu.Lock()
		if c, ok := p.clients[keys[i]]; ok {
			c.RestCfg.BearerToken = token
		}
		p.mu.Unlock()
	}
}
