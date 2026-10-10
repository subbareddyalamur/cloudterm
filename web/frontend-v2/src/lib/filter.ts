import type { EC2Instance, AccountNode } from '@/lib/types';

export type { EC2Instance as Instance };

function instanceHaystack(inst: EC2Instance): string {
  const env = inst.tags?.Environment ?? inst.tags?.environment ?? inst.tag2_value ?? '';
  return [
    inst.name,
    inst.instance_id,
    inst.private_ip,
    inst.public_ip,
    inst.account_alias,
    inst.account_id,
    inst.aws_region,
    env,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Which searchable field contained the query, for the fleet filter hint. */
export function matchField(inst: EC2Instance, query: string): string | null {
  const token = query.trim().toLowerCase().split(/\s+/).filter(Boolean)[0];
  if (!token) return null;
  const fields: Array<[string, string | undefined]> = [
    ['name', inst.name],
    ['instance id', inst.instance_id],
    ['private ip', inst.private_ip],
    ['public ip', inst.public_ip],
    ['account', inst.account_alias],
    ['account id', inst.account_id],
    ['region', inst.aws_region],
    ['environment', inst.tags?.Environment ?? inst.tags?.environment ?? inst.tag2_value],
  ];
  for (const [label, value] of fields) {
    if (value && value.toLowerCase().includes(token)) return label;
  }
  return null;
}

export function matchInstance(inst: EC2Instance, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = instanceHaystack(inst);
  return tokens.every((t) => hay.includes(t));
}

export function expandAccountsWithMatches(
  accounts: AccountNode[],
  query: string,
): Record<string, boolean> {
  const q = query.trim();
  if (!q) return {};
  const result: Record<string, boolean> = {};
  for (const a of accounts) {
    for (const r of a.regions) {
      const hasMatch = r.groups.some((g) => g.instances.some((i) => matchInstance(i, q)));
      if (hasMatch) {
        result[`account:${a.account_id}`] = true;
        result[`region:${a.account_id}:${r.region}`] = true;
      }
    }
  }
  return result;
}

export function getFilteredAccounts(accounts: AccountNode[], query: string): AccountNode[] {
  const q = query.trim();
  if (!q) return accounts;
  return accounts
    .map((a) => ({
      ...a,
      regions: a.regions
        .map((r) => ({
          ...r,
          groups: r.groups
            .map((g) => ({
              ...g,
              instances: g.instances.filter((i) => matchInstance(i, q)),
            }))
            .filter((g) => g.instances.length > 0),
        }))
        .filter((r) => r.groups.length > 0),
    }))
    .filter((a) => a.regions.length > 0);
}

export function getAllInstances(accounts: AccountNode[]): EC2Instance[] {
  const flat: EC2Instance[] = [];
  for (const a of accounts) {
    for (const r of a.regions) {
      for (const g of r.groups) {
        flat.push(...g.instances);
      }
    }
  }
  return flat;
}

export function tokenMatch(query: string, text: string): boolean {
  if (!query.trim()) return true;
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = text.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export interface TextSegment {
  text: string;
  highlight: boolean;
}

export function highlightMatch(text: string, query: string): TextSegment[] {
  if (!query.trim()) return [{ text, highlight: false }];
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const result: TextSegment[] = [];
  let i = 0;
  const lower = text.toLowerCase();

  while (i < text.length) {
    let matched = false;
    for (const token of tokens) {
      const idx = lower.indexOf(token, i);
      if (idx === i) {
        result.push({ text: text.slice(i, i + token.length), highlight: true });
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      let next = text.length;
      for (const token of tokens) {
        const idx = lower.indexOf(token, i);
        if (idx !== -1 && idx < next) next = idx;
      }
      result.push({ text: text.slice(i, next), highlight: false });
      i = next;
    }
  }

  return result;
}
