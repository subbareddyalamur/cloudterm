import { Star } from 'lucide-react';
import { useInstancesStore } from '@/stores/instances';
import { InstanceRow } from './InstanceRow';

export function FavoritesPanel() {
  const accounts = useInstancesStore((s) => s.accounts);
  const favorites = useInstancesStore((s) => s.favorites);

  const favInstances = accounts.flatMap((a) =>
    a.regions.flatMap((r) => r.groups.flatMap((g) => g.instances)),
  ).filter((i) => favorites.includes(i.instance_id));

  if (favInstances.length === 0) return null;

  return (
    <section className="py-2 border-b border-border" aria-label="Favorites">
      <header className="px-2 pb-1 text-[10px] font-semibold text-text-dim uppercase tracking-wider flex items-center gap-1.5">
        <Star size={10} aria-hidden />
        Favorites
        <span className="ml-auto font-normal">{favInstances.length}</span>
      </header>
      <div>
        {favInstances.map((inst) => (
          <InstanceRow key={inst.instance_id} instance={inst} showAccount />
        ))}
      </div>
    </section>
  );
}
