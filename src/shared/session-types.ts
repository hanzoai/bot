export type GatewayAgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
  /**
   * Where this agent was discovered: the gateway's own config/disk ("local"),
   * a live runtime node connected over WebSocket ("node"), or the cloud agent
   * registry read-through ("cloud"). Absent on rows minted before this field.
   */
  source?: GatewayAgentSource;
};

export type GatewayAgentSource = "local" | "node" | "cloud";

export type SessionsListResultBase<TDefaults, TRow> = {
  ts: number;
  path: string;
  count: number;
  defaults: TDefaults;
  sessions: TRow[];
};

export type SessionsPatchResultBase<TEntry> = {
  ok: true;
  path: string;
  key: string;
  entry: TEntry;
};
