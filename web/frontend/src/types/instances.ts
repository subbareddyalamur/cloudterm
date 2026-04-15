/** EC2 instance as returned by the fleet API. */
export interface EC2Instance {
  instance_id: string;
  name: string;
  private_ip: string;
  public_ip?: string;
  state: string;
  platform: string;
  os: string;
  instance_type: string;
  aws_profile: string;
  aws_region: string;
  account_id: string;
  account_alias?: string;
  tag1_value: string;
  tag2_value: string;
  launch_time?: string;
  ami_id?: string;
  instance_profile?: string;
  tags?: Record<string, string>;
  vpc_id?: string;
  subnet_id?: string;
  security_groups?: string[];
}

/** Full instance details from DescribeInstances + DescribeSecurityGroups. */
export interface EC2InstanceDetails extends EC2Instance {
  key_name?: string;
  architecture?: string;
  root_device_name?: string;
  root_device_type?: string;
  virtualization_type?: string;
  hypervisor?: string;
  ena_support: boolean;
  ebs_optimized: boolean;
  source_dest_check: boolean;
  monitoring?: string;
  availability_zone?: string;
  tenancy?: string;
  private_dns?: string;
  public_dns?: string;
  block_devices?: BlockDeviceInfo[];
  network_interfaces?: NetworkIfaceInfo[];
  security_group_details?: SecurityGroupInfo[];
}

export interface BlockDeviceInfo {
  device_name: string;
  volume_id: string;
  volume_size: number;
  volume_type: string;
  iops?: number;
  encrypted: boolean;
  kms_key_id?: string;
  delete_on_termination: boolean;
}

export interface NetworkIfaceInfo {
  interface_id: string;
  subnet_id: string;
  private_ip: string;
  public_ip?: string;
  mac_address: string;
  status: string;
}

export interface SecurityGroupInfo {
  group_id: string;
  group_name: string;
  description: string;
  inbound_rules?: SGRule[];
  outbound_rules?: SGRule[];
}

export interface SGRule {
  protocol: string;
  from_port: number;
  to_port: number;
  source: string;
  description?: string;
}

/** 4-level hierarchy: Account → Region → Tag1 → Tag2 → Instances. */
export interface InstanceTree {
  accounts: AccountNode[];
}

export interface AccountNode {
  account_id: string;
  account_alias?: string;
  profile: string;
  regions: RegionNode[];
}

export interface RegionNode {
  region: string;
  groups: TagGroup[];
}

export interface TagGroup {
  tag1: string;
  tag2: string;
  instances: EC2Instance[];
}

/** Aggregate fleet counts for the sidebar. */
export interface FleetStats {
  total: number;
  running: number;
  stopped: number;
  windows: number;
  rhel: number;
  accounts: number;
}

/** Full fleet details with per-account breakdown. */
export interface FleetSummary {
  total: number;
  running: number;
  stopped: number;
  platforms: Record<string, number>;
  accounts: AccountStats[];
  scan_duration: string;
}

export interface AccountStats {
  account_id: string;
  account_alias?: string;
  profile: string;
  total: number;
  running: number;
  stopped: number;
  platforms: Record<string, number>;
}

/** Emitted during scanning to show progress. */
export interface ScanStatus {
  status: "scanning" | "completed" | "error";
  scanned_combinations: number;
  successful_regions: number;
  total_instances: number;
  message?: string;
}

/** Outcome of an EC2 scanning operation. */
export interface ScanResult {
  data: InstanceTree | null;
  instances: EC2Instance[];
  timestamp: string;
}

/** Instance resource metrics from SSM. */
export interface InstanceMetrics {
  cpu_load: number;
  cpu_count: number;
  mem_used_pct: number;
  mem_total_mb: number;
  mem_used_mb: number;
  disk_used_pct: number;
  disk_total_gb: number;
  disk_used_gb: number;
  uptime: string;
}

/** Manually-added AWS account. */
export interface ManualAccount {
  id: string;
  name: string;
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
  added_at: string;
}

/** Audit log entry. */
export interface AuditEvent {
  timestamp: string;
  action: string;
  instance_id?: string;
  instance_name?: string;
  profile?: string;
  region?: string;
  details?: string;
}
