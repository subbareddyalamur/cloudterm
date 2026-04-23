import { Dialog } from '@/components/primitives/Dialog';

export interface CostExplorerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CostExplorerModal({ open, onOpenChange }: CostExplorerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cost Explorer" size="xl">
      <div className="h-[70vh] min-h-[400px]">
        <iframe
          src="http://localhost:5173"
          className="w-full h-full rounded border border-border"
          title="Cost Explorer"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </Dialog>
  );
}

CostExplorerModal.displayName = 'CostExplorerModal';
