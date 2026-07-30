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
  Sparkles,
  CheckCircle2,
  Lock,
  Clock,
  Gauge,
} from "lucide-react";
import { Button, Badge } from "../ui";
import { videoApi, PlaybackConfig } from "../../api/endpoints/video";

interface SecurePlayerProps {
  lectureId: number;
  lectureTitle?: string;
  onComplete?: () => void;
  onEnded?: () => void;
}

export const SecurePlayer: React.FC<SecurePlayerProps> = ({
  lectureId,
  lectureTitle,
  onComplete,
  onEnded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Loading & Playback Config State
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

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
  const [liveTimestamp, setLiveTimestamp] = useState(new Date().toLocaleTimeString());

  // Load Playback Token & Video Source
  const loadPlayback = async () => {
    setIsLoading(true);
    setErrorMsg("");
    setIsTakenOver(false);
    try {
      const config = await videoApi.getLecturePlayback(lectureId);
      setPlaybackConfig(config);

      // Check if this lecture was already completed locally
      const isDone = localStorage.getItem(`sams_lecture_completed_${lectureId}`) === "true";
      setHasCompleted90(isDone);

      const streamUrl = config.playback.url;
      const startAt = config.resumeAtSeconds || 0;

      if (videoRef.current) {
        if (Hls.isSupported() && streamUrl.endsWith(".m3u8")) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoRef.current && startAt > 0) {
              videoRef.current.currentTime = startAt;
            }
          });
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          videoRef.current.src = streamUrl;
          if (startAt > 0) {
            videoRef.current.currentTime = startAt;
          }
        } else {
          // Fallback direct video src (e.g. mp4 or standard HLS proxy)
          videoRef.current.src = streamUrl;
          if (startAt > 0) {
            videoRef.current.currentTime = startAt;
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load secure video playback token.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPlayback();

    const handleDevTakeover = () => {
      triggerTakeover();
    };

    window.addEventListener("sams_dev_stream_takeover", handleDevTakeover);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      window.removeEventListener("sams_dev_stream_takeover", handleDevTakeover);
    };
  }, [lectureId]);

  // Periodic Watermark Repositioning (Every 20 seconds) & Live Clock
  useEffect(() => {
    const wmInterval = setInterval(() => {
      // Reposition to a random quadrant / corner
      const topPct = Math.floor(Math.random() * 65 + 10) + "%";
      const leftPct = Math.floor(Math.random() * 60 + 10) + "%";
      setWatermarkPos({ top: topPct, left: leftPct });
      setLiveTimestamp(new Date().toLocaleTimeString());
    }, 20000);

    return () => clearInterval(wmInterval);
  }, []);

  // 15-second Heartbeat & Resume Position Saver
  useEffect(() => {
    if (!isPlaying || isTakenOver || !playbackConfig) return;

    const hbInterval = setInterval(() => {
      if (videoRef.current) {
        const curSec = Math.floor(videoRef.current.currentTime);
        // Persist local resume
        localStorage.setItem(`sams_lecture_resume_${lectureId}`, curSec.toString());

        // Call heartbeat API
        videoApi
          .sendPlaybackHeartbeat(lectureId, playbackConfig.sessionKey, curSec, 15)
          .catch((err: any) => {
            if (err.status === 409 || err.code === "STREAM_TAKEN_OVER") {
              triggerTakeover();
            }
          });
      }
    }, 15000);

    return () => clearInterval(hbInterval);
  }, [isPlaying, isTakenOver, playbackConfig, lectureId]);

  // Handle Video Time Update & >=90% Completion Threshold
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Calculate buffered range
    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    // Check 90% completion
    if (dur > 0 && cur / dur >= 0.9 && !hasCompleted90) {
      setHasCompleted90(true);
      localStorage.setItem(`sams_lecture_completed_${lectureId}`, "true");
      videoApi.markLectureComplete(lectureId).catch(console.error);
      if (onComplete) onComplete();
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (onEnded) onEnded();
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

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const userWatermarkName = playbackConfig?.watermark.name || "Dr. Hamza Malik";
  const userWatermarkEmail = playbackConfig?.watermark.email || "student@samsacademy.com";

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
        {/* Video Canvas Element */}
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onContextMenu={(e) => e.preventDefault()}
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          playsInline
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
        />

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white space-y-3">
            <RefreshCw className="w-8 h-8 text-[#0FA3A3] animate-spin" />
            <p className="text-xs font-semibold text-slate-300">Decrypting HLS stream token...</p>
          </div>
        )}

        {/* Dynamic Anti-Piracy Watermark Overlay (Survives Fullscreen) */}
        {!isLoading && !isTakenOver && (
          <div
            className="absolute pointer-events-none select-none z-30 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-xs text-[#0FA3A3] text-[10px] sm:text-xs font-mono font-bold tracking-wider opacity-65 border border-[#0FA3A3]/40 shadow-lg transition-all duration-1000"
            style={{ top: watermarkPos.top, left: watermarkPos.left }}
          >
            <div>{userWatermarkName}</div>
            <div>{userWatermarkEmail}</div>
            <div className="text-[9px] text-slate-400 font-normal">{liveTimestamp} • VERIFIED SAMS DEVICE</div>
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

        {/* Custom Video Controls Bar */}
        {!isLoading && !isTakenOver && (
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
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                {/* -10s / +10s Skip Buttons */}
                <button
                  type="button"
                  onClick={() => skipSeconds(-10)}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center gap-0.5"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 10s
                </button>

                <button
                  type="button"
                  onClick={() => skipSeconds(10)}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center gap-0.5"
                  title="Forward 10s"
                >
                  <RotateCw className="w-3.5 h-3.5" /> 10s
                </button>

                {/* Volume Control */}
                <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700">
                  <button type="button" onClick={toggleMute} className="text-slate-300 hover:text-white">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 accent-[#0FA3A3] cursor-pointer"
                  />
                </div>

                {/* Time Display */}
                <span className="text-[11px] font-mono text-slate-300 ml-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
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
