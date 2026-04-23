import { HardDrive, Lock } from 'lucide-react';
import { Badge } from '@/components/primitives';

interface Volume {
  volumeId: string;
  deviceName: string;
  volumeType: string;
  sizeGb: number;
  iops?: number;
  encrypted: boolean;
  kmsKeyId?: string;
}

interface StorageSectionProps {
  volumes: Volume[];
}

export function StorageSection({ volumes }: StorageSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <HardDrive size={13} className="text-accent" />
        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Storage</span>
      </div>
      {volumes.length === 0 ? (
        <div className="text-[12px] text-text-dim">No volumes attached</div>
      ) : (
        <div className="space-y-2">
          {volumes.map((v) => (
            <div key={v.volumeId} className="bg-elev rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-text-pri">{v.deviceName}</span>
                  <span className="text-[10px] text-text-dim">{v.volumeId}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {v.encrypted && (
                    <span className="flex items-center gap-1 text-[10px] text-success">
                      <Lock size={10} />
                      encrypted
                    </span>
                  )}
                  <Badge variant="default">{v.volumeType}</Badge>
                </div>
              </div>
              <div className="flex gap-4 text-[11px] text-text-mut">
                <span><span className="text-text-pri font-medium">{v.sizeGb}</span> GiB</span>
                {v.iops && <span><span className="text-text-pri font-medium">{v.iops}</span> IOPS</span>}
                {v.kmsKeyId && <span className="truncate max-w-[180px] font-mono text-text-dim">KMS: {v.kmsKeyId}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
