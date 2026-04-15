import { useState, useEffect, useMemo } from "react";
import type {
  ResourceCategory,
  ResourceType,
  K8sResourceItem,
  K8sSelectedResource,
} from "@/types";
import { k8sCategories, k8sNamespaces, k8sListResources } from "@/lib/api";

interface ResourceTreeProps {
  clusterId: string | null;
  onSelect: (resource: K8sSelectedResource) => void;
}

export function ResourceTree({ clusterId, onSelect }: ResourceTreeProps) {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNs, setSelectedNs] = useState("");
  const [allNamespaces, setAllNamespaces] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [resourceItems, setResourceItems] = useState<Record<string, K8sResourceItem[]>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!clusterId) {
      setCategories([]);
      setNamespaces([]);
      return;
    }
    k8sCategories({ cluster: clusterId }).then(setCategories).catch(() => {});
    k8sNamespaces({ cluster: clusterId }).then(setNamespaces).catch(() => {});
  }, [clusterId]);

  const toggleCategory = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleResourceType = async (cat: string, res: ResourceType) => {
    const key = `${cat}/${res.name}`;
    if (expanded[key]) {
      setExpanded((prev) => ({ ...prev, [key]: false }));
      return;
    }
    setExpanded((prev) => ({ ...prev, [key]: true }));
    setLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const ns = allNamespaces ? undefined : selectedNs || undefined;
      const items = await k8sListResources(res.name, {
        cluster: clusterId!,
        group: res.group,
        version: res.version,
        namespace: ns,
      });
      setResourceItems((prev) => ({ ...prev, [key]: items || [] }));
    } catch {
      setResourceItems((prev) => ({ ...prev, [key]: [] }));
    }
    setLoading((prev) => ({ ...prev, [key]: false }));
  };

  const handleSelect = (item: K8sResourceItem, resType: ResourceType) => {
    const ns = item.metadata?.namespace || "";
    const name = item.metadata?.name || "";
    const containers = item.spec?.containers?.map((c) => c.name) || [];
    onSelect({
      kind: resType.kind,
      name,
      namespace: ns,
      group: resType.group,
      version: resType.version,
      resource: resType.name,
      containers,
    });
  };

  const filteredCategories = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        resources: cat.resources.filter(
          (r) => r.kind.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.resources.length > 0);
  }, [categories, search]);

  if (!clusterId) {
    return (
      <div className="k8s-sidebar">
        <div className="k8s-sidebar-empty">
          <svg viewBox="0 0 32 32" width="40" height="40" opacity="0.3">
            <path
              fill="currentColor"
              d="M16 2l12.66 7.34v14.64L16 31.32 3.34 23.98V9.34z"
            />
          </svg>
          <p>Connect to a cluster to browse resources</p>
        </div>
      </div>
    );
  }

  return (
    <div className="k8s-sidebar">
      <div className="k8s-sidebar-header">
        <input
          className="k8s-sidebar-search"
          placeholder="Filter resources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="k8s-ns-selector">
          <label className="k8s-ns-all">
            <input
              type="checkbox"
              checked={allNamespaces}
              onChange={(e) => setAllNamespaces(e.target.checked)}
            />
            All NS
          </label>
          {!allNamespaces && (
            <select
              className="k8s-ns-select"
              value={selectedNs}
              onChange={(e) => setSelectedNs(e.target.value)}
            >
              <option value="">Select namespace</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="k8s-sidebar-tree">
        {filteredCategories.map((cat) => (
          <div key={cat.name} className="k8s-tree-category">
            <div
              className="k8s-tree-category-header"
              onClick={() => toggleCategory(cat.name)}
            >
              <span className={`k8s-tree-arrow ${expanded[cat.name] ? "open" : ""}`}>
                ▸
              </span>
              <span className="k8s-tree-category-name">{cat.name}</span>
              <span className="k8s-tree-count">{cat.resources.length}</span>
            </div>
            {expanded[cat.name] &&
              cat.resources.map((res) => {
                const key = `${cat.name}/${res.name}`;
                const items = resourceItems[key] || [];
                return (
                  <div key={res.name} className="k8s-tree-resource">
                    <div
                      className="k8s-tree-resource-header"
                      onClick={() => toggleResourceType(cat.name, res)}
                    >
                      <span className={`k8s-tree-arrow ${expanded[key] ? "open" : ""}`}>
                        ▸
                      </span>
                      <span className="k8s-tree-resource-kind">{res.kind}</span>
                      {loading[key] && <span className="k8s-tree-spinner" />}
                      {expanded[key] && (
                        <span className="k8s-tree-count">{items.length}</span>
                      )}
                    </div>
                    {expanded[key] && (
                      <div className="k8s-tree-items">
                        {items.map((item, i) => (
                          <div
                            key={item.metadata?.name || i}
                            className="k8s-tree-item"
                            onClick={() => handleSelect(item, res)}
                          >
                            <ResourceIcon
                              kind={res.kind}
                              status={item.status?.phase || ""}
                            />
                            <span className="k8s-tree-item-name">
                              {item.metadata?.name}
                            </span>
                            {item.metadata?.namespace && (
                              <span className="k8s-tree-item-ns">
                                {item.metadata.namespace}
                              </span>
                            )}
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className="k8s-tree-item k8s-tree-empty">
                            No resources found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<string, (status: string) => string> = {
  Pod: (status) =>
    status === "Running" ? "#3fb950" : status === "Failed" ? "#f85149" : "#d29922",
  Deployment: () => "#58a6ff",
  Service: () => "#bc8cff",
  ConfigMap: () => "#79c0ff",
  Secret: () => "#ffa657",
};

function ResourceIcon({ kind, status }: { kind: string; status: string }) {
  const colorFn = KIND_COLORS[kind];
  const color = colorFn ? colorFn(status) : "#8b949e";
  return (
    <span className="k8s-tree-icon" style={{ color }}>
      ●
    </span>
  );
}
