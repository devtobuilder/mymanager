import React, { useState } from 'react';
import {
  Link2,
  Unlink,
  ExternalLink,
  Cpu,
  CheckCircle2,
  ShieldCheck,
  Terminal,
  Info,
} from 'lucide-react';
import { LlmConfig, PlatformAccount, PlatformId } from '../types';
import { PlatformIcon, PLATFORM_META } from './PlatformIcons';

interface AccountsTabProps {
  accounts: PlatformAccount[];
  onUpdateHandle: (platformId: PlatformId, handle: string) => void;
  onToggleLink: (platformId: PlatformId, handle?: string) => void;
  onOpenLoginSession: (platformId: PlatformId, handle?: string) => void;
  llmConfig: LlmConfig;
  onUpdateLlmConfig: (cfg: Partial<LlmConfig>) => void;
}

const PLATFORM_INPUT_GUIDE: Record<
  PlatformId,
  {
    label: string;
    prefix: string;
    placeholder: string;
    example: string;
    helpText: string;
    formatPreviewUrl: (raw: string) => string;
  }
> = {
  twitter: {
    label: 'X (Twitter) Username',
    prefix: '@',
    placeholder: 'your_x_handle',
    example: '@alexcreates',
    helpText: 'X has no post analytics; extracts your live Follower Count from your X profile.',
    formatPreviewUrl: (raw: string) => {
      const clean = raw
        .trim()
        .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
        .replace(/^@/, '')
        .split('/')[0];
      return clean ? `https://x.com/${clean}` : 'https://x.com/your_x_handle';
    },
  },
  linkedin: {
    label: 'LinkedIn Profile Slug or Company Name',
    prefix: 'linkedin.com/in/',
    placeholder: 'first-last-12345',
    example: 'jane-doe',
    helpText: 'Extracts live stats from https://www.linkedin.com/analytics/creator/content/.',
    formatPreviewUrl: () => 'https://www.linkedin.com/analytics/creator/content/',
  },
  youtube: {
    label: 'YouTube Channel Handle',
    prefix: '@',
    placeholder: 'YourChannelName',
    example: '@MyChannel',
    helpText: 'Extracts live stats from YouTube Studio Analytics Hub Overview.',
    formatPreviewUrl: () =>
      'https://studio.youtube.com/channel/UC-MXA8OTNJZWgKQxHjxBvFQ/analytics/hub_overview',
  },
  instagram: {
    label: 'Instagram Username',
    prefix: '@',
    placeholder: 'your.ig.username',
    example: '@creator.studio',
    helpText: 'Extracts live stats from Instagram Account Insights.',
    formatPreviewUrl: () => 'https://www.instagram.com/accounts/insights',
  },
  tiktok: {
    label: 'TikTok Username',
    prefix: '@',
    placeholder: 'your_tiktok_handle',
    example: '@creator.tok',
    helpText: 'Extracts live stats from TikTok Studio.',
    formatPreviewUrl: () => 'https://www.tiktok.com/tiktokstudio',
  },
};

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  onUpdateHandle,
  onToggleLink,
  onOpenLoginSession,
  llmConfig,
  onUpdateLlmConfig,
}) => {

  return (
    <div className="space-y-6 pb-8">
      {/* Persistent Browser Session Overview */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Linked Social Media Accounts & Persistent Browser Profiles
              </h2>
              <p className="text-xs text-slate-400">
                Enter your username/handle for each platform below, or click "Open Browser Login" to sign in inside the persistent browser window.
              </p>
            </div>
          </div>
        </div>

        {/* 5 Platform Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => {
            const meta = PLATFORM_META[acc.id];
            const guide = PLATFORM_INPUT_GUIDE[acc.id];
            const currentInput = acc.handle || '';
            const previewUrl = guide.formatPreviewUrl(currentInput);

            return (
              <div
                key={acc.id}
                className={`rounded-2xl border p-5 transition bg-gradient-to-b ${meta.badgeBg} ${
                  acc.linked ? meta.borderClass : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
                    >
                      <PlatformIcon platform={acc.id} size={22} />
                    </div>
                    <div>
                      <div className="text-base font-bold text-white">{acc.name}</div>
                      <div className="flex items-center gap-1.5 text-xs">
                        {acc.linked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Linked & Authenticated
                          </span>
                        ) : (
                          <span className="text-slate-500">Unlinked</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                      {guide.label}
                    </label>
                    <span className="text-[11px] font-mono text-indigo-400">
                      e.g. {guide.example}
                    </span>
                  </div>

                  {/* Input with platform prefix */}
                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-700/90 bg-slate-950/90 focus-within:border-indigo-500">
                    <span className="select-none border-r border-slate-800 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-400">
                      {guide.prefix}
                    </span>
                    <input
                      type="text"
                      value={currentInput}
                      placeholder={guide.placeholder}
                      onChange={(e) => onUpdateHandle(acc.id, e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
                    />
                  </div>

                  {/* Clear format hint & live URL preview */}
                  <div className="flex items-start gap-1.5 pt-0.5 text-[11px] text-slate-400">
                    <Info className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
                    <div>
                      <div>{guide.helpText}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500 truncate">
                        Target URL: <span className="text-slate-300">{previewUrl}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => onOpenLoginSession(acc.id, currentInput)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Browser Login</span>
                  </button>

                  <button
                    onClick={() => onToggleLink(acc.id, currentInput)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      acc.linked
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    }`}
                  >
                    {acc.linked ? (
                      <>
                        <Unlink className="h-3.5 w-3.5" /> Unlink
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" /> Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Local LLM & Playwright Engine Settings */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Local LLM (Ollama) & Playwright Browser Engine Configuration
            </h3>
            <p className="text-xs text-slate-400">
              Configure the local Ollama model endpoint and browser automation runtime
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Ollama Local API Endpoint
            </label>
            <input
              type="text"
              value={llmConfig.ollamaEndpoint}
              onChange={(e) => onUpdateLlmConfig({ ollamaEndpoint: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Local LLM Model Name
            </label>
            <input
              type="text"
              value={llmConfig.model}
              onChange={(e) => onUpdateLlmConfig({ model: e.target.value })}
              placeholder="llama3.2, qwen2.5, mistral..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Browser Execution Mode
            </label>
            <button
              type="button"
              onClick={() => onUpdateLlmConfig({ headless: !llmConfig.headless })}
              className="w-full flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-200"
            >
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-indigo-400" />
                {llmConfig.headless ? 'Headless Background Browser' : 'Interactive Visible Browser'}
              </span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                Toggle
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
