export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="font-label text-[13px] text-zinc-300">{title}</div>
      {hint && <p className="mt-1.5 max-w-[16rem] font-label text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
    </div>
  );
}
