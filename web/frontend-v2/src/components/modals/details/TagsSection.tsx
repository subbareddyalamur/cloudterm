import { Tag } from 'lucide-react';

interface TagsSectionProps {
  tags: Record<string, string>;
}

export function TagsSection({ tags }: TagsSectionProps) {
  const entries = Object.entries(tags);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Tag size={13} className="text-accent" />
        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Tags</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[12px] text-text-dim">No tags</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 py-1 border-b border-border/40 text-[12px]">
              <span className="text-text-dim w-28 shrink-0 truncate">{k}</span>
              <span className="text-text-pri truncate">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
