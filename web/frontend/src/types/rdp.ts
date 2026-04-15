/** Active RDP session info. */
export interface RDPSessionInfo {
  instance_id: string;
  instance_name: string;
  local_port: number;
  aws_profile: string;
  aws_region: string;
  started_at: string;
}

/** Request body for POST /start-guacamole-rdp. */
export interface GuacamoleTokenRequest {
  instance_id: string;
  instance_name: string;
  aws_profile: string;
  aws_region: string;
  username: string;
  password: string;
  record: boolean;
  security: string;
}

/** Response from POST /start-guacamole-rdp. */
export interface GuacamoleTokenResponse {
  token: string;
  url: string;
  instance_id: string;
  instance_name: string;
  ws_url: string;
  recording: boolean;
}

/** SSM port-forward request. */
export interface ForwarderStartRequest {
  instance_id: string;
  instance_name: string;
  aws_profile: string;
  aws_region: string;
  port_number: number;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_session_token?: string;
}

/** SSM port-forward response. */
export interface ForwarderStartResponse {
  status: string;
  instance_id: string;
  port: number;
  remote_port: number;
  instance_name: string;
}

/** Active SSM port-forward session. */
export interface ForwarderSession {
  instance_id: string;
  instance_name: string;
  local_port: number;
  remote_port: number;
  aws_profile: string;
  aws_region: string;
  started_at: string;
}

/** Detected RDP client on the host OS. */
export interface RDPClient {
  name: string;
  command: string;
  available: boolean;
}
