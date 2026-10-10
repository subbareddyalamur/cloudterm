import type { CSSProperties } from 'react';
import type { EC2Instance } from '@/lib/types';
import { InstanceRow } from './InstanceRow';

/**
 * Off-screen rows skip layout and paint, so a 200-host account stays fast
 * while rows keep their natural height and long names can wrap.
 */
const offscreen: CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: 'auto 40px' };

export function VirtualInstanceList({ instances }: { instances: EC2Instance[] }) {
  return (
    <>
      {instances.map((inst) => (
        <div key={inst.instance_id} style={offscreen}>
          <InstanceRow instance={inst} />
        </div>
      ))}
    </>
  );
}
