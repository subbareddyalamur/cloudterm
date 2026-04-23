import { memo, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useInstancesStore } from '@/stores/instances';
import type { RegionNode, TagGroup } from '@/lib/types';
import { InstanceRow } from './InstanceRow';

const TAG_COLORS: Record<string, string> = {
  prod: 'bg-danger/20 text-danger',
  production: 'bg-danger/20 text-danger',
  prd: 'bg-danger/20 text-danger',
  staging: 'bg-warn/20 text-warn',
  stage: 'bg-warn/20 text-warn',
  stg: 'bg-warn/20 text-warn',
  uat: 'bg-warn/20 text-warn',
  dev: 'bg-success/20 text-success',
  development: 'bg-success/20 text-success',
  test: 'bg-info/20 text-info',
  testing: 'bg-info/20 text-info',
  qa: 'bg-info/20 text-info',
  sandbox: 'bg-accent/20 text-accent',
};

function getTagBadgeClass(label: string): string {
  const lower = label.toLowerCase();
  for (const [key, cls] of Object.entries(TAG_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return 'bg-accent/15 text-accent';
}

interface TagSectionProps {
  accountId: string;
  regionKey: string;
  group: TagGroup;
}

const TagSection = memo(function TagSection({ accountId, regionKey, group }: TagSectionProps) {
  const label = [group.tag1, group.tag2].filter(Boolean).join(' / ');
  const expandKey = `tag:${accountId}:${regionKey}:${label}`;
  const isOpen = useInstancesStore((s) => {
    const val = s.expanded[expandKey];
    return val === undefined ? true : !!val;
  });

  if (!label) {
    return (
      <>
        {group.instances.map((inst) => (
          <InstanceRow key={inst.instance_id} instance={inst} />
        ))}
      </>
    );
  }

  const handleClick = () => {
    useInstancesStore.setState((s) => ({
      expanded: { ...s.expanded, [expandKey]: !isOpen },
    }));
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="ml-3">
      <button
        type="button"
        className="flex items-center gap-1.5 pl-2 py-1 group/tag"
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown size={9} className="text-text-dim shrink-0 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
        ) : (
          <ChevronRight size={9} className="text-text-dim shrink-0 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
        )}
        <span
          className={`text-[9px] font-bold px-1.5 py-[1px] rounded uppercase tracking-wider leading-normal ${getTagBadgeClass(label)}`}
        >
          {label}
        </span>
      </button>
      {isOpen &&
        group.instances.map((inst) => (
          <InstanceRow key={inst.instance_id} instance={inst} />
        ))}
    </div>
  );
});

interface Props {
  accountId: string;
  region: RegionNode;
}

export const RegionGroup = memo(function RegionGroup({ accountId, region }: Props) {
  const isOpen = useInstancesStore((s) => !!s.expanded[`region:${accountId}:${region.region}`]);
  const toggle = useInstancesStore((s) => s.toggleExpand);

  const allInstances = region.groups.flatMap((g) => g.instances);
  const runningCount = allInstances.filter((i) => i.state === 'running').length;

  const handleClick = () => toggle(`region:${accountId}:${region.region}`);
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(`region:${accountId}:${region.region}`);
    }
  };

  return (
    <div className="pl-3">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2 py-0.5 text-left hover:bg-elev transition-colors rounded"
        aria-expanded={isOpen}
        onClick={handleClick}
        onKeyDown={handleKey}
      >
        {isOpen ? (
          <ChevronDown size={10} className="text-text-dim shrink-0" />
        ) : (
          <ChevronRight size={10} className="text-text-dim shrink-0" />
        )}
        <span className="flex-1 text-[11px] text-text-mut font-mono truncate">{region.region}</span>
        <span className="text-[9px] text-text-dim shrink-0">
          {runningCount > 0 && <span className="text-success">{runningCount} on</span>}
          {runningCount > 0 && ' · '}
          {allInstances.length}
        </span>
      </button>
      {isOpen &&
        region.groups.map((group) => {
          const key = `${group.tag1}:${group.tag2}`;
          return (
            <TagSection
              key={key}
              accountId={accountId}
              regionKey={region.region}
              group={group}
            />
          );
        })}
    </div>
  );
});
