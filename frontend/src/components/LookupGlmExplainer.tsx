import { Info } from "lucide-react";

import type { MethodId } from "@/lib/types";

interface Props {
  method: MethodId;
}

export function LookupGlmExplainer({ method }: Props) {
  if (method !== "lookup" && method !== "glm") return null;
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">
          Lookup and GLM offer comparable latency.
        </span>{" "}
        The real distinction is in flexibility: Lookup serves any model but
        cannot handle continuous inputs; GLM handles continuous inputs but only
        linear models. The paper places both at the origin of the
        flexibility / robustness plane (Bernardi 2019, §4).
      </span>
    </div>
  );
}
