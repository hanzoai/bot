import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';
import { CreateBotModal } from './components/CreateBotModal';
import { ConnectAppsModal } from './components/ConnectAppsModal';
import { LocalWorkspaceModal } from './components/LocalWorkspaceModal';
import { VoiceModeModal } from './components/VoiceModeModal';
import { cancelLocalDev, checkGatewayStatus, listLocalWorkspace, runLocalDev, type DevEvent } from './lib/tauri';
import { defaultBotClient } from './lib/botClient';
import type { Bot, Message, LocalWorkspace, GatewayStatus, Step } from './types';

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
  // The Hanzo Dev run in flight, which the composer's Stop ends.
  const [devRun, setDevRun] = useState<string | null>(null);

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

  const append = (botId: string, msg: Message) =>
    setMessagesMap((prev) => ({ ...prev, [botId]: [...(prev[botId] || []), msg] }));

  const revise = (botId: string, id: string, change: (msg: Message) => Message) =>
    setMessagesMap((prev) => ({
      ...prev,
      [botId]: (prev[botId] || []).map((m) => (m.id === id ? change(m) : m)),
    }));

  /**
   * Hanzo Dev works the task on the linked folder: each command it runs in its
   * sandbox shows up as a step while it runs, its answer replaces the status
   * when it finishes, and Stop ends it.
   */
  const runDev = async (botId: string, text: string) => {
    if (!workspace) {
      append(botId, {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        botId,
        text: 'Link a folder first (Local folder in the top bar): Hanzo Dev works inside it and nowhere else.',
        timestamp: 'Just now',
      });
      return;
    }
    const run = crypto.randomUUID();
    const id = `dev_${run}`;
    append(botId, {
      id,
      sender: 'bot',
      botId,
      text: '',
      statusText: `Hanzo Dev is working in ${workspace.name}`,
      timestamp: 'Just now',
      isStreaming: true,
      steps: [],
    });
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const onEvent = (event: DevEvent) => {
      const item = event.item;
      if (!item) {return;}
      if (item.type === 'command_execution') {
        const step: Step = {
          id: str(item.id),
          command: str(item.command),
          output: str(item.aggregated_output),
          exitCode: typeof item.exit_code === 'number' ? item.exit_code : null,
          status: (item.status as Step['status']) ?? 'in_progress',
        };
        revise(botId, id, (m) => {
          const steps = m.steps ?? [];
          const at = steps.findIndex((x) => x.id === step.id);
          return { ...m, steps: at < 0 ? [...steps, step] : steps.map((x, i) => (i === at ? step : x)) };
        });
      } else if (item.type === 'file_change' && event.type === 'item.completed') {
        const paths = ((item.changes as Array<{ path?: string }>) ?? []).map((c) => c.path ?? '');
        revise(botId, id, (m) => ({
          ...m,
          localFilesChanged: [...new Set([...(m.localFilesChanged ?? []), ...paths])],
        }));
      } else if (item.type === 'agent_message' && event.type === 'item.completed') {
        revise(botId, id, (m) => ({ ...m, text: str(item.text) }));
      }
    };
    setDevRun(run);
    try {
      const result = await runLocalDev(run, workspace.path, text, onEvent);
      revise(botId, id, (m) => ({
        ...m,
        text: result.output || m.text,
        statusText: result.success ? 'Hanzo Dev finished' : result.output === 'Stopped.' ? 'Stopped' : 'Hanzo Dev failed',
        isStreaming: false,
      }));
      const files = await listLocalWorkspace(workspace.path);
      setWorkspace({ ...workspace, files });
    } catch (err) {
      revise(botId, id, (m) => ({
        ...m,
        text: `Hanzo Dev could not run: ${err instanceof Error ? err.message : String(err)}`,
        statusText: 'Hanzo Dev failed',
        isStreaming: false,
      }));
    } finally {
      setDevRun(null);
    }
  };

  /** Sends a turn to the active bot; `dev` hands it to Hanzo Dev whatever the bot. */
  const handleSendMessage = async (text: string, dev = false) => {
    const botId = activeBotId;
    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: 'Just now',
    };

    const nextMessages = [...messages, userMsg];
    setMessagesMap((prev) => ({ ...prev, [botId]: nextMessages }));

    if (dev || activeBot.model === 'hanzo-dev') {
      await runDev(botId, text);
      return;
    }

    setIsBotThinking(true);
    setBotStatusText('Thinking...');

    try {
      const reply = await defaultBotClient.sendMessage(activeBot, text, nextMessages, workspace?.path);
      append(botId, {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        botId,
        text: reply.text,
        timestamp: 'Just now',
      });
    } catch (err) {
      append(botId, {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        botId,
        statusText: 'No answer',
        text: err instanceof Error ? err.message : String(err),
        timestamp: 'Just now',
      });
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
            onSendMessage={(text) => void handleSendMessage(text)}
            onOpenAttachment={() => setIsWorkspaceModalOpen(true)}
            onStartVoiceMode={() => setIsVoiceModeOpen(true)}
            placeholder={`Message ${activeBot.name}`}
            disabled={isBotThinking || devRun !== null}
            running={devRun !== null}
            onStop={() => {
              if (devRun) {void cancelLocalDev(devRun);}
            }}
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
        running={devRun !== null}
        onRunDev={(prompt) => {
          setIsWorkspaceModalOpen(false);
          void handleSendMessage(prompt, true);
        }}
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
