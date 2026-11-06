import React from 'react';
import {
  Link2,
  Unlink,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
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
    helpText: 'Used for multi-platform video uploads (statistics tracking disabled for X).',
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
    helpText: 'Extracts live stats from YouTube Studio.',
    formatPreviewUrl: () => 'https://studio.youtube.com/',
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
}) => {

  return (
    <div className="space-y-6 pb-8">
      {/* Persistent Browser Session Overview */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Linked Social Media Accounts & Persistent Browser Profiles
              </h2>
              <p className="text-xs text-slate-500">
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
                className={`rounded-xl border bg-white p-5 shadow-sm transition ${
                  acc.linked ? 'border-slate-300' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 ${meta.textClass}`}
                    >
                      <PlatformIcon platform={acc.id} size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{acc.name}</div>
                      <div className="flex items-center gap-1.5 text-xs">
                        {acc.linked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Linked & Authenticated
                          </span>
                        ) : (
                          <span className="text-slate-400">Unlinked</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      {guide.label}
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      e.g. {guide.example}
                    </span>
                  </div>

                  {/* Input with platform prefix */}
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-slate-900">
                    <span className="select-none border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500">
                      {guide.prefix}
                    </span>
                    <input
                      type="text"
                      value={currentInput}
                      placeholder={guide.placeholder}
                      onChange={(e) => onUpdateHandle(acc.id, e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* Clear format hint & live URL preview */}
                  <div className="flex items-start gap-1.5 pt-0.5 text-[11px] text-slate-500">
                    <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                    <div>
                      <div>{guide.helpText}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500 truncate">
                        Target URL: <span className="text-slate-700">{previewUrl}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => onOpenLoginSession(acc.id, currentInput)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Browser Login</span>
                  </button>

                  <button
                    onClick={() => onToggleLink(acc.id, currentInput)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition border ${
                      acc.linked
                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                        : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
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
    </div>
  );
};
