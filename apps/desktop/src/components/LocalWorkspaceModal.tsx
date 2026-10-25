import React, { useState } from 'react';
import { X, FolderOpen, FolderGit2, FileText, Play } from 'lucide-react';
import { openFolderDialog, listLocalWorkspace, runLocalDev } from '../lib/tauri';
import type { LocalWorkspace } from '../types';

interface LocalWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: LocalWorkspace | null;
  onSetWorkspace: (ws: LocalWorkspace) => void;
}

export function LocalWorkspaceModal({
  isOpen,
  onClose,
  currentWorkspace,
  onSetWorkspace,
}: LocalWorkspaceModalProps) {
  const [loading, setLoading] = useState(false);
  const [devPrompt, setDevPrompt] = useState('');
  const [devRunning, setDevRunning] = useState(false);
  const [devOutput, setDevOutput] = useState<string | null>(null);

  if (!isOpen) {return null;}

  const handlePickFolder = async () => {
    try {
      setLoading(true);
      const folder = await openFolderDialog();
      if (!folder) {return;}

      const files = await listLocalWorkspace(folder);
      const name = folder.split('/').filter(Boolean).pop() || 'workspace';

      const ws: LocalWorkspace = {
        name,
        path: folder,
        files,
      };

      onSetWorkspace(ws);
    } catch (err) {
      console.error('Failed to open workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDev = async () => {
    if (!currentWorkspace || !devPrompt.trim() || devRunning) {return;}
    try {
      setDevRunning(true);
      setDevOutput('Invoking hanzoai/dev on local machine...');
      const res = await runLocalDev(currentWorkspace.path, devPrompt.trim());
      setDevOutput(res.output || (res.success ? 'Completed successfully!' : 'Completed with warnings.'));
      // refresh workspace files
      const updatedFiles = await listLocalWorkspace(currentWorkspace.path);
      onSetWorkspace({ ...currentWorkspace, files: updatedFiles });
    } catch (err: unknown) {
      setDevOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDevRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#141414] border border-[#262626] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#202020]">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Local Files & Workspace</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[#202020] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          {/* Active Folder Info */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181818] border border-[#242424]">
            <div>
              <span className="text-gray-400 font-medium block">Current Workspace</span>
              <span className="text-white font-semibold font-mono text-[11px] truncate max-w-xs block mt-0.5">
                {currentWorkspace ? currentWorkspace.path : 'No folder linked'}
              </span>
            </div>
            <button
              onClick={handlePickFolder}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{loading ? 'Opening...' : 'Select Folder'}</span>
            </button>
          </div>

          {/* Files preview */}
          {currentWorkspace && (
            <div className="flex flex-col gap-2">
              <span className="text-gray-400 font-medium">
                Files in workspace ({currentWorkspace.files.length})
              </span>
              <div className="bg-[#101010] border border-[#222222] rounded-xl p-2.5 max-h-40 overflow-y-auto space-y-1">
                {currentWorkspace.files.slice(0, 30).map((file, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] text-gray-300 px-2 py-1 rounded hover:bg-[#181818]">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0 font-mono">
                      {file.is_dir ? 'dir' : `${Math.round(file.size / 1024)} KB`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local Code Editing with hanzoai/dev */}
          {currentWorkspace && (
            <div className="flex flex-col gap-2 border-t border-[#202020] pt-3">
              <span className="text-gray-300 font-medium flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-blue-400" /> Run Hanzo Dev on this Workspace
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Refactor API endpoints to use async/await"
                  value={devPrompt}
                  onChange={(e) => setDevPrompt(e.target.value)}
                  className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={handleRunDev}
                  disabled={devRunning || !devPrompt.trim()}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors"
                >
                  {devRunning ? 'Running...' : 'Run'}
                </button>
              </div>

              {devOutput && (
                <pre className="bg-[#0e0e0e] border border-[#242424] rounded-xl p-2.5 text-[10px] text-gray-300 font-mono max-h-28 overflow-y-auto whitespace-pre-wrap">
                  {devOutput}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#101010] border-t border-[#1e1e1e] flex items-center justify-end">
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
