/* The globe unrolled: a flattened world with its equator and prime meridian.
   Drawn as an oval rather than the equirectangular rectangle the view actually
   renders — a rectangle with a straight graticule reads as a table at 15px.
   Weighted to match the lucide globe it sits beside. */
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
