import { useState, useEffect } from 'react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';

export interface CloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
  onConfirm: (cloneName: string) => void;
}

export function CloneModal({ open, onOpenChange, instanceId: _instanceId, instanceName, onConfirm }: CloneModalProps) {
  const [cloneName, setCloneName] = useState('');

  useEffect(() => {
    if (open) setCloneName(`${instanceName}-clone`);
  }, [open, instanceName]);

  const handleConfirm = () => {
    if (!cloneName.trim()) return;
    onConfirm(cloneName.trim());
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clone Instance"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!cloneName.trim()} onClick={handleConfirm}>
            Start Clone
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] text-text-dim">
          Creates an AMI from <span className="text-text-pri font-medium">{instanceName}</span> and launches a new instance.
        </p>
        <div>
          <label className="text-[11px] font-medium text-text-mut block mb-1">Clone name</label>
          <Input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            placeholder="my-instance-clone"
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}

CloneModal.displayName = 'CloneModal';
