import { describe, it, expect } from 'vitest';
import { matchInstance, expandAccountsWithMatches, tokenMatch } from './filter';
import type { EC2Instance, AccountNode } from './types';

function makeInst(overrides: Partial<EC2Instance> = {}): EC2Instance {
  return {
    instance_id: 'i-0a1b2c3d4e5f6789',
    name: 'syc23-api-prod-01',
    state: 'running',
    platform: 'linux',
    os: 'amazon-linux',
    instance_type: 't3.xlarge',
    aws_profile: 'default',
    aws_region: 'us-east-1',
    account_id: '123456789012',
    account_alias: 'acme-prod',
    tag1_value: 'App',
    tag2_value: 'prod',
    private_ip: '10.0.4.127',
    tags: { Environment: 'prod', App: 'api' },
    ...overrides,
  };
}

function makeAccount(instances: EC2Instance[]): AccountNode {
  return {
    account_id: '123456789012',
    account_alias: 'acme-prod',
    profile: 'default',
    regions: [
      {
        region: 'us-east-1',
        groups: [{ tag1: 'App', tag2: 'prod', instances }],
      },
    ],
  };
}

describe('matchInstance', () => {
  it('empty query matches any instance', () => {
    expect(matchInstance(makeInst(), '')).toBe(true);
    expect(matchInstance(makeInst(), '   ')).toBe(true);
  });

  it('single token matches substring of name', () => {
    expect(matchInstance(makeInst(), 'api')).toBe(true);
    expect(matchInstance(makeInst(), 'syc23')).toBe(true);
  });

  it('single token matches substring of instance_id', () => {
    expect(matchInstance(makeInst(), 'i-0a1b')).toBe(true);
    expect(matchInstance(makeInst(), '6789')).toBe(true);
  });

  it('two tokens AND semantics — both must match', () => {
    expect(matchInstance(makeInst(), 'syc23 prod')).toBe(true);
    expect(matchInstance(makeInst(), 'syc23 missing')).toBe(false);
  });

  it('case-insensitive: uppercase query matches lowercase name', () => {
    expect(matchInstance(makeInst(), 'PROD')).toBe(true);
    expect(matchInstance(makeInst(), 'SYC23')).toBe(true);
    expect(matchInstance(makeInst(), 'API')).toBe(true);
  });

  it('hyphenated token matches hyphenated name segment', () => {
    expect(matchInstance(makeInst(), 'api-prod')).toBe(true);
    expect(matchInstance(makeInst(), 'syc23-api')).toBe(true);
  });

  it('partial instance_id matches', () => {
    expect(matchInstance(makeInst({ instance_id: 'i-0a1b2c3d4e5f6789' }), 'i-0a1b')).toBe(true);
    expect(matchInstance(makeInst({ instance_id: 'i-0a1b2c3d4e5f6789' }), '2c3d4e')).toBe(true);
  });

  it('no match returns false', () => {
    expect(matchInstance(makeInst(), 'xyz-does-not-exist')).toBe(false);
    expect(matchInstance(makeInst(), 'us-east-1')).toBe(false);
  });

  it('whitespace-only query matches all instances', () => {
    expect(matchInstance(makeInst(), '  \t  ')).toBe(true);
  });

  it('mixed token order does not matter', () => {
    expect(matchInstance(makeInst(), 'prod syc23')).toBe(true);
    expect(matchInstance(makeInst(), 'syc23 prod')).toBe(true);
  });

  it('tag value is NOT searched (VanillaJS parity — name+id only)', () => {
    const inst = makeInst({ tags: { Owner: 'alice-unique-tag' } });
    expect(matchInstance(inst, 'alice-unique-tag')).toBe(false);
  });

  it('private IP is NOT searched (VanillaJS parity)', () => {
    const inst = makeInst({ private_ip: '10.99.88.77' });
    expect(matchInstance(inst, '10.99.88.77')).toBe(false);
  });

  it('account alias is NOT searched (VanillaJS parity)', () => {
    const inst = makeInst({ account_alias: 'my-special-account' });
    expect(matchInstance(inst, 'my-special-account')).toBe(false);
  });

  it('unicode names are preserved and matched', () => {
    const inst = makeInst({ name: 'ñoño-srv-01' });
    expect(matchInstance(inst, 'ñoño')).toBe(true);
    expect(matchInstance(inst, 'noño')).toBe(false);
  });

  it('three tokens all must match', () => {
    expect(matchInstance(makeInst(), 'syc23 api prod')).toBe(true);
    expect(matchInstance(makeInst(), 'syc23 api missing')).toBe(false);
  });

  it('filter on stopped instance still works', () => {
    const inst = makeInst({ name: 'my-stopped-box', state: 'stopped' });
    expect(matchInstance(inst, 'stopped-box')).toBe(true);
  });
});

describe('expandAccountsWithMatches', () => {
  it('empty query returns empty expansion map', () => {
    const accounts = [makeAccount([makeInst()])];
    expect(expandAccountsWithMatches(accounts, '')).toEqual({});
    expect(expandAccountsWithMatches(accounts, '   ')).toEqual({});
  });

  it('matching query expands the account and region', () => {
    const accounts = [makeAccount([makeInst()])];
    const result = expandAccountsWithMatches(accounts, 'api');
    expect(result['account:123456789012']).toBe(true);
    expect(result['region:123456789012:us-east-1']).toBe(true);
  });

  it('non-matching query returns empty map', () => {
    const accounts = [makeAccount([makeInst()])];
    const result = expandAccountsWithMatches(accounts, 'xyz-no-match');
    expect(Object.keys(result).length).toBe(0);
  });

  it('only expands accounts/regions with actual matches', () => {
    const matchingInst = makeInst({ name: 'web-prod-01', instance_id: 'i-match' });
    const nonMatchingInst = makeInst({ name: 'db-dev-01', instance_id: 'i-other' });
    const accounts: AccountNode[] = [
      {
        account_id: 'acct-1',
        account_alias: 'prod',
        profile: 'prod',
        regions: [
          { region: 'us-east-1', groups: [{ tag1: '', tag2: '', instances: [matchingInst] }] },
          { region: 'eu-west-1', groups: [{ tag1: '', tag2: '', instances: [nonMatchingInst] }] },
        ],
      },
    ];
    const result = expandAccountsWithMatches(accounts, 'web-prod');
    expect(result['account:acct-1']).toBe(true);
    expect(result['region:acct-1:us-east-1']).toBe(true);
    expect(result['region:acct-1:eu-west-1']).toBeUndefined();
  });
});

describe('tokenMatch', () => {
  it('empty query always returns true', () => {
    expect(tokenMatch('', 'anything')).toBe(true);
  });

  it('single token substring match', () => {
    expect(tokenMatch('foo', 'foobar')).toBe(true);
    expect(tokenMatch('bar', 'foobar')).toBe(true);
    expect(tokenMatch('baz', 'foobar')).toBe(false);
  });

  it('multiple tokens AND logic', () => {
    expect(tokenMatch('foo bar', 'foobar')).toBe(true);
    expect(tokenMatch('foo baz', 'foobar')).toBe(false);
  });
});
