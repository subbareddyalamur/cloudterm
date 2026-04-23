import type React from 'react';
import {
  Upload,
  Download,
  Zap,
  Folder,
  Link,
  Clipboard,
  Info,
  Globe,
  Star,
  X,
  Copy,
} from 'lucide-react';
import type { EC2Instance } from '@/lib/types';

export type CtxIconComponent = React.ComponentType<{
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
  'aria-hidden'?: boolean;
}>;

function RHELIcon({
  size = 13,
  style,
  'aria-hidden': ariaHidden,
}: {
  size?: number | string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden={ariaHidden} style={style}>
      <circle cx="12" cy="12" r="11" fill="#EE0000" />
      <path
        d="M8.5 10.5c0-1.1.9-2 2-2h3c1.1 0 2 .9 2 2v.5c0 .3-.2.5-.5.5H9c-.3 0-.5-.2-.5-.5v-.5z"
        fill="white"
      />
      <path
        d="M7.5 12h9l-.8 3.5c-.2.8-.9 1.4-1.7 1.5H9.5c-.8 0-1.5-.6-1.7-1.5L7 12.5c-.1-.3.1-.5.5-.5z"
        fill="white"
      />
    </svg>
  );
}

function WindowsIcon({
  size = 13,
  style,
  'aria-hidden': ariaHidden,
}: {
  size?: number | string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden={ariaHidden} style={style}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="12" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="12" width="9" height="9" fill="#00A4EF" />
      <rect x="12" y="12" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export interface CtxItem {
  id: string;
  label: string;
  icon: CtxIconComponent;
  kbd?: string;
  pill?: { label: string; colorClass: string };
  meta?: (inst: EC2Instance) => string | undefined;
  danger?: boolean;
  visible?: (inst: EC2Instance, settings: { s3Bucket?: string }) => boolean;
  disabled?: (inst: EC2Instance) => boolean;
  action: (inst: EC2Instance) => void;
}

export type CtxEntry = CtxItem | { separator: true };

export function isSeparator(e: CtxEntry): e is { separator: true } {
  return 'separator' in e && (e as { separator: true }).separator === true;
}

function dispatchCtxEvent(name: string, inst: EC2Instance): void {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        instanceId: inst.instance_id,
        instanceName: inst.name,
        accountId: inst.account_id,
        region: inst.aws_region,
      },
    }),
  );
}

export const CTX_ITEMS: CtxEntry[] = [
  {
    id: 'ssh',
    label: 'Open SSH Terminal',
    icon: RHELIcon as CtxIconComponent,
    kbd: '⌘↵',
    pill: { label: 'SSH', colorClass: 'bg-success/15 text-success' },
    action: (inst) => {
      window.dispatchEvent(
        new CustomEvent('ct:open-ssh', {
          detail: {
            instanceId: inst.instance_id,
            instanceName: inst.name,
            accountId: inst.account_id,
            region: inst.aws_region,
          },
        }),
      );
    },
  },
  {
    id: 'rdp',
    label: 'Open RDP Session',
    icon: WindowsIcon as CtxIconComponent,
    pill: { label: 'RDP', colorClass: 'bg-info/15 text-info' },
    visible: (inst) =>
      (inst.platform ?? '').toLowerCase() === 'windows' ||
      (inst.os ?? '').toLowerCase().includes('windows'),
    action: (inst) => {
      window.dispatchEvent(
        new CustomEvent('ct:open-rdp', {
          detail: {
            instanceId: inst.instance_id,
            instanceName: inst.name,
            accountId: inst.account_id,
            region: inst.aws_region,
          },
        }),
      );
    },
  },
  { separator: true },
  {
    id: 'copy-id',
    label: 'Copy Instance ID',
    icon: Clipboard as unknown as CtxIconComponent,
    meta: (inst) => inst.instance_id,
    action: (inst) => {
      void navigator.clipboard.writeText(inst.instance_id);
    },
  },
  {
    id: 'copy-private-ip',
    label: 'Copy Private IP',
    icon: Globe as unknown as CtxIconComponent,
    meta: (inst) => inst.private_ip,
    action: (inst) => {
      void navigator.clipboard.writeText(inst.private_ip);
    },
  },
  { separator: true },
  {
    id: 'details',
    label: 'Instance Details',
    icon: Info as unknown as CtxIconComponent,
    action: (inst) => {
      window.dispatchEvent(
        new CustomEvent('ct:show-details', {
          detail: { instanceId: inst.instance_id },
        }),
      );
    },
  },
  { separator: true },
  {
    id: 'favorite',
    label: 'Toggle Favorite',
    icon: Star as unknown as CtxIconComponent,
    action: () => { return; },
  },
  {
    id: 'browse',
    label: 'Browse Files',
    icon: Folder as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:browse-files', inst),
  },
  {
    id: 'port-forward',
    label: 'Port Forward',
    icon: Link as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:port-forward', inst),
  },
  {
    id: 'topology',
    label: 'Network Topology',
    icon: Globe as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:topology', inst),
  },
  {
    id: 'clone',
    label: 'Clone Instance',
    icon: Copy as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:clone', inst),
  },
  { separator: true },
  {
    id: 'upload',
    label: 'Upload File',
    icon: Upload as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:upload', inst),
  },
  {
    id: 'download',
    label: 'Download File',
    icon: Download as unknown as CtxIconComponent,
    action: (inst) => dispatchCtxEvent('ct:download', inst),
  },
  {
    id: 'expupload',
    label: 'Express Upload',
    icon: Zap as unknown as CtxIconComponent,
    visible: (_inst, s) => !!s.s3Bucket,
    action: (inst) => dispatchCtxEvent('ct:express-upload', inst),
  },
  {
    id: 'expdownload',
    label: 'Express Download',
    icon: Zap as unknown as CtxIconComponent,
    visible: (_inst, s) => !!s.s3Bucket,
    action: (inst) => dispatchCtxEvent('ct:express-download', inst),
  },
  { separator: true },
  {
    id: 'close-all',
    label: 'Close All Sessions',
    icon: X as unknown as CtxIconComponent,
    danger: true,
    action: (inst) => dispatchCtxEvent('ct:close-all', inst),
  },
];

export function getVisibleEntries(
  entries: CtxEntry[],
  inst: EC2Instance,
  settings: { s3Bucket?: string },
): CtxEntry[] {
  return entries.filter((e) => {
    if (isSeparator(e)) return true;
    if (!e.visible) return true;
    return e.visible(inst, settings);
  });
}
