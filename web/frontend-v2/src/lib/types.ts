/**
 * TypeScript interfaces mirroring Go structs from internal/types/types.go.
 * Field names match JSON tags (snake_case) so they work directly with the backend.
 */

export type InstanceState =
  | 'running'
  | 'stopped'
  | 'pending'
  | 'stopping'
  | 'shutting-down'
  | 'terminated';

/** Mirrors Go types.EC2Instance */
export interface EC2Instance {
  instance_id: string;
  name: string;
  state: InstanceState;
  /** "linux" | "windows" — coarse platform family */
  platform: string;
  /** detailed OS name: "amazon-linux" | "rhel" | "ubuntu" | "windows" | "suse" | etc. */
  os: string;
  instance_type: string;
  aws_profile: string;
  aws_region: string;
  account_id: string;
  account_alias: string;
  tag1_value: string;
  tag2_value: string;
  private_ip: string;
  public_ip?: string;
  private_dns?: string;
  public_dns?: string;
  vpc_id?: string;
  subnet_id?: string;
  ami_id?: string;
  instance_profile?: string;
  launch_time?: string;
  security_groups?: string[];
  /** AWS resource tags — may be absent (omitempty on Go side) */
  tags?: Record<string, string>;
}

/** Short alias used throughout UI components */
export type Instance = EC2Instance;

/** Mirrors Go types.TagGroup */
export interface TagGroup {
  tag1: string;
  tag2: string;
  instances: EC2Instance[];
}

/** Mirrors Go types.RegionNode */
export interface RegionNode {
  region: string;
  groups: TagGroup[];
}

/** Mirrors Go types.AccountNode */
export interface AccountNode {
  account_id: string;
  account_alias: string;
  profile: string;
  regions: RegionNode[];
}

/** Mirrors Go types.InstanceTree — root payload from GET /instances */
export interface InstanceTree {
  accounts: AccountNode[];
}
