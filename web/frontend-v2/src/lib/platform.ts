export type Platform =
  | 'linux'
  | 'rhel'
  | 'ubuntu'
  | 'windows'
  | 'amazon-linux'
  | 'suse'
  | 'debian'
  | 'centos'
  | 'fedora'
  | 'unknown';

export interface PlatformInput {
  Platform?: string | null;
  PlatformDetails?: string | null;
  ImageId?: string | null;
  Tags?: Record<string, string> | null;
}

export function detectPlatform(i: PlatformInput): Platform {
  const details = (i.PlatformDetails ?? '').toLowerCase();
  const plat = (i.Platform ?? '').toLowerCase();
  const combined = `${plat} ${details}`;
  if (combined.includes('windows')) return 'windows';
  if (combined.includes('red hat') || combined.includes('rhel')) return 'rhel';
  if (combined.includes('ubuntu')) return 'ubuntu';
  if (combined.includes('debian')) return 'debian';
  if (combined.includes('centos')) return 'centos';
  if (combined.includes('fedora')) return 'fedora';
  if (combined.includes('suse') || combined.includes('sles')) return 'suse';
  if (combined.includes('amazon linux') || combined.includes('amzn') || combined.includes('al2')) return 'amazon-linux';
  if (combined.includes('linux')) return 'linux';
  return 'unknown';
}

export function platformColorClass(p: Platform): string {
  switch (p) {
    case 'windows': return 'plat-windows';
    case 'rhel':
    case 'centos': return 'plat-rhel';
    case 'ubuntu': return 'plat-ubuntu';
    case 'debian': return 'plat-ubuntu';
    case 'fedora': return 'plat-rhel';
    case 'suse': return 'plat-rhel';
    case 'linux':
    case 'amazon-linux': return 'plat-linux';
    default: return 'plat-unknown';
  }
}
