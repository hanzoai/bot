import React, { useEffect, useState } from 'react';

export interface FaceProps {
  size?: number;
  isStarred?: boolean;
  status?: 'idle' | 'blinking' | 'talking' | 'thinking' | 'listening';
  avatar?: string;
  emoji?: string;
  name?: string;
  className?: string;
}

export function Face({
  size = 48,
  isStarred = false,
  status = 'idle',
  avatar,
  emoji,
  name = 'Bot',
  className = '',
}: FaceProps) {
  const [blink, setBlink] = useState(false);
  const [talkTick, setTalkTick] = useState(0);

  // Auto blinking effect
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 3800 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Talking animation effect
  useEffect(() => {
    if (status !== 'talking') {
      return () => {};
    }
    const interval = setInterval(() => {
      setTalkTick((t) => (t + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [status]);

  if (avatar) {
    return (
      <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
        <img
          src={avatar}
          alt={name}
          className="w-full h-full rounded-full object-cover border border-[#2c2c2c]"
        />
        {isStarred && (
          <div
            className="absolute -bottom-1 -right-1 bg-amber-500 text-black rounded-full flex items-center justify-center shadow-md border-2 border-[#121212]"
            style={{ width: Math.max(14, size * 0.32), height: Math.max(14, size * 0.32) }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  if (emoji) {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 rounded-full bg-[#1e1e1e] border border-[#2c2c2c] ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        <span>{emoji}</span>
        {isStarred && (
          <div
            className="absolute -bottom-1 -right-1 bg-amber-500 text-black rounded-full flex items-center justify-center shadow-md border-2 border-[#121212]"
            style={{ width: Math.max(14, size * 0.32), height: Math.max(14, size * 0.32) }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  // The Iconic Hanzo Bot Face: white disc with two vertical pill eyes
  const eyeHeight = size * 0.28;
  const eyeWidth = size * 0.11;
  const eyeSpacing = size * 0.16;

  const isBlinkingNow = blink || status === 'blinking';

  let eyeScaleY = isBlinkingNow ? 0.12 : 1;
  if (status === 'talking') {
    eyeScaleY = talkTick % 2 === 0 ? 1.25 : 0.85;
  } else if (status === 'thinking') {
    eyeScaleY = 0.65;
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full bg-white transition-all duration-150 ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: status === 'talking' ? '0 0 18px rgba(255, 255, 255, 0.45)' : 'none',
      }}
    >
      {/* Two vertical pill eyes */}
      <div
        className="flex items-center justify-center"
        style={{
          gap: eyeSpacing,
          transform: status === 'thinking' ? 'translateY(-2px)' : 'none',
        }}
      >
        <span
          className="bg-black rounded-full transition-transform duration-100 ease-in-out"
          style={{
            width: eyeWidth,
            height: eyeHeight,
            transform: `scaleY(${eyeScaleY})`,
          }}
        />
        <span
          className="bg-black rounded-full transition-transform duration-100 ease-in-out"
          style={{
            width: eyeWidth,
            height: eyeHeight,
            transform: `scaleY(${eyeScaleY})`,
          }}
        />
      </div>

      {/* Gold star badge */}
      {isStarred && (
        <div
          className="absolute -bottom-0.5 -right-0.5 bg-amber-500 text-black rounded-full flex items-center justify-center shadow-lg border-2 border-[#121212]"
          style={{ width: Math.max(14, size * 0.32), height: Math.max(14, size * 0.32) }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      )}
    </div>
  );
}
