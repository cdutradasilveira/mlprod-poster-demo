// Shared visual constants reused across charts and tables.

import type { MethodId, ModelId } from "./types";

// Muted, distinctive palette per model. HSL chosen so each color stays legible
// on both light and dark backgrounds.
export const MODEL_COLORS: Record<ModelId, string> = {
  logreg: "hsl(210, 75%, 58%)", // blue
  rf: "hsl(150, 55%, 48%)", // green
  xgb: "hsl(28, 85%, 55%)", // orange
  mlp: "hsl(290, 55%, 60%)", // violet
};

export const METHOD_COLORS: Record<MethodId, string> = {
  lookup: "hsl(195, 70%, 55%)", // cyan
  glm: "hsl(45, 80%, 55%)", // amber
  native: "hsl(265, 60%, 60%)", // indigo
  scripted: "hsl(0, 65%, 60%)", // rose
};

export const MODEL_DISPLAY: Record<ModelId, string> = {
  logreg: "Logistic Regression",
  rf: "Random Forest",
  xgb: "Gradient Boosting",
  mlp: "MLP",
};

export const MODEL_LIBRARY: Record<ModelId, string> = {
  logreg: "scikit-learn",
  rf: "scikit-learn",
  xgb: "XGBoost",
  mlp: "PyTorch",
};

export function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return `${v.toFixed(3)} ms`;
  if (v < 10) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(1)} ms`;
}

export function fmtSeconds(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return `${(v * 1000).toFixed(0)} ms`;
  if (v < 60) return `${v.toFixed(2)} s`;
  return `${(v / 60).toFixed(1)} min`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(
  v: number | null | undefined,
  digits = 4,
): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits);
}
