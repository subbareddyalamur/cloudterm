/** Rule for matching credentials to instances. */
export interface VaultMatchRule {
  id: string;
  type: string;
  value: string;
  label: string;
  priority: number;
}

/** RDP connection credentials. */
export interface RDPCredential {
  username: string;
  password?: string;
  domain?: string;
  security: string;
}

/** Stored credential with metadata. */
export interface VaultEntry {
  rule: VaultMatchRule;
  credential: RDPCredential;
  created_at: string;
  updated_at: string;
}
