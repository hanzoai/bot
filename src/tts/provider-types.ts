import type { HanzoBotConfig } from "../config/config.js";
import type { ResolvedTtsConfig, TtsDirectiveOverrides } from "./tts.js";

export type SpeechProviderId = string;

export type SpeechSynthesisTarget = "audio-file" | "voice-note";

export type SpeechProviderConfiguredContext = {
  cfg?: HanzoBotConfig;
  config: ResolvedTtsConfig;
};

export type SpeechSynthesisRequest = {
  text: string;
  cfg: HanzoBotConfig;
  config: ResolvedTtsConfig;
  target: SpeechSynthesisTarget;
  overrides?: TtsDirectiveOverrides;
};

export type SpeechSynthesisResult = {
  audioBuffer: Buffer;
  outputFormat: string;
  fileExtension: string;
  voiceCompatible: boolean;
};

export type SpeechTelephonySynthesisRequest = {
  text: string;
  cfg: HanzoBotConfig;
  config: ResolvedTtsConfig;
};

export type SpeechTelephonySynthesisResult = {
  audioBuffer: Buffer;
  outputFormat: string;
  sampleRate: number;
};

export type SpeechVoiceOption = {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  locale?: string;
  gender?: string;
  personalities?: string[];
};

export type SpeechListVoicesRequest = {
  cfg?: HanzoBotConfig;
  config?: ResolvedTtsConfig;
  apiKey?: string;
  baseUrl?: string;
};
