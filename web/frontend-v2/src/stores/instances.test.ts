import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFilteredAccounts, getAllInstances } from '@/lib/filter';

vi.mock('zustand/middleware', async (importOriginal) => {
  const mod = await importOriginal() as Record<string, unknown>;
  return {
    ...mod,
    persist: (fn: unknown) => fn,
    createJSONStorage: () => undefined,
  };
});

import { useInstancesStore } from './instances';
import type { InstanceTree } from '@/lib/types';

const mockTree: InstanceTree = {
  accounts: [
    {
      account_id: 'acct-1',
      account_alias: 'acme-prod',
      profile: 'prod',
      regions: [
        {
          region: 'us-east-1',
          groups: [
            {
              tag1: 'App',
              tag2: 'prod',
              instances: [
                {
                  instance_id: 'i-aaa111',
                  name: 'api-prod-01',
                  state: 'running',
                  platform: 'linux',
                  os: 'amazon-linux',
                  instance_type: 't3.xlarge',
                  aws_profile: 'prod',
                  aws_region: 'us-east-1',
                  account_id: 'acct-1',
                  account_alias: 'acme-prod',
                  tag1_value: 'api',
                  tag2_value: 'prod',
                  private_ip: '10.0.1.1',
                  tags: { Environment: 'prod' },
                },
                {
                  instance_id: 'i-bbb222',
                  name: 'db-dev-02',
                  state: 'stopped',
                  platform: 'linux',
                  os: 'ubuntu',
                  instance_type: 't3.medium',
                  aws_profile: 'prod',
                  aws_region: 'us-east-1',
                  account_id: 'acct-1',
                  account_alias: 'acme-prod',
                  tag1_value: 'db',
                  tag2_value: 'dev',
                  private_ip: '10.0.1.2',
                  tags: { Environment: 'dev' },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  useInstancesStore.setState({
    accounts: [],
    loading: false,
    lastScanAt: null,
    filter: '',
    expanded: {},
    favorites: [],
    selectedId: null,
  });
});

describe('setFilter', () => {
  it('updates filter value', () => {
    useInstancesStore.getState().setFilter('api');
    expect(useInstancesStore.getState().filter).toBe('api');
  });

  it('auto-expands matching accounts when filter is non-empty', () => {
    useInstancesStore.setState({ accounts: mockTree.accounts });
    useInstancesStore.getState().setFilter('api');
    const expanded = useInstancesStore.getState().expanded;
    expect(expanded['account:acct-1']).toBe(true);
    expect(expanded['region:acct-1:us-east-1']).toBe(true);
  });

  it('does not expand when filter is empty', () => {
    useInstancesStore.setState({ accounts: mockTree.accounts });
    useInstancesStore.getState().setFilter('');
    expect(Object.keys(useInstancesStore.getState().expanded).length).toBe(0);
  });
});

describe('toggleExpand', () => {
  it('expands a collapsed key', () => {
    useInstancesStore.getState().toggleExpand('account:acct-1');
    expect(useInstancesStore.getState().expanded['account:acct-1']).toBe(true);
  });

  it('collapses an expanded key', () => {
    useInstancesStore.setState({ expanded: { 'account:acct-1': true } });
    useInstancesStore.getState().toggleExpand('account:acct-1');
    expect(useInstancesStore.getState().expanded['account:acct-1']).toBe(false);
  });
});

describe('collapseAll / expandAll', () => {
  it('collapseAll clears expanded map', () => {
    useInstancesStore.setState({ expanded: { 'account:acct-1': true } });
    useInstancesStore.getState().collapseAll();
    expect(Object.keys(useInstancesStore.getState().expanded).length).toBe(0);
  });

  it('expandAll sets all account and region keys', () => {
    useInstancesStore.setState({ accounts: mockTree.accounts });
    useInstancesStore.getState().expandAll();
    const expanded = useInstancesStore.getState().expanded;
    expect(expanded['account:acct-1']).toBe(true);
    expect(expanded['region:acct-1:us-east-1']).toBe(true);
  });
});

describe('toggleFavorite', () => {
  it('adds an id to favorites', () => {
    useInstancesStore.getState().toggleFavorite('i-aaa111');
    expect(useInstancesStore.getState().favorites).toContain('i-aaa111');
  });

  it('removes an id already in favorites', () => {
    useInstancesStore.setState({ favorites: ['i-aaa111'] });
    useInstancesStore.getState().toggleFavorite('i-aaa111');
    expect(useInstancesStore.getState().favorites).not.toContain('i-aaa111');
  });
});

describe('getFilteredAccounts', () => {
  beforeEach(() => {
    useInstancesStore.setState({ accounts: mockTree.accounts, filter: '' });
  });

  it('no filter returns all accounts', () => {
    const { accounts } = useInstancesStore.getState();
    const filtered = getFilteredAccounts(accounts, '');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.regions[0]?.groups[0]?.instances.length).toBe(2);
  });

  it('filter by name returns only matching instances', () => {
    const { accounts } = useInstancesStore.getState();
    const filtered = getFilteredAccounts(accounts, 'api');
    const instances = filtered[0]?.regions[0]?.groups[0]?.instances;
    expect(instances?.length).toBe(1);
    expect(instances?.[0]?.name).toBe('api-prod-01');
  });

  it('filter with no matches returns empty array', () => {
    const { accounts } = useInstancesStore.getState();
    const filtered = getFilteredAccounts(accounts, 'xyz-no-match');
    expect(filtered.length).toBe(0);
  });
});

describe('getVisibleInstances', () => {
  it('returns flat list of all instances when no filter', () => {
    useInstancesStore.setState({ accounts: mockTree.accounts, filter: '' });
    const { accounts } = useInstancesStore.getState();
    const visible = getAllInstances(getFilteredAccounts(accounts, ''));
    expect(visible.length).toBe(2);
  });

  it('returns only matching instances when filter set', () => {
    useInstancesStore.setState({ accounts: mockTree.accounts, filter: 'db-dev' });
    const { accounts } = useInstancesStore.getState();
    const visible = getAllInstances(getFilteredAccounts(accounts, 'db-dev'));
    expect(visible.length).toBe(1);
    expect(visible[0]?.name).toBe('db-dev-02');
  });
});

describe('fetchInstances', () => {
  it('sets accounts from API response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockTree,
    } as Response);

    await useInstancesStore.getState().fetchInstances();
    const { accounts, loading, lastScanAt } = useInstancesStore.getState();
    expect(accounts.length).toBe(1);
    expect(loading).toBe(false);
    expect(lastScanAt).not.toBeNull();
  });

  it('sets loading false on API error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'error',
    } as Response);

    await useInstancesStore.getState().fetchInstances();
    expect(useInstancesStore.getState().loading).toBe(false);
  });
});
