export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-(--ochre) font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      S
    </span>
  );
}

export function Logo({ collapse = false }: { collapse?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className={`text-sm font-semibold tracking-tight ${collapse ? "hidden md:inline" : ""}`}>
        SimpleSequence
      </span>
    </span>
  );
}
