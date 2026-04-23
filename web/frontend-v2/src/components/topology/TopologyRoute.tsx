import { useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { TopologyCanvas } from './TopologyCanvas';
import { TopologySidePanel } from './TopologySidePanel';
import { useTopology, useInvalidateTopology } from '@/hooks/useTopology';
import type { TopoNode } from '@/lib/topology-types';
import { Button } from '@/components/primitives/Button';

export interface TopologyRouteProps {
  instanceId: string;
}

class TopologyErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void info;
    void error;
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-text-dim">
          <AlertCircle size={28} className="text-danger" />
          <span className="text-sm font-semibold text-danger">Topology rendering error</span>
          <span className="text-xs text-text-dim max-w-sm text-center">
            {this.state.error?.message ?? 'Unknown error'}
          </span>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={13} />}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TopologyRoute({ instanceId }: TopologyRouteProps) {
  const { data, isLoading, isRefetching, error } = useTopology(instanceId);
  const invalidate = useInvalidateTopology();
  const [selectedNode, setSelectedNode] = useState<TopoNode | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-dim">
        <Loader2 size={28} className="animate-spin text-accent" />
        <span className="text-sm">Loading topology…</span>
        <span className="text-xs text-text-dim">Fetching VPC, subnets, and security groups…</span>
      </div>
    );
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'Failed to load topology';
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-danger">
        <AlertCircle size={28} />
        <span className="text-sm font-semibold">Topology unavailable</span>
        <span className="text-xs text-text-dim max-w-sm text-center">{msg}</span>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw size={13} />}
          onClick={() => invalidate(instanceId)}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <TopologyErrorBoundary onReset={() => invalidate(instanceId)}>
      <div className="flex h-full overflow-hidden">
        <div className="flex-1 min-w-0">
          <TopologyCanvas
            topology={data}
            onSelectNode={setSelectedNode}
            onRefresh={() => invalidate(instanceId)}
            isRefreshing={isRefetching}
          />
        </div>
        {selectedNode && (
          <TopologySidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </TopologyErrorBoundary>
  );
}

TopologyRoute.displayName = 'TopologyRoute';
