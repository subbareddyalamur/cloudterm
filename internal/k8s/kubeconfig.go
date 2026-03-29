package k8s

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"time"

	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// KubeconfigCluster represents a cluster from a kubeconfig file
type KubeconfigCluster struct {
	Name                 string `json:"name"`
	Server               string `json:"server"`
	CertificateAuthority string `json:"certificateAuthority,omitempty"`
}

// ExtractClustersFromKubeconfig parses a kubeconfig and returns available clusters
func ExtractClustersFromKubeconfig(config *clientcmdapi.Config) []KubeconfigCluster {
	var clusters []KubeconfigCluster
	for name, cluster := range config.Clusters {
		kc := KubeconfigCluster{
			Name:   name,
			Server: cluster.Server,
		}
		if len(cluster.CertificateAuthorityData) > 0 {
			kc.CertificateAuthority = base64.StdEncoding.EncodeToString(cluster.CertificateAuthorityData)
		}
		clusters = append(clusters, kc)
	}
	return clusters
}

// ConnectWithKubeconfig creates a K8s client using kubeconfig data
func ConnectWithKubeconfig(server, token, caDataB64 string) (*kubernetes.Clientset, error) {
	var caData []byte
	var err error
	if caDataB64 != "" {
		caData, err = base64.StdEncoding.DecodeString(caDataB64)
		if err != nil {
			return nil, fmt.Errorf("decode CA cert: %w", err)
		}
	}

	// Create custom transport with longer timeouts for slow/remote clusters
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
		Host:      server,
		BearerToken: token,
		Transport: transport,
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}

	return clientset, nil
}
