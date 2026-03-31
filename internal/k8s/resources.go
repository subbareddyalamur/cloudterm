package k8s

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// ResourceCategory groups K8s resource types for the sidebar tree.
type ResourceCategory struct {
	Name      string         `json:"name"`
	Resources []ResourceType `json:"resources"`
}

// ResourceType describes a single K8s API resource.
type ResourceType struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Group      string `json:"group"`
	Version    string `json:"version"`
	Namespaced bool   `json:"namespaced"`
}

// ResourceItem is a single resource instance.
type ResourceItem struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Kind      string            `json:"kind"`
	Status    string            `json:"status,omitempty"`
	Age       string            `json:"age,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// Categories returns all K8s resource types organized by category.
// Uses a hardcoded fallback list because ServerGroupsAndResources() can hang
// indefinitely on slow or overloaded clusters.
func Categories(client *kubernetes.Clientset) ([]ResourceCategory, error) {
	// Skip actual discovery - just return the hardcoded fallback
	// This ensures the UI is always responsive
	return fallbackCategories(), nil
}

// ListResourcesDynamic lists resources using the dynamic client.
func ListResourcesDynamic(dynClient dynamic.Interface, group, version, resource, namespace string, limit int64) ([]unstructured.Unstructured, error) {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	opts := metav1.ListOptions{}
	if limit > 0 {
		opts.Limit = limit
	}

	var list *unstructured.UnstructuredList
	var err error
	if namespace != "" {
		list, err = dynClient.Resource(gvr).Namespace(namespace).List(context.TODO(), opts)
	} else {
		list, err = dynClient.Resource(gvr).List(context.TODO(), opts)
	}
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetResourceYAML returns the full resource definition.
func GetResourceYAML(dynClient dynamic.Interface, group, version, resource, namespace, name string) (*unstructured.Unstructured, error) {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	if namespace != "" {
		return dynClient.Resource(gvr).Namespace(namespace).Get(context.TODO(), name, metav1.GetOptions{})
	}
	return dynClient.Resource(gvr).Get(context.TODO(), name, metav1.GetOptions{})
}

// fallbackCategories returns a hardcoded list of common K8s resource types
// when discovery API fails or times out.
func fallbackCategories() []ResourceCategory {
	return []ResourceCategory{
		{
			Name: "Workloads",
			Resources: []ResourceType{
				{Name: "pods", Kind: "Pod", Group: "", Version: "v1", Namespaced: true},
				{Name: "deployments", Kind: "Deployment", Group: "apps", Version: "v1", Namespaced: true},
				{Name: "statefulsets", Kind: "StatefulSet", Group: "apps", Version: "v1", Namespaced: true},
				{Name: "daemonsets", Kind: "DaemonSet", Group: "apps", Version: "v1", Namespaced: true},
				{Name: "jobs", Kind: "Job", Group: "batch", Version: "v1", Namespaced: true},
				{Name: "cronjobs", Kind: "CronJob", Group: "batch", Version: "v1", Namespaced: true},
			},
		},
		{
			Name: "Network",
			Resources: []ResourceType{
				{Name: "services", Kind: "Service", Group: "", Version: "v1", Namespaced: true},
				{Name: "ingresses", Kind: "Ingress", Group: "networking.k8s.io", Version: "v1", Namespaced: true},
				{Name: "networkpolicies", Kind: "NetworkPolicy", Group: "networking.k8s.io", Version: "v1", Namespaced: true},
			},
		},
		{
			Name: "Config & Storage",
			Resources: []ResourceType{
				{Name: "configmaps", Kind: "ConfigMap", Group: "", Version: "v1", Namespaced: true},
				{Name: "secrets", Kind: "Secret", Group: "", Version: "v1", Namespaced: true},
				{Name: "persistentvolumeclaims", Kind: "PersistentVolumeClaim", Group: "", Version: "v1", Namespaced: true},
				{Name: "persistentvolumes", Kind: "PersistentVolume", Group: "", Version: "v1", Namespaced: false},
				{Name: "storageclasses", Kind: "StorageClass", Group: "storage.k8s.io", Version: "v1", Namespaced: false},
			},
		},
		{
			Name: "RBAC",
			Resources: []ResourceType{
				{Name: "serviceaccounts", Kind: "ServiceAccount", Group: "", Version: "v1", Namespaced: true},
				{Name: "roles", Kind: "Role", Group: "rbac.authorization.k8s.io", Version: "v1", Namespaced: true},
				{Name: "rolebindings", Kind: "RoleBinding", Group: "rbac.authorization.k8s.io", Version: "v1", Namespaced: true},
				{Name: "clusterroles", Kind: "ClusterRole", Group: "rbac.authorization.k8s.io", Version: "v1", Namespaced: false},
				{Name: "clusterrolebindings", Kind: "ClusterRoleBinding", Group: "rbac.authorization.k8s.io", Version: "v1", Namespaced: false},
			},
		},
		{
			Name: "Other",
			Resources: []ResourceType{
				{Name: "namespaces", Kind: "Namespace", Group: "", Version: "v1", Namespaced: false},
				{Name: "nodes", Kind: "Node", Group: "", Version: "v1", Namespaced: false},
				{Name: "events", Kind: "Event", Group: "", Version: "v1", Namespaced: true},
			},
		},
	}
}
