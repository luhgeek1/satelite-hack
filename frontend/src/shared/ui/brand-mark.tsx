/* Three nodes around a body, the way the map draws them: one per orbital
   plane. The nodes clear the globe's stroke on purpose — nothing is knocked
   out with a background colour, so the mark stays one flat currentColor.

   Sized by attribute rather than by a utility class: an SVG that carries no
   width/height stretches to fill its parent the moment the stylesheet is
   missing, and the mark is the first thing on the page. */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6.2" />
      <g fill="currentColor" stroke="none">
        <circle cx="15.09" cy="2.49" r="1.9" />
        <circle cx="19.43" cy="18.69" r="1.9" />
        <circle cx="2.6" cy="15.42" r="1.9" />
      </g>
    </svg>
  );
}
