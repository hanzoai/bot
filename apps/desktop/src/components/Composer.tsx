import React, { useState, useRef } from 'react';
import { Plus, Mic, AudioWaveform, ArrowUp } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (text: string) => void;
  onOpenAttachment: () => void;
  onStartVoiceMode: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Composer({
  onSendMessage,
  onOpenAttachment,
  onStartVoiceMode,
  placeholder = 'Type your answer, or talk about something else',
  disabled = false,
}: ComposerProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled) {return;}
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      // Simulate voice input prompt
      setTimeout(() => {
        setInput('Can you help me organize my work for today?');
        setIsRecording(false);
      }, 2500);
    }
  };

  return (
    <div className="w-full max-w-2xl px-6 pb-6 pt-2 shrink-0">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 bg-[#161616] border border-[#262626] hover:border-[#333333] focus-within:border-[#444444] rounded-full px-3 py-1.5 transition-all shadow-sm"
      >
        {/* Attachment '+' button */}
        <button
          type="button"
          onClick={onOpenAttachment}
          className="w-8 h-8 rounded-full hover:bg-[#222222] text-gray-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
          title="Attach file, local folder, or skill"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Input box */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Listening...' : placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent border-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none px-2 py-1"
        />

        {/* Microphone dictation button */}
        <button
          type="button"
          onClick={toggleRecording}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            isRecording
              ? 'bg-red-500/20 text-red-400 animate-pulse'
              : 'hover:bg-[#222222] text-gray-400 hover:text-white'
          }`}
          title={isRecording ? 'Stop recording' : 'Dictate message'}
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* Voice waveform / Talk mode button OR Send button if text typed */}
        {input.trim() ? (
          <button
            type="submit"
            disabled={disabled}
            className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 text-black flex items-center justify-center transition-colors shrink-0 shadow-sm"
            title="Send"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartVoiceMode}
            className="w-8 h-8 rounded-full hover:bg-[#222222] text-gray-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
            title="Live Voice Mode"
          >
            <AudioWaveform className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
}
