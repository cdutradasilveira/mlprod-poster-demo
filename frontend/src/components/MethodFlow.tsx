import { ArrowRight, Box, Database, FileJson, Code2, Cpu } from "lucide-react";

import type { MethodId, ModelId } from "@/lib/types";
import { cn } from "@/lib/utils";

const ARTIFACT_BY_MODEL: Record<ModelId, string> = {
  logreg: "logreg.pkl (joblib)",
  rf: "rf.pkl (joblib)",
  xgb: "xgb.json (xgboost)",
  mlp: "mlp.pt (torch)",
};

const METHOD_NODE: Record<MethodId, { label: string; icon: typeof Box }> = {
  lookup: { label: "in-process numpy table", icon: Database },
  glm: { label: "numpy · σ(W·x + b)", icon: FileJson },
  native: { label: "library predict()", icon: Box },
  scripted: { label: "script + rules", icon: Code2 },
};

const ARTIFACT_BY_METHOD: Record<MethodId, ((m: ModelId) => string) | null> = {
  lookup: (m) => `lookup/${m}.npy[user, hotel]`,
  glm: () => "glm_weights.json",
  native: (m) => ARTIFACT_BY_MODEL[m],
  scripted: (m) => `scripted.py + ${ARTIFACT_BY_MODEL[m]}`,
};

interface Props {
  model: ModelId;
  method: MethodId;
}

function Node({
  icon: Icon,
  label,
  sub,
  highlighted,
}: {
  icon: typeof Box;
  label: string;
  sub?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border bg-muted/30 px-3 py-2 text-center",
        highlighted && "border-primary/40 bg-primary/5",
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="text-[11px] font-medium text-foreground">{label}</div>
      {sub && (
        <div className="text-[10px] font-mono text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

export function MethodFlow({ model, method }: Props) {
  const node = METHOD_NODE[method];
  const artifact = ARTIFACT_BY_METHOD[method]?.(model) ?? "";
  return (
    <div className="flex items-center justify-between gap-2">
      <Node icon={Cpu} label="Request" sub="(user_id, hotel_id)" />
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Node icon={node.icon} label={node.label} sub={method} highlighted />
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Node icon={Box} label={model.toUpperCase()} sub={artifact} />
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Node icon={Cpu} label="Response" sub="probability" />
    </div>
  );
}
