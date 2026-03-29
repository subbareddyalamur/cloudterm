package k8s

import metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

// EKSClusterInfo holds cluster endpoint and CA data for connecting.
type EKSClusterInfo struct {
	Endpoint string
	CACert   string
}

// ListOpts returns default list options.
func ListOpts() metav1.ListOptions {
	return metav1.ListOptions{}
}
