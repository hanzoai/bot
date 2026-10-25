import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';
import { CreateBotModal } from './components/CreateBotModal';
import { ConnectAppsModal } from './components/ConnectAppsModal';
import { LocalWorkspaceModal } from './components/LocalWorkspaceModal';
import { VoiceModeModal } from './components/VoiceModeModal';
import { checkGatewayStatus } from './lib/tauri';
import { defaultBotClient } from './lib/botClient';
import type { Bot, Message, LocalWorkspace, GatewayStatus } from './types';

const INITIAL_BOTS: Bot[] = [
  {
    id: 'hanzo-bot',
    name: 'Hanzo Bot',
    role: 'Personal Assistant',
    description: 'Your personal AI assistant for work and everyday life',
    isStarred: true,
    model: 'zenlm-70b',
    endpoint: 'local',
    systemPrompt:
      "You are Hanzo Bot, the user's primary personal assistant. You help take things off their plate, coordinate their schedule, and write code.",
  },
  {
    id: 'coder-bot',
    name: 'Coder Bot',
    role: 'Local Workspace Developer',
    description: 'Codes directly in local directories using hanzoai/dev',
    emoji: '💻',
    model: 'hanzo-dev',
    endpoint: 'local',
    systemPrompt:
      'You are Coder Bot, specializing in local software engineering, refactoring, and code automation.',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    role: 'Web Grounding & Synthesis',
    description: 'Researches documents, papers, and web information',
    emoji: '🔍',
    model: 'claude-3-7-sonnet',
    endpoint: 'cloud',
    systemPrompt: 'You are a meticulous research and intelligence agent.',
  },
];

// Screenshot 1 & 2 exact onboarding conversation
const INITIAL_MESSAGES: Record<string, Message[]> = {
  'hanzo-bot': [
    {
      id: 'm1',
      sender: 'bot',
      botId: 'hanzo-bot',
      statusText: 'Starting the onboarding',
      text: "Hi Zach! I'm Hanzo Bot, your new personal assistant. I can help with your work and everyday life, and take things off your plate.",
      timestamp: 'Today 10:03 AM',
      choiceCard: {
        id: 'name-choice',
        question: 'What would you like to call me? You can always change this later.',
        options: [
          { id: 'opt-drew', badge: 'A', label: 'Drew' },
          { id: 'opt-nori', badge: 'B', label: 'Nori' },
          { id: 'opt-hanzobot', badge: 'C', label: 'Hanzo Bot' },
        ],
      },
    },
  ],
  'coder-bot': [
    {
      id: 'c1',
      sender: 'bot',
      botId: 'coder-bot',
      statusText: 'Workspace ready',
      text: "Ready to inspect and edit your local folders. Click 'Local folder' in the top bar to point me to any codebase on this machine.",
      timestamp: 'Today 10:05 AM',
    },
  ],
};

export function App() {
  const [bots, setBots] = useState<Bot[]>(INITIAL_BOTS);
  const [activeBotId, setActiveBotId] = useState<string>('hanzo-bot');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({
    connected: false,
    url: 'http://127.0.0.1:18789',
    message: 'Checking local daemon...',
  });

  const [isBotThinking, setIsBotThinking] = useState(false);
  const [botStatusText, setBotStatusText] = useState<string | undefined>(undefined);

  // Modals
  const [isCreateBotOpen, setIsCreateBotOpen] = useState(false);
  const [isConnectAppsOpen, setIsConnectAppsOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);

  // Active bot
  const activeBot = bots.find((b) => b.id === activeBotId) || bots[0];
  const messages = messagesMap[activeBotId] || [];

  // Check local daemon on mount and periodically
  useEffect(() => {
    let mounted = true;
    const probe = async () => {
      const status = await checkGatewayStatus();
      if (mounted) {setGatewayStatus(status);}
    };
    void probe();
    const interval = setInterval(() => {
      void probe();
    }, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: 'Just now',
    };

    const nextMessages = [...messages, userMsg];
    setMessagesMap((prev) => ({ ...prev, [activeBotId]: nextMessages }));

    setIsBotThinking(true);
    setBotStatusText('Thinking...');

    try {
      const reply = await defaultBotClient.sendMessage(
        activeBot,
        text,
        nextMessages,
        workspace?.path
      );

      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        botId: activeBotId,
        text: reply.text,
        timestamp: 'Just now',
        localFilesChanged: reply.filesChanged,
      };

      setMessagesMap((prev) => ({
        ...prev,
        [activeBotId]: [...(prev[activeBotId] || []), botMsg],
      }));
    } finally {
      setIsBotThinking(false);
      setBotStatusText(undefined);
    }
  };

  const handleSelectOption = (choiceId: string, choiceLabel: string) => {
    // Update the choice card in the message to mark selected
    setMessagesMap((prev) => {
      const current = prev[activeBotId] || [];
      const updated = current.map((msg) => {
        if (msg.choiceCard) {
          return {
            ...msg,
            choiceCard: {
              ...msg.choiceCard,
              selectedChoiceId: choiceId,
            },
          };
        }
        return msg;
      });
      return { ...prev, [activeBotId]: updated };
    });

    // If changing the bot's name
    if (choiceId === 'opt-drew' || choiceId === 'opt-nori') {
      setBots((prev) =>
        prev.map((b) => (b.id === activeBotId ? { ...b, name: choiceLabel } : b))
      );
    }

    // Auto-send response
    void handleSendMessage(`I'd like to call you ${choiceLabel}.`);
  };

  const handleSaveBot = (newBot: Bot) => {
    setBots((prev) => [...prev, newBot]);
    setActiveBotId(newBot.id);
    setMessagesMap((prev) => ({
      ...prev,
      [newBot.id]: [
        {
          id: `init_${newBot.id}`,
          sender: 'bot',
          botId: newBot.id,
          statusText: 'Bot online',
          text: `Hi Zach! I am ${newBot.name}, ready to assist you.`,
          timestamp: 'Just now',
        },
      ],
    }));
  };

  return (
    <div className="flex h-screen w-screen bg-[#0b0b0b] text-gray-100 overflow-hidden font-sans">
      {/* Sidebar with bots and connect apps */}
      <Sidebar
        bots={bots}
        activeBotId={activeBotId}
        onSelectBot={setActiveBotId}
        onCreateBot={() => setIsCreateBotOpen(true)}
        onOpenConnectApps={() => setIsConnectAppsOpen(true)}
      />

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0c0c]">
        {/* Frameless Top Header */}
        <Header
          bot={activeBot}
          gatewayStatus={gatewayStatus}
          workspace={workspace}
          onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
          onOpenBotSettings={() => setIsCreateBotOpen(true)}
        />

        {/* Chat Conversation Stream */}
        <ChatStream
          messages={messages}
          bot={activeBot}
          onSelectOption={handleSelectOption}
          botStatusText={botStatusText}
          isBotThinking={isBotThinking}
        />

        {/* Bottom Composer Bar */}
        <div className="flex justify-center w-full">
          <Composer
            onSendMessage={handleSendMessage}
            onOpenAttachment={() => setIsWorkspaceModalOpen(true)}
            onStartVoiceMode={() => setIsVoiceModeOpen(true)}
            placeholder={`Message ${activeBot.name}`}
            disabled={isBotThinking}
          />
        </div>
      </main>

      {/* Modals */}
      <CreateBotModal
        isOpen={isCreateBotOpen}
        onClose={() => setIsCreateBotOpen(false)}
        onSaveBot={handleSaveBot}
      />

      <ConnectAppsModal
        isOpen={isConnectAppsOpen}
        onClose={() => setIsConnectAppsOpen(false)}
      />

      <LocalWorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        currentWorkspace={workspace}
        onSetWorkspace={setWorkspace}
      />

      <VoiceModeModal
        isOpen={isVoiceModeOpen}
        onClose={() => setIsVoiceModeOpen(false)}
        bot={activeBot}
      />
    </div>
  );
}

export default App;
