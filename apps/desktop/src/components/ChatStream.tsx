import React, { useEffect, useRef } from 'react';
import { Face } from './Face';
import { FileCode, Check } from 'lucide-react';
import type { Message, Bot } from '../types';

interface ChatStreamProps {
  messages: Message[];
  bot: Bot;
  onSelectOption: (choiceId: string, choiceLabel: string) => void;
  botStatusText?: string;
  isBotThinking?: boolean;
}

export function ChatStream({
  messages,
  bot: _bot,
  onSelectOption,
  botStatusText,
  isBotThinking,
}: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botStatusText, isBotThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Timestamp */}
        <div className="text-center">
          <span className="text-xs text-gray-500 font-medium">Today 10:03 AM</span>
        </div>

        {/* Message turns */}
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] bg-[#1c1c1c] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm border border-[#262626] shadow-sm leading-relaxed">
                  {msg.text}
                </div>
              </div>
            );
          }

          // Bot message
          return (
            <div key={msg.id} className="flex flex-col gap-3">
              {/* If there's a status line (e.g. "Starting the onboarding") */}
              {msg.statusText && (
                <div className="flex items-center gap-2 text-xs text-gray-400 pl-1">
                  <Face size={18} status="idle" />
                  <span>{msg.statusText}</span>
                </div>
              )}

              {/* Text bubble */}
              {msg.text && (
                <div className="bg-[#181818] text-gray-200 px-4 py-3 rounded-2xl text-sm leading-relaxed border border-[#242424] max-w-xl">
                  {msg.text}
                </div>
              )}

              {/* Local files edited badge if any */}
              {msg.localFilesChanged && msg.localFilesChanged.length > 0 && (
                <div className="bg-[#121c16] border border-emerald-900/40 rounded-xl p-3 text-xs text-emerald-300 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Modified {msg.localFilesChanged.length} local file(s):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-emerald-200/80 font-mono text-[11px]">
                    {msg.localFilesChanged.map((file, i) => (
                      <li key={i}>{file}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interactive Choice Card (Screenshot 1) */}
              {msg.choiceCard && (
                <div className="bg-[#161616] border border-[#242424] rounded-2xl p-4.5 flex flex-col gap-3 max-w-xl shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-100">
                    {msg.choiceCard.question}
                  </h3>

                  <div className="flex flex-col gap-2 mt-1">
                    {msg.choiceCard.options.map((opt) => {
                      const isSelected = msg.choiceCard?.selectedChoiceId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => onSelectOption(opt.id, opt.label)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                            isSelected
                              ? 'bg-[#222222] border border-gray-500 text-white shadow-sm'
                              : 'bg-[#1a1a1a] hover:bg-[#202020] border border-[#282828] text-gray-300 hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                              isSelected
                                ? 'bg-white text-black'
                                : 'bg-[#282828] text-gray-400'
                            }`}
                          >
                            {opt.badge}
                          </span>
                          <span className="flex-1">{opt.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Live thinking / status indicator */}
        {(botStatusText || isBotThinking) && (
          <div className="flex items-center gap-2.5 text-xs text-gray-400 pl-1 animate-pulse">
            <Face size={20} status={isBotThinking ? 'thinking' : 'idle'} />
            <span>{botStatusText || 'Thinking...'}</span>
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}
