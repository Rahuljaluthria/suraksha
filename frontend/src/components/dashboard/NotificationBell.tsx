import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAppSelector } from "@/app/hooks";
import { formatRelative } from "@/features/dashboard/format";
import { useDismiss } from "@/features/dashboard/useDismiss";
import type { NotificationItem } from "@/types/dashboard";

const LAST_SEEN_KEY = "suraksha.notifications.lastSeen";

function readLastSeen(): number {
  try {
    return Number(window.localStorage.getItem(LAST_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * The API lists notifications and their unread state but has no "mark as read" endpoint yet.
 * So the badge counts unread notifications that arrived after the last time this panel was
 * opened in this browser, while each row still shows the server's own read state.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const widget = useAppSelector((state) => state.dashboard.notifications);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const items = widget.data?.items;
  const badge = useMemo(
    () => (items ?? []).filter((n) => !n.isRead && new Date(n.createdAt).getTime() > lastSeen).length,
    [items, lastSeen]
  );

  const toggle = () => {
    if (!open) {
      const now = Date.now();
      setLastSeen(now);
      try {
        window.localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        // storage unavailable: the badge simply resets on reload
      }
    }
    setOpen(!open);
  };

  const openItem = (item: NotificationItem) => {
    setOpen(false);
    if (item.entityType === "INCIDENT" && item.entityId) navigate(`/incidents/${item.entityId}`);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={badge > 0 ? `Notifications, ${badge} new` : "Notifications"}
        className="relative flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden="true" />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-semibold leading-4 text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">Notifications</p>
            {widget.data && (
              <p className="font-mono text-[10px] text-muted-foreground">{widget.data.unreadCount} unread</p>
            )}
          </div>

          {!items ? (
            <p className="p-4 text-xs text-muted-foreground">
              {widget.status === "failed" ? widget.error ?? "Could not load notifications." : "Loading…"}
            </p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">You have no notifications.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-primary"}`}
                      aria-label={n.isRead ? "Read" : "Unread"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{n.title}</span>
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">{n.message}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
