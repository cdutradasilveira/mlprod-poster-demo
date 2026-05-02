import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  METHOD_COLORS,
  MODEL_COLORS,
  MODEL_DISPLAY,
  fmtMs,
  fmtNum,
} from "@/lib/theme";
import type { CompareRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "model" | "method" | "p50" | "p95" | "p99" | "auc";

interface Props {
  rows: CompareRow[];
}

const COLS: { key: SortKey; label: string; align?: "left" | "right" }[] = [
  { key: "model", label: "Model", align: "left" },
  { key: "method", label: "Method", align: "left" },
  { key: "p50", label: "p50", align: "right" },
  { key: "p95", label: "p95", align: "right" },
  { key: "p99", label: "p99", align: "right" },
  { key: "auc", label: "AUC", align: "right" },
];

export function CompareResultsTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("p95");
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const va = a[sortKey] as number | string | null;
      const vb = b[sortKey] as number | string | null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return out;
  }, [rows, sortKey, asc]);

  function toggle(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "auc" ? false : true);
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "cursor-pointer select-none px-3 py-2",
                  c.align === "right" ? "text-right" : "text-left",
                )}
                onClick={() => toggle(c.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sortKey === c.key &&
                    (asc ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    ))}
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-right">hits</th>
            <th className="px-3 py-2 text-right">misses</th>
            <th className="px-3 py-2 text-right">errors</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={`${r.model}:${r.method}`}
              className="border-t border-border/60 transition-colors hover:bg-muted/30"
            >
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: MODEL_COLORS[r.model] }}
                    aria-hidden
                  />
                  <span className="font-medium">{MODEL_DISPLAY[r.model]}</span>
                </span>
              </td>
              <td className="px-3 py-2.5">
                <Badge
                  variant="outline"
                  style={{
                    borderColor: METHOD_COLORS[r.method],
                    color: METHOD_COLORS[r.method],
                  }}
                >
                  {r.method}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {fmtMs(r.p50)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {fmtMs(r.p95)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {fmtMs(r.p99)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {fmtNum(r.auc, 4)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {r.hits}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {r.misses}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {r.errors}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
