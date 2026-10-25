import React from 'react';
import { Minus, Square, X, FolderGit2, Radio } from 'lucide-react';
import { Face } from './Face';
import { windowMinimize, windowToggleMaximize, windowClose } from '../lib/tauri';
import type { Bot, GatewayStatus, LocalWorkspace } from '../types';

interface HeaderProps {
  bot: Bot;
  gatewayStatus: GatewayStatus;
  workspace: LocalWorkspace | null;
  onOpenWorkspaceModal: () => void;
  onOpenBotSettings: () => void;
}

export function Header({
  bot,
  gatewayStatus,
  workspace,
  onOpenWorkspaceModal,
  onOpenBotSettings,
}: HeaderProps) {
  return (
    <header className="h-12 border-b border-[#181818] bg-[#0c0c0c] flex items-center justify-between px-4 select-none drag-region shrink-0">
      {/* Left: workspace or local machine indicator */}
      <div className="flex items-center gap-2 no-drag">
        <button
          onClick={onOpenWorkspaceModal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors border ${
            workspace
              ? 'bg-[#15231c] text-emerald-400 border-emerald-800/40 hover:bg-[#1a2d24]'
              : 'bg-[#141414] text-gray-400 border-[#242424] hover:bg-[#1a1a1a] hover:text-gray-200'
          }`}
          title={workspace ? `Workspace: ${workspace.path}` : 'Open local folder / repository'}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span className="font-medium truncate max-w-[140px]">
            {workspace ? workspace.name : 'Local folder'}
          </span>
        </button>

        {/* Local daemon status pill */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-[#141414] border border-[#222222]"
          title={gatewayStatus.connected ? `Connected to ${gatewayStatus.url}` : gatewayStatus.message || 'Connecting...'}
        >
          <Radio
            className={`w-3 h-3 ${
              gatewayStatus.connected ? 'text-emerald-400 animate-pulse' : 'text-gray-500'
            }`}
          />
          <span className={gatewayStatus.connected ? 'text-emerald-300' : 'text-gray-400'}>
            {gatewayStatus.connected ? '127.0.0.1:18789' : 'cloud'}
          </span>
        </div>
      </div>

      {/* Center: The Iconic Top Bot Pill */}
      <div className="no-drag">
        <button
          onClick={onOpenBotSettings}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#161616] hover:bg-[#1f1f1f] border border-[#262626] transition-colors shadow-sm"
        >
          <Face size={18} avatar={bot.avatar} emoji={bot.emoji} name={bot.name} />
          <span className="text-xs font-semibold text-gray-100">{bot.name}</span>
        </button>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={windowMinimize}
          className="w-7 h-7 rounded hover:bg-[#202020] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={windowToggleMaximize}
          className="w-7 h-7 rounded hover:bg-[#202020] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={windowClose}
          className="w-7 h-7 rounded hover:bg-red-600/80 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
