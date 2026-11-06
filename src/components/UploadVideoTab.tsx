import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Film,
  CheckCircle2,
  Loader2,
  Sparkles,
  Share2,
  FolderOpen,
  ExternalLink,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import {
  PlatformAccount,
  PlatformId,
  PlatformUploadStatus,
  UploadJob,
  VideoUploadPayload,
} from '../types';
import { PlatformIcon, PLATFORM_META } from './PlatformIcons';

interface UploadVideoTabProps {
  accounts: PlatformAccount[];
  onStartUpload: (payload: VideoUploadPayload) => Promise<void>;
  activeStatuses: Record<PlatformId, PlatformUploadStatus>;
  uploadHistory: UploadJob[];
  isUploading: boolean;
}

export const UploadVideoTab: React.FC<UploadVideoTabProps> = ({
  accounts,
  onStartUpload,
  activeStatuses,
  uploadHistory,
  isUploading,
}) => {
  const linkedIds = accounts.filter((a) => a.linked).map((a) => a.id);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(linkedIds);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [videoFile, setVideoFile] = useState<{
    videoPath: string;
    videoFileName: string;
    videoSizeBytes: number;
  } | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<{
    thumbnailPath: string;
    thumbnailFileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const thumbInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedPlatforms((prev) => {
      const valid = prev.filter((id) => linkedIds.includes(id));
      return valid.length > 0 ? valid : linkedIds;
    });
  }, [accounts]);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleBrowseThumbnail = async () => {
    if (window.myManagerApi?.selectThumbnailFile) {
      const picked = await window.myManagerApi.selectThumbnailFile();
      if (picked) {
        setThumbnailFile(picked);
      }
      return;
    }
    thumbInputRef.current?.click();
  };

  const handleThumbInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile({
      thumbnailPath: (file as any).path || file.name,
      thumbnailFileName: file.name,
    });
  };

  const handleBrowseFile = async () => {
    if (window.myManagerApi?.selectVideoFile) {
      const picked = await window.myManagerApi.selectVideoFile();
      if (picked) {
        setVideoFile(picked);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile({
      videoPath: (file as any).path || file.name,
      videoFileName: file.name,
      videoSizeBytes: file.size,
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setVideoFile({
        videoPath: (file as any).path || file.name,
        videoFileName: file.name,
        videoSizeBytes: file.size,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) return;
    if (!dryRun && (!videoFile || !title.trim())) return;

    const effectiveTitle = title.trim() || 'Test Multi-Platform Video Upload';
    const effectiveDescription =
      description.trim() || 'Testing multi-platform video staging without publishing.';
    const effectiveTags = tags.trim() || '#test #creator';

    if (!title.trim()) setTitle(effectiveTitle);
    if (!description.trim()) setDescription(effectiveDescription);
    if (!tags.trim()) setTags(effectiveTags);

    await onStartUpload({
      videoPath: videoFile?.videoPath || '',
      videoFileName: videoFile?.videoFileName || 'test-draft-preview.mp4',
      videoSizeBytes: videoFile?.videoSizeBytes || 0,
      thumbnailPath: thumbnailFile?.thumbnailPath || '',
      thumbnailFileName: thumbnailFile?.thumbnailFileName || '',
      title: effectiveTitle,
      description: effectiveDescription,
      tags: effectiveTags,
      platforms: selectedPlatforms,
      dryRun,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 pb-8">
      {/* Left Column: Upload Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Single-Video Multi-Platform Publisher
              </h2>
              <p className="text-xs text-slate-500">
                Upload once with a title & description — automatically replicated across all linked platforms
              </p>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv,.avi"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <input
          ref={thumbInputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp"
          onChange={handleThumbInputChange}
          className="hidden"
        />

        {/* Video Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={handleBrowseFile}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
            videoFile
              ? 'border-slate-400 bg-slate-50'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          {videoFile ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Film className="h-5 w-5" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {videoFile.videoFileName}
              </div>
              <div className="text-xs text-slate-500">
                {(videoFile.videoSizeBytes / (1024 * 1024)).toFixed(2)} MB •{' '}
                <span className="text-slate-900 font-medium underline">
                  Click to choose a different video
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                Drop your video file here or click to select (.MP4, .MOV, .WEBM)
              </div>
              <p className="text-xs text-slate-500">
                One video file will be formatted & uploaded to Twitter/X, LinkedIn, YouTube, Instagram, and TikTok
              </p>
            </div>
          )}
        </div>

        {/* Optional Thumbnail Dropzone / Selector */}
        <div
          onClick={handleBrowseThumbnail}
          className={`cursor-pointer rounded-xl border border-dashed p-3.5 text-center transition ${
            thumbnailFile
              ? 'border-slate-400 bg-slate-50'
              : 'border-slate-300 bg-slate-50/40 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          {thumbnailFile ? (
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">
                    Thumbnail: {thumbnailFile.thumbnailFileName}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Will be uploaded to YouTube, LinkedIn, Instagram & TikTok
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-900 underline">Change</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
              <ImageIcon className="h-4 w-4 text-slate-500" />
              <span>
                (Optional) Click to select a <strong className="text-slate-900">Thumbnail / Cover Image</strong> (.jpg, .png)
              </span>
            </div>
          )}
        </div>

        {/* Title & Description Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Video Title *
            </label>
            <input
              type="text"
              required={!dryRun}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Video Description & Caption *
            </label>
            <textarea
              rows={4}
              required={!dryRun}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description and caption to replicate across all linked platforms..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Tags / Hashtags (Optional)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. #video #launch"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Target Linked Platforms with Icons */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Replicate Across Linked Platforms ({selectedPlatforms.length} selected)
            </label>
            <button
              type="button"
              onClick={() => setSelectedPlatforms(linkedIds)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
            >
              Select All Linked
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
            {accounts.map((acc) => {
              const meta = PLATFORM_META[acc.id];
              const isSelected = selectedPlatforms.includes(acc.id);
              return (
                <button
                  key={acc.id}
                  type="button"
                  disabled={!acc.linked}
                  onClick={() => togglePlatform(acc.id)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition ${
                    !acc.linked
                      ? 'border-slate-200 bg-slate-50 opacity-45 cursor-not-allowed'
                      : isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <PlatformIcon
                    platform={acc.id}
                    size={20}
                    className={isSelected ? 'text-white' : meta.textClass}
                  />
                  <div
                    className={`text-xs font-semibold ${
                      isSelected ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {acc.name}
                  </div>
                  <span
                    className={`text-[10px] ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {acc.linked ? (isSelected ? 'Will Replicate' : 'Skipped') : 'Not Linked'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Test / Dry-Run Mode Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-slate-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Test Mode (Open Visible Browser & Stage Drafts — Do Not Publish)
              </div>
              <div className="text-[11px] text-slate-500">
                Opens each selected platform's upload studio in a visible browser window, attaches your video & fills Title/Caption, and stops before clicking Publish/Post.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDryRun((v) => !v)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition border ${
              dryRun
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {dryRun ? 'Test Mode: ON' : 'Test Mode: OFF'}
          </button>
        </div>

        <button
          type="submit"
          disabled={
            isUploading ||
            selectedPlatforms.length === 0 ||
            (!dryRun && (!videoFile || !title.trim()))
          }
          className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>
                {dryRun
                  ? `Opening Visible Browser & Staging Across ${selectedPlatforms.length} Platforms...`
                  : `Uploading Video Across ${selectedPlatforms.length} Platforms...`}
              </span>
            </>
          ) : dryRun ? (
            <>
              <Eye className="h-5 w-5" />
              <span>
                Test Upload in Visible Browser ({selectedPlatforms.length} Platform
                {selectedPlatforms.length === 1 ? '' : 's'} — No Publish)
              </span>
            </>
          ) : (
            <>
              <Share2 className="h-5 w-5" />
              <span>
                Upload & Replicate Video to {selectedPlatforms.length} Linked Platform
                {selectedPlatforms.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </button>
      </form>

      {/* Right Column: Live Replication Progress & History */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
            <Sparkles className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Live Multi-Platform Replication Pipeline
            </h3>
          </div>

          <div className="space-y-3">
            {accounts.map((acc) => {
              const st = activeStatuses[acc.id];
              const meta = PLATFORM_META[acc.id];
              const progress = st?.progress || 0;
              return (
                <div
                  key={acc.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white ${meta.textClass}`}
                      >
                        <PlatformIcon platform={acc.id} size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{acc.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {st?.status && st.status !== 'queued'
                            ? st.message
                            : acc.linked
                            ? 'Ready for replication'
                            : 'Account unlinked'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {st?.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Published
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {progress}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Replicated Uploads */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Recent Cross-Platform Video Broadcasts
          </h3>
          {uploadHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No videos replicated in this session yet. Select a video above and click Upload & Replicate!
            </p>
          ) : (
            <div className="space-y-3">
              {uploadHistory.map((job) => (
                <div
                  key={job.jobId}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-slate-900">{job.title}</div>
                    <span className="text-[11px] text-slate-500">{job.createdAt}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{job.description}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {(Object.keys(job.results) as PlatformId[]).map((pid) => (
                      <span
                        key={pid}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        <PlatformIcon
                          platform={pid}
                          size={11}
                          className={PLATFORM_META[pid].textClass}
                        />
                        <span>{PLATFORM_META[pid].name}</span>
                        <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
