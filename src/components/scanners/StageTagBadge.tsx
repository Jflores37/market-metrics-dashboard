import { ReactNode } from "react";

// Mirrors the reference repo's `_tag_badge` at layout.py:950-963
// (pakkiraju/Market-Metrics-, finviz-elite). EP and PS get filled
// background pills; anything else (incl. BO) renders as plain text.
// Multi-tag values (e.g. "EP, PS") split on comma and render as a
// flex row with 4px gap (layout.py:989-993).

type Variant = "filled-green" | "filled-red" | "plain";

function variantFor(tag: string): Variant {
  if (tag === "EP") return "filled-green";
  if (tag === "PS") return "filled-red";
  return "plain";
}

function classFor(v: Variant): string {
  if (v === "filled-green") return "bg-accent-green/20 text-accent-green px-1 py-0.5 rounded-[2px] border border-accent-green/40";
  if (v === "filled-red") return "bg-accent-red/20 text-accent-red px-1 py-0.5 rounded-[2px] border border-accent-red/40";
  return "text-text-secondary";
}

export default function StageTagBadge({ tag }: { tag: string | null | undefined }): ReactNode {
  if (!tag) return <span className="text-text-dim">—</span>;
  const parts = tag.split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <span className="inline-flex gap-1 items-center">
      {parts.map((t) => (
        <span key={t} className={`text-2xs font-mono uppercase tracking-wider ${classFor(variantFor(t))}`}>
          {t}
        </span>
      ))}
    </span>
  );
}
