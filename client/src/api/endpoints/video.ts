import { CONFIG } from "../../config";
import { apiFetch, mockLatency, ApiError } from "../client";

export interface PlaybackConfig {
  playback: {
    type: "hls" | "iframe" | "video";
    url: string;
    expiresAt: string;
  };
  watermark: {
    name: string;
    email: string;
    timestamp: string;
  };
  resumeAtSeconds: number;
  sessionKey: string;
}

export const videoApi = {
  async getLecturePlayback(lectureId: number): Promise<PlaybackConfig> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);

      // Check user mock auth session
      const userJson = localStorage.getItem("sams_mock_auth_user");
      const currentUser = userJson ? JSON.parse(userJson) : { name: "Dr. Hamza Malik", email: "student@samsacademy.com" };

      // Read stored resume time if available
      const savedResume = localStorage.getItem(`sams_lecture_resume_${lectureId}`);
      const initialResumeSecs = savedResume ? Number(savedResume) : 15;

      // Public test HLS stream
      const sampleHlsUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

      return {
        playback: {
          type: "hls",
          url: sampleHlsUrl,
          expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
        },
        watermark: {
          name: currentUser.name || "Dr. Hamza Malik",
          email: currentUser.email || "student@samsacademy.com",
          timestamp: new Date().toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        resumeAtSeconds: initialResumeSecs,
        sessionKey: `sess_${Math.random().toString(36).substring(2, 10)}`,
      };
    }
    return apiFetch<PlaybackConfig>(`/student/lectures/${lectureId}/play`);
  },

  async sendPlaybackHeartbeat(lectureId: number, sessionKey: string, positionSeconds: number, deltaSeconds: number) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 150);
      return { status: "ok" };
    }
    return apiFetch<{ status: string }>(`/student/lectures/${lectureId}/heartbeat`, {
      method: "PUT",
      body: JSON.stringify({ sessionKey, positionSeconds, deltaSeconds }),
    });
  },

  async markLectureComplete(lectureId: number) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return { isCompleted: true, completedAt: new Date().toISOString() };
    }
    return apiFetch<{ isCompleted: boolean; completedAt: string }>(`/student/lectures/${lectureId}/complete`, {
      method: "POST",
    });
  },
};
