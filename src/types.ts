export type PlatformId = 'twitter' | 'linkedin' | 'youtube' | 'instagram' | 'tiktok';

export interface PlatformAccount {
  id: PlatformId;
  name: string;
  handle: string;
  profileUrl: string;
  uploadUrl: string;
  analyticsUrl: string;
  linked: boolean;
  lastSyncedAt: string | null;
  sessionStatus: 'connected' | 'disconnected' | 'syncing' | 'uploading';
}

export interface PlatformStats {
  platform: PlatformId;
  likes: number;
  comments: number;
  views: number;
  followers: number;
  engagementRate: number;
  updatedAt: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  elapsedSeconds: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
  twitterViews: number;
  linkedinViews: number;
  youtubeViews: number;
  instagramViews: number;
  tiktokViews: number;
  twitterLikes: number;
  linkedinLikes: number;
  youtubeLikes: number;
  instagramLikes: number;
  tiktokLikes: number;
  twitterComments: number;
  linkedinComments: number;
  youtubeComments: number;
  instagramComments: number;
  tiktokComments: number;
}

export interface BrowserAgentLog {
  id: string;
  timestamp: string;
  platform?: PlatformId;
  stage: 'browser' | 'llm' | 'stats' | 'upload' | 'error';
  message: string;
}

export interface VideoUploadPayload {
  videoPath: string;
  videoFileName: string;
  videoSizeBytes: number;
  thumbnailPath?: string;
  thumbnailFileName?: string;
  title: string;
  description: string;
  tags: string;
  platforms: PlatformId[];
  dryRun?: boolean;
}

export interface PlatformUploadStatus {
  platform: PlatformId;
  status: 'queued' | 'opening_browser' | 'llm_navigating' | 'uploading_file' | 'filling_metadata' | 'completed' | 'failed';
  progress: number;
  message: string;
  postUrl?: string;
  completedAt?: string;
}

export interface UploadJob {
  jobId: string;
  title: string;
  description: string;
  videoFileName: string;
  createdAt: string;
  results: Record<PlatformId, PlatformUploadStatus>;
}

export interface LlmConfig {
  ollamaEndpoint: string;
  model: string;
  headless: boolean;
  livePollingIntervalSec: number;
}
