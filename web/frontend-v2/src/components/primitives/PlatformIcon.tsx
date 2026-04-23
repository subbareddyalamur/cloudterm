import type { Platform } from '@/lib/platform';

export interface PlatformIconProps {
  platform: Platform;
  size?: number;
  className?: string;
}

function WindowsIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 88 88" width={s} height={s} className={className} aria-label="Windows">
      <path fill="#00adef" d="M0 12.4L35.7 7.6V42.6H0zM39.3 7L87.4 0V42.6H39.3zM87.4 45.7V88L39.3 81.3V45.7zM35.7 80.9L0 76V45.7H35.7z" />
    </svg>
  );
}

function UbuntuIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Ubuntu">
      <circle cx="128" cy="128" r="128" fill="#E95420" />
      <circle cx="128" cy="128" r="18" fill="#fff" />
      <circle cx="62" cy="90" r="14" fill="#fff" />
      <circle cx="62" cy="166" r="14" fill="#fff" />
      <circle cx="194" cy="128" r="14" fill="#fff" />
      <path d="M128 110a46 46 0 0 0-39.8 23" stroke="#fff" strokeWidth="10" fill="none" />
      <path d="M88.2 151a46 46 0 0 0 79.6 0" stroke="#fff" strokeWidth="10" fill="none" />
      <path d="M167.8 128a46 46 0 0 0-39.8-46" stroke="#fff" strokeWidth="10" fill="none" strokeDasharray="0" />
    </svg>
  );
}

function RhelIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="RHEL">
      <circle cx="128" cy="128" r="128" fill="#EE0000" />
      <path d="M75 100h25c20 0 30 8 30 24s-10 24-30 24H95v28H75V100z" fill="#fff" />
      <path d="M95 116v18h5c8 0 13-3 13-9s-5-9-13-9H95z" fill="#EE0000" />
      <path d="M135 176h-12l30-52h-28v-12h48v12l-30 52z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function SuseIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="SUSE">
      <circle cx="128" cy="128" r="128" fill="#73BA25" />
      <circle cx="100" cy="100" r="12" fill="#fff" />
      <circle cx="156" cy="100" r="12" fill="#fff" />
      <circle cx="100" cy="100" r="5" fill="#333" />
      <circle cx="156" cy="100" r="5" fill="#333" />
      <path d="M88 148c0 0 16 28 40 28s40-28 40-28" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function AmazonLinuxIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Amazon Linux">
      <circle cx="128" cy="128" r="128" fill="#232F3E" />
      <path d="M72 160c0 0 20 24 56 24s56-24 56-24" stroke="#FF9900" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M184 156l12 8-4-14" fill="#FF9900" />
      <path d="M98 80l30 56 30-56" stroke="#FF9900" strokeWidth="9" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LinuxIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Linux">
      <circle cx="128" cy="128" r="128" fill="#333" />
      <ellipse cx="128" cy="108" rx="46" ry="52" fill="#F0C040" />
      <circle cx="110" cy="96" r="6" fill="#333" />
      <circle cx="146" cy="96" r="6" fill="#333" />
      <ellipse cx="128" cy="118" rx="10" ry="7" fill="#E8A000" />
      <path d="M88 160c0 0 -4 36 12 40s24-12 28-12s24 16 28 12s12-40 12-40" fill="#F0C040" stroke="#333" strokeWidth="3" />
      <path d="M82 162c-8 4-18 18-14 28s16 8 20 4" fill="#F0C040" stroke="#333" strokeWidth="3" />
      <path d="M174 162c8 4 18 18 14 28s-16 8-20 4" fill="#F0C040" stroke="#333" strokeWidth="3" />
    </svg>
  );
}

function DebianIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Debian">
      <circle cx="128" cy="128" r="128" fill="#A80030" />
      <path d="M148 68c-8-2-16 0-20 4 6-1 12 1 14 4-4-2-10-2-16 0-5 2-8 6-10 10 2-2 5-4 10-5-8 6-14 14-14 28 0 10 2 18 8 26-2-6-3-12-2-18 2 6 6 14 12 18-4-6-6-10-6-18 8 10 20 16 26 24 0 4-2 8-6 14l4-2c4-6 4-12 2-18 2 0 4 2 4 6 4-6 4-14 0-18 2-2 4 0 6 2-2-8-6-12-12-14 4-4 4-10 4-16 0-4-1-8-2-10-2-6-6-10-10-12l2-2c-4-4-10-6-16-8 4 2 8 6 10 8-6-4-14-6-20-4 6 0 12 4 16 8-8-4-16-4-22 0 6 0 10 2 14 4-8 0-14 4-18 10 4-4 8-6 14-8-10 4-16 12-18 22-2 6-2 10-2 16 0 24 12 46 34 56 4 4 10 6 14 4 0-2-4-4-8-6 6 0 12-2 14-6-6 0-10 0-14-2 8-2 14-6 18-12-6 2-10 2-14 2 6-4 12-10 14-16-4 2-8 2-12 2 6-6 10-12 10-20-2 0-4 2-6 4 2-8 0-16-2-22z" fill="#fff" />
    </svg>
  );
}

function CentosIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="CentOS">
      <circle cx="128" cy="128" r="128" fill="#262577" />
      <path d="M128 50l78 78-78 78-78-78z" fill="none" stroke="#fff" strokeWidth="6" />
      <path d="M128 50v78H50z" fill="#9CCD2A" opacity="0.9" />
      <path d="M128 50v78h78z" fill="#EFA724" opacity="0.9" />
      <path d="M128 206v-78H50z" fill="#932279" opacity="0.9" />
      <path d="M128 206v-78h78z" fill="#262577" opacity="0.9" />
      <circle cx="128" cy="128" r="20" fill="#fff" />
    </svg>
  );
}

function FedoraIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Fedora">
      <circle cx="128" cy="128" r="128" fill="#294172" />
      <circle cx="128" cy="128" r="60" fill="none" stroke="#fff" strokeWidth="12" />
      <path d="M128 68v60h60" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" />
      <text x="128" y="148" textAnchor="middle" fill="#fff" fontSize="36" fontFamily="sans-serif" fontWeight="bold">f</text>
    </svg>
  );
}

function UnknownIcon({ s, className }: { s: number; className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={s} height={s} className={className} aria-label="Unknown OS">
      <circle cx="128" cy="128" r="128" fill="#6B7280" />
      <rect x="92" y="60" rx="12" width="72" height="100" fill="#fff" opacity="0.25" />
      <rect x="100" y="68" rx="6" width="56" height="72" fill="#fff" opacity="0.15" />
      <circle cx="128" cy="172" r="6" fill="#fff" opacity="0.4" />
      <text x="128" y="114" textAnchor="middle" fill="#fff" fontSize="48" fontFamily="sans-serif" fontWeight="bold" opacity="0.6">?</text>
    </svg>
  );
}

export function PlatformIcon({ platform, size = 12, className = '' }: PlatformIconProps) {
  const cls = `inst-platform shrink-0 ${className}`;
  switch (platform) {
    case 'windows':
      return <WindowsIcon s={size} className={cls} />;
    case 'ubuntu':
      return <UbuntuIcon s={size} className={cls} />;
    case 'rhel':
      return <RhelIcon s={size} className={cls} />;
    case 'suse':
      return <SuseIcon s={size} className={cls} />;
    case 'amazon-linux':
      return <AmazonLinuxIcon s={size} className={cls} />;
    case 'debian':
      return <DebianIcon s={size} className={cls} />;
    case 'centos':
      return <CentosIcon s={size} className={cls} />;
    case 'fedora':
      return <FedoraIcon s={size} className={cls} />;
    case 'linux':
      return <LinuxIcon s={size} className={cls} />;
    default:
      return <UnknownIcon s={size} className={cls} />;
  }
}

PlatformIcon.displayName = 'PlatformIcon';
