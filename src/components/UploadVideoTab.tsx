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
  const [videoFile, setVideoFile] = useState<{
    videoPath: string;
    videoFileName: string;
    videoSizeBytes: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!videoFile || !title.trim() || selectedPlatforms.length === 0) return;
    await onStartUpload({
      videoPath: videoFile.videoPath,
      videoFileName: videoFile.videoFileName,
      videoSizeBytes: videoFile.videoSizeBytes,
      title: title.trim(),
      description: description.trim(),
      tags: tags.trim(),
      platforms: selectedPlatforms,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 pb-8">
      {/* Left Column: Upload Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Single-Video Multi-Platform Publisher
              </h2>
              <p className="text-xs text-slate-400">
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

        {/* Video Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={handleBrowseFile}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
            videoFile
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-slate-700 bg-slate-950/60 hover:border-indigo-500/60 hover:bg-slate-950'
          }`}
        >
          {videoFile ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Film className="h-6 w-6" />
              </div>
              <div className="text-sm font-bold text-white">
                {videoFile.videoFileName}
              </div>
              <div className="text-xs text-slate-400">
                {(videoFile.videoSizeBytes / (1024 * 1024)).toFixed(2)} MB •{' '}
                <span className="text-indigo-400 underline">Click to choose a different video</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold text-white">
                Drop your video file here or click to select (.MP4, .MOV, .WEBM)
              </div>
              <p className="text-xs text-slate-400">
                One video file will be formatted & uploaded to Twitter/X, LinkedIn, YouTube, Instagram, and TikTok
              </p>
            </div>
          )}
        </div>

        {/* Title & Description Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Video Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Video Description & Caption *
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description and caption to replicate across all linked platforms..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Tags / Hashtags (Optional)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. #video #launch"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-indigo-300 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Target Linked Platforms with Icons */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Replicate Across Linked Platforms ({selectedPlatforms.length} selected)
            </label>
            <button
              type="button"
              onClick={() => setSelectedPlatforms(linkedIds)}
              className="text-xs text-indigo-400 hover:text-indigo-300"
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
                      ? 'border-slate-800 bg-slate-950/40 opacity-40 cursor-not-allowed'
                      : isSelected
                      ? `${meta.bgClass} ${meta.borderClass} ${meta.textClass} shadow-md`
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <PlatformIcon platform={acc.id} size={22} />
                  <div className="text-xs font-bold text-white">{acc.name}</div>
                  <span className="text-[10px] text-slate-400">
                    {acc.linked ? (isSelected ? 'Will Replicate' : 'Skipped') : 'Not Linked'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={isUploading || !videoFile || !title.trim() || selectedPlatforms.length === 0}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Replicating Video Across {selectedPlatforms.length} Platforms via Local LLM...</span>
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3 mb-4">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">
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
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
                      >
                        <PlatformIcon platform={acc.id} size={16} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white">{acc.name}</div>
                        <div className="text-[11px] text-slate-400">
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Published
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-indigo-400">
                          {progress}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Replicated Uploads */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
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
                  className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white">{job.title}</div>
                    <span className="text-[11px] text-slate-500">{job.createdAt}</span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">{job.description}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {(Object.keys(job.results) as PlatformId[]).map((pid) => (
                      <span
                        key={pid}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${PLATFORM_META[pid].bgClass} ${PLATFORM_META[pid].borderClass} ${PLATFORM_META[pid].textClass}`}
                      >
                        <PlatformIcon platform={pid} size={11} />
                        <span>{PLATFORM_META[pid].name}</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
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
