import React, { useState, useEffect } from "react";
import { Bell, CheckCircle2, CheckCheck, Clock, BookOpen, AlertCircle, ShieldCheck } from "lucide-react";
import { Card, Badge, Button } from "../../components/ui";
import { notificationsApi } from "../../api/endpoints/notifications";
import { NotificationItem } from "../../types";

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadNotifications() {
      setIsLoading(true);
      try {
        const items = await notificationsApi.getNotifications();
        setNotifications(items);
      } catch (err) {
        console.error("Failed to load notifications", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadNotifications();
  }, []);

  // Dispatched after a successful mark-read call so StudentLayout.tsx's
  // persistent bell badge (which only loads once on mount — this page is a
  // separate route, not a remount) picks up the new unread count without
  // requiring a full page reload. Same custom-event pattern already used
  // for `start-student-guided-tour`.
  const notifyBadgeToRefresh = () => window.dispatchEvent(new CustomEvent("notifications-updated"));

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAsRead(undefined, true);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      notifyBadgeToRefresh();
    } catch (err) {
      console.error("Failed to mark notifications as read", err);
    }
  };

  const handleMarkSingleRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead([id]);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      notifyBadgeToRefresh();
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (isLoading) {
    return (
      <div className="py-20 text-center space-y-3 max-w-xl mx-auto">
        <div className="w-10 h-10 border-4 border-[#0FA3A3] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-500">Loading Student Notifications & Alerts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#0E2A47]">Notifications & Alerts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Course access updates, transaction approvals, and high-yield study announcements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Badge variant="teal" size="lg" className="font-extrabold uppercase">
              {unreadCount} UNREAD
            </Badge>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            icon={<CheckCheck className="w-4 h-4 text-[#0FA3A3]" />}
          >
            Mark All Read
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <Card className="p-8 text-center text-slate-500 text-xs space-y-2 rounded-2xl border-slate-200">
            <Bell className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">No Notifications Found</p>
            <p>You're all caught up with your study announcements and course alerts.</p>
          </Card>
        ) : (
          notifications.map((n) => (
            <Card
              key={n.id}
              className={`p-5 border-slate-200 rounded-2xl transition-all flex items-start gap-4 ${
                !n.isRead
                  ? "bg-teal-50/40 border-l-4 border-l-[#0FA3A3] shadow-xs"
                  : "bg-white hover:bg-slate-50/60"
              }`}
            >
              {/* Icon Indicator */}
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  !n.isRead ? "bg-[#0FA3A3] text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Bell className="w-5 h-5" />
              </div>

              {/* Notification Content Body */}
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-[#0E2A47]">{n.title}</h4>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#0FA3A3] inline-block shrink-0" title="Unread" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">
                    {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "2026-07-28"}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{n.body}</p>

                {/* Mark Single Read Action */}
                {!n.isRead && (
                  <button
                    onClick={() => handleMarkSingleRead(n.id)}
                    className="text-[11px] font-bold text-[#0FA3A3] hover:underline pt-1 inline-block"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
