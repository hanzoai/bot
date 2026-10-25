import React, { useState } from 'react';
import { X, Check, ShieldCheck } from 'lucide-react';

interface ConnectAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppIntegration {
  id: string;
  name: string;
  category: string;
  iconBg: string;
  iconText: string;
  description: string;
  connected: boolean;
}

export function ConnectAppsModal({ isOpen, onClose }: ConnectAppsModalProps) {
  const [apps, setApps] = useState<AppIntegration[]>([
    {
      id: 'gmail',
      name: 'Google Mail',
      category: 'Google Workspace',
      iconBg: '#ea4335',
      iconText: 'M',
      description: 'Read and summarize emails, draft replies, and find invoices.',
      connected: true,
    },
    {
      id: 'gcal',
      name: 'Google Calendar',
      category: 'Google Workspace',
      iconBg: '#4285f4',
      iconText: 'C',
      description: 'Check your schedule, find conflicts, and book meetings.',
      connected: true,
    },
    {
      id: 'gdrive',
      name: 'Google Drive',
      category: 'Google Workspace',
      iconBg: '#34a853',
      iconText: 'D',
      description: 'Search documents, read PDFs, and organize project folders.',
      connected: true,
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'Messaging',
      iconBg: '#4a154b',
      iconText: '#',
      description: 'Monitor channels, notify teams, and send status updates.',
      connected: false,
    },
    {
      id: 'github',
      name: 'GitHub',
      category: 'Developer',
      iconBg: '#24292e',
      iconText: 'GH',
      description: 'Inspect pull requests, review issues, and trigger CI builds.',
      connected: false,
    },
    {
      id: 'notion',
      name: 'Notion',
      category: 'Productivity',
      iconBg: '#000000',
      iconText: 'N',
      description: 'Read and update workspaces, task lists, and documentation.',
      connected: false,
    },
  ]);

  if (!isOpen) {return null;}

  const toggleConnect = (id: string) => {
    setApps((prev) =>
      prev.map((app) => (app.id === id ? { ...app, connected: !app.connected } : app))
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#141414] border border-[#262626] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#202020]">
          <div>
            <h2 className="text-sm font-semibold text-white">Connect Apps & Tools</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Allow Hanzo Bot to access your everyday apps and take things off your plate.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[#202020] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List of Apps */}
        <div className="p-5 flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
          {apps.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-[#181818] border border-[#242424] hover:border-[#2e2e2e] transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
                  style={{ backgroundColor: app.iconBg }}
                >
                  {app.iconText}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{app.name}</span>
                    <span className="text-[10px] text-gray-500 bg-[#202020] px-1.5 py-0.5 rounded">
                      {app.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs leading-normal">
                    {app.description}
                  </p>
                </div>
              </div>

              <button
                onClick={() => toggleConnect(app.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  app.connected
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
                    : 'bg-[#222222] hover:bg-[#2c2c2c] text-white border border-[#333333]'
                }`}
              >
                {app.connected ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Connected</span>
                  </>
                ) : (
                  <span>Connect</span>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3.5 bg-[#101010] border-t border-[#1e1e1e] flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>End-to-end encrypted with Hanzo KMS</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-gray-200 text-black rounded-lg font-semibold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
