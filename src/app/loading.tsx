export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c9a87c]/30 border-t-[#c9a87c]" />
        <p className="text-sm text-white/40">加载中…</p>
      </div>
    </div>
  );
}
