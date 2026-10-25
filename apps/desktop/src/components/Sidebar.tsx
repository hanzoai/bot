import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Face } from './Face';
import type { Bot } from '../types';

interface SidebarProps {
  bots: Bot[];
  activeBotId: string;
  onSelectBot: (botId: string) => void;
  onCreateBot: () => void;
  onOpenConnectApps: () => void;
}

export function Sidebar({
  bots,
  activeBotId,
  onSelectBot,
  onCreateBot,
  onOpenConnectApps,
}: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBots = bots.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="w-48 bg-[#0b0b0b] border-r border-[#1a1a1a] flex flex-col justify-between p-3 select-none shrink-0 h-full">
      {/* Top action buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 pt-1">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-8 h-8 rounded-full bg-[#161616] hover:bg-[#222222] border border-[#262626] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Search bots"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onCreateBot}
            className="w-8 h-8 rounded-full bg-[#161616] hover:bg-[#222222] border border-[#262626] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Create new bot"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {searchOpen && (
          <div className="px-1">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141414] border border-[#242424] rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
              autoFocus
            />
          </div>
        )}

        {/* Bot Cards List */}
        <div className="flex flex-col gap-3 mt-1 overflow-y-auto max-h-[calc(100vh-140px)] pr-0.5">
          {filteredBots.map((bot) => {
            const isActive = bot.id === activeBotId;
            return (
              <button
                key={bot.id}
                onClick={() => onSelectBot(bot.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-150 ${
                  isActive
                    ? 'bg-[#181818] border border-[#2d2d2d] shadow-sm'
                    : 'bg-[#101010] hover:bg-[#151515] border border-transparent hover:border-[#222222]'
                }`}
              >
                <div className="my-1">
                  <Face
                    size={46}
                    isStarred={bot.isStarred}
                    avatar={bot.avatar}
                    emoji={bot.emoji}
                    name={bot.name}
                  />
                </div>
                <span
                  className={`text-xs font-medium mt-1 truncate max-w-[120px] ${
                    isActive ? 'text-gray-100' : 'text-gray-400'
                  }`}
                >
                  {bot.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile and Connect apps */}
      <div className="flex items-center gap-2 pt-3 border-t border-[#181818]">
        {/* User profile avatar badge */}
        <div className="w-8 h-8 rounded-full bg-[#185adb] text-white flex items-center justify-center font-semibold text-sm shrink-0 shadow-inner">
          Z
        </div>

        {/* Connect apps pill button */}
        <button
          onClick={onOpenConnectApps}
          className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-full bg-[#161616] hover:bg-[#202020] border border-[#242424] text-xs text-gray-300 transition-colors shadow-sm"
          title="Connect Google Workspace, Slack, Notion, and more"
        >
          <span className="truncate text-[11px] font-medium mr-1">Connect apps</span>
          <div className="flex items-center -space-x-1 shrink-0">
            {/* Google Mail */}
            <span className="w-3.5 h-3.5 rounded-full bg-[#ea4335] text-[7px] text-white flex items-center justify-center font-bold">
              M
            </span>
            {/* Google Calendar */}
            <span className="w-3.5 h-3.5 rounded-full bg-[#4285f4] text-[7px] text-white flex items-center justify-center font-bold">
              C
            </span>
            {/* Google Drive */}
            <span className="w-3.5 h-3.5 rounded-full bg-[#34a853] text-[7px] text-white flex items-center justify-center font-bold">
              D
            </span>
          </div>
        </button>
      </div>
    </aside>
  );
}
