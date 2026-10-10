import { memo, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useInstancesStore } from '@/stores/instances';
import type { RegionNode, TagGroup } from '@/lib/types';
import { VirtualInstanceList } from './VirtualInstanceList';
import { envTone } from '@/lib/env';

function getTagBadgeClass(label: string): string {
  const env = label.split('/').pop()?.trim() ?? label;
  return envTone(env);
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
        <VirtualInstanceList instances={group.instances} />
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
          className={`text-[10px] uppercase tracking-[0.05em] leading-normal ${getTagBadgeClass(label)}`}
        >
          {label}
        </span>
      </button>
      {isOpen && <VirtualInstanceList instances={group.instances} />}
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
