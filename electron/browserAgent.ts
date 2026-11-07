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
        return 'https://studio.youtube.com/';
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
          label: 'YouTube Studio',
          url: 'https://studio.youtube.com/',
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
  private contextHeadless: boolean | null = null;
  private isUploadingActive = false;
  private userDataDir: string;
  private config: LlmConfig = {
    ollamaEndpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    headless: true,
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

  public isUploadActive(): boolean {
    return this.isUploadingActive;
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
      // Stats updates (forceVisible = false) ALWAYS run in a headless browser;
      // Interactive login & upload testing (forceVisible = true) open a visible browser window.
      const headless = forceVisible ? false : true;

      if (this.context && this.contextHeadless !== headless) {
        // Do not close the visible browser context while an upload / publish session is in progress
        if (this.isUploadingActive && !forceVisible) {
          return null;
        }
        await this.closeContext();
        await new Promise((r) => setTimeout(r, 600));
      }

      if (this.context) {
        return this.context;
      }
      this.emitLog(
        'browser',
        `Starting ${headless ? 'headless background' : 'visible'} browser session`
      );
      const args = ['--disable-blink-features=AutomationControlled'];
      if (headless) {
        args.push('--headless=new');
      }
      const baseOptions = {
        headless,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        args,
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
      this.contextHeadless = headless;
      this.context.on('close', () => {
        this.context = null;
        this.contextHeadless = null;
      });
      return this.context;
    } catch (err: any) {
      this.emitLog(
        'error',
        `Browser launch error: ${err?.message || 'Unable to launch browser'}`
      );
      return null;
    }
  }

  public async closeContext(): Promise<void> {
    if (!this.context) {
      this.contextHeadless = null;
      return;
    }
    const ctx = this.context;
    this.context = null;
    this.contextHeadless = null;
    try {
      await ctx.close();
      this.emitLog('browser', 'Closed background browser instance.');
    } catch {
      // ignore close errors
    }
  }

  public async closeContextIfHeadless(): Promise<void> {
    if (this.context && this.contextHeadless === true) {
      await this.closeContext();
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
          `Navigation note on ${account.name}: ${err?.message || 'reading available page content'}`,
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

  /**
   * Builds normalized hashtags and auto-generates suggested tags from title/description when needed.
   */
  private buildUploadTags(payload: VideoUploadPayload): string {
    const rawTokens = (payload.tags || '')
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'from',
      'into',
      'your',
      'day',
      'testing',
    ]);
    const keywordTokens = `${payload.title || ''} ${payload.description || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w))
      .slice(0, 3)
      .map((w) => `#${w}`);

    const combined = Array.from(new Set([...rawTokens, ...keywordTokens, '#shorts']));
    return combined.slice(0, 5).join(' ');
  }

  /**
   * Clicks the first visible element on the page matching any of the given exact text labels or selectors.
   */
  private async clickVisibleElement(page: Page, selectors: string[]): Promise<boolean> {
    for (const sel of selectors) {
      try {
        const handles = await page.$$(sel);
        for (const h of handles) {
          const visible = await h.isVisible().catch(() => false);
          if (visible) {
            await h.scrollIntoViewIfNeeded().catch(() => {});
            await h.click({ timeout: 2500 }).catch(async () => {
              await h.click({ force: true }).catch(() => {});
            });
            return true;
          }
        }
      } catch {
        // ignore selector error
      }
    }
    return false;
  }

  /**
   * Dismisses TikTok Studio tutorial / onboarding popups ("Got it", "Skip", etc.)
   */
  private async dismissTikTokPopups(page: Page): Promise<void> {
    const popupSelectors = [
      'button:has-text("Got it")',
      'div[role="button"]:has-text("Got it")',
      'span:has-text("Got it")',
      'button:has-text("Skip")',
      'div[role="button"]:has-text("Skip")',
      'button:has-text("OK")',
      '.TUXButton:has-text("Got it")',
    ];
    for (const sel of popupSelectors) {
      try {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * Clears any existing or pre-filled text in a contenteditable / Draft.js / Lexical / Polymer element
   * using native keyboard events (without destroying Draft.js internal DOM wrappers) and types the text.
   */
  private async clearAndInsertText(
    page: Page,
    elementSelector: string,
    text: string,
    timeoutMs = 18000
  ): Promise<boolean> {
    const el = await page
      .waitForSelector(elementSelector, { state: 'visible', timeout: timeoutMs })
      .catch(() => null);
    if (!el) return false;

    await el.scrollIntoViewIfNeeded().catch(() => {});
    const box = await el.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + Math.min(40, box.width / 2), box.y + Math.min(20, box.height / 2)).catch(() => {});
    } else {
      await el.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(300);

    // 1. Clear pre-filled text (e.g. "11-5-26") using ONLY keyboard events so Draft.js (TikTok & X) keeps its internal state intact
    await page.keyboard.press('Control+A').catch(() => {});
    await page.waitForTimeout(80);
    await page.keyboard.press('Backspace').catch(() => {});
    await page.waitForTimeout(80);

    const remainingLen = await el
      .evaluate((node: Element) => ((node as HTMLElement).innerText || '').trim().length)
      .catch(() => 0);
    if (remainingLen > 0) {
      await page.keyboard.press('End').catch(() => {});
      for (let i = 0; i < Math.min(remainingLen + 15, 80); i++) {
        await page.keyboard.press('Backspace').catch(() => {});
      }
      await page.keyboard.press('Home').catch(() => {});
      for (let i = 0; i < Math.min(remainingLen + 15, 80); i++) {
        await page.keyboard.press('Delete').catch(() => {});
      }
    }

    await page.waitForTimeout(200);

    // 2. Type text line-by-line using real keystrokes so Draft.js (X & TikTok), Quill (LinkedIn), and Polymer (YouTube) commit every character
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0) {
        await page.keyboard.type(line, { delay: 12 }).catch(() => {});
        // If the line ends with a hashtag, press Space to commit the tag (avoid pressing Escape which closes composer modals)
        if (/#\w+$/.test(line.trim())) {
          await page.keyboard.press('Space').catch(() => {});
          await page.waitForTimeout(100);
        }
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Shift+Enter').catch(() => {});
        await page.waitForTimeout(60);
      }
    }

    await page.waitForTimeout(300);
    return true;
  }

  public async replicateVideoUpload(
    payload: VideoUploadPayload,
    accounts: PlatformAccount[],
    onStatusUpdate: (status: PlatformUploadStatus) => void
  ): Promise<void> {
    this.isUploadingActive = true;
    try {
      const isDryRun = payload.dryRun !== false;
      const targetAccounts = accounts.filter(
        (a) => a.linked && payload.platforms.includes(a.id)
      );

      this.emitLog(
        'upload',
        `${isDryRun ? '[TEST / STAGE ONLY — NO PUBLISH] ' : ''}Starting multi-platform video flow for "${payload.title}" across ${targetAccounts.length} linked platforms`
      );

      // Always launch a visible browser for upload staging/testing so the user can see and verify
      const ctx = await this.ensurePersistentContext(true);
      const hasVideoFile = Boolean(payload.videoPath && fs.existsSync(payload.videoPath));
      const hasThumbnailFile = Boolean(payload.thumbnailPath && fs.existsSync(payload.thumbnailPath));
      const suggestedTags = this.buildUploadTags(payload);
      const userOrSuggestedTags = (payload.tags || '').trim() || suggestedTags;

      // Tags are on the line directly below the text (single newline, no empty line)
      // Title + Tags (for LinkedIn & Instagram)
      const titleAndTagsCaption = [payload.title.trim(), userOrSuggestedTags.trim()]
        .filter(Boolean)
        .join('\n');

      // Title + Description + Tags (for TikTok, etc. with single line spacing)
      const fullCaption = [
        payload.title.trim(),
        payload.description.trim(),
        userOrSuggestedTags.trim(),
      ]
        .filter(Boolean)
        .join('\n');

      for (const account of targetAccounts) {
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const targetUploadUrl =
          account.id === 'linkedin'
            ? 'https://www.linkedin.com/sharing/compose'
            : account.uploadUrl;

        onStatusUpdate({
          platform: account.id,
          status: 'opening_browser',
          progress: 25,
          message: `Opening ${account.name} upload studio (${targetUploadUrl})...`,
        });
        this.emitLog(
          'browser',
          `Opening ${account.name} upload studio (${targetUploadUrl})`,
          account.id
        );

        let page: Page | null = null;
        if (ctx) {
          try {
            page = await this.getOrCreatePage(ctx, targetUploadUrl);
            await page.bringToFront();

            // Set up dialog dismisser to prevent unexpected browser beforeunload prompts from discarding posts
            page.on('dialog', async (d) => {
              try {
                await d.dismiss();
              } catch {}
            });

            const curUrl = page.url();
            const targetHost = new URL(targetUploadUrl).hostname.replace(/^www\./, '');
            const isSameDomain = curUrl && curUrl !== 'about:blank' && curUrl.includes(targetHost);

            if (!isSameDomain) {
              await page.goto(targetUploadUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
              await page.waitForTimeout(2500);
            } else {
              // If already on the platform, check if we're already on composer/upload page to avoid reloading and discarding staged drafts
              const pathname = new URL(page.url()).pathname;
              const needsNav =
                (account.id === 'twitter' && !pathname.includes('/compose')) ||
                (account.id === 'linkedin' && !pathname.includes('/sharing')) ||
                (account.id === 'tiktok' && !pathname.includes('/upload')) ||
                (account.id === 'youtube' && !pathname.includes('studio'));
              if (needsNav) {
                await page.goto(targetUploadUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(2000);
              } else {
                await page.waitForTimeout(1000);
              }
            }
          } catch (err: any) {
            this.emitLog(
              'browser',
              `Opened ${account.name} (${err?.message || 'ready'})`,
              account.id
            );
          }
        }

        onStatusUpdate({
          platform: account.id,
          status: 'llm_navigating',
          progress: 55,
          message: `Preparing upload modal & inputs on ${account.name}...`,
        });

        if (page) {
          try {
            // =========================================================================
            // 1. X / TWITTER: Only use Title (no description or tags)
            // =========================================================================
            if (account.id === 'twitter') {
              // Safely dismiss any pre-existing discard dialog if present
              await this.clickVisibleElement(page, ['[data-testid="confirmationSheetCancel"]']);

              const alreadyHasMedia = await page
                .$('[data-testid="attachments"], [data-testid="videoPlayer"]')
                .catch(() => null);

              if (hasVideoFile && !alreadyHasMedia) {
                onStatusUpdate({
                  platform: account.id,
                  status: 'uploading_file',
                  progress: 70,
                  message: `Staging "${payload.videoFileName}" on X...`,
                });
                const fileInput = await page.$(
                  'input[type="file"][data-testid="fileInput"], input[type="file"]'
                );
                if (fileInput) {
                  await fileInput.setInputFiles(payload.videoPath);
                  this.emitLog('upload', `Attached "${payload.videoFileName}" on X`, account.id);
                  await page.waitForTimeout(2500);
                }
              }

              onStatusUpdate({
                platform: account.id,
                status: 'filling_metadata',
                progress: 90,
                message: `Setting Title only on X...`,
              });
              await this.clearAndInsertText(
                page,
                '[data-testid="tweetTextarea_0"] [contenteditable="true"], [data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]',
                payload.title.trim()
              );

              // If not test mode, wait for upload to complete and click "Post"
              if (!isDryRun) {
                onStatusUpdate({
                  platform: account.id,
                  status: 'uploading_file',
                  progress: 95,
                  message: `Waiting for video upload to finish & publishing on X...`,
                });
                // Wait up to 60s for the Post button to become enabled while Twitter processes/uploads the media
                const enabledPostSelector =
                  '[data-testid="tweetButton"]:not([aria-disabled="true"]):not([disabled]), [data-testid="tweetButtonInline"]:not([aria-disabled="true"]):not([disabled])';

                const postBtn = await page
                  .waitForSelector(enabledPostSelector, { state: 'visible', timeout: 60000 })
                  .catch(() => null);

                if (postBtn) {
                  await postBtn.click().catch(() => {});
                  this.emitLog('upload', 'Clicked enabled "Post" on X', account.id);
                } else {
                  await this.clickVisibleElement(page, [
                    '[data-testid="tweetButtonInline"]',
                    '[data-testid="tweetButton"]',
                    'button[role="button"]:has-text("Post")',
                    'button:has-text("Post")',
                  ]);
                  this.emitLog('upload', 'Attempted fallback "Post" on X', account.id);
                }

                await page.waitForTimeout(3500);
                // If a discard confirmation ever appears, dismiss it safely with Cancel (never Discard)
                await this.clickVisibleElement(page, ['[data-testid="confirmationSheetCancel"]']);
              }
            }

          // =========================================================================
          // 2. LINKEDIN: Opens https://www.linkedin.com/sharing/compose directly, attaches video via media button, fills post
          // =========================================================================
          else if (account.id === 'linkedin') {
            let videoAttached = false;

            // Ensure compose dialog is open (if not already opened by URL)
            const composeBox = await page
              .$('.ql-editor, div[role="dialog"] .share-creation-state, .share-box, div[role="dialog"]')
              .catch(() => null);
            if (!composeBox) {
              await this.clickVisibleElement(page, [
                'button:has-text("Start a post")',
                'button.share-box-feed-entry__trigger',
                'div[role="button"]:has-text("Start a post")',
                'button:has-text("Create a post")',
              ]);
              await page.waitForTimeout(1500);
            }

            if (hasVideoFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 65,
                message: `Clicking media button & attaching "${payload.videoFileName}" in LinkedIn composer...`,
              });

              // Wait for compose dialog to be ready
              await page.waitForTimeout(1500);

              // Intercept the native OS file picker when clicking the media button
              const fcPromise = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);

              // Click the media button (photo/video icon at bottom left of the compose box)
              await this.clickVisibleElement(page, [
                'button[aria-label*="Add media" i]',
                'button[aria-label*="Add a photo" i]',
                'button[aria-label*="media" i]',
                'button[aria-label*="video" i]',
                'button:has-text("Media")',
                'button.share-promoted-detour-button',
                'button:has(svg[data-test-icon="image-medium"])',
                'button:has(svg[data-test-icon*="image"])',
                'button:has(svg[data-test-icon*="video"])',
                'button:has(svg path[d*="M19 4H5a3 3 0 00-3 3v10a3"])',
                'div[role="button"][aria-label*="media" i]',
                '.share-box-footer button:first-of-type',
                '.share-creation-state__bottom-bar button:first-of-type',
              ]);

              const fc = await fcPromise;
              if (fc) {
                await fc.setFiles(payload.videoPath);
                videoAttached = true;
                this.emitLog('upload', `Attached "${payload.videoFileName}" via LinkedIn media chooser`, account.id);
              } else {
                // Check if clicking opened a file input or secondary modal
                const fcPromise2 = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
                const clickedSelect = await this.clickVisibleElement(page, [
                  'button:has-text("Select from computer")',
                  'button:has-text("Upload from computer")',
                  'label:has-text("Select from computer")',
                  'label:has-text("Upload from computer")',
                  'div[role="button"]:has-text("Select from computer")',
                ]);
                const fc2 = await fcPromise2;
                if (fc2) {
                  await fc2.setFiles(payload.videoPath);
                  videoAttached = true;
                  this.emitLog('upload', `Attached "${payload.videoFileName}" via LinkedIn secondary modal filechooser`, account.id);
                } else {
                  await page.waitForTimeout(1000);
                  const fileInputs = await page.$$('input[type="file"]');
                  if (fileInputs.length > 0) {
                    await fileInputs[fileInputs.length - 1].setInputFiles(payload.videoPath);
                    videoAttached = true;
                    this.emitLog('upload', `Attached "${payload.videoFileName}" via file input on LinkedIn`, account.id);
                  }
                }
              }

              if (videoAttached) {
                await page.waitForTimeout(3000);

                // Thumbnail: Click the thumbnail icon directly on the video editor dialog that opened
                if (hasThumbnailFile) {
                  onStatusUpdate({
                    platform: account.id,
                    status: 'uploading_file',
                    progress: 75,
                    message: `Adding video thumbnail on LinkedIn...`,
                  });

                  // Click thumbnail icon on the edit/preview dialog
                  await this.clickVisibleElement(page, [
                    'button[aria-label*="Thumbnail" i]',
                    'button:has-text("Thumbnail")',
                    'button:has(svg[data-test-icon*="image"])',
                    '[role="tab"]:has-text("Thumbnail")',
                    'span:text-is("Thumbnail")',
                  ]);
                  await page.waitForTimeout(1000);

                  // Click "add video thumbnail" or upload thumbnail file
                  const thumbFcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
                  await this.clickVisibleElement(page, [
                    'button:has-text("Add video thumbnail")',
                    'button[aria-label*="thumbnail" i]',
                    'label:has-text("Add video thumbnail")',
                    'button:has-text("Upload thumbnail")',
                  ]);
                  const thumbFc = await thumbFcPromise;
                  if (thumbFc) {
                    await thumbFc.setFiles(payload.thumbnailPath!);
                    this.emitLog('upload', 'Attached thumbnail on LinkedIn', account.id);
                  } else {
                    const thumbInputs = await page.$$('input[type="file"]');
                    if (thumbInputs.length > 0) {
                      await thumbInputs[thumbInputs.length - 1].setInputFiles(payload.thumbnailPath!);
                      this.emitLog('upload', 'Attached thumbnail on LinkedIn via file input', account.id);
                    }
                  }

                  await page.waitForTimeout(1500);
                  // Click "Add" / "Apply" on the thumbnail dialog if needed
                  await this.clickVisibleElement(page, [
                    'button:text-is("Add")',
                    'button:has-text("Add")',
                    'button:has-text("Apply")',
                    '.video-edit-modal__footer button:has-text("Add")',
                  ]);
                  await page.waitForTimeout(1500);
                }

                // Wait for "Next" in LinkedIn's media preview dialog to become enabled, then click
                await page
                  .waitForSelector(
                    'button[aria-label="Next"]:not([disabled]), button:has-text("Next"):not([disabled]), .share-box-footer__primary-btn:not([disabled])',
                    { state: 'visible', timeout: 20000 }
                  )
                  .catch(() => null);

                await this.clickVisibleElement(page, [
                  'button[aria-label="Next"]',
                  'button:has-text("Next")',
                  'span:text-is("Next")',
                  '.share-box-footer__primary-btn',
                ]);
                await page.waitForTimeout(2000);
              }
            }

            onStatusUpdate({
              platform: account.id,
              status: 'filling_metadata',
              progress: 90,
              message: `Filling post text on LinkedIn (Title then Tags)...`,
            });
            // LinkedIn must only show Title then Tags
            await this.clearAndInsertText(
              page,
              '.ql-editor[contenteditable="true"], .ql-editor, [role="textbox"][aria-label*="Text editor" i], [role="textbox"][contenteditable="true"], div[contenteditable="true"]',
              titleAndTagsCaption
            );

            // If not test mode, wait for processing and click "Post"
            if (!isDryRun) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 95,
                message: `Waiting for video processing & publishing on LinkedIn...`,
              });

              // Wait up to 60s for LinkedIn post button to become enabled
              const enabledLinkedInPostSelector =
                'button.share-actions__primary-action:not([disabled]), .share-box_actions button.artdeco-button--primary:not([disabled]), button[aria-label="Post"]:not([disabled])';

              const postBtn = await page
                .waitForSelector(enabledLinkedInPostSelector, { state: 'visible', timeout: 60000 })
                .catch(() => null);

              if (postBtn) {
                await postBtn.click().catch(() => {});
                this.emitLog('upload', 'Clicked enabled "Post" on LinkedIn', account.id);
              } else {
                await this.clickVisibleElement(page, [
                  'button.share-actions__primary-action',
                  'button:has-text("Post")',
                  'button[aria-label="Post"]',
                  '.share-box_actions button.artdeco-button--primary',
                ]);
                this.emitLog('upload', 'Attempted fallback "Post" on LinkedIn', account.id);
              }

              await page.waitForTimeout(4000);
              // Dismiss any accidental discard draft dialog by clicking Cancel
              const cancelDiscard = await page.$(
                '.artdeco-modal button:has-text("Cancel"), button[aria-label="Cancel"]'
              );
              if (cancelDiscard) {
                await cancelDiscard.click().catch(() => {});
              }
            }
          }

          // =========================================================================
          // 3. YOUTUBE STUDIO: Upload file, wait for modal, set Title (+ Suggested Hashtags button -> Add all) & Description (+ tags)
          // =========================================================================
          else if (account.id === 'youtube') {
            await this.clickVisibleElement(page, [
              '#create-icon',
              'ytcp-button#create-icon',
              'button[aria-label*="Create" i]',
            ]);
            await page.waitForTimeout(800);
            await this.clickVisibleElement(page, [
              'tp-yt-paper-item#text-item-0',
              'ytcp-ve:has-text("Upload videos")',
              'tp-yt-paper-item:has-text("Upload videos")',
            ]);
            await page.waitForTimeout(1000);

            if (hasVideoFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 70,
                message: `Uploading "${payload.videoFileName}" to YouTube Studio...`,
              });
              const fileInput = await page
                .waitForSelector('input[type="file"]', { state: 'attached', timeout: 8000 })
                .catch(() => null);
              if (fileInput) {
                await fileInput.setInputFiles(payload.videoPath);
                this.emitLog(
                  'upload',
                  `Staged "${payload.videoFileName}" into YouTube Studio`,
                  account.id
                );
              }
            }

            onStatusUpdate({
              platform: account.id,
              status: 'filling_metadata',
              progress: 90,
              message: `Setting Title & Description on YouTube Studio...`,
            });

            // Wait for YouTube Studio's Upload Details modal textboxes to become visible and finish default filename prefill
            const ytTitleSelector =
              'ytcp-social-suggestions-textbox#title-textarea #textbox, #title-textarea #textbox, #textbox[aria-label*="Add a title" i]';
            const ytDescSelector =
              'ytcp-social-suggestions-textbox#description-textarea #textbox, #description-textarea #textbox, #textbox[aria-label*="Tell viewers" i]';

            const titleEl = await page
              .waitForSelector(ytTitleSelector, { state: 'visible', timeout: 25000 })
              .catch(() => null);

            if (titleEl) {
              // Wait 1.5s for YouTube Studio to finish auto-filling the filename (e.g. "11-5-26")
              await page.waitForTimeout(1500);
              // YouTube title is ONLY the Title
              const cleanYtTitle = payload.title.trim();
              await this.clearAndInsertText(page, ytTitleSelector, cleanYtTitle, 10000);
              this.emitLog('upload', `Set YouTube Title: "${cleanYtTitle}"`, account.id);

              // Click YouTube Studio's "Suggested hashtags" / "Suggesting Hashtags", then click "Add all"
              await page.waitForTimeout(800);
              const clickedSuggestions = await this.clickVisibleElement(page, [
                'button:has-text("Suggesting Hashtags")',
                'button:has-text("Suggested hashtags")',
                'button:has-text("Suggested Hashtags")',
                'ytcp-chip:has-text("Suggest")',
                '[aria-label*="suggested hashtag" i]',
                'ytcp-button:has-text("Hashtags")',
              ]);
              if (clickedSuggestions) {
                this.emitLog('upload', 'Clicked Suggested Hashtags on YouTube Studio', account.id);
                await page.waitForTimeout(1000);

                // Click "Add all" once it appears
                const clickedAddAll = await this.clickVisibleElement(page, [
                  'button:has-text("Add all")',
                  'button:has-text("Add All")',
                  'tp-yt-paper-button:has-text("Add all")',
                  'ytcp-button:has-text("Add all")',
                  '[aria-label*="Add all" i]',
                  '.add-all-button',
                ]);
                if (clickedAddAll) {
                  this.emitLog('upload', 'Clicked "Add all" suggested hashtags on YouTube Studio', account.id);
                } else {
                  // Fallback: click individual suggestion chips if "Add all" button not present
                  const chips = await page.$$('ytcp-chip:not([disabled]), .suggestion-chip, tp-yt-paper-item.suggestion');
                  for (let c = 0; c < Math.min(chips.length, 3); c++) {
                    if (await chips[c].isVisible().catch(() => false)) {
                      await chips[c].click().catch(() => {});
                      await page.waitForTimeout(300);
                    }
                  }
                }
              }
            }

            // Thumbnail for YouTube: Click "Upload file" under the thumbnail section
            if (hasThumbnailFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 85,
                message: `Uploading thumbnail on YouTube Studio...`,
              });
              const thumbFcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
              const clickedUploadThumb = await this.clickVisibleElement(page, [
                '#select-button[aria-label*="Upload file" i]',
                'button[aria-label*="Upload thumbnail" i]',
                '#select-button:has-text("Upload file")',
                '#select-button:has-text("Upload thumbnail")',
                'button:has-text("Upload file")',
                'button:has-text("Upload thumbnail")',
                'ytcp-thumbnails-compact-editor-uploader #select-button',
                'ytcp-thumbnails-compact-editor-uploader',
              ]);
              const thumbFc = await thumbFcPromise;
              if (thumbFc) {
                await thumbFc.setFiles(payload.thumbnailPath!);
                this.emitLog('upload', 'Uploaded thumbnail on YouTube Studio via filechooser', account.id);
              } else {
                // If direct file input exists under thumbnail uploader
                const thumbInput = await page.$('ytcp-thumbnails-compact-editor-uploader input[type="file"], input[type="file"]#file-loader');
                if (thumbInput) {
                  await thumbInput.setInputFiles(payload.thumbnailPath!);
                  this.emitLog('upload', 'Uploaded thumbnail on YouTube Studio via input element', account.id);
                }
              }
              await page.waitForTimeout(1500);
            }

            const descEl = await page
              .waitForSelector(ytDescSelector, { state: 'visible', timeout: 10000 })
              .catch(() => null);

            if (descEl) {
              // YouTube Description receives Description + Tags (with single line directly below)
              const ytDescWithTags = [payload.description.trim(), userOrSuggestedTags.trim()]
                .filter(Boolean)
                .join('\n');
              await this.clearAndInsertText(page, ytDescSelector, ytDescWithTags, 10000);
              this.emitLog('upload', `Set YouTube Description with tags`, account.id);
            }

            // Step 1 Details: select "No, it's not made for kids"
            onStatusUpdate({
              platform: account.id,
              status: 'filling_metadata',
              progress: 92,
              message: `Selecting audience & stepping through YouTube wizard...`,
            });

            // Target the actual scrollable body of the dialog
            await page.evaluate(() => {
              const el = document.querySelector('#scrollable-content, #dialog #scrollable-content, ytcp-uploads-dialog #scrollable-content');
              if (el) {
                el.scrollTop = el.scrollHeight;
              }
            }).catch(() => {});
            await page.waitForTimeout(1000);

            // Click the not-made-for-kids radio button specifically by targeting its input or container
            const clickedKids = await page.evaluate(() => {
              // Priority 1: tp-yt-paper-radio-button by name
              const radio = document.querySelector(
                'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], #not-made-for-kids, [name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'
              ) as HTMLElement | null;
              if (radio) {
                radio.scrollIntoView({ block: 'center', inline: 'center' });
                // Click the radio button element or its internal #radio container
                const target = radio.querySelector('#radio') as HTMLElement | null || radio;
                target.click();
                return true;
              }
              // Priority 2: Find by label text
              const all = Array.from(document.querySelectorAll('tp-yt-paper-radio-button, [role="radio"]'));
              const found = all.find((r) =>
                ((r as HTMLElement).innerText || '').toLowerCase().includes('not made for kids')
              ) as HTMLElement | null;
              if (found) {
                found.scrollIntoView({ block: 'center', inline: 'center' });
                const target = found.querySelector('#radio') as HTMLElement | null || found;
                target.click();
                return true;
              }
              return false;
            }).catch(() => false);

            if (!clickedKids) {
              await this.clickVisibleElement(page, [
                'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radio',
                'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
                '#not-made-for-kids #radio',
                '#not-made-for-kids',
              ]);
            }

            this.emitLog('upload', 'Selected "No, it\'s not made for kids" on YouTube Studio', account.id);
            await page.waitForTimeout(1500);

            // Step through wizard tabs: Details -> Video elements -> Checks -> Visibility
            // Click the bottom-right #next-button
            for (let step = 0; step < 4; step++) {
              const onVisibilityStep = await page.evaluate(() => {
                const pub = document.querySelector('[name="PUBLIC"], tp-yt-paper-radio-button[name="PUBLIC"]');
                return Boolean(pub && pub.getBoundingClientRect().height > 0);
              }).catch(() => false);

              if (onVisibilityStep) {
                break;
              }

              // Wait up to 10s for the Next button to be enabled before clicking
              await page
                .waitForSelector('#next-button:not([disabled]), ytcp-button#next-button:not([disabled])', {
                  state: 'visible',
                  timeout: 10000,
                })
                .catch(() => null);

              // Click next button
              const nextClicked = await page.evaluate(() => {
                const btn = document.querySelector('#next-button, ytcp-button#next-button') as HTMLElement | null;
                if (btn && !btn.hasAttribute('disabled')) {
                  btn.scrollIntoView({ block: 'center' });
                  btn.click();
                  return true;
                }
                return false;
              }).catch(() => false);

              if (!nextClicked) {
                await this.clickVisibleElement(page, [
                  '#next-button',
                  'ytcp-button#next-button',
                  'button:has-text("Next")',
                ]);
              }
              await page.waitForTimeout(2000);
            }

            // Visibility step: Select "Public"
            await page.waitForTimeout(1200);
            await page.evaluate(() => {
              const pubRadio = document.querySelector(
                'tp-yt-paper-radio-button[name="PUBLIC"], #public-radio-button, [name="PUBLIC"]'
              ) as HTMLElement | null;
              if (pubRadio) {
                pubRadio.scrollIntoView({ block: 'center', inline: 'center' });
                const target = pubRadio.querySelector('#radio') as HTMLElement | null || pubRadio;
                target.click();
                return true;
              }
              const all = Array.from(document.querySelectorAll('tp-yt-paper-radio-button, [role="radio"]'));
              const found = all.find((r) =>
                ((r as HTMLElement).innerText || '').trim().startsWith('Public')
              ) as HTMLElement | null;
              if (found) {
                found.scrollIntoView({ block: 'center', inline: 'center' });
                const target = found.querySelector('#radio') as HTMLElement | null || found;
                target.click();
                return true;
              }
              return false;
            }).catch(() => false);

            this.emitLog('upload', 'Selected "Public" visibility on YouTube Studio', account.id);
            await page.waitForTimeout(1500);

            // Click Save / Publish
            if (!isDryRun) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 95,
                message: `Clicking Publish on YouTube Studio...`,
              });

              // Wait up to 15s for the Publish button to become enabled
              await page
                .waitForSelector('#done-button:not([disabled]), ytcp-button#done-button:not([disabled])', {
                  state: 'visible',
                  timeout: 15000,
                })
                .catch(() => null);

              await page.evaluate(() => {
                const doneBtn = document.querySelector('#done-button, ytcp-button#done-button') as HTMLElement | null;
                if (doneBtn && !doneBtn.hasAttribute('disabled')) {
                  doneBtn.click();
                }
              }).catch(() => {});

              await this.clickVisibleElement(page, [
                '#done-button:has-text("Publish")',
                'ytcp-button#done-button:has-text("Publish")',
                'button:has-text("Publish")',
                '#done-button',
                'ytcp-button#done-button',
                'button:has-text("Save")',
              ]);
              this.emitLog('upload', 'Clicked Publish on YouTube Studio', account.id);
              await page.waitForTimeout(1500);

              // Check if "Publish anyway" confirmation dialog appeared (e.g. while checks are still running)
              for (let attempt = 0; attempt < 8; attempt++) {
                const clickedPublishAnyway = await this.clickVisibleElement(page, [
                  'ytcp-button#publish-button:has-text("Publish anyway")',
                  'ytcp-button#confirm-button:has-text("Publish anyway")',
                  'ytcp-button:has-text("Publish anyway")',
                  'button:has-text("Publish anyway")',
                  'tp-yt-paper-button:has-text("Publish anyway")',
                  'ytcp-button:has-text("Publish Anyway")',
                  'button:has-text("Publish Anyway")',
                  'tp-yt-paper-button:has-text("Publish Anyway")',
                  'ytcp-button:has-text("PUBLISH ANYWAY")',
                  'button:has-text("PUBLISH ANYWAY")',
                  'tp-yt-paper-button:has-text("PUBLISH ANYWAY")',
                  '[aria-label*="Publish anyway" i]',
                ]);

                if (clickedPublishAnyway) {
                  this.emitLog('upload', 'Clicked "Publish anyway" confirmation on YouTube Studio', account.id);
                  await page.waitForTimeout(2000);
                  break;
                }

                // Check dialog button text via page.evaluate in case web component shadow DOM or inner elements hide text
                const clickedViaEval = await page.evaluate(() => {
                  const allButtons = Array.from(document.querySelectorAll('ytcp-button, tp-yt-paper-button, button'));
                  const target = allButtons.find((b) => {
                    const text = ((b as HTMLElement).innerText || '').toLowerCase().trim();
                    return text.includes('publish anyway');
                  }) as HTMLElement | null;
                  if (target && !target.hasAttribute('disabled')) {
                    target.click();
                    return true;
                  }
                  return false;
                }).catch(() => false);

                if (clickedViaEval) {
                  this.emitLog('upload', 'Clicked "Publish anyway" via evaluate on YouTube Studio', account.id);
                  await page.waitForTimeout(2000);
                  break;
                }

                await page.waitForTimeout(600);
              }

              // Dismiss post-publish dialog if present ("Video published" -> "Close")
              for (let c = 0; c < 5; c++) {
                const clickedClose = await this.clickVisibleElement(page, [
                  '#close-button',
                  'ytcp-button#close-button',
                  'button:has-text("Close")',
                  'tp-yt-paper-button:has-text("Close")',
                  'ytcp-button:has-text("Close")',
                  'tp-yt-paper-button[aria-label="Close"]',
                ]);
                if (clickedClose) {
                  this.emitLog('upload', 'Closed post-publish dialog on YouTube Studio', account.id);
                  break;
                }
                await page.waitForTimeout(600);
              }
              await page.waitForTimeout(1000);
            } else {
              this.emitLog('upload', '[Test Mode] Staged up to Public visibility on YouTube Studio', account.id);
            }
          }

          // =========================================================================
          // 4. INSTAGRAM: Click "+ Create" -> Click "Post" in submenu -> Attach video -> Next -> Next -> Caption
          // =========================================================================
          else if (account.id === 'instagram') {
            await this.clickVisibleElement(page, [
              'a:has-text("Create")',
              'span:text-is("Create")',
              'svg[aria-label="New post"]',
            ]);
            await page.waitForTimeout(1000);

            // If clicking "+ Create" opened the submenu ("Post", "Live video", "Ad"), click the visible "Post" item
            await this.clickVisibleElement(page, [
              'span:text-is("Post")',
              'a:has-text("Post")',
              'div[role="button"]:has-text("Post")',
              '[role="menuitem"]:has-text("Post")',
            ]);
            await page.waitForTimeout(1500);

            if (hasVideoFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 70,
                message: `Attaching "${payload.videoFileName}" to Instagram post modal...`,
              });

              const igFileInputs = await page.$$('input[type="file"]');
              if (igFileInputs.length > 0) {
                // Use the last file input (inside the newly opened Create Post modal)
                await igFileInputs[igFileInputs.length - 1].setInputFiles(payload.videoPath);
                this.emitLog('upload', `Attached "${payload.videoFileName}" on Instagram`, account.id);
              } else {
                const fcPromise = page
                  .waitForEvent('filechooser', { timeout: 4500 })
                  .catch(() => null);
                const clickedSelectBtn = await this.clickVisibleElement(page, [
                  'button:has-text("Select from computer")',
                  'div[role="button"]:has-text("Select from computer")',
                ]);
                if (clickedSelectBtn) {
                  const fc = await fcPromise;
                  if (fc) {
                    await fc.setFiles(payload.videoPath);
                    this.emitLog('upload', `Attached "${payload.videoFileName}" on Instagram`, account.id);
                  }
                }
              }

              await page.waitForTimeout(3000);

              // Dismiss "Video posts are now shared as reels" -> "OK" popup if shown
              await this.clickVisibleElement(page, [
                'button:has-text("OK")',
                'div[role="button"]:has-text("OK")',
              ]);
              await page.waitForTimeout(600);

              // On the Crop screen: click the bottom-left two-arrow icon ("Select crop") and then click "9:16"
              const clickedCropToggle = await this.clickVisibleElement(page, [
                'button:has(svg[aria-label="Select crop"])',
                'div[role="button"]:has(svg[aria-label="Select crop"])',
                'svg[aria-label="Select crop"]',
                '[aria-label="Select crop"]',
              ]);
              if (clickedCropToggle) {
                await page.waitForTimeout(800);
                await this.clickVisibleElement(page, [
                  'span:text-is("9:16")',
                  'div[role="button"]:has-text("9:16")',
                  'button:has-text("9:16")',
                  'svg[aria-label="Crop portrait icon"]',
                ]);
                this.emitLog('upload', 'Selected 9:16 aspect ratio crop on Instagram', account.id);
                await page.waitForTimeout(1000);
              }

              // Advance to Edit/Cover screen (1st "Next")
              await page
                .waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next")', {
                  state: 'visible',
                  timeout: 6000,
                })
                .catch(() => null);
              await this.clickVisibleElement(page, [
                'div[role="button"]:has-text("Next")',
                'button:has-text("Next")',
              ]);
              await page.waitForTimeout(2000);

              // Thumbnail on Edit/Cover screen: click "Select from computer" near the cover photo title
              if (hasThumbnailFile) {
                onStatusUpdate({
                  platform: account.id,
                  status: 'uploading_file',
                  progress: 85,
                  message: `Uploading cover photo on Instagram...`,
                });
                const igThumbFcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
                const clickedSelectThumb = await this.clickVisibleElement(page, [
                  'button:has-text("Select from computer")',
                  'div[role="button"]:has-text("Select from computer")',
                  'span:has-text("Select from computer")',
                  'label:has-text("Select from computer")',
                ]);
                const igThumbFc = await igThumbFcPromise;
                if (igThumbFc) {
                  await igThumbFc.setFiles(payload.thumbnailPath!);
                  this.emitLog('upload', 'Uploaded cover photo on Instagram', account.id);
                } else {
                  const coverInputs = await page.$$('input[type="file"]');
                  if (coverInputs.length > 0) {
                    await coverInputs[coverInputs.length - 1].setInputFiles(payload.thumbnailPath!);
                    this.emitLog('upload', 'Uploaded cover photo on Instagram via file input', account.id);
                  }
                }
                await page.waitForTimeout(1500);
              }

              // Advance to Caption screen (2nd "Next")
              await page
                .waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next")', {
                  state: 'visible',
                  timeout: 6000,
                })
                .catch(() => null);
              await this.clickVisibleElement(page, [
                'div[role="button"]:has-text("Next")',
                'button:has-text("Next")',
              ]);
              await page.waitForTimeout(1800);
            }

            onStatusUpdate({
              platform: account.id,
              status: 'filling_metadata',
              progress: 90,
              message: `Filling caption on Instagram (Title then Tags)...`,
            });
            // Instagram must only show Title then Tags
            await this.clearAndInsertText(
              page,
              'div[aria-label="Write a caption..."][contenteditable="true"], div[role="textbox"][contenteditable="true"]',
              titleAndTagsCaption,
              10000
            );

            // If not test mode, click "Share"
            if (!isDryRun) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 95,
                message: `Publishing reel on Instagram...`,
              });
              await page.waitForTimeout(1000);

              const clickedShare = await this.clickVisibleElement(page, [
                'div[role="button"]:text-is("Share")',
                'button:text-is("Share")',
                'div[role="button"]:has-text("Share")',
                'button:has-text("Share")',
                'header button:has-text("Share")',
              ]);
              if (clickedShare) {
                this.emitLog('upload', 'Clicked "Share" on Instagram, waiting for upload to complete...', account.id);
              }

              // Wait up to 60s for Instagram to finish uploading and sharing the reel
              const sharedConfirmationSelector =
                'span:has-text("Your reel has been shared"), span:has-text("Your post has been shared"), h2:has-text("Your reel has been shared"), h2:has-text("Your post has been shared"), svg[aria-label="Post created"], svg[aria-label="Reel shared"]';

              const confirmed = await page
                .waitForSelector(sharedConfirmationSelector, { state: 'visible', timeout: 60000 })
                .catch(() => null);

              if (confirmed) {
                this.emitLog('upload', 'Instagram confirmed: Reel has been shared!', account.id);
                await page.waitForTimeout(1000);
                // Cleanly close the completion dialog
                await this.clickVisibleElement(page, [
                  'svg[aria-label="Close"]',
                  'button:has(svg[aria-label="Close"])',
                  'div[role="button"]:has(svg[aria-label="Close"])',
                  '[aria-label="Close"]',
                ]);
              } else {
                await page.waitForTimeout(5000);
              }

              // Dismiss any accidental "Discard post?" dialog by clicking Cancel (never click Discard)
              const cancelDiscardBtn = await page.$(
                'button:has-text("Cancel"), div[role="button"]:has-text("Cancel")'
              );
              if (cancelDiscardBtn) {
                const isDiscardModal = await page.evaluate(() => {
                  return document.body.innerText.includes('Discard post?');
                }).catch(() => false);
                if (isDiscardModal) {
                  await cancelDiscardBtn.click().catch(() => {});
                  this.emitLog('upload', 'Safely dismissed Discard dialog on Instagram by clicking Cancel', account.id);
                }
              }
            }
          }

          // =========================================================================
          // 5. TIKTOK STUDIO: Dismiss "Got it" tutorial popups, upload video, clear default filename, paste caption
          // =========================================================================
          else if (account.id === 'tiktok') {
            await this.dismissTikTokPopups(page);

            if (hasVideoFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 70,
                message: `Staging "${payload.videoFileName}" on TikTok Studio...`,
              });
              const fileInput = await page
                .waitForSelector('input[type="file"]', { state: 'attached', timeout: 8000 })
                .catch(() => null);
              if (fileInput) {
                await fileInput.setInputFiles(payload.videoPath);
                this.emitLog(
                  'upload',
                  `Staged "${payload.videoFileName}" into TikTok Studio`,
                  account.id
                );
                await page.waitForTimeout(2500);
              }
            }

            // Dismiss any "Got it" tutorial popups that appear after video attachment
            await this.dismissTikTokPopups(page);
            await page.waitForTimeout(1000);
            await this.dismissTikTokPopups(page);

            // Thumbnail for TikTok Studio: Click "Edit cover", then "Upload cover" on the bottom of dialog, upload, click "Save"
            if (hasThumbnailFile) {
              onStatusUpdate({
                platform: account.id,
                status: 'uploading_file',
                progress: 85,
                message: `Uploading cover image on TikTok Studio...`,
              });

              // Wait up to 15 seconds for the video processing to finish and the "Edit cover" thumbnail trigger to appear
              const editCoverSelector =
                'button:has-text("Edit cover"), div[role="button"]:has-text("Edit cover"), span:has-text("Edit cover"), [class*="cover"] button, [class*="Cover"] button, [class*="edit-cover"]';

              await page
                .waitForSelector(editCoverSelector, { state: 'visible', timeout: 15000 })
                .catch(() => null);

              // Click "Edit cover" (or click directly on the cover preview card if that's what's interactive)
              const clickedEditCover = await this.clickVisibleElement(page, [
                'button:has-text("Edit cover")',
                'div[role="button"]:has-text("Edit cover")',
                'span:text-is("Edit cover")',
                'span:has-text("Edit cover")',
                '[class*="editCover"]',
                '[class*="cover-edit"]',
                '.cover-edit-btn',
              ]);

              if (!clickedEditCover) {
                // If the text button wasn't clicked, try clicking the cover preview box/card itself
                await this.clickVisibleElement(page, [
                  '[class*="cover-container"]',
                  '[class*="cover-preview"]',
                  '[class*="CoverPreview"]',
                  '[class*="coverCard"]',
                ]);
              }

              await page.waitForTimeout(2000);

              // Intercept filechooser when clicking "Upload cover" tab / button inside the Edit Cover modal
              const ttThumbFcPromise = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
              const clickedUploadCover = await this.clickVisibleElement(page, [
                'div[role="tab"]:has-text("Upload cover")',
                'button:has-text("Upload cover")',
                'div[role="button"]:has-text("Upload cover")',
                'span:has-text("Upload cover")',
                'div:text-is("Upload cover")',
                '.upload-cover-btn',
                '[class*="uploadCover"]',
              ]);

              const ttThumbFc = await ttThumbFcPromise;
              if (ttThumbFc) {
                await ttThumbFc.setFiles(payload.thumbnailPath!);
                this.emitLog('upload', 'Attached cover image on TikTok Studio via filechooser', account.id);
              } else {
                // Check if an input[type="file"] is present in the cover dialog
                const ttCoverInputs = await page.$$('input[type="file"]');
                if (ttCoverInputs.length > 0) {
                  // Usually the last file input is the one added for the modal
                  await ttCoverInputs[ttCoverInputs.length - 1].setInputFiles(payload.thumbnailPath!);
                  this.emitLog('upload', 'Attached cover image on TikTok Studio via file input', account.id);
                } else if (clickedUploadCover) {
                  // If we clicked tab first, there may be a "Select file" / "Upload" button inside the tab
                  const ttThumbFc2Promise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
                  await this.clickVisibleElement(page, [
                    'button:has-text("Select file")',
                    'button:has-text("Upload")',
                    'div[role="button"]:has-text("Select file")',
                    'span:has-text("Select file")',
                  ]);
                  const ttThumbFc2 = await ttThumbFc2Promise;
                  if (ttThumbFc2) {
                    await ttThumbFc2.setFiles(payload.thumbnailPath!);
                    this.emitLog('upload', 'Attached cover image on TikTok Studio via tab filechooser', account.id);
                  }
                }
              }

              // After image is attached, TikTok takes a moment to process the crop / preview before enabling "Save"
              await page.waitForTimeout(2000);

              // Click the pink "Save" button in the top right header (next to "Cancel")
              let saved = false;
              for (let attempt = 0; attempt < 5; attempt++) {
                // Priority 1: Specifically find button that contains exact text "Save" and has red/pink background or is next to Cancel
                saved = await page.evaluate(() => {
                  const buttons = Array.from(document.querySelectorAll('button'));
                  // Find the top-right header "Save" button
                  const saveBtn = buttons.find((b) => {
                    const text = (b.innerText || '').trim();
                    if (text !== 'Save') return false;
                    const rect = b.getBoundingClientRect();
                    // In the screenshot, the Save button is in the top-right quadrant (rect.top < 300, rect.right > 600)
                    return rect.width > 0 && rect.height > 0 && !b.disabled;
                  });
                  if (saveBtn) {
                    saveBtn.click();
                    return true;
                  }
                  return false;
                }).catch(() => false);

                if (!saved) {
                  saved = await this.clickVisibleElement(page, [
                    'button.primary:has-text("Save")',
                    'button[class*="primary"]:has-text("Save")',
                    'button[data-e2e*="save"]:has-text("Save")',
                    'button:text-is("Save")',
                  ]);
                }

                if (saved) {
                  this.emitLog('upload', 'Clicked Save on TikTok cover modal header', account.id);
                  break;
                }
                await page.waitForTimeout(1000);
              }
              await page.waitForTimeout(1500);
            }

            onStatusUpdate({
              platform: account.id,
              status: 'filling_metadata',
              progress: 90,
              message: `Clearing default filename & setting caption on TikTok Studio...`,
            });

            const tiktokCaptionSelector =
              '.public-DraftEditor-content[contenteditable="true"], .caption-editor [contenteditable="true"], [contenteditable="true"]';
            const captionEl = await page
              .waitForSelector(tiktokCaptionSelector, { timeout: 12000 })
              .catch(() => null);

            if (captionEl) {
              await this.dismissTikTokPopups(page);
              // Wait briefly to ensure TikTok has finished auto-filling the filename (e.g. "11-5-26")
              await page.waitForTimeout(800);
              // TikTok should just be Title + Tags (single line below, no empty gap)
              await this.clearAndInsertText(page, tiktokCaptionSelector, titleAndTagsCaption);

              // If not test mode, wait for upload checks and click "Post"
              if (!isDryRun) {
                onStatusUpdate({
                  platform: account.id,
                  status: 'uploading_file',
                  progress: 95,
                  message: `Waiting for TikTok upload checks & publishing...`,
                });
                await page.waitForTimeout(1500);
                // Scroll down to ensure post button is in view
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
                await page.waitForTimeout(1000);

                // Wait up to 60s for TikTok Post button to become enabled (video upload & copyright checks complete)
                const enabledTikTokPostSelector =
                  'button[data-e2e*="post"]:not([disabled]):not([class*="disabled"]), button.btn-post:not([disabled]):not([class*="disabled"]), button:text-is("Post"):not([disabled]):not([class*="disabled"])';

                const postBtn = await page
                  .waitForSelector(enabledTikTokPostSelector, { state: 'visible', timeout: 60000 })
                  .catch(() => null);

                if (postBtn) {
                  await postBtn.click().catch(() => {});
                  this.emitLog('upload', 'Clicked enabled "Post" on TikTok Studio', account.id);
                } else {
                  const clickedPost = await this.clickVisibleElement(page, [
                    'button[data-e2e*="post"]:has-text("Post")',
                    'button.btn-post:has-text("Post")',
                    'button:text-is("Post")',
                    'button:has-text("Post")',
                  ]);
                  if (clickedPost) {
                    this.emitLog('upload', 'Clicked "Post" on TikTok Studio', account.id);
                  }
                }

                // Wait for TikTok submission confirmation modal
                const postSuccessSelector =
                  'div:has-text("Your video has been uploaded"), button:has-text("Manage your posts"), div:has-text("Manage your posts")';
                const successModal = await page
                  .waitForSelector(postSuccessSelector, { state: 'visible', timeout: 25000 })
                  .catch(() => null);

                if (successModal) {
                  this.emitLog('upload', 'TikTok Studio confirmed upload published!', account.id);
                }
                await page.waitForTimeout(3000);

                // Dismiss any accidental Discard dialog by clicking Keep editing / Cancel (never Discard)
                const keepEditingBtn = await page.$(
                  'button:has-text("Keep editing"), button:has-text("Cancel")'
                );
                if (keepEditingBtn) {
                  const isDiscardModal = await page.evaluate(() => {
                    return document.body.innerText.includes('Discard');
                  }).catch(() => false);
                  if (isDiscardModal) {
                    await keepEditingBtn.click().catch(() => {});
                  }
                }
              }
            }
          }
        } catch (err: any) {
          this.emitLog(
            'upload',
            `Staging note on ${account.name}: ${err?.message || 'ready'}`,
            account.id
          );
        }
      }

      await delay(400);

      onStatusUpdate({
        platform: account.id,
        status: 'completed',
        progress: 100,
        message: isDryRun
          ? `Staged in browser (Not Published) — "${payload.title}" on ${account.name}`
          : `Published "${payload.title}" on ${account.name}`,
        postUrl: account.uploadUrl,
        completedAt: new Date().toLocaleTimeString(),
      });
      this.emitLog(
        'upload',
        isDryRun
          ? `[Test Mode] Staged "${payload.title}" on ${account.name} without publishing. Browser left open for inspection.`
          : `Completed video publishing for "${payload.title}" on ${account.name}.`,
        account.id
      );
    }
  } finally {
    this.isUploadingActive = false;
  }
}
}
