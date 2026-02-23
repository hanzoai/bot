import { html, type TemplateResult } from "lit";

// Channel-specific SVG icons
// All icons use currentColor via CSS, 24x24 viewBox

// ── Messaging channels ──────────────────────────────────────────────

export const whatsappIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path
      d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.23-1.24A9.96 9.96 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.4 14.1c-.23.63-1.32 1.2-1.82 1.28-.5.07-.96.2-3.13-.67-2.62-1.05-4.3-3.72-4.43-3.9-.13-.17-1.05-1.4-1.05-2.67 0-1.27.67-1.9.9-2.16.24-.26.52-.32.69-.32h.5c.16 0 .37-.06.58.45.21.51.72 1.76.78 1.89.07.13.11.28.02.45-.09.17-.13.28-.26.43-.13.15-.28.33-.4.45-.13.13-.26.27-.11.52.15.26.66 1.08 1.41 1.75.97.87 1.79 1.14 2.04 1.27.26.13.4.11.56-.07.15-.17.64-.75.81-1.01.17-.26.35-.21.58-.13.24.09 1.5.71 1.76.84.26.13.43.2.5.3.06.11.06.63-.17 1.25z"
    />
  </svg>
`;

export const telegramIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.58 7.45c-.12.54-.43.67-.88.42l-2.43-1.79-1.17 1.13c-.13.13-.24.24-.49.24l.17-2.46 4.46-4.03c.19-.17-.04-.27-.3-.1l-5.52 3.47-2.38-.74c-.52-.16-.53-.52.11-.77l9.3-3.58c.43-.16.81.1.67.76z"
    />
  </svg>
`;

export const discordIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path
      d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.36-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.02.03.05.03.07.02 1.72-.53 3.45-1.33 5.24-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"
    />
  </svg>
`;

export const slackIcon = html`
  <svg viewBox="0 0 24 24">
    <path
      d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"
      fill="currentColor"
    />
    <path
      d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
      fill="currentColor"
    />
    <path
      d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"
      fill="currentColor"
    />
    <path
      d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"
      fill="currentColor"
    />
    <path
      d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"
      fill="currentColor"
    />
    <path
      d="M15.5 19v1.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5h1.5z"
      fill="currentColor"
    />
    <path
      d="M10 9.5c0 .83-.67 1.5-1.5 1.5h-5C2.67 11 2 10.33 2 9.5S2.67 8 3.5 8h5c.83 0 1.5.67 1.5 1.5z"
      fill="currentColor"
    />
    <path d="M8.5 5V3.5C8.5 2.67 9.17 2 10 2s1.5.67 1.5 1.5S10.83 5 10 5H8.5z" fill="currentColor" />
  </svg>
`;

export const signalIcon = html`
  <svg viewBox="0 0 24 24">
    <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5z" fill="currentColor" />
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
  </svg>
`;

export const imessageIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
  </svg>
`;

export const ircIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 4h16v12H5.17L4 17.17V4z" />
    <path d="M8 9h8" />
    <path d="M8 12h4" />
  </svg>
`;

export const lineIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path
      d="M12 2C6.48 2 2 5.81 2 10.5c0 4.01 3.17 7.36 7.5 8.24V22l3.25-2.82c.41.05.83.07 1.25.07 5.52 0 10-3.81 10-8.5S17.52 2 12 2z"
    />
  </svg>
`;

export const googlechatIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3a9 9 0 1 0 0 18h5l2 2v-5a9 9 0 0 0-7-14z" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
  </svg>
`;

export const msteamsIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path
      d="M19.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21.5 8h-4a1 1 0 0 0-1 1v4.5a3 3 0 0 0 6 0V9a1 1 0 0 0-1-1zM14 5.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0zM15 9H4a1 1 0 0 0-1 1v5a4.5 4.5 0 0 0 9 0v-2h3V10a1 1 0 0 0-1-1z"
    />
  </svg>
`;

export const mattermostIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
    <path d="M8 10h8" />
    <path d="M8 14h5" />
  </svg>
`;

export const nextcloudIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12a4 4 0 0 1 8 0" />
    <path d="M10 15a2 2 0 0 1 4 0" />
  </svg>
`;

export const bluebubblesIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="8" cy="14" r="3" />
    <circle cx="16" cy="14" r="3" />
    <path d="M6.5 11.5a5.5 5.5 0 0 1 11 0" />
  </svg>
`;

export const nostrIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8 16s1.5-2 4-2 4 2 4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
`;

export const feishuIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 6l8 4 8-4M4 6v12l8 4M4 6l8-4 8 4M12 10v12M20 6v12l-8 4" />
  </svg>
`;

export const zaloIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M7 15l3-6h4l-3 6" />
    <path d="M14 9h3v6" />
  </svg>
`;

export const twitchIcon = html`
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M4 2l-2 4v14h5v3h3l3-3h4l5-5V2H4zm15 10l-3 3h-4l-3 3v-3H5V4h14v8z" />
    <path d="M14 6h2v5h-2zM10 6h2v5h-2z" />
  </svg>
`;

export const tlonIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18" />
  </svg>
`;

export const voiceCallIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"
    />
  </svg>
`;

export const matrixIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M2 4v16h2" />
    <path d="M22 4v16h-2" />
    <path d="M7 8v8M12 8v8M17 8v8" />
    <path d="M7 10h5M7 14h10" />
  </svg>
`;

// ── Coming soon channels ────────────────────────────────────────────

export const blueskyIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 4c2 2 5 5.5 5 8a5 5 0 0 1-10 0c0-2.5 3-6 5-8z" />
    <path d="M7 17c1-1 3-1.5 5-1.5s4 .5 5 1.5" />
  </svg>
`;

export const xTwitterIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 4l6.5 8L4 20h2l5.5-6.5L16 20h4l-7-8.5L19.5 4H18l-5 6L9 4H4z" />
  </svg>
`;

export const substackIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
`;

export const rssIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 11a9 9 0 0 1 9 9" />
    <path d="M4 4a16 16 0 0 1 16 16" />
    <circle cx="5" cy="19" r="1" />
  </svg>
`;

export const emailIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
`;

export const blogIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </svg>
`;

export const mastodonIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 2C7 2 3 5.5 3 10v2c0 4.5 4 8 9 8s9-3.5 9-8v-2c0-4.5-4-8-9-8z" />
    <path d="M8 12v-2a4 4 0 0 1 8 0v2" />
  </svg>
`;

export const redditIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="13" r="7" />
    <path d="M12 3v4" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <path d="M9 16c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
  </svg>
`;

export const linkedinIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 11v6M7 7v.01M11 11v6M11 13a3 3 0 0 1 6 0v4" />
  </svg>
`;

export const facebookIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
`;

export const smsIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
  </svg>
`;

export const instagramIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="17.5" cy="6.5" r="1.5" />
  </svg>
`;

// ── Generic fallback ────────────────────────────────────────────────

export const genericChannelIcon = html`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
  </svg>
`;

// ── Icon registry ───────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, TemplateResult> = {
  whatsapp: whatsappIcon,
  telegram: telegramIcon,
  discord: discordIcon,
  slack: slackIcon,
  signal: signalIcon,
  imessage: imessageIcon,
  irc: ircIcon,
  line: lineIcon,
  googlechat: googlechatIcon,
  msteams: msteamsIcon,
  mattermost: mattermostIcon,
  "nextcloud-talk": nextcloudIcon,
  bluebubbles: bluebubblesIcon,
  nostr: nostrIcon,
  feishu: feishuIcon,
  zalo: zaloIcon,
  zalouser: zaloIcon,
  twitch: twitchIcon,
  tlon: tlonIcon,
  "voice-call": voiceCallIcon,
  matrix: matrixIcon,
  bluesky: blueskyIcon,
  "x-twitter": xTwitterIcon,
  substack: substackIcon,
  rss: rssIcon,
  email: emailIcon,
  blog: blogIcon,
  mastodon: mastodonIcon,
  reddit: redditIcon,
  linkedin: linkedinIcon,
  facebook: facebookIcon,
  sms: smsIcon,
  instagram: instagramIcon,
};

export function channelIcon(channelId: string): TemplateResult {
  return CHANNEL_ICONS[channelId] ?? genericChannelIcon;
}

// ── "Coming soon" channel metadata ──────────────────────────────────

export type ComingSoonChannel = {
  id: string;
  label: string;
};

export const COMING_SOON_CHANNELS: ComingSoonChannel[] = [
  { id: "bluesky", label: "Bluesky" },
  { id: "x-twitter", label: "X / Twitter" },
  { id: "substack", label: "Substack" },
  { id: "rss", label: "RSS / Atom" },
  { id: "email", label: "Email" },
  { id: "blog", label: "Blog / Webhook" },
  { id: "mastodon", label: "Mastodon" },
  { id: "reddit", label: "Reddit" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Messenger" },
  { id: "sms", label: "SMS" },
  { id: "instagram", label: "Instagram" },
];
