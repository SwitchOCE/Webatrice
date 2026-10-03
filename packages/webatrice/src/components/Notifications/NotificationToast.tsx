interface NotificationToastProps {
  title: string;
  body?: string;
  onActivate?: () => void;
}

const PREVIEW_LIMIT = 100;

/**
 * Body of an in-app notification toast: a heading plus an optional preview, the whole pill
 * clickable when the notification leads somewhere (a private chat, a room).
 */
export default function NotificationToast({ title, body, onActivate }: NotificationToastProps) {
  const preview = body && body.length > PREVIEW_LIMIT ? `${body.slice(0, PREVIEW_LIMIT)}…` : body;
  const content = (
    <>
      <span className="text-xs font-semibold text-accent truncate">{title}</span>
      {preview && (
        <span className="text-sm text-text-primary whitespace-pre-wrap break-words line-clamp-3">
          {preview}
        </span>
      )}
    </>
  );

  if (!onActivate) {
    return <div className="flex flex-col gap-0.5 min-w-0">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onActivate}
      className={[
        'w-full text-left flex flex-col gap-0.5 min-w-0 rounded-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      {content}
    </button>
  );
}
