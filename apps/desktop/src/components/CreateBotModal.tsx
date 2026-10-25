import React, { useState } from 'react';
import { X, Sparkles, Cpu, Cloud } from 'lucide-react';
import type { Bot } from '../types';

interface CreateBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveBot: (newBot: Bot) => void;
}

export function CreateBotModal({ isOpen, onClose, onSaveBot }: CreateBotModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [model, setModel] = useState('zenlm-70b');
  const [endpoint, setEndpoint] = useState<'local' | 'cloud'>('local');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful and intelligent personal bot assistant.'
  );

  if (!isOpen) {return null;}

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {return;}

    const newBot: Bot = {
      id: `bot_${Date.now()}`,
      name: name.trim(),
      role: role.trim() || 'Custom Assistant',
      description: description.trim() || 'Custom bot assistant',
      emoji: emoji || '🤖',
      model,
      endpoint,
      systemPrompt,
      isStarred: false,
    };

    onSaveBot(newBot);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#141414] border border-[#262626] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#202020]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#222222] flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">Create New Bot</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[#202020] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3 flex flex-col gap-1.5">
              <label className="text-gray-400 font-medium">Bot Name</label>
              <input
                type="text"
                placeholder="e.g. Researcher, Data Analyst"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
            </div>
            <div className="col-span-1 flex flex-col gap-1.5">
              <label className="text-gray-400 font-medium">Icon</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={2}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-center text-white text-base focus:outline-none focus:border-gray-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 font-medium">Role / Specialty</label>
            <input
              type="text"
              placeholder="e.g. Code Reviewer & Local Refactoring Specialist"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 font-medium">Description</label>
            <input
              type="text"
              placeholder="e.g. Focused on fast and accurate Python and TypeScript edits"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>

          {/* Model & Target Endpoint */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-gray-400 font-medium flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-gray-500" /> Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-gray-500"
              >
                <option value="zenlm-70b">ZenLM 70B (Local / Fast)</option>
                <option value="hanzo-dev">Hanzo Dev (Coding Agent)</option>
                <option value="claude-3-7-sonnet">Claude 3.7 Sonnet</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="local-daemon">Local Daemon (127.0.0.1:18789)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-gray-400 font-medium flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-gray-500" /> Target Runtime
              </label>
              <div className="flex rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-1">
                <button
                  type="button"
                  onClick={() => setEndpoint('local')}
                  className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                    endpoint === 'local' ? 'bg-[#282828] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => setEndpoint('cloud')}
                  className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                    endpoint === 'cloud' ? 'bg-[#282828] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Cloud
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 font-medium">System Instructions</label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define instructions, personality, guidelines..."
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none font-mono text-[11px]"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#202020]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#1a1a1a] hover:bg-[#222222] text-gray-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-white hover:bg-gray-200 text-black font-semibold transition-colors shadow-sm"
            >
              Create Bot
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
