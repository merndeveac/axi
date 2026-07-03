type ConnectionBadgeTone = "online" | "offline" | "warning" | "neutral";

type ConnectionBadgeProps = {
  label: string;
  tone?: ConnectionBadgeTone;
  title?: string;
};

export function ConnectionBadge({
  label,
  tone = "neutral",
  title
}: ConnectionBadgeProps) {
  return (
    <span className={`terminal-badge terminal-badge-${tone}`} title={title}>
      [{label}]
    </span>
  );
}
