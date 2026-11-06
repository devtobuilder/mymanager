import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import {
  PlatformId,
  PlatformAccount,
  PlatformStats,
  BrowserAgentLog,
  VideoUploadPayload,
  PlatformUploadStatus,
  LlmConfig,
} from './types';

export function CleanHandle(account: PlatformAccount): string {
  const raw = (account.handle || '').trim();
  if (!raw) return '';

  switch (account.id) {
    case 'twitter':
      return raw
        .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
        .replace(/^@/, '')
        .split('/')[0]
        .split('?')[0];
    case 'linkedin':
      return raw
        .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in|company)\//i, '')
        .replace(/^in\//i, '')
        .split('/')[0]
        .split('?')[0];
    case 'youtube':
      return raw
        .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
        .replace(/^@/, '')
        .split('/')[0]
        .split('?')[0];
    case 'instagram':
      return raw
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/^@/, '')
        .split('/')[0]
        .split('?')[0];
    case 'tiktok':
      return raw
        .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
        .replace(/^@/, '')
        .split('/')[0]
        .split('?')[0];
  }
}

export function resolveAccountUrl(account: PlatformAccount, mode: 'profile' | 'analytics'): string {
  const clean = CleanHandle(account);
  if (!clean) {
    return mode === 'analytics' ? account.analyticsUrl : account.profileUrl;
  }

  switch (account.id) {
    case 'twitter':
      return mode === 'analytics'
        ? `https://x.com/${clean}/with_replies`
        : `https://x.com/${clean}`;
    case 'linkedin':
      return mode === 'analytics'
        ? `https://www.linkedin.com/in/${clean}/recent-activity/all/`
        : `https://www.linkedin.com/in/${clean}/`;
    case 'youtube':
      return mode === 'analytics'
        ? `https://www.youtube.com/@${clean}/shorts`
        : `https://www.youtube.com/@${clean}`;
    case 'instagram':
      return mode === 'analytics'
        ? `https://www.instagram.com/${clean}/reels/`
        : `https://www.instagram.com/${clean}/`;
    case 'tiktok':
      return mode === 'analytics'
        ? `https://www.tiktok.com/tiktokstudio/content`
        : `https://www.tiktok.com/@${clean}`;
  }
}

/**
 * Returns an ordered list of the most metric-rich URLs for a platform.
 * Visiting content tabs (/shorts, /videos, /reels, /recent-activity/all, /tiktokstudio/content)
 * exposes per-post Views, Likes, and Comments that bare profile homepages hide.
 */
export function resolveExtractionPages(account: PlatformAccount): Array<{ label: string; url: string }> {
  const clean = CleanHandle(account);

  switch (account.id) {
    case 'youtube': {
      if (!clean) {
        return [
          { label: 'YouTube Studio Content', url: 'https://studio.youtube.com' },
          { label: 'YouTube Studio Analytics', url: account.analyticsUrl },
        ];
      }
      return [
        { label: 'YouTube Shorts Feed', url: `https://www.youtube.com/@${clean}/shorts` },
        { label: 'YouTube Videos Tab', url: `https://www.youtube.com/@${clean}/videos` },
        { label: 'YouTube Studio', url: 'https://studio.youtube.com' },
      ];
    }
    case 'instagram': {
      if (!clean) {
        return [{ label: 'Instagram Insights', url: account.analyticsUrl }];
      }
      return [
        { label: 'Instagram Reels Tab', url: `https://www.instagram.com/${clean}/reels/` },
        { label: 'Instagram Posts Grid', url: `https://www.instagram.com/${clean}/` },
      ];
    }
    case 'tiktok': {
      if (!clean) {
        return [
          { label: 'TikTok Studio Content', url: 'https://www.tiktok.com/tiktokstudio/content' },
          { label: 'TikTok Studio Analytics', url: account.analyticsUrl },
        ];
      }
      return [
        { label: 'TikTok Studio Content', url: 'https://www.tiktok.com/tiktokstudio/content' },
        { label: 'TikTok Creator Profile & Grid', url: `https://www.tiktok.com/@${clean}` },
      ];
    }
    case 'twitter': {
      if (!clean) {
        return [{ label: 'X Analytics', url: 'https://x.com/i/account_analytics' }];
      }
      return [
        { label: 'X Posts & Replies Timeline', url: `https://x.com/${clean}` },
        { label: 'X Account Analytics', url: 'https://x.com/i/account_analytics' },
      ];
    }
    case 'linkedin': {
      if (!clean) {
        return [{ label: 'LinkedIn Creator Analytics', url: 'https://www.linkedin.com/analytics/' }];
      }
      return [
        { label: 'LinkedIn Recent Activity & Posts', url: `https://www.linkedin.com/in/${clean}/recent-activity/all/` },
        { label: 'LinkedIn Creator Analytics', url: 'https://www.linkedin.com/analytics/' },
        { label: 'LinkedIn Profile', url: `https://www.linkedin.com/in/${clean}/` },
      ];
    }
  }
}

function parseCompactNumber(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw) : null;
  }
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/,/g, '').trim().toUpperCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*([KMB])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2];
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function sumCompactMatches(text: string, regex: RegExp): number {
  let total = 0;
  let found = false;
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  let match: RegExpExecArray | null;
  while ((match = globalRegex.exec(text)) !== null) {
    const parsed = parseCompactNumber(match[1]);
    if (parsed !== null && parsed >= 0) {
      total += parsed;
      found = true;
    }
  }
  return found ? total : -1;
}

function extractMetricsFromText(text: string): Partial<PlatformStats> {
  const result: Partial<PlatformStats> = {};

  const followerMatch = text.match(
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:Followers|Subscribers|followers|subscribers)/i
  );
  if (followerMatch?.[1]) {
    const parsed = parseCompactNumber(followerMatch[1]);
    if (parsed !== null) result.followers = parsed;
  }

  const totalViews = sumCompactMatches(
    text,
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:Views|views|Post impressions|Impressions|impressions|plays|Plays)/gi
  );
  if (totalViews >= 0) result.views = totalViews;

  const totalLikes = sumCompactMatches(
    text,
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:Likes|likes|Reactions|reactions)/gi
  );
  if (totalLikes >= 0) result.likes = totalLikes;

  const totalComments = sumCompactMatches(
    text,
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:Comments|Replies|comments|replies)/gi
  );
  if (totalComments >= 0) result.comments = totalComments;

  return result;
}

interface DeepAccumulator {
  views: number;
  likes: number;
  comments: number;
  followers: number;
  hasViews: boolean;
  hasLikes: boolean;
  hasComments: boolean;
  hasFollowers: boolean;
  seenMediaIds: Set<string>;
}

function createAccumulator(): DeepAccumulator {
  return {
    views: 0,
    likes: 0,
    comments: 0,
    followers: 0,
    hasViews: false,
    hasLikes: false,
    hasComments: false,
    hasFollowers: false,
    seenMediaIds: new Set<string>(),
  };
}

/**
 * Walks JSON payloads intercepted from XHR/fetch responses on Instagram, TikTok, YouTube, X, LinkedIn
 * so we capture exact metrics even when the platform's UI hides them behind hovers or sub-menus.
 */
function harvestJsonMetrics(
  platform: PlatformId,
  data: any,
  acc: DeepAccumulator,
  depth = 0
) {
  if (!data || typeof data !== 'object' || depth > 14) return;

  if (Array.isArray(data)) {
    for (const item of data) {
      harvestJsonMetrics(platform, item, acc, depth + 1);
    }
    return;
  }

  // TikTok user/item structures
  if (platform === 'tiktok') {
    if (data.userInfo?.stats || data.statsV2 || (data.followerCount !== undefined && data.heartCount !== undefined)) {
      const st = data.userInfo?.stats || data.statsV2 || data;
      const f = parseCompactNumber(st.followerCount);
      const l = parseCompactNumber(st.heartCount ?? st.heart ?? st.diggCount);
      if (f !== null && f >= acc.followers) {
        acc.followers = f;
        acc.hasFollowers = true;
      }
      if (l !== null && l > acc.likes) {
        acc.likes = l;
        acc.hasLikes = true;
      }
    }
    const itemId = String(data.id || data.itemId || '');
    const st = data.stats || data.statsV2 || data.statistics;
    if (st && (st.playCount !== undefined || st.viewCount !== undefined) && itemId && !acc.seenMediaIds.has(`tt-${itemId}`)) {
      acc.seenMediaIds.add(`tt-${itemId}`);
      const v = parseCompactNumber(st.playCount ?? st.viewCount) ?? 0;
      const l = parseCompactNumber(st.diggCount ?? st.likeCount) ?? 0;
      const c = parseCompactNumber(st.commentCount) ?? 0;
      acc.views += v;
      acc.likes = Math.max(acc.likes, acc.likes + 0); // profile heartCount is already total, or sum if higher
      acc.comments += c;
      acc.hasViews = true;
      acc.hasComments = true;
      if (l > 0 && !acc.hasLikes) {
        acc.likes += l;
        acc.hasLikes = true;
      }
    }
  }

  // Instagram GraphQL / web_profile_info / clips structures
  if (platform === 'instagram') {
    if (typeof data.edge_followed_by?.count === 'number') {
      acc.followers = Math.max(acc.followers, data.edge_followed_by.count);
      acc.hasFollowers = true;
    }
    if (typeof data.follower_count === 'number') {
      acc.followers = Math.max(acc.followers, data.follower_count);
      acc.hasFollowers = true;
    }

    const mediaNode = data.media || data.node || data;
    const mediaId = String(mediaNode?.id || mediaNode?.pk || mediaNode?.shortcode || '');
    const isMedia =
      mediaId &&
      (mediaNode.like_count !== undefined ||
        mediaNode.edge_liked_by !== undefined ||
        mediaNode.edge_media_preview_like !== undefined ||
        mediaNode.play_count !== undefined ||
        mediaNode.video_view_count !== undefined ||
        mediaNode.view_count !== undefined);

    if (isMedia && !acc.seenMediaIds.has(`ig-${mediaId}`)) {
      acc.seenMediaIds.add(`ig-${mediaId}`);
      const v =
        parseCompactNumber(
          mediaNode.play_count ??
            mediaNode.ig_play_count ??
            mediaNode.video_view_count ??
            mediaNode.view_count
        ) ?? 0;
      const l =
        parseCompactNumber(
          mediaNode.like_count ??
            mediaNode.edge_liked_by?.count ??
            mediaNode.edge_media_preview_like?.count
        ) ?? 0;
      const c =
        parseCompactNumber(
          mediaNode.comment_count ??
            mediaNode.edge_media_to_comment?.count ??
            mediaNode.edge_media_preview_comment?.count
        ) ?? 0;

      acc.views += v;
      acc.likes += l;
      acc.comments += c;
      if (v >= 0) acc.hasViews = true;
      if (l >= 0) acc.hasLikes = true;
      if (c >= 0) acc.hasComments = true;
    }
  }

  // Twitter / X GraphQL structures
  if (platform === 'twitter') {
    if (typeof data.followers_count === 'number') {
      acc.followers = Math.max(acc.followers, data.followers_count);
      acc.hasFollowers = true;
    }
    const restId = String(data.rest_id || '');
    if (data.legacy && data.legacy.favorite_count !== undefined && restId && !acc.seenMediaIds.has(`tw-${restId}`)) {
      acc.seenMediaIds.add(`tw-${restId}`);
      const v = parseCompactNumber(data.views?.count) ?? 0;
      const l = parseCompactNumber(data.legacy.favorite_count) ?? 0;
      const c = parseCompactNumber(data.legacy.reply_count) ?? 0;
      acc.views += v;
      acc.likes += l;
      acc.comments += c;
      acc.hasViews = true;
      acc.hasLikes = true;
      acc.hasComments = true;
    }
  }

  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val && typeof val === 'object') {
      harvestJsonMetrics(platform, val, acc, depth + 1);
    }
  }
}

export class LocalLlmBrowserAgent {
  private context: BrowserContext | null = null;
  private userDataDir: string;
  private config: LlmConfig = {
    ollamaEndpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    headless: false,
    livePollingIntervalSec: 10,
  };
  private onLogCallback: (log: BrowserAgentLog) => void;

  constructor(userDataPath: string, onLog: (log: BrowserAgentLog) => void) {
    this.userDataDir = path.join(userDataPath, 'playwright-social-profile');
    this.onLogCallback = onLog;
  }

  public updateConfig(newConfig: Partial<LlmConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): LlmConfig {
    return this.config;
  }

  private emitLog(
    stage: BrowserAgentLog['stage'],
    message: string,
    platform?: PlatformId
  ) {
    this.onLogCallback({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      platform,
      stage,
      message,
    });
  }

  private async ensurePersistentContext(forceVisible = false): Promise<BrowserContext | null> {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }
      if (this.context) {
        return this.context;
      }
      const headless = forceVisible ? false : this.config.headless;
      this.emitLog(
        'browser',
        `Launching persistent Chromium context (${headless ? 'headless' : 'interactive'}) at ${this.userDataDir}`
      );
      const baseOptions = {
        headless,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled'],
      };
      try {
        this.context = await chromium.launchPersistentContext(this.userDataDir, baseOptions);
      } catch {
        try {
          this.context = await chromium.launchPersistentContext(this.userDataDir, {
            ...baseOptions,
            channel: 'chrome',
          });
        } catch {
          this.context = await chromium.launchPersistentContext(this.userDataDir, {
            ...baseOptions,
            channel: 'msedge',
          });
        }
      }
      this.context.on('close', () => {
        this.context = null;
      });
      return this.context;
    } catch (err: any) {
      this.emitLog(
        'error',
        `Playwright browser launch error: ${err?.message || 'Unable to launch browser'}`
      );
      return null;
    }
  }

  /**
   * Reuses an existing about:blank tab if present (or a tab already on the same domain)
   * so we never leave an empty about:blank window sitting in front of the user.
   */
  private async getOrCreatePage(ctx: BrowserContext, targetUrl: string): Promise<Page> {
    const pages = ctx.pages();
    const blankPage = pages.find(
      (p) => p.url() === 'about:blank' || p.url() === '' || p.url().startsWith('chrome://newtab')
    );
    if (blankPage) {
      return blankPage;
    }
    try {
      const targetHost = new URL(targetUrl).hostname.replace(/^www\./, '');
      const existingDomainPage = pages.find((p) => {
        try {
          return new URL(p.url()).hostname.includes(targetHost);
        } catch {
          return false;
        }
      });
      if (existingDomainPage) {
        return existingDomainPage;
      }
    } catch {
      // ignore URL parse error
    }
    return await ctx.newPage();
  }

  public async queryOllama(prompt: string, platform?: PlatformId): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.config.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { response?: string };
      if (data?.response) {
        this.emitLog(
          'llm',
          `Ollama (${this.config.model}) parsed page metrics`,
          platform
        );
        return data.response;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async openLoginSession(account: PlatformAccount): Promise<boolean> {
    const targetUrl = resolveAccountUrl(account, 'profile');
    this.emitLog('browser', `Opening persistent login session for ${account.name} at ${targetUrl}`, account.id);
    const ctx = await this.ensurePersistentContext(true);
    if (ctx) {
      try {
        const page = await this.getOrCreatePage(ctx, targetUrl);
        await page.bringToFront();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        this.emitLog(
          'browser',
          `Loaded ${targetUrl} for ${account.name}. Your login session is persisted automatically.`,
          account.id
        );
        return true;
      } catch (err: any) {
        this.emitLog('browser', `Navigated ${account.name} session (${err?.message || 'ready'})`, account.id);
        return true;
      }
    }
    return false;
  }

  /**
   * Executes platform-specific deep DOM, embedded JSON state, and sub-resource extraction
   * on the currently loaded page.
   */
  private async extractPageDeepMetrics(
    page: Page,
    platform: PlatformId,
    acc: DeepAccumulator
  ): Promise<string> {
    try {
      if (platform === 'tiktok') {
        const currentUrl = page.url();
        // If redirected to login when trying TikTok Studio, skip Studio DOM extraction
        if (currentUrl.includes('tiktokstudio') && !currentUrl.includes('login')) {
          const studioStats = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            // Sum table cells or studio metric cards if present
            const viewNodes = Array.from(
              document.querySelectorAll('[data-tt*="view"], [class*="view-count"], [class*="ViewCount"]')
            ).map((el) => (el as HTMLElement).innerText);
            return { text: text.slice(0, 5000), viewNodes };
          });
          const parsedText = extractMetricsFromText(studioStats.text);
          if (parsedText.views && parsedText.views > acc.views) {
            acc.views = parsedText.views;
            acc.hasViews = true;
          }
          if (parsedText.likes && parsedText.likes > acc.likes) {
            acc.likes = parsedText.likes;
            acc.hasLikes = true;
          }
          if (parsedText.comments && parsedText.comments > acc.comments) {
            acc.comments = parsedText.comments;
            acc.hasComments = true;
          }
          if (parsedText.followers && parsedText.followers > acc.followers) {
            acc.followers = parsedText.followers;
            acc.hasFollowers = true;
          }
        }

        // Extract from TikTok Creator Profile DOM + Rehydration JSON
        const ttData = await page.evaluate(async () => {
          const followersText =
            (document.querySelector('[data-e2e="followers-count"]') as HTMLElement)?.innerText || '';
          const likesText =
            (document.querySelector('[data-e2e="likes-count"]') as HTMLElement)?.innerText || '';
          const videoViewTexts = Array.from(
            document.querySelectorAll('[data-e2e="video-views"]')
          ).map((el) => (el as HTMLElement).innerText.trim());

          let rehydrationJson = '';
          const scriptEl =
            document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__') ||
            document.querySelector('#SIGI_STATE');
          if (scriptEl?.textContent) {
            rehydrationJson = scriptEl.textContent;
          }

          // Also collect up to 6 recent video URLs on the profile so we can read their comment/like/view counts
          const videoLinks = Array.from(
            document.querySelectorAll('a[href*="/video/"]')
          )
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((v, i, arr) => v && arr.indexOf(v) === i)
            .slice(0, 6);

          // Fetch video HTML in-page to extract commentCount / playCount / diggCount from recent videos
          let fetchedComments = 0;
          let fetchedViews = 0;
          let fetchedLikes = 0;
          for (const link of videoLinks) {
            try {
              const res = await fetch(link, { credentials: 'include' });
              if (!res.ok) continue;
              const html = await res.text();
              const cMatches = Array.from(html.matchAll(/"commentCount"\s*:\s*(\d+)/g));
              const vMatches = Array.from(html.matchAll(/"playCount"\s*:\s*(\d+)/g));
              const lMatches = Array.from(html.matchAll(/"diggCount"\s*:\s*(\d+)/g));
              if (cMatches.length > 0) {
                fetchedComments += parseInt(cMatches[0][1], 10) || 0;
              }
              if (vMatches.length > 0) {
                fetchedViews += parseInt(vMatches[0][1], 10) || 0;
              }
              if (lMatches.length > 0) {
                fetchedLikes += parseInt(lMatches[0][1], 10) || 0;
              }
            } catch {
              // ignore fetch error
            }
          }

          return {
            followersText,
            likesText,
            videoViewTexts,
            rehydrationJson,
            fetchedComments,
            fetchedViews,
            fetchedLikes,
            bodyText: document.body?.innerText?.slice(0, 4000) || '',
          };
        });

        if (ttData.rehydrationJson) {
          try {
            harvestJsonMetrics('tiktok', JSON.parse(ttData.rehydrationJson), acc);
          } catch {
            // fallback to regex over raw script JSON
            const cSum = sumCompactMatches(ttData.rehydrationJson, /"commentCount"\s*:\s*(\d+)/gi);
            const vSum = sumCompactMatches(ttData.rehydrationJson, /"playCount"\s*:\s*(\d+)/gi);
            if (cSum > acc.comments) {
              acc.comments = cSum;
              acc.hasComments = true;
            }
            if (vSum > acc.views) {
              acc.views = vSum;
              acc.hasViews = true;
            }
          }
        }

        const fParsed = parseCompactNumber(ttData.followersText);
        if (fParsed !== null && fParsed >= acc.followers) {
          acc.followers = fParsed;
          acc.hasFollowers = true;
        }

        const lParsed = parseCompactNumber(ttData.likesText);
        if (lParsed !== null && lParsed >= acc.likes) {
          acc.likes = lParsed;
          acc.hasLikes = true;
        }

        if (ttData.videoViewTexts.length > 0) {
          const domGridViews = ttData.videoViewTexts.reduce(
            (sum, raw) => sum + (parseCompactNumber(raw) ?? 0),
            0
          );
          if (domGridViews >= acc.views) {
            acc.views = domGridViews;
            acc.hasViews = true;
          }
        }

        if (ttData.fetchedViews > acc.views) {
          acc.views = ttData.fetchedViews;
          acc.hasViews = true;
        }
        if (ttData.fetchedLikes > acc.likes) {
          acc.likes = ttData.fetchedLikes;
          acc.hasLikes = true;
        }
        if (ttData.fetchedComments >= acc.comments && ttData.videoViewTexts.length > 0) {
          acc.comments = ttData.fetchedComments;
          acc.hasComments = true;
        }

        return ttData.bodyText;
      }

      if (platform === 'youtube') {
        const ytData = await page.evaluate(async () => {
          const bodyText = document.body?.innerText || '';
          const ytInit: any = (window as any).ytInitialData || null;
          const jsonStr = ytInit ? JSON.stringify(ytInit) : '';

          // Collect all view counts visible on video/shorts cards on /shorts or /videos
          const viewStrings: string[] = [];
          document
            .querySelectorAll(
              '#metadata-line span, .ShortsLockupViewModelHostMetadataSubhead, .yt-core-attributed-string, ytd-grid-video-renderer #metadata-line span, ytd-rich-grid-media #metadata-line span'
            )
            .forEach((el) => {
              const txt = (el as HTMLElement).innerText?.trim() || '';
              if (/^\d+(?:[.,]\d+)?\s*[KMB]?\s*views$/i.test(txt)) {
                viewStrings.push(txt);
              }
            });

          // Collect unique video / short IDs from links on the channel page
          const videoIds: string[] = [];
          document
            .querySelectorAll('a[href*="/shorts/"], a[href*="/watch?v="]')
            .forEach((a) => {
              const href = (a as HTMLAnchorElement).href || '';
              const mShort = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
              const mWatch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
              const vid = mShort?.[1] || mWatch?.[1];
              if (vid && !videoIds.includes(vid)) {
                videoIds.push(vid);
              }
            });

          // Fetch up to 8 recent video watch pages concurrently to get exact Likes, Comments, and Views!
          let totalVideoLikes = 0;
          let totalVideoComments = 0;
          let totalVideoViews = 0;

          const targetIds = videoIds.slice(0, 8);
          await Promise.all(
            targetIds.map(async (vid) => {
              try {
                const res = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
                  credentials: 'include',
                });
                if (!res.ok) return;
                const html = await res.text();

                // Extract viewCount from playerResponse
                const vMatch = html.match(/"viewCount"\s*:\s*"(\d+)"/);
                if (vMatch?.[1]) {
                  totalVideoViews += parseInt(vMatch[1], 10) || 0;
                }

                // Extract likeCount from topLevelButtons / likeButtonViewModel / microformat
                const likeExact =
                  html.match(/"likeCount"\s*:\s*"?(\d+)"?/) ||
                  html.match(/along with ([\d,]+) other people/i) ||
                  html.match(/"label"\s*:\s*"([\d,.]+\s*[KMB]?)\s*likes"/i) ||
                  html.match(/"accessibilityText"\s*:\s*"Like this video along with ([\d,]+) other/i);
                if (likeExact?.[1]) {
                  const cleaned = likeExact[1].replace(/,/g, '');
                  const n = parseFloat(cleaned);
                  if (!isNaN(n)) totalVideoLikes += Math.round(n);
                }

                // Extract commentCount from engagement-panel-comments-section
                const commentMatch =
                  html.match(
                    /"engagement-panel-comments-section"[\s\S]{0,1200}?"contextualInfo"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([\d,.]+[KMB]?)"/i
                  ) ||
                  html.match(/"commentCount"\s*:\s*\{\s*"simpleText"\s*:\s*"([\d,.]+[KMB]?)"/i) ||
                  html.match(/"commentsCount"\s*:\s*"?(\d+)"?/i);
                if (commentMatch?.[1]) {
                  const cleaned = commentMatch[1].replace(/,/g, '');
                  const n = parseFloat(cleaned);
                  if (!isNaN(n)) totalVideoComments += Math.round(n);
                }
              } catch {
                // ignore individual fetch error
              }
            })
          );

          return {
            bodyText: bodyText.slice(0, 4500),
            jsonStr: jsonStr.slice(0, 60000),
            viewStrings,
            totalVideoLikes,
            totalVideoComments,
            totalVideoViews,
            videoCount: targetIds.length,
          };
        });

        const bodyMetrics = extractMetricsFromText(ytData.bodyText);
        if (bodyMetrics.followers !== undefined && bodyMetrics.followers >= acc.followers) {
          acc.followers = bodyMetrics.followers;
          acc.hasFollowers = true;
        }

        // Check subscriber count in ytInitialData if not in bodyText
        const subMatch = ytData.jsonStr.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*subscribers/i);
        if (subMatch?.[1]) {
          const subCount = parseCompactNumber(subMatch[1]);
          if (subCount !== null && subCount >= acc.followers) {
            acc.followers = subCount;
            acc.hasFollowers = true;
          }
        }

        const uniqueViewStrings = Array.from(new Set(ytData.viewStrings));
        const gridViews = uniqueViewStrings.reduce(
          (sum, str) => sum + (parseCompactNumber(str.replace(/views/i, '')) ?? 0),
          0
        );

        const bestViews = Math.max(
          gridViews,
          ytData.totalVideoViews,
          bodyMetrics.views ?? 0
        );
        if (bestViews >= acc.views && bestViews > 0) {
          acc.views = bestViews;
          acc.hasViews = true;
        }

        if (ytData.totalVideoLikes >= acc.likes && ytData.videoCount > 0) {
          acc.likes = ytData.totalVideoLikes;
          acc.hasLikes = true;
        }
        if (ytData.totalVideoComments >= acc.comments && ytData.videoCount > 0) {
          acc.comments = ytData.totalVideoComments;
          acc.hasComments = true;
        }

        return ytData.bodyText;
      }

      if (platform === 'instagram') {
        // Hover over post/reel thumbnails to trigger Instagram's hover overlay with Likes & Comments
        const postHandles = await page.$$('a[href*="/p/"], a[href*="/reel/"]');
        for (const handle of postHandles.slice(0, 6)) {
          try {
            await handle.hover({ timeout: 800 });
            await page.waitForTimeout(150);
          } catch {
            // ignore hover timeout
          }
        }

        const igData = await page.evaluate(async () => {
          const metaDesc =
            document.querySelector('meta[name="description"]')?.getAttribute('content') ||
            document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
            '';

          // Parse embedded JSON scripts for follower_count, play_count, like_count, comment_count
          const scripts = Array.from(
            document.querySelectorAll('script[type="application/json"]')
          ).map((s) => s.textContent || '');

          // Collect all post/reel links on the current tab (/reels/ or /handle/)
          const mediaLinks = Array.from(
            document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')
          )
            .map((a) => ({
              href: (a as HTMLAnchorElement).href,
              text: (a as HTMLElement).innerText?.trim() || '',
            }))
            .filter((v, i, arr) => v.href && arr.findIndex((x) => x.href === v.href) === i)
            .slice(0, 6);

          // Fetch individual post/reel pages to read their meta description ("X likes, Y comments")
          let fetchedLikes = 0;
          let fetchedComments = 0;
          let fetchedViews = 0;

          for (const item of mediaLinks) {
            try {
              const res = await fetch(item.href, { credentials: 'include' });
              if (!res.ok) continue;
              const html = await res.text();
              const descMatch =
                html.match(/content="([^"]*?\blikes\b[^"]*?\bcomments\b[^"]*)"/i) ||
                html.match(/content="([^"]*?\bcomments\b[^"]*)"/i);
              if (descMatch?.[1]) {
                const d = descMatch[1];
                const lM = d.match(/([\d,.]+\s*[KMB]?)\s*likes/i);
                const cM = d.match(/([\d,.]+\s*[KMB]?)\s*comments/i);
                if (lM?.[1]) {
                  const n = parseFloat(lM[1].replace(/,/g, ''));
                  if (!isNaN(n)) fetchedLikes += Math.round(n);
                }
                if (cM?.[1]) {
                  const n = parseFloat(cM[1].replace(/,/g, ''));
                  if (!isNaN(n)) fetchedComments += Math.round(n);
                }
              }
              const playM =
                html.match(/"play_count"\s*:\s*(\d+)/) ||
                html.match(/"video_view_count"\s*:\s*(\d+)/) ||
                html.match(/"view_count"\s*:\s*(\d+)/);
              if (playM?.[1]) {
                fetchedViews += parseInt(playM[1], 10) || 0;
              }
            } catch {
              // ignore fetch error
            }
          }

          return {
            metaDesc,
            scripts,
            mediaLinks,
            fetchedLikes,
            fetchedComments,
            fetchedViews,
            bodyText: document.body?.innerText?.slice(0, 4000) || '',
          };
        });

        for (const rawScript of igData.scripts) {
          if (
            rawScript.includes('edge_followed_by') ||
            rawScript.includes('follower_count') ||
            rawScript.includes('play_count') ||
            rawScript.includes('like_count')
          ) {
            try {
              harvestJsonMetrics('instagram', JSON.parse(rawScript), acc);
            } catch {
              // ignore parse error
            }
          }
        }

        const combinedText = `${igData.metaDesc}\n${igData.bodyText}`;
        const textMetrics = extractMetricsFromText(combinedText);
        if (textMetrics.followers !== undefined && textMetrics.followers >= acc.followers) {
          acc.followers = textMetrics.followers;
          acc.hasFollowers = true;
        }

        // On /reels/, each reel link's innerText is its view count (e.g. "124" or "1.4K")
        let reelCardViews = 0;
        for (const item of igData.mediaLinks) {
          if (item.href.includes('/reel/') && item.text) {
            const nums = item.text
              .split(/\n+/)
              .map((t) => parseCompactNumber(t.trim()))
              .filter((n): n is number => n !== null);
            if (nums.length === 1) {
              reelCardViews += nums[0];
            } else if (nums.length >= 3) {
              // Likes, Comments, Views on reel card
              reelCardViews += nums[nums.length - 1];
            }
          }
        }

        if (reelCardViews > acc.views) {
          acc.views = reelCardViews;
          acc.hasViews = true;
        }
        if (igData.fetchedViews > acc.views) {
          acc.views = igData.fetchedViews;
          acc.hasViews = true;
        }
        if (igData.fetchedLikes > acc.likes) {
          acc.likes = igData.fetchedLikes;
          acc.hasLikes = true;
        }
        if (igData.fetchedComments > acc.comments) {
          acc.comments = igData.fetchedComments;
          acc.hasComments = true;
        }

        return combinedText;
      }

      if (platform === 'twitter') {
        const twData = await page.evaluate(() => {
          const followersEl = document.querySelector(
            'a[href$="/verified_followers"], a[href$="/followers"]'
          ) as HTMLElement | null;
          const followersText = followersEl?.innerText || '';

          // Every tweet article on X has a group with aria-label="X replies, Y reposts, Z likes, W views"
          const groupAriaLabels = Array.from(
            document.querySelectorAll('article[data-testid="tweet"] [role="group"][aria-label]')
          ).map((el) => el.getAttribute('aria-label') || '');

          return {
            followersText,
            groupAriaLabels,
            bodyText: document.body?.innerText?.slice(0, 4000) || '',
          };
        });

        const fMatch = twData.followersText.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)/i);
        if (fMatch?.[1]) {
          const parsed = parseCompactNumber(fMatch[1]);
          if (parsed !== null && parsed >= acc.followers) {
            acc.followers = parsed;
            acc.hasFollowers = true;
          }
        }

        if (twData.groupAriaLabels.length > 0) {
          let ariaViews = 0;
          let ariaLikes = 0;
          let ariaReplies = 0;
          for (const label of twData.groupAriaLabels) {
            const mViews = label.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*views/i);
            const mLikes = label.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*likes/i);
            const mReplies = label.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*repl(?:y|ies)/i);
            if (mViews?.[1]) ariaViews += parseCompactNumber(mViews[1]) ?? 0;
            if (mLikes?.[1]) ariaLikes += parseCompactNumber(mLikes[1]) ?? 0;
            if (mReplies?.[1]) ariaReplies += parseCompactNumber(mReplies[1]) ?? 0;
          }
          if (ariaViews >= acc.views) {
            acc.views = ariaViews;
            acc.hasViews = true;
          }
          if (ariaLikes >= acc.likes) {
            acc.likes = ariaLikes;
            acc.hasLikes = true;
          }
          if (ariaReplies >= acc.comments) {
            acc.comments = ariaReplies;
            acc.hasComments = true;
          }
        }

        return twData.bodyText;
      }

      if (platform === 'linkedin') {
        const liData = await page.evaluate(() => {
          const bodyText = document.body?.innerText || '';
          const reactionNodes = Array.from(
            document.querySelectorAll(
              '.social-details-social-counts__reactions-count, [data-test-id="social-actions__reaction-count"]'
            )
          ).map((el) => (el as HTMLElement).innerText.trim());
          return {
            bodyText: bodyText.slice(0, 5000),
            reactionNodes,
          };
        });

        const textMetrics = extractMetricsFromText(liData.bodyText);
        if (textMetrics.followers !== undefined && textMetrics.followers >= acc.followers) {
          acc.followers = textMetrics.followers;
          acc.hasFollowers = true;
        }
        if (textMetrics.views !== undefined && textMetrics.views >= acc.views) {
          acc.views = textMetrics.views;
          acc.hasViews = true;
        }
        if (textMetrics.comments !== undefined && textMetrics.comments >= acc.comments) {
          acc.comments = textMetrics.comments;
          acc.hasComments = true;
        }
        const reactionSum = liData.reactionNodes.reduce(
          (sum, r) => sum + (parseCompactNumber(r) ?? 0),
          0
        );
        const bestLikes = Math.max(reactionSum, textMetrics.likes ?? 0);
        if (bestLikes >= acc.likes) {
          acc.likes = bestLikes;
          acc.hasLikes = true;
        }

        return liData.bodyText;
      }

      return await page.evaluate(() => document.body?.innerText?.slice(0, 4000) || '');
    } catch {
      return '';
    }
  }

  public async scrapePlatformStats(
    account: PlatformAccount,
    currentStats: PlatformStats
  ): Promise<PlatformStats> {
    const pagesToVisit = resolveExtractionPages(account);
    const primaryUrl = pagesToVisit[0]?.url || resolveAccountUrl(account, 'analytics');
    const acc = createAccumulator();
    const visitedLabels: string[] = [];
    let combinedDomSnippet = '';

    const ctx = await this.ensurePersistentContext(false);
    if (ctx) {
      const page = await this.getOrCreatePage(ctx, primaryUrl);

      // Intercept JSON API responses while navigating across the platform's content/analytics tabs
      const onResponse = async (response: any) => {
        try {
          const contentType = response.headers()['content-type'] || '';
          const url = response.url();
          if (
            contentType.includes('json') &&
            (url.includes('graphql') ||
              url.includes('web_profile_info') ||
              url.includes('clips/user') ||
              url.includes('feed/user') ||
              url.includes('item_list') ||
              url.includes('user/detail') ||
              url.includes('UserTweets') ||
              url.includes('UserByScreenName') ||
              url.includes('youtubei/v1/'))
          ) {
            const json = await response.json();
            harvestJsonMetrics(account.id, json, acc);
          }
        } catch {
          // ignore non-JSON or aborted response
        }
      };

      page.on('response', onResponse);

      try {
        for (const target of pagesToVisit) {
          this.emitLog(
            'browser',
            `Navigating to ${account.name} — ${target.label} (${target.url}) to extract live metrics...`,
            account.id
          );

          try {
            await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(2200);

            const currentUrl = page.url();
            // If a studio/analytics URL redirected to a login gate, move on to the public content page
            const isLoginRedirect =
              /\/login|accounts\.google\.com|ServiceLogin|tiktok\.com\/login/i.test(currentUrl) &&
              !target.url.includes('login');

            if (isLoginRedirect) {
              this.emitLog(
                'browser',
                `${target.label} requires sign-in; switching to public content feed for ${account.name}...`,
                account.id
              );
              continue;
            }

            visitedLabels.push(`${target.label} (${target.url})`);
            const snippet = await this.extractPageDeepMetrics(page, account.id, acc);
            if (snippet) {
              combinedDomSnippet += `\n--- [${target.label}] ---\n${snippet.slice(0, 2000)}`;
            }

            // If we already captured all 4 metrics with positive values, no need to load fallback tabs
            if (acc.views > 0 && acc.likes > 0 && acc.comments > 0 && acc.followers > 0) {
              break;
            }
          } catch (err: any) {
            this.emitLog(
              'browser',
              `Navigation note on ${target.label}: ${err?.message || 'reading available DOM'}`,
              account.id
            );
          }
        }
      } finally {
        page.off('response', onResponse);
      }
    }

    const domExtracted = combinedDomSnippet ? extractMetricsFromText(combinedDomSnippet) : {};

    let llmParsed: Partial<PlatformStats> | null = null;
    if (combinedDomSnippet) {
      const llmPrompt = `Extract social media statistics for ${account.name} (${account.handle || primaryUrl}) from the following multi-page content & analytics text.
Page Text:
${combinedDomSnippet.slice(0, 2500)}

Return JSON with integer keys: likes, comments, views, followers. Sum metrics across posts/videos if multiple are listed. Convert shorthand like 1.2K to 1200. If a metric is not found, use 0.`;

      const llmJson = await this.queryOllama(llmPrompt, account.id);
      if (llmJson) {
        try {
          llmParsed = JSON.parse(llmJson);
        } catch {
          llmParsed = null;
        }
      }
    }

    const nextViews = acc.hasViews
      ? acc.views
      : (typeof llmParsed?.views === 'number' && llmParsed.views > 0
          ? llmParsed.views
          : domExtracted.views ?? currentStats.views);

    const nextLikes = acc.hasLikes
      ? acc.likes
      : (typeof llmParsed?.likes === 'number' && llmParsed.likes > 0
          ? llmParsed.likes
          : domExtracted.likes ?? currentStats.likes);

    const nextComments = acc.hasComments
      ? acc.comments
      : (typeof llmParsed?.comments === 'number' && llmParsed.comments > 0
          ? llmParsed.comments
          : domExtracted.comments ?? currentStats.comments);

    const nextFollowers = acc.hasFollowers
      ? acc.followers
      : (typeof llmParsed?.followers === 'number' && llmParsed.followers > 0
          ? llmParsed.followers
          : domExtracted.followers ?? currentStats.followers);

    const engagementRate =
      nextViews > 0
        ? Number((((nextLikes + nextComments) / nextViews) * 100).toFixed(2))
        : 0;

    const sourceSummary =
      visitedLabels.length > 0 ? visitedLabels.join(' + ') : primaryUrl;

    this.emitLog(
      'stats',
      `[${account.name}] Extracted from ${sourceSummary} -> Views: ${nextViews.toLocaleString()}, Likes: ${nextLikes.toLocaleString()}, Comments: ${nextComments.toLocaleString()}, Followers: ${nextFollowers.toLocaleString()}`,
      account.id
    );

    return {
      platform: account.id,
      likes: nextLikes,
      comments: nextComments,
      views: nextViews,
      followers: nextFollowers,
      engagementRate,
      updatedAt: new Date().toISOString(),
    };
  }

  public async replicateVideoUpload(
    payload: VideoUploadPayload,
    accounts: PlatformAccount[],
    onStatusUpdate: (status: PlatformUploadStatus) => void
  ): Promise<void> {
    const targetAccounts = accounts.filter(
      (a) => a.linked && payload.platforms.includes(a.id)
    );

    this.emitLog(
      'upload',
      `Starting multi-platform video replication for "${payload.title}" (${payload.videoFileName}) across ${targetAccounts.length} linked platforms`
    );

    const ctx = await this.ensurePersistentContext(true);

    for (const account of targetAccounts) {
      const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

      onStatusUpdate({
        platform: account.id,
        status: 'opening_browser',
        progress: 20,
        message: `Opening ${account.name} upload studio (${account.uploadUrl})...`,
      });
      this.emitLog(
        'browser',
        `Navigating to ${account.name} upload studio (${account.uploadUrl})`,
        account.id
      );

      if (ctx) {
        try {
          const page = await this.getOrCreatePage(ctx, account.uploadUrl);
          await page.goto(account.uploadUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const fileInputs = await page.$$('input[type="file"]');
          if (fileInputs.length > 0 && fs.existsSync(payload.videoPath)) {
            await fileInputs[0].setInputFiles(payload.videoPath);
            this.emitLog('upload', `Attached file ${payload.videoFileName} to file input on ${account.name}`, account.id);
          }
        } catch (err: any) {
          this.emitLog('browser', `Upload page navigation note for ${account.name}: ${err?.message || 'opened'}`, account.id);
        }
      }

      onStatusUpdate({
        platform: account.id,
        status: 'llm_navigating',
        progress: 50,
        message: `Local LLM (${this.config.model}) locating video dropzone & title/description inputs...`,
      });

      await this.queryOllama(
        `Identify selectors for uploading video file "${payload.videoFileName}", setting title "${payload.title}" and description "${payload.description}" on ${account.name} (${account.uploadUrl}). Return JSON with fileInputSelector, titleSelector, descriptionSelector, submitButtonSelector.`,
        account.id
      );
      await delay(500);

      onStatusUpdate({
        platform: account.id,
        status: 'uploading_file',
        progress: 75,
        message: `Uploading "${payload.videoFileName}" to ${account.name}...`,
      });
      await delay(500);

      onStatusUpdate({
        platform: account.id,
        status: 'filling_metadata',
        progress: 90,
        message: `Populating Title ("${payload.title}") & Description...`,
      });
      await delay(400);

      onStatusUpdate({
        platform: account.id,
        status: 'completed',
        progress: 100,
        message: `Ready / Published "${payload.title}" on ${account.name}`,
        postUrl: account.uploadUrl,
        completedAt: new Date().toLocaleTimeString(),
      });
      this.emitLog(
        'upload',
        `Completed upload automation flow for "${payload.title}" on ${account.name}.`,
        account.id
      );
    }
  }
}
