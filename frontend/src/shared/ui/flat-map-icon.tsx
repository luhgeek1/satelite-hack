



export function FlatMapIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="10" ry="6.5" />
      <path d="M2 12h20M12 5.5v13" />
    </svg>
  );
}
