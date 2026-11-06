export interface Bot {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar?: string;
  emoji?: string;
  isStarred?: boolean;
  systemPrompt: string;
  model: string;
  endpoint: 'local' | 'cloud';
}

export interface OptionChoice {
  id: string;
  badge: string; // "A", "B", "C", etc.
  label: string;
}

export interface ChoiceCard {
  id: string;
  question: string;
  options: OptionChoice[];
  selectedChoiceId?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'bot';
  botId?: string;
  text: string;
  statusText?: string; // e.g. "Starting the onboarding", "Thinking..."
  timestamp: string;
  choiceCard?: ChoiceCard;
  isStreaming?: boolean;
  localFilesChanged?: string[];
  steps?: Step[];
}

/** A command an agent ran in its sandbox, as it ran. */
export interface Step {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  status: 'in_progress' | 'completed' | 'failed' | 'declined';
}

export interface LocalWorkspace {
  name: string;
  path: string;
  files: LocalEntry[];
}

export interface LocalEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  last_modified?: number;
}

export interface GatewayStatus {
  connected: boolean;
  url: string;
  version?: string;
  message?: string;
}
