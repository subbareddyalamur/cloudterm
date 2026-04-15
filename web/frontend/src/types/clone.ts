/** Clone operation status from GET /clone/status/{id}. */
export interface CloneStatus {
  id: string;
  source_instance_id: string;
  source_name: string;
  clone_name: string;
  ami_id?: string;
  phase: "creating_ami" | "ami_ready" | "launching" | "complete" | "error";
  progress: number;
  message: string;
  new_instance_id?: string;
  created_at: string;
}

/** Pre-filled launch parameters from GET /clone/settings/{id}. */
export interface CloneSettings {
  ami_id: string;
  instance_type: string;
  subnet_id: string;
  security_group_ids: string[];
  key_name: string;
  iam_profile: string;
  tags: Record<string, string>;
  available_subnets: SubnetOption[];
  available_sgs: SGOption[];
}

export interface SubnetOption {
  subnet_id: string;
  az: string;
  cidr: string;
  name: string;
}

export interface SGOption {
  group_id: string;
  group_name: string;
}
