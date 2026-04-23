import { useState, useCallback } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { PALETTE_CATEGORIES } from './lib/icons';
import type { PaletteItem, PaletteCategory } from './lib/diagramTypes';

interface PaletteItemTileProps {
  item: PaletteItem;
}

function PaletteItemTile({ item }: PaletteItemTileProps) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/ctdiagram-node', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  }, [item]);

  const color = item.color ?? '#4B5563';
  const isIcon = Boolean(item.iconType);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px 4px',
        borderRadius: 6,
        cursor: 'grab',
        transition: 'background 0.12s',
        userSelect: 'none',
        minWidth: 0,
      }}
      className="hover:bg-elev"
      title={item.label}
    >
      {isIcon ? (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, color: 'white', fontWeight: 700, letterSpacing: 0.3, textAlign: 'center' }}>
            {(item.abbr ?? item.label).substring(0, 4)}
          </span>
        </div>
      ) : (
        <ShapePreview shape={item.shape ?? 'rectangle'} color={color} />
      )}
      <span
        style={{
          fontSize: 9,
          color: 'var(--text-dim)',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 52,
          display: 'block',
        }}
      >
        {item.label}
      </span>
    </div>
  );
}

function ShapePreview({ shape, color }: { shape: string; color: string }) {
  if (shape === 'diamond') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <polygon points="18,2 34,18 18,34 2,18" fill={color} stroke="var(--border)" strokeWidth={1} />
      </svg>
    );
  }

  if (shape === 'cylinder') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <ellipse cx={18} cy={8} rx={14} ry={5} fill={color} stroke="var(--border)" strokeWidth={1} />
        <rect x={4} y={8} width={28} height={20} fill={color} stroke="none" />
        <ellipse cx={18} cy={28} rx={14} ry={5} fill={color} stroke="var(--border)" strokeWidth={1} />
        <line x1={4} y1={8} x2={4} y2={28} stroke="var(--border)" strokeWidth={1} />
        <line x1={32} y1={8} x2={32} y2={28} stroke="var(--border)" strokeWidth={1} />
      </svg>
    );
  }

  if (shape === 'rounded') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <rect x={2} y={8} width={32} height={20} rx={6} fill={color} stroke="var(--border)" strokeWidth={1} />
      </svg>
    );
  }

  if (shape === 'parallelogram') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <polygon points="8,8 34,8 28,28 2,28" fill={color} stroke="var(--border)" strokeWidth={1} />
      </svg>
    );
  }

  if (shape === 'cloud') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <ellipse cx={18} cy={20} rx={13} ry={10} fill={color} stroke="var(--border)" strokeWidth={1} />
        <ellipse cx={10} cy={18} rx={7} ry={6} fill={color} stroke="none" />
        <ellipse cx={26} cy={18} rx={7} ry={6} fill={color} stroke="none" />
        <ellipse cx={18} cy={12} rx={9} ry={7} fill={color} stroke="none" />
      </svg>
    );
  }

  if (shape === 'container') {
    return (
      <svg width={36} height={36} viewBox="0 0 36 36">
        <rect x={2} y={2} width={32} height={32} rx={4} fill={color} fillOpacity={0.3} stroke="var(--border)" strokeWidth={1} strokeDasharray="4,2" />
        <rect x={2} y={2} width={32} height={8} rx={4} fill={color} fillOpacity={0.5} stroke="none" />
      </svg>
    );
  }

  // rectangle default
  return (
    <svg width={36} height={36} viewBox="0 0 36 36">
      <rect x={2} y={8} width={32} height={20} fill={color} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

interface CategorySectionProps {
  category: PaletteCategory;
  defaultOpen?: boolean;
  searchQuery: string;
}

function CategorySection({ category, defaultOpen = false, searchQuery }: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const filteredItems = searchQuery
    ? category.items.filter((item) =>
        item.label.toLowerCase().includes(searchQuery) ||
        (item.service?.toLowerCase().includes(searchQuery) ?? false)
      )
    : category.items;

  if (searchQuery && filteredItems.length === 0) return null;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
        className="hover:bg-elev"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {category.label}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>
          {filteredItems.length}
        </span>
      </button>

      {(open || searchQuery) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            padding: '4px 6px 8px',
            gap: 2,
          }}
        >
          {filteredItems.map((item) => (
            <PaletteItemTile key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiagramPalette() {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div
        style={{
          padding: '8px 8px 6px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <Search size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shapes…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 11,
              color: 'var(--text-pri)',
            }}
          />
        </div>
      </div>

      {/* Categories */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {PALETTE_CATEGORIES.map((cat, i) => (
          <CategorySection
            key={cat.id}
            category={cat}
            defaultOpen={i === 0}
            searchQuery={q}
          />
        ))}
      </div>
    </div>
  );
}
