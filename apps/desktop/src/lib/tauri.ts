import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { GatewayStatus, LocalEntry } from '../types';

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Window Controls
export async function windowMinimize(): Promise<void> {
  if (isTauri()) {
    await invoke('window_minimize');
  }
}

export async function windowMaximize(): Promise<void> {
  if (isTauri()) {
    await invoke('window_maximize');
  }
}

export async function windowToggleMaximize(): Promise<void> {
  if (isTauri()) {
    await invoke('window_toggle_maximize');
  }
}

export async function windowClose(): Promise<void> {
  if (isTauri()) {
    await invoke('window_close');
  }
}

export async function windowIsMaximized(): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>('window_is_maximized');
  }
  return false;
}

// Local Workspace
export async function openFolderDialog(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('local_workspace_open_dialog');
  }
  return prompt('Enter local folder path:', '/home/z/work/demo');
}

export async function openFileDialog(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('local_workspace_open_file_dialog');
  }
  return null;
}

export async function listLocalWorkspace(dirPath: string): Promise<LocalEntry[]> {
  if (isTauri()) {
    return invoke<LocalEntry[]>('local_workspace_list', { dirPath });
  }
  return [];
}

export async function readLocalFile(filePath: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('local_workspace_read_file', { filePath });
  }
  return '';
}

export async function writeLocalFile(filePath: string, content: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>('local_workspace_write_file', { filePath, content });
  }
}

/** One event of `dev exec --json` (thread.started, item.started, item.completed, turn.completed, ...). */
export type DevEvent = { type: string; item?: Record<string, unknown>; [key: string]: unknown };

export interface DevRunResult {
  session_id: string;
  output: string;
  success: boolean;
}

/**
 * Runs Hanzo Dev on a local folder in its workspace-write sandbox. `onEvent`
 * receives every event while the agent works; the promise resolves with its
 * last message when it finishes or is stopped (`cancelLocalDev(run)`).
 */
export async function runLocalDev(
  run: string,
  workspacePath: string,
  promptText: string,
  onEvent: (event: DevEvent) => void,
): Promise<DevRunResult> {
  if (!isTauri()) {
    throw new Error('Hanzo Dev runs on this machine, so it needs the desktop app.');
  }
  const unlisten = await listen<{ run: string; event: DevEvent }>('dev-run', (e) => {
    if (e.payload.run === run) {onEvent(e.payload.event);}
  });
  try {
    return await invoke<DevRunResult>('local_workspace_run_dev', { run, workspacePath, prompt: promptText });
  } finally {
    unlisten();
  }
}

/** Stops a run started by `runLocalDev`. */
export async function cancelLocalDev(run: string): Promise<boolean> {
  return isTauri() ? invoke<boolean>('local_workspace_cancel_dev', { run }) : false;
}

// Keyring / Secure storage
export async function keychainGet(service: string, key: string): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('keychain_get', { service, key });
  }
  return localStorage.getItem(`${service}:${key}`);
}

export async function keychainSet(service: string, key: string, value: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>('keychain_set', { service, key, value });
  }
  localStorage.setItem(`${service}:${key}`, value);
}

// Gateway status check
export async function checkGatewayStatus(url?: string): Promise<GatewayStatus> {
  if (isTauri()) {
    return invoke<GatewayStatus>('bot_check_gateway', { url });
  }
  return {
    connected: false,
    url: url || 'http://127.0.0.1:18789',
    message: 'Browser sandbox (Tauri not detected)',
  };
}
