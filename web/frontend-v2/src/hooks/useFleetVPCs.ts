import { useInstancesStore } from '@/stores/instances';

export interface FleetVPC {
  accountId: string;
  accountName: string;
  region: string;
  vpcId: string;
  vpcName: string;
  cidr: string;
  instanceCount: number;
  isDefault: boolean;
}

export function useFleetVPCs(): { vpcs: FleetVPC[] } {
  const accounts = useInstancesStore((s) => s.accounts);
  const vpcs: FleetVPC[] = [];
  const seen = new Set<string>();

  for (const account of accounts) {
    for (const region of account.regions ?? []) {
      for (const group of region.groups ?? []) {
        for (const inst of group.instances ?? []) {
          const vpcId =
            (inst as Record<string, unknown>)['vpc_id'] as string | undefined
            ?? `vpc-unknown-${account.account_id}-${region.region}`;
          const key = `${account.account_id}/${region.region}/${vpcId}`;
          if (!seen.has(key)) {
            seen.add(key);
            vpcs.push({
              accountId: account.account_id,
              accountName: (account as Record<string, unknown>)['account_name'] as string | undefined ?? account.account_id,
              region: region.region,
              vpcId,
              vpcName: vpcId,
              cidr: '',
              instanceCount: 0,
              isDefault: false,
            });
          }
          const found = vpcs.find(
            (v) => v.vpcId === vpcId && v.accountId === account.account_id,
          );
          if (found) found.instanceCount++;
        }
      }
    }
  }

  return { vpcs };
}
