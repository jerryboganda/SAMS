import { CONFIG } from "../../config";
import { apiFetch, mockLatency } from "../client";
import { Announcement, NotificationItem } from "../../types";
import { MOCK_ANNOUNCEMENTS, MOCK_NOTIFICATIONS } from "../../mock-data";

export const notificationsApi = {
  async getNotifications(): Promise<NotificationItem[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_NOTIFICATIONS;
    }
    return apiFetch<NotificationItem[]>("/notifications");
  },

  async markAsRead(ids?: number[], all?: boolean) {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 150);
      return { success: true };
    }
    return apiFetch<{ success: boolean }>("/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids, all }),
    });
  },

  async getAnnouncements(): Promise<Announcement[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_ANNOUNCEMENTS;
    }
    return apiFetch<Announcement[]>("/announcements");
  },
};
