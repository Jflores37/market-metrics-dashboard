import { ReactNode } from "react";

const COLOR: Record<string, string> = {
  EP: "border-accent-green text-accent-green",
  PS: "border-accent-red text-accent-red",
  BO: "border-accent-cyan text-accent-cyan",
};

function classFor(tag: string): string {
  return COLOR[tag] ?? "border-border-subtle text-text-secondary";
}

export default function StageTagBadge({ tag }: { tag: string | null | undefined }): ReactNode {
  if (!tag) return <span className="text-text-dim">—</span>;
  const parts = tag.split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <span className="inline-flex gap-1">
      {parts.map((t) => (
        <span
          key={t}
          className={`px-1 py-0.5 rounded-[2px] border text-2xs font-mono uppercase tracking-wider ${classFor(t)}`}
        >
          {t}
        </span>
      ))}
    </span>
  );
}
