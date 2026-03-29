package k8s

import (
	"context"
	"fmt"
	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
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
func Categories(client *kubernetes.Clientset) ([]ResourceCategory, error) {
	disc := client.Discovery()
	_, apiResources, err := disc.ServerGroupsAndResources()
	
	// If discovery fails or times out, use a hardcoded fallback list
	if err != nil {
		if !discovery.IsGroupDiscoveryFailedError(err) {
			return fallbackCategories(), nil
		}
		return nil, fmt.Errorf("discover resources: %w", err)
	}

	grouped := make(map[string][]ResourceType)
	seen := make(map[string]bool)

	for _, list := range apiResources {
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range list.APIResources {
			// Skip subresources (e.g., pods/log, pods/exec)
			if strings.Contains(r.Name, "/") {
				continue
			}
			key := gv.Group + "/" + r.Name
			if seen[key] {
				continue
			}
			seen[key] = true

			cat := categorize(gv.Group, r.Kind)
			grouped[cat] = append(grouped[cat], ResourceType{
				Name:       r.Name,
				Kind:       r.Kind,
				Group:      gv.Group,
				Version:    gv.Version,
				Namespaced: r.Namespaced,
			})
		}
	}

	order := []string{"Workloads", "Network", "Config & Storage", "RBAC", "Custom Resources", "Other"}
	var categories []ResourceCategory
	for _, name := range order {
		if res, ok := grouped[name]; ok {
			sort.Slice(res, func(i, j int) bool { return res[i].Kind < res[j].Kind })
			categories = append(categories, ResourceCategory{Name: name, Resources: res})
		}
	}
	return categories, nil
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

func categorize(group, kind string) string {
	switch {
	case group == "" && inList(kind, "Pod", "ReplicationController"):
		return "Workloads"
	case group == "apps" || group == "batch":
		return "Workloads"
	case group == "" && inList(kind, "Service", "Endpoints"):
		return "Network"
	case group == "networking.k8s.io" || group == "discovery.k8s.io":
		return "Network"
	case group == "" && inList(kind, "ConfigMap", "Secret", "PersistentVolumeClaim", "PersistentVolume"):
		return "Config & Storage"
	case group == "storage.k8s.io":
		return "Config & Storage"
	case group == "rbac.authorization.k8s.io" || group == "" && inList(kind, "ServiceAccount"):
		return "RBAC"
	case group == "" && inList(kind, "Namespace", "Node", "Event"):
		return "Other"
	case strings.Contains(group, "."):
		// CRDs have dotted group names
		return "Custom Resources"
	default:
		return "Other"
	}
}

func inList(s string, list ...string) bool {
	for _, v := range list {
		if s == v {
			return true
		}
	}
	return false
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
