import { invoke } from '@tauri-apps/api/core';
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

export async function runLocalDev(workspacePath: string, promptText: string): Promise<{ session_id: string; output: string; success: boolean }> {
  if (isTauri()) {
    return invoke('local_workspace_run_dev', { workspacePath, prompt: promptText });
  }
  return { session_id: 'web_mock', output: 'Simulated local dev execution', success: true };
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
