import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Clock,
  Gauge,
} from "lucide-react";
import { Button, Badge } from "../ui";
import { videoApi, PlaybackConfig } from "../../api/endpoints/video";
import { useAuth } from "../../stores/authStore";
import {
  computeNextHeartbeatDelayMs,
  computeMsUntilTokenRefresh,
  computeWatermarkPosition,
  formatPlayerTime,
  formatWatermarkTimestamp,
  inferAlreadyCompletedFromResume,
  shouldShowResumeNotice,
  shouldTriggerTakeover,
  RESUME_NOTICE_VISIBLE_MS,
  TOKEN_REFRESH_RETRY_DELAY_MS,
  WATERMARK_REPOSITION_INTERVAL_MS,
} from "./playerLogic";

interface SecurePlayerProps {
  lectureId: number;
  lectureTitle?: string;
  /**
   * The lecture's known duration (from the real curriculum data the caller
   * already has — e.g. CoursePlayerPage's fetched `CourseSection[]`), used
   * only to infer "already completed in a prior session" from `/play`'s
   * `resumeAtSeconds` — see `inferAlreadyCompletedFromResume` in
   * playerLogic.ts. Optional: when omitted, that inference is simply
   * skipped (no crash, just a slightly less informed completion badge).
   */
  lectureDurationSeconds?: number;
  onComplete?: () => void;
  onEnded?: () => void;
}

export const SecurePlayer: React.FC<SecurePlayerProps> = ({
  lectureId,
  lectureTitle,
  lectureDurationSeconds,
  onComplete,
  onEnded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const resumeAppliedRef = useRef(false);
  const refreshRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Guards against a stale `loadPlayback()` call applying its results after a
   * newer one has already started — e.g. React StrictMode's dev-only
   * mount→cleanup→mount double-invoke (which calls this effect, and thus
   * `loadPlayback()`, twice in a row), or a real user flipping between
   * lectures quickly enough that a previous lecture's in-flight `/play` call
   * resolves after the next one's. Without this, the older call's
   * `videoRef.current.src = ...` assignment can run *after* the newer one's,
   * silently resetting playback the viewer just started. Each call captures
   * its own generation at start and checks it's still current before
   * touching any state or the `<video>` element.
   */
  const loadGenerationRef = useRef(0);

  // A real, authenticated session is required for heartbeat/complete calls
  // to succeed at all (server/src/routes/v1/student/lectures.js gates both
  // behind `auth -> deviceCheck -> requireRole('student')`) — an anonymous
  // free-preview viewer (client/src/pages/public/CourseDetailPage.tsx's
  // preview modal) must never attempt either, per docs/07_EXECUTION_PLAN.md
  // 5.5's explicit "heartbeat/bookmarks won't work anonymously... should
  // just not attempt to fire" requirement.
  const { isAuthenticated } = useAuth();

  // Loading & Playback Config State
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorCode, setErrorCode] = useState("");

  // Video State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Security & Takeover States
  const [isTakenOver, setIsTakenOver] = useState(false);
  const [hasCompleted90, setHasCompleted90] = useState(false);

  // Watermark positioning
  const [watermarkPos, setWatermarkPos] = useState({ top: "15%", left: "20%" });

  // Resume UX
  const [resumeNoticeSeconds, setResumeNoticeSeconds] = useState<number | null>(null);

  const playbackType = playbackConfig?.playback.type;
  const isIframeMode = playbackType === "iframe";

  // Load Playback Token & Video Source
  const loadPlayback = async () => {
    const myGeneration = ++loadGenerationRef.current;

    setIsLoading(true);
    setErrorMsg("");
    setErrorCode("");
    setIsTakenOver(false);
    setHasCompleted90(false);
    resumeAppliedRef.current = false;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    try {
      const config = await videoApi.getLecturePlayback(lectureId);
      if (loadGenerationRef.current !== myGeneration) return; // superseded — see loadGenerationRef's doc comment

      setPlaybackConfig(config);

      const startAt = config.resumeAtSeconds || 0;

      if (inferAlreadyCompletedFromResume(startAt, lectureDurationSeconds)) {
        setHasCompleted90(true);
        onComplete?.();
      }

      const type = config.playback.type;
      const streamUrl = config.playback.url;

      if (type === "iframe") {
        // Rendered as an <iframe> below — no <video>/hls.js wiring needed.
        // See the header comment on isIframeMode-gated logic throughout
        // this component for the documented limitations of this path.
      } else if (videoRef.current) {
        if (type === "hls" && Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            applyResumePosition(startAt);
          });
        } else {
          // Native <video> src — covers the mock driver's `type:'video'`
          // (plain mp4, server/src/adapters/video/mock.js) AND the 'hls'
          // fallback for browsers with native HLS support (Safari) and no
          // hls.js support.
          videoRef.current.src = streamUrl;
        }
      }
    } catch (err: any) {
      if (loadGenerationRef.current !== myGeneration) return;
      setErrorMsg(err.message || "Failed to load secure video playback token.");
      setErrorCode(err.code || "");
    } finally {
      if (loadGenerationRef.current === myGeneration) {
        setIsLoading(false);
      }
    }
  };

  /** Seeks to `startAt` exactly once per load (guarded by resumeAppliedRef so a
   * later metadata/manifest event, or a token refresh, never re-seeks over a
   * viewer's own scrubbing) and surfaces the "Resuming from X:XX" indicator. */
  const applyResumePosition = (startAt: number) => {
    if (resumeAppliedRef.current) return;
    resumeAppliedRef.current = true;
    if (startAt > 0 && videoRef.current) {
      videoRef.current.currentTime = startAt;
    }
    if (shouldShowResumeNotice(startAt)) {
      setResumeNoticeSeconds(startAt);
      if (resumeNoticeTimeoutRef.current) clearTimeout(resumeNoticeTimeoutRef.current);
      resumeNoticeTimeoutRef.current = setTimeout(() => setResumeNoticeSeconds(null), RESUME_NOTICE_VISIBLE_MS);
    }
  };

  /**
   * Re-calls `/play` for a fresh signed URL shortly before `expiresAt`
   * (docs/07_EXECUTION_PLAN.md 5.4 point 5) and hot-swaps the media source
   * in place, preserving position/play-state — a full `loadPlayback()`
   * would tear down and restart the player, which is a much worse UX for
   * something that should be invisible to the viewer.
   */
  const refreshPlaybackToken = async () => {
    try {
      const fresh = await videoApi.getLecturePlayback(lectureId);
      const wasPlaying = videoRef.current ? !videoRef.current.paused : false;
      const resumeTime = videoRef.current?.currentTime || 0;

      if (fresh.playback.type === "hls" && hlsRef.current) {
        hlsRef.current.loadSource(fresh.playback.url);
        hlsRef.current.once(Hls.Events.MANIFEST_PARSED, () => {
          if (videoRef.current) {
            videoRef.current.currentTime = resumeTime;
            if (wasPlaying) videoRef.current.play().catch(() => {});
          }
        });
      } else if (fresh.playback.type !== "iframe" && videoRef.current) {
        const el = videoRef.current;
        const onLoaded = () => {
          el.currentTime = resumeTime;
          if (wasPlaying) el.play().catch(() => {});
          el.removeEventListener("loadedmetadata", onLoaded);
        };
        el.addEventListener("loadedmetadata", onLoaded);
        el.src = fresh.playback.url;
      }
      // iframe: no in-place hot-swap is possible without Bunny's player
      // postMessage API (out of scope) — updating playbackConfig below
      // re-renders the <iframe src>, which reloads the embed from the
      // start. A documented limitation, not a silent bug.

      setPlaybackConfig(fresh);
    } catch (err) {
      console.error("[SecurePlayer] Token refresh failed, will retry:", err);
      refreshRetryTimeoutRef.current = setTimeout(refreshPlaybackToken, TOKEN_REFRESH_RETRY_DELAY_MS);
    }
  };

  useEffect(() => {
    loadPlayback();

    const handleDevTakeover = () => triggerTakeover();
    window.addEventListener("sams_dev_stream_takeover", handleDevTakeover);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (refreshRetryTimeoutRef.current) clearTimeout(refreshRetryTimeoutRef.current);
      if (resumeNoticeTimeoutRef.current) clearTimeout(resumeNoticeTimeoutRef.current);
      window.removeEventListener("sams_dev_stream_takeover", handleDevTakeover);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  // Periodic Watermark Repositioning — purely cosmetic/anti-piracy, no
  // network involved. Position math lives in playerLogic.ts (unit-tested).
  useEffect(() => {
    const wmInterval = setInterval(() => {
      setWatermarkPos(computeWatermarkPosition());
    }, WATERMARK_REPOSITION_INTERVAL_MS);
    return () => clearInterval(wmInterval);
  }, []);

  // Token refresh scheduling: re-arms whenever a fresh `expiresAt` comes in
  // (initial load AND every subsequent refresh), so the cycle repeats for
  // as long as the lecture stays open. See computeMsUntilTokenRefresh.
  useEffect(() => {
    const expiresAt = playbackConfig?.playback.expiresAt;
    if (!expiresAt || isTakenOver) return;
    const delay = computeMsUntilTokenRefresh(expiresAt, Date.now());
    const timeoutId = setTimeout(refreshPlaybackToken, delay);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackConfig?.playback.expiresAt, isTakenOver]);

  // Heartbeat loop: real elapsed-time delta, exponential backoff on
  // transient failures, immediate stop + takeover UI on 409
  // STREAM_TAKEN_OVER. Never attempted for an anonymous (free-preview)
  // viewer. For `type:'iframe'` embeds there is no cross-origin play/pause
  // signal available without Bunny's player SDK, so heartbeats fire on a
  // fixed cadence once loaded (keeping the stream lock alive) rather than
  // being gated on a real `isPlaying` — a documented, narrower-than-ideal
  // compromise (see DECISIONS.md); position sent for that path is 0
  // (unknown), which only affects resume-position accuracy for iframe/Bunny
  // embeds, not the security-critical stream-lock/heartbeat mechanism.
  useEffect(() => {
    const activeEnough = isIframeMode ? !isLoading : isPlaying;
    if (!activeEnough || isTakenOver || !playbackConfig || !isAuthenticated) return;

    let cancelled = false;
    let consecutiveFailures = 0;
    let lastTickAt = Date.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      if (!isIframeMode && !videoRef.current) return;

      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.round((now - lastTickAt) / 1000));
      lastTickAt = now;
      const curSec = isIframeMode ? 0 : Math.floor(videoRef.current!.currentTime);

      try {
        await videoApi.sendPlaybackHeartbeat(lectureId, playbackConfig.sessionKey, curSec, elapsedSeconds);
        consecutiveFailures = 0;
      } catch (err: any) {
        if (shouldTriggerTakeover(err?.status, err?.code)) {
          triggerTakeover();
          return;
        }
        consecutiveFailures += 1;
        console.error("[SecurePlayer] Heartbeat failed, backing off:", err);
      }

      if (!cancelled) {
        timeoutId = setTimeout(tick, computeNextHeartbeatDelayMs(consecutiveFailures));
      }
    };

    timeoutId = setTimeout(tick, computeNextHeartbeatDelayMs(0));

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isPlaying, isTakenOver, playbackConfig, isAuthenticated, lectureId, isIframeMode, isLoading]);

  // Handle Video Time Update & >=90% Completion Threshold (client-side
  // pre-empt of the server's own 95% threshold in videoService.js — the
  // real POST /complete call below is what actually persists it).
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    if (dur > 0 && cur / dur >= 0.9 && !hasCompleted90) {
      setHasCompleted90(true);
      if (isAuthenticated) {
        videoApi.markLectureComplete(lectureId).catch((err) => {
          console.error("[SecurePlayer] markLectureComplete failed (non-fatal):", err);
        });
      }
      onComplete?.();
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onEnded?.();
  };

  // Playback Control Handlers
  const togglePlay = () => {
    if (!videoRef.current || isTakenOver) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const skipSeconds = (seconds: number) => {
    if (!videoRef.current) return;
    const nextTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  // Trigger 2nd Device Stream Takeover Modal
  const triggerTakeover = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setIsTakenOver(true);
  };

  const userWatermarkName = playbackConfig?.watermark.name || "SAMS Candidate";
  const userWatermarkEmail = playbackConfig?.watermark.email || "";
  const watermarkTimestampLabel = formatWatermarkTimestamp(playbackConfig?.watermark.timestamp);

  const errorTitle =
    errorCode === "NOT_ENROLLED"
      ? "Not Enrolled"
      : errorCode === "ENROLLMENT_EXPIRED"
      ? "Enrollment Expired"
      : errorCode === "UNAUTHENTICATED"
      ? "Sign-in Required"
      : "Playback Error";

  return (
    <div className="space-y-3">
      {/* Dev Security Simulation Bar */}
      <div className="flex items-center justify-between p-2.5 bg-slate-900 text-white rounded-xl text-xs border border-slate-800">
        <div className="flex items-center gap-2">
          <Badge variant="teal" size="sm">
            <Lock className="w-3 h-3 mr-1" /> SAMS DRM
          </Badge>
          <span className="text-slate-300 font-mono text-[11px] truncate">
            Session: {playbackConfig?.sessionKey || "active"}
          </span>
        </div>

        <button
          type="button"
          onClick={triggerTakeover}
          className="px-2.5 py-1 rounded-lg bg-rose-600/30 text-rose-300 hover:bg-rose-600/50 border border-rose-500/40 font-bold transition-all flex items-center gap-1.5"
          title="Simulate 409 STREAM_TAKEN_OVER response"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          Simulate 2nd Device Takeover
        </button>
      </div>

      {/* Main Player Container (Supports Fullscreen with Watermark Overlay) */}
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-video rounded-2xl bg-black overflow-hidden shadow-2xl group border border-slate-800 flex flex-col justify-between select-none"
      >
        {isIframeMode && playbackConfig ? (
          <iframe
            key={playbackConfig.playback.url}
            src={playbackConfig.playback.url}
            title={lectureTitle || "Secure lecture playback"}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            ref={videoRef}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={() => applyResumePosition(playbackConfig?.resumeAtSeconds || 0)}
            onContextMenu={(e) => e.preventDefault()}
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            playsInline
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
          />
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white space-y-3">
            <RefreshCw className="w-8 h-8 text-[#0FA3A3] animate-spin" />
            <p className="text-xs font-semibold text-slate-300">Decrypting secure stream token...</p>
          </div>
        )}

        {/* Load Error (NOT_ENROLLED / ENROLLMENT_EXPIRED / other) */}
        {!isLoading && errorMsg && (
          <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-950 text-amber-500 flex items-center justify-center border-2 border-amber-500/50">
              {errorCode === "NOT_ENROLLED" || errorCode === "ENROLLMENT_EXPIRED" ? (
                <Lock className="w-9 h-9" />
              ) : (
                <AlertTriangle className="w-9 h-9" />
              )}
            </div>
            <div className="space-y-2 max-w-md">
              {errorCode && (
                <Badge variant="danger" size="md">
                  {errorCode}
                </Badge>
              )}
              <h3 className="text-lg font-black text-white">{errorTitle}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{errorMsg}</p>
            </div>
            <Button variant="teal" size="md" onClick={loadPlayback} icon={<RefreshCw className="w-4 h-4" />}>
              Retry
            </Button>
          </div>
        )}

        {/* Dynamic Anti-Piracy Watermark Overlay (Survives Fullscreen) */}
        {!isLoading && !isTakenOver && !errorMsg && playbackConfig && (
          <div
            className="absolute pointer-events-none select-none z-30 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-xs text-[#0FA3A3] text-[10px] sm:text-xs font-mono font-bold tracking-wider opacity-65 border border-[#0FA3A3]/40 shadow-lg transition-all duration-1000"
            style={{ top: watermarkPos.top, left: watermarkPos.left }}
          >
            <div>{userWatermarkName}</div>
            {userWatermarkEmail && <div>{userWatermarkEmail}</div>}
            <div className="text-[9px] text-slate-400 font-normal">
              {watermarkTimestampLabel} • VERIFIED SAMS DEVICE
            </div>
          </div>
        )}

        {/* Resume Indicator */}
        {!isLoading && !isTakenOver && !errorMsg && resumeNoticeSeconds !== null && (
          <div className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-lg bg-slate-900/85 backdrop-blur-xs text-white text-[11px] font-semibold flex items-center gap-1.5 border border-slate-700 shadow-lg">
            <Clock className="w-3.5 h-3.5 text-[#0FA3A3]" />
            Resuming from {formatPlayerTime(resumeNoticeSeconds)}
          </div>
        )}

        {/* 409 STREAM_TAKEN_OVER Blocking Modal */}
        {isTakenOver && (
          <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-950 text-rose-500 flex items-center justify-center border-2 border-rose-500/50 animate-pulse">
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div className="space-y-2 max-w-md">
              <Badge variant="danger" size="md">
                STREAM_TAKEN_OVER (409)
              </Badge>
              <h3 className="text-lg font-black text-white">Playback Interrupted</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your SAMS candidate account started playback on another device. In compliance with medical candidate security policies, active streaming is restricted to one concurrent screen.
              </p>
            </div>

            <Button
              variant="teal"
              size="md"
              onClick={loadPlayback}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Re-claim Active Session
            </Button>
          </div>
        )}

        {/* Custom Video Controls Bar (hidden for iframe embeds — no access to the embedded player's state) */}
        {!isLoading && !isTakenOver && !errorMsg && !isIframeMode && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 space-y-2.5 transition-opacity opacity-100 group-hover:opacity-100 z-20">
            {/* Seek Bar + Buffered Range Indicator */}
            <div className="space-y-1">
              <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer">
                {/* Buffered Indicator */}
                <div
                  className="absolute top-0 bottom-0 bg-slate-600/60 rounded-full transition-all"
                  style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
                />
                {/* Played Range */}
                <div
                  className="absolute top-0 bottom-0 bg-[#0FA3A3] rounded-full transition-all"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>

              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek video position"
                className="w-full h-1.5 opacity-0 cursor-pointer absolute -mt-2"
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Play / Pause Button */}
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-[#0FA3A3] transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                {/* -10s / +10s Skip Buttons */}
                <button
                  type="button"
                  onClick={() => skipSeconds(-10)}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center gap-0.5"
                  title="Rewind 10s"
                  aria-label="Rewind 10 seconds"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 10s
                </button>

                <button
                  type="button"
                  onClick={() => skipSeconds(10)}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center gap-0.5"
                  title="Forward 10s"
                  aria-label="Forward 10 seconds"
                >
                  <RotateCw className="w-3.5 h-3.5" /> 10s
                </button>

                {/* Volume Control */}
                <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700">
                  <button type="button" onClick={toggleMute} className="text-slate-300 hover:text-white" aria-label={isMuted ? "Unmute" : "Mute"}>
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    aria-label="Volume"
                    className="w-16 h-1 accent-[#0FA3A3] cursor-pointer"
                  />
                </div>

                {/* Time Display */}
                <span className="text-[11px] font-mono text-slate-300 ml-1">
                  {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Completion Badge */}
                {hasCompleted90 && (
                  <Badge variant="emerald" size="sm" className="hidden md:flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Completed (≥90%)
                  </Badge>
                )}

                {/* Playback Speed Selector */}
                <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2 py-1 text-[11px]">
                  <Gauge className="w-3 h-3 text-[#0FA3A3]" />
                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => changeSpeed(rate)}
                      className={`px-1 py-0.5 rounded font-bold transition-colors ${
                        playbackRate === rate ? "bg-[#0FA3A3] text-[#0E2A47]" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white"
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
