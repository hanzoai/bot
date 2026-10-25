import React, { useState, useEffect } from 'react';
import { X, Mic, MicOff } from 'lucide-react';
import { Face } from './Face';
import type { Bot } from '../types';

interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: Bot;
}

export function VoiceModeModal({ isOpen, onClose, bot }: VoiceModeModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [faceStatus, setFaceStatus] = useState<'listening' | 'talking' | 'thinking'>('listening');
  const [transcript, setTranscript] = useState('Listening to you...');

  useEffect(() => {
    if (!isOpen) {
      return () => {};
    }

    // Simulate conversational turns in voice mode
    const t1 = setTimeout(() => {
      setFaceStatus('thinking');
      setTranscript('Processing your request...');
    }, 3200);

    const t2 = setTimeout(() => {
      setFaceStatus('talking');
      setTranscript("I'm right here! Let's get through your tasks and schedule for today.");
    }, 4800);

    const t3 = setTimeout(() => {
      setFaceStatus('listening');
      setTranscript('Listening to you...');
    }, 9500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isOpen]);

  if (!isOpen) {return null;}

  return (
    <div className="fixed inset-0 bg-[#090909] z-50 flex flex-col items-center justify-between p-8 select-none">
      {/* Top bar */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-xs font-medium text-gray-400">Live Voice Mode</span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#181818] hover:bg-[#252525] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Center: The Iconic Hanzo Bot Animated Face (Screenshot 5) */}
      <div className="flex flex-col items-center gap-8 my-auto">
        <div className="relative">
          <Face
            size={110}
            status={faceStatus}
            avatar={bot.avatar}
            emoji={bot.emoji}
            name={bot.name}
            className="shadow-[0_0_60px_rgba(255,255,255,0.2)]"
          />
        </div>

        <div className="flex flex-col items-center gap-2 max-w-md text-center">
          <h2 className="text-base font-semibold text-white">{bot.name}</h2>
          <p className="text-sm text-gray-400 leading-relaxed font-normal min-h-[3rem]">
            {transcript}
          </p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-lg ${
            isMuted
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-[#181818] hover:bg-[#222222] text-gray-300 border border-[#2a2a2a]'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-full bg-white hover:bg-gray-200 text-black font-semibold text-xs transition-colors shadow-lg"
        >
          End Voice Call
        </button>
      </div>
    </div>
  );
}
