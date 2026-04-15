/** Recording list item returned by GET /recordings. */
export interface Recording {
  name: string;
  size: number;
  mod_time: string;
  type: "ssh" | "rdp";
  has_mp4: boolean;
}
