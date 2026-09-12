'use client';

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="relative h-px w-full overflow-hidden bg-rule-strong">
      <span
        className="absolute inset-y-0 left-0 bg-zinc-300 transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
