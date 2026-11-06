import React from 'react';
import { PlatformId } from '../types';

interface IconProps {
  platform: PlatformId;
  className?: string;
  size?: number;
}

export const PLATFORM_META: Record<
  PlatformId,
  {
    name: string;
    color: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    badgeBg: string;
  }
> = {
  twitter: {
    name: 'Twitter / X',
    color: '#38bdf8',
    bgClass: 'bg-sky-500/15',
    borderClass: 'border-sky-500/40',
    textClass: 'text-sky-400',
    badgeBg: 'from-sky-500/20 to-slate-900',
  },
  linkedin: {
    name: 'LinkedIn',
    color: '#0A66C2',
    bgClass: 'bg-blue-600/15',
    borderClass: 'border-blue-500/40',
    textClass: 'text-blue-400',
    badgeBg: 'from-blue-600/20 to-slate-900',
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    bgClass: 'bg-red-500/15',
    borderClass: 'border-red-500/40',
    textClass: 'text-red-400',
    badgeBg: 'from-red-600/20 to-slate-900',
  },
  instagram: {
    name: 'Instagram',
    color: '#E1306C',
    bgClass: 'bg-pink-500/15',
    borderClass: 'border-pink-500/40',
    textClass: 'text-pink-400',
    badgeBg: 'from-pink-500/20 via-purple-500/15 to-slate-900',
  },
  tiktok: {
    name: 'TikTok',
    color: '#2dd4bf',
    bgClass: 'bg-teal-400/15',
    borderClass: 'border-teal-400/40',
    textClass: 'text-teal-300',
    badgeBg: 'from-teal-400/20 via-rose-500/15 to-slate-900',
  },
};

export const PlatformIcon: React.FC<IconProps> = ({
  platform,
  className = '',
  size = 20,
}) => {
  switch (platform) {
    case 'twitter':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-label="Twitter / X Icon"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-label="LinkedIn Icon"
        >
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-label="YouTube Icon"
        >
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-label="Instagram Icon"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-label="TikTok Icon"
        >
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      );
  }
};

export const PlatformBadge: React.FC<{
  platform: PlatformId;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}> = ({ platform, size = 'md', showLabel = true }) => {
  const meta = PLATFORM_META[platform];
  const dims =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1.5'
      : size === 'lg'
      ? 'px-3.5 py-2 text-sm gap-2.5'
      : 'px-2.5 py-1 text-xs gap-2';
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 18 : 15;

  return (
    <span
      className={`inline-flex items-center rounded-lg border font-medium ${meta.bgClass} ${meta.borderClass} ${meta.textClass} ${dims}`}
    >
      <PlatformIcon platform={platform} size={iconSize} />
      {showLabel && <span>{meta.name}</span>}
    </span>
  );
};
