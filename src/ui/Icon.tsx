/** The app's icons: hand-drawn 20×20 paths in one stroke weight, coloured by currentColor. */
const PATHS = {
  check: "M4 10.5l4 4 8-9",
  cross: "M5 5l10 10M15 5L5 15",
  alert: "M10 3.5l7.5 13h-15zM10 8.5v3.5M10 14.6v.1",
  info: "M10 2.75a7.25 7.25 0 1 1 0 14.5a7.25 7.25 0 0 1 0-14.5zM10 9v5M10 6.4v.1",
  sun: "M10 6.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4",
  moon: "M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z",
  auto: "M10 2.75a7.25 7.25 0 1 1 0 14.5a7.25 7.25 0 0 1 0-14.5zM10 2.75v14.5",
} as const;

export type IconName = keyof typeof PATHS;

/** An icon. Without a label it is decorative and hidden from screen readers. */
export function Icon({ name, size = 18, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon" width={size} height={size} viewBox="0 0 20 20"
      fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {/* "auto" (match the system theme) is a half-filled circle */}
      {name === "auto" && <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor" stroke="none" />}
      <path d={PATHS[name]} />
    </svg>
  );
}
