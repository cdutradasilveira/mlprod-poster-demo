import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { METHOD_COLORS } from "@/lib/theme";
import type { MethodId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  method: MethodId;
  title: string;
  paragraph: string;
  quote: string;
  paperRef: string;
}

export function MethodSidebarCard({
  method,
  title,
  paragraph,
  quote,
  paperRef,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: METHOD_COLORS[method] }}
              aria-hidden
            />
            {title}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0 text-xs text-muted-foreground">
          <p className="leading-relaxed">{paragraph}</p>
          <blockquote
            className="rounded-md border-l-2 px-3 py-2 italic leading-relaxed"
            style={{ borderColor: METHOD_COLORS[method] }}
          >
            “{quote}”
            <div className="mt-1 text-[10px] not-italic text-muted-foreground/80">
              {paperRef}
            </div>
          </blockquote>
        </CardContent>
      )}
    </Card>
  );
}
