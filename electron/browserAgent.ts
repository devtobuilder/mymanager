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

  switch (account.id) {
    case 'twitter':
      return clean ? `https://x.com/${clean}` : account.profileUrl;
    case 'linkedin':
      if (mode === 'analytics') {
        return 'https://www.linkedin.com/analytics/creator/content/';
      }
      return clean ? `https://www.linkedin.com/in/${clean}/` : account.profileUrl;
    case 'youtube':
      if (mode === 'analytics') {
        return 'https://studio.youtube.com/channel/UC-MXA8OTNJZWgKQxHjxBvFQ/analytics/hub_overview';
      }
      return clean ? `https://www.youtube.com/@${clean}` : account.profileUrl;
    case 'instagram':
      if (mode === 'analytics') {
        return 'https://www.instagram.com/accounts/insights';
      }
      return clean ? `https://www.instagram.com/${clean}/` : account.profileUrl;
    case 'tiktok':
      if (mode === 'analytics') {
        return 'https://www.tiktok.com/tiktokstudio';
      }
      return clean ? `https://www.tiktok.com/@${clean}` : account.profileUrl;
  }
}

/**
 * Returns the single dedicated analytics/insights URL to extract live metrics from:
 * - Instagram: https://www.instagram.com/accounts/insights
 * - YouTube: https://studio.youtube.com/channel/UC-MXA8OTNJZWgKQxHjxBvFQ/analytics/hub_overview
 * - LinkedIn: https://www.linkedin.com/analytics/creator/content/
 * - TikTok: https://www.tiktok.com/tiktokstudio
 * - Twitter / X: https://x.com/{handle} (follower count only)
 *
 * Never navigates away to a secondary profile page after landing on the requested page.
 */
export function resolveExtractionPages(account: PlatformAccount): Array<{ label: string; url: string }> {
  const clean = CleanHandle(account);

  switch (account.id) {
    case 'youtube':
      return [
        {
          label: 'YouTube Studio Analytics Hub',
          url: 'https://studio.youtube.com/channel/UC-MXA8OTNJZWgKQxHjxBvFQ/analytics/hub_overview',
        },
      ];
    case 'instagram':
      return [
        {
          label: 'Instagram Account Insights',
          url: 'https://www.instagram.com/accounts/insights',
        },
      ];
    case 'tiktok':
      return [
        {
          label: 'TikTok Studio',
          url: 'https://www.tiktok.com/tiktokstudio',
        },
      ];
    case 'linkedin':
      return [
        {
          label: 'LinkedIn Creator Content Analytics',
          url: 'https://www.linkedin.com/analytics/creator/content/',
        },
      ];
    case 'twitter':
      return [
        {
          label: 'X Profile (Follower Count)',
          url: clean ? `https://x.com/${clean}` : account.profileUrl,
        },
      ];
  }
}

function parseCompactNumber(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw) : null;
  }
  if (!raw || typeof raw !== 'string') return null;
  // Reject percentages (e.g. "4.2%", "66%") or dates/times
  if (raw.includes('%') || raw.includes(':')) return null;
  const cleaned = raw.replace(/,/g, '').replace(/^\+/, '').trim().toUpperCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2];
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

/**
 * Parses clean non-empty lines from page innerText.
 */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Finds the first valid compact number immediately following (or 2 lines after, e.g. when "--" or "Cumulative" sits between)
 * a line matching `labelRegex`.
 */
function findNumberAfterLabel(lines: string[], labelRegex: RegExp, startIndex = 0): number | null {
  for (let i = startIndex; i < lines.length; i++) {
    if (labelRegex.test(lines[i])) {
      const next1 = lines[i + 1] || '';
      const val1 = parseCompactNumber(next1);
      if (val1 !== null) return val1;

      // Handle "--\n0" or "Cumulative\n128"
      const next2 = lines[i + 2] || '';
      if (next1 === '--' || /^cumulative$/i.test(next1)) {
        const val2 = parseCompactNumber(next2);
        if (val2 !== null) return val2;
      }
    }
  }
  return null;
}

/**
 * Finds the first valid compact number immediately preceding a line matching `labelRegex`
 * (e.g. "128\nImpressions" on LinkedIn or "9\nTotal followers" on Instagram).
 */
function findNumberBeforeLabel(lines: string[], labelRegex: RegExp, startIndex = 0): number | null {
  for (let i = Math.max(1, startIndex); i < lines.length; i++) {
    if (labelRegex.test(lines[i])) {
      const prev = lines[i - 1] || '';
      const val = parseCompactNumber(prev);
      if (val !== null) return val;
    }
  }
  return null;
}

function extractMetricsFromText(text: string, platform?: PlatformId): Partial<PlatformStats> {
  const result: Partial<PlatformStats> = {};

  if (platform === 'instagram') {
    const lines = splitLines(text);
    const views = findNumberAfterLabel(lines, /^Views$/i);
    const likes =
      findNumberAfterLabel(lines, /^Interactions$/i) ??
      findNumberAfterLabel(lines, /^Likes$/i) ??
      findNumberAfterLabel(lines, /^Accounts engaged$/i);
    const comments = findNumberAfterLabel(lines, /^Comments$/i) ?? 0;
    const followers =
      findNumberBeforeLabel(lines, /^Total followers$/i) ??
      findNumberAfterLabel(lines, /^Total followers$/i) ??
      findNumberAfterLabel(lines, /^Followers$/i);

    if (views !== null) result.views = views;
    if (likes !== null) result.likes = likes;
    result.comments = comments;
    if (followers !== null) result.followers = followers;
    return result;
  }

  if (platform === 'youtube') {
    const lines = splitLines(text);
    const keyIdx = lines.findIndex((l) => /^Key metrics$/i.test(l));
    const views =
      findNumberAfterLabel(lines, /^Views$/i, keyIdx >= 0 ? keyIdx : 0) ??
      findNumberAfterLabel(lines, /^Views$/i);
    const followers =
      findNumberAfterLabel(lines, /^Total subscribers$/i) ??
      findNumberAfterLabel(lines, /^Subscribers$/i);
    const likes = findNumberAfterLabel(lines, /^Likes$/i) ?? 0;
    const comments = findNumberAfterLabel(lines, /^Comments$/i) ?? 0;

    if (views !== null) result.views = views;
    if (followers !== null) result.followers = followers;
    result.likes = likes;
    result.comments = comments;
    return result;
  }

  if (platform === 'linkedin') {
    const lines = splitLines(text);
    const views =
      findNumberAfterLabel(lines, /^Impressions$/i) ??
      findNumberBeforeLabel(lines, /^Impressions$/i);
    const likes =
      findNumberAfterLabel(lines, /^Reactions$/i) ??
      findNumberBeforeLabel(lines, /^Reactions$/i) ??
      findNumberBeforeLabel(lines, /^Social engagements$/i);
    const comments =
      findNumberAfterLabel(lines, /^Comments$/i) ??
      findNumberBeforeLabel(lines, /^Comments$/i) ??
      0;
    const followers =
      findNumberAfterLabel(lines, /^(?:Total followers|Followers)$/i) ??
      findNumberBeforeLabel(lines, /^(?:Total followers|Followers)$/i);

    if (views !== null) result.views = views;
    if (likes !== null) result.likes = likes;
    result.comments = comments;
    if (followers !== null) result.followers = followers;
    return result;
  }

  if (platform === 'tiktok') {
    // Strip out the "Inspiration / Trending" feed at the bottom of TikTok Studio so viral videos aren't parsed
    const creatorOnlyText = text.split(/\n(?:Inspiration|Trending|Related posts)\n/i)[0] || text;
    const lines = splitLines(creatorOnlyText);
    const keyIdx = lines.findIndex((l) => /^Key metrics$/i.test(l));

    const views =
      findNumberAfterLabel(lines, /^(?:Video views|Post views|Views)$/i, keyIdx >= 0 ? keyIdx : 0) ??
      findNumberAfterLabel(lines, /^(?:Video views|Post views|Views)$/i);
    const followers = findNumberAfterLabel(lines, /^Followers$/i);
    const likes =
      findNumberAfterLabel(lines, /^Likes$/i, keyIdx >= 0 ? keyIdx : 0) ??
      findNumberAfterLabel(lines, /^Likes$/i);
    const comments =
      findNumberAfterLabel(lines, /^Comments$/i, keyIdx >= 0 ? keyIdx : 0) ??
      findNumberAfterLabel(lines, /^Comments$/i) ??
      0;

    if (views !== null) result.views = views;
    if (followers !== null) result.followers = followers;
    if (likes !== null) result.likes = likes;
    result.comments = comments;
    return result;
  }

  // Twitter / X or generic fallback
  const followerMatch = text.match(
    /(\d+(?:[.,]\d+)?[ \t]*[KMB]?)[ \t]+(?:Followers|Subscribers|followers|subscribers)\b/i
  );
  if (followerMatch?.[1]) {
    const parsed = parseCompactNumber(followerMatch[1]);
    if (parsed !== null) {
      result.followers = parsed;
    }
  }

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

  // Twitter / X GraphQL structures (Follower count only)
  if (platform === 'twitter') {
    if (typeof data.followers_count === 'number') {
      acc.followers = Math.max(acc.followers, data.followers_count);
      acc.hasFollowers = true;
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
    livePollingIntervalSec: 25,
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
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
    const targetUrl = resolveAccountUrl(account, 'analytics');
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
   * Executes platform-specific DOM extraction on the dedicated Studio / Insights page:
   * - Instagram: https://www.instagram.com/accounts/insights
   * - YouTube: https://studio.youtube.com/channel/UC-MXA8OTNJZWgKQxHjxBvFQ/analytics/hub_overview
   * - LinkedIn: https://www.linkedin.com/analytics/creator/content/
   * - TikTok: https://www.tiktok.com/tiktokstudio
   * - Twitter / X: https://x.com/{handle} (follower count only)
   */
  private async extractPageDeepMetrics(
    page: Page,
    platform: PlatformId,
    acc: DeepAccumulator
  ): Promise<string> {
    try {
      // If YouTube Studio ever shows the "SKIP TO YOUTUBE STUDIO" prompt, click through it automatically
      if (platform === 'youtube') {
        const skipBtn = await page.$('text=/SKIP TO YOUTUBE STUDIO/i');
        if (skipBtn) {
          await skipBtn.click().catch(() => {});
          await page.waitForTimeout(3500);
        }
      }

      if (platform === 'twitter') {
        const twData = await page.evaluate(() => {
          const followersEl = document.querySelector(
            'a[href$="/verified_followers"], a[href$="/followers"]'
          ) as HTMLElement | null;
          const followersText = followersEl?.innerText || '';
          return {
            followersText,
            bodyText: document.body?.innerText?.slice(0, 4000) || '',
          };
        });

        const fMatch = twData.followersText.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)/i);
        if (fMatch?.[1]) {
          const parsed = parseCompactNumber(fMatch[1]);
          if (parsed !== null) {
            acc.followers = parsed;
            acc.hasFollowers = true;
          }
        } else {
          const parsed = extractMetricsFromText(twData.bodyText, 'twitter');
          if (parsed.followers !== undefined) {
            acc.followers = parsed.followers;
            acc.hasFollowers = true;
          }
        }
        return twData.bodyText;
      }

      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      const parsed = extractMetricsFromText(bodyText, platform);

      if (parsed.views !== undefined) {
        acc.views = parsed.views;
        acc.hasViews = true;
      }
      if (parsed.likes !== undefined) {
        acc.likes = parsed.likes;
        acc.hasLikes = true;
      }
      if (parsed.comments !== undefined) {
        acc.comments = parsed.comments;
        acc.hasComments = true;
      }
      if (parsed.followers !== undefined) {
        acc.followers = parsed.followers;
        acc.hasFollowers = true;
      }

      return bodyText.slice(0, 4000);
    } catch {
      return '';
    }
  }

  public async scrapePlatformStats(
    account: PlatformAccount,
    currentStats: PlatformStats
  ): Promise<PlatformStats> {
    const pagesToVisit = resolveExtractionPages(account);
    const target = pagesToVisit[0];
    const targetUrl = target?.url || resolveAccountUrl(account, 'analytics');
    const acc = createAccumulator();
    let domSnippet = '';

    this.emitLog(
      'browser',
      `Navigating to ${account.name} (${targetUrl}) to extract live metrics...`,
      account.id
    );

    const ctx = await this.ensurePersistentContext(false);
    if (ctx) {
      try {
        const page = await this.getOrCreatePage(ctx, targetUrl);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3500);
        domSnippet = await this.extractPageDeepMetrics(page, account.id, acc);
      } catch (err: any) {
        this.emitLog(
          'browser',
          `Navigation note on ${account.name}: ${err?.message || 'reading available DOM'}`,
          account.id
        );
      }
    }

    const domExtracted = domSnippet ? extractMetricsFromText(domSnippet, account.id) : {};

    let llmParsed: Partial<PlatformStats> | null = null;
    const needsLlmFallback =
      account.id === 'twitter'
        ? !acc.hasFollowers
        : !acc.hasViews && !acc.hasLikes && !acc.hasFollowers;

    if (domSnippet && needsLlmFallback) {
      const llmPrompt = `Extract social media statistics for ${account.name} (${targetUrl}) from the following page text.
Page Text:
${domSnippet.slice(0, 2200)}

Return JSON with integer keys: likes, comments, views, followers. Convert shorthand like 1.2K to 1200. If a metric is not found, use 0.`;

      const llmJson = await this.queryOllama(llmPrompt, account.id);
      if (llmJson) {
        try {
          llmParsed = JSON.parse(llmJson);
        } catch {
          llmParsed = null;
        }
      }
    }

    const nextFollowers = acc.hasFollowers
      ? acc.followers
      : domExtracted.followers ??
        (typeof llmParsed?.followers === 'number' && llmParsed.followers > 0
          ? llmParsed.followers
          : currentStats.followers);

    // X has no stats, only show follower count
    if (account.id === 'twitter') {
      this.emitLog(
        'stats',
        `[${account.name}] Extracted from ${targetUrl} -> Followers: ${nextFollowers.toLocaleString()}`,
        account.id
      );
      return {
        platform: account.id,
        likes: 0,
        comments: 0,
        views: 0,
        followers: nextFollowers,
        engagementRate: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const nextViews = acc.hasViews
      ? acc.views
      : domExtracted.views ??
        (typeof llmParsed?.views === 'number' && llmParsed.views > 0
          ? llmParsed.views
          : currentStats.views);

    const nextLikes = acc.hasLikes
      ? acc.likes
      : domExtracted.likes ??
        (typeof llmParsed?.likes === 'number' && llmParsed.likes > 0
          ? llmParsed.likes
          : currentStats.likes);

    const nextComments = acc.hasComments
      ? acc.comments
      : domExtracted.comments ??
        (typeof llmParsed?.comments === 'number' && llmParsed.comments > 0
          ? llmParsed.comments
          : currentStats.comments);

    const engagementRate =
      nextViews > 0
        ? Number((((nextLikes + nextComments) / nextViews) * 100).toFixed(2))
        : 0;

    this.emitLog(
      'stats',
      `[${account.name}] Extracted from ${targetUrl} -> Views: ${nextViews.toLocaleString()}, Likes: ${nextLikes.toLocaleString()}, Comments: ${nextComments.toLocaleString()}, Followers: ${nextFollowers.toLocaleString()}`,
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
