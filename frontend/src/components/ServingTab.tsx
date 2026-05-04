import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play, Zap } from "lucide-react";

import { FeatureDisplay } from "@/components/FeatureDisplay";
import { InputSelector } from "@/components/InputSelector";
import { LatencyHistogram } from "@/components/LatencyHistogram";
import { LookupGlmExplainer } from "@/components/LookupGlmExplainer";
import { MethodFlow } from "@/components/MethodFlow";
import { MethodRadarChart } from "@/components/RadarChart";
import { ScriptedInfoDialog } from "@/components/ScriptedInfoDialog";
import {
  StressHistory,
  type StressHistoryEntry,
} from "@/components/StressHistory";
import { SegmentedControl } from "@/components/SegmentedControl";
import { WhyDialog } from "@/components/WhyDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, ApiError } from "@/lib/api";
import { MODEL_COLORS } from "@/lib/theme";
import type {
  CompatibilityResponse,
  MethodId,
  ModelId,
  PredictResponse,
  SampleInputsResponse,
  StressDoneEvent,
  StressProgressEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const MODEL_OPTIONS: { value: ModelId; label: string }[] = [
  { value: "logreg", label: "LogReg" },
  { value: "rf", label: "RF" },
  { value: "xgb", label: "XGB" },
  { value: "mlp", label: "MLP" },
];

const METHOD_OPTIONS: { value: MethodId; label: string }[] = [
  { value: "lookup", label: "Lookup" },
  { value: "glm", label: "GLM" },
  { value: "native", label: "Native" },
  { value: "scripted", label: "Scripted" },
];

const STRESS_PRESETS = [100, 500, 2000];
const LATENCY_BUFFER_CAP = 5000;

interface ComboMetrics {
  latencies: number[];
  total: number;
  hits: number;
  misses: number;
  errors: number;
  artifactSizeBytes?: number;
}

function emptyMetrics(): ComboMetrics {
  return { latencies: [], total: 0, hits: 0, misses: 0, errors: 0 };
}

function comboKey(model: ModelId, method: MethodId): string {
  return `${model}:${method}`;
}

function percentile(arr: number[], p: number): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return `${v.toFixed(3)} ms`;
  if (v < 10) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(1)} ms`;
}

interface Props {
  resetGen: number;
}

export function ServingTab({ resetGen }: Props) {
  // --- data fetched once ---
  const [inputs, setInputs] = useState<SampleInputsResponse | null>(null);
  const [compat, setCompat] = useState<CompatibilityResponse | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // --- selection ---
  const [model, setModel] = useState<ModelId>("logreg");
  const [method, setMethod] = useState<MethodId>("lookup");
  const [userId, setUserId] = useState<number | null>(null);
  const [hotelId, setHotelId] = useState<number | null>(null);

  // --- last result + accumulators ---
  const [lastResult, setLastResult] = useState<PredictResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);

  const [combosMetrics, setCombosMetrics] = useState<
    Record<string, ComboMetrics>
  >({});
  const [history, setHistory] = useState<StressHistoryEntry[]>([]);

  // --- stress state ---
  const [stressN, setStressN] = useState<number>(STRESS_PRESETS[1]);
  const [stressProgress, setStressProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const stressEsRef = useRef<EventSource | null>(null);

  // Scripted always wraps the PyTorch MLP regardless of the model column
  // (CLAUDE.md §7.4). The UI uses `effectiveModel` for everything that should
  // reflect what actually runs (feature display, predict request body), and
  // disables the model selector while Scripted is active.
  const scriptedActive = method === "scripted";
  const effectiveModel: ModelId = scriptedActive ? "mlp" : model;

  const isCompatible = useMemo(() => {
    if (!compat) return true;
    const m = compat.models.indexOf(model);
    const me = compat.methods.indexOf(method);
    if (m < 0 || me < 0) return false;
    return compat.matrix[m]?.[me]?.compatible ?? false;
  }, [compat, model, method]);

  const incompatibleReason = useMemo(() => {
    if (!compat || isCompatible) return null;
    const m = compat.models.indexOf(model);
    const me = compat.methods.indexOf(method);
    return compat.matrix[m]?.[me]?.reason ?? null;
  }, [compat, isCompatible, model, method]);

  const currentMetrics = combosMetrics[comboKey(effectiveModel, method)] ?? emptyMetrics();
  const p95 = percentile(currentMetrics.latencies, 95);

  const selectedUser = useMemo(
    () => inputs?.users.find((u) => u.user_id === userId) ?? undefined,
    [inputs, userId],
  );
  const selectedHotel = useMemo(
    () => inputs?.hotels.find((h) => h.hotel_id === hotelId) ?? undefined,
    [inputs, hotelId],
  );

  // ---- Bootstrap fetch ----
  useEffect(() => {
    let alive = true;
    Promise.all([api.sampleInputs(), api.compatibility()])
      .then(([inputs, compat]) => {
        if (!alive) return;
        setInputs(inputs);
        setCompat(compat);
        // Default selection: first precomputed user, first hotel.
        const u =
          inputs.users.find((u) => u.precomputed_in_lookup) ?? inputs.users[0];
        if (u) setUserId(u.user_id);
        if (inputs.hotels[0]) setHotelId(inputs.hotels[0].hotel_id);
      })
      .catch((e: ApiError) => {
        if (alive) setBootstrapError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ---- Reset on resetGen bump ----
  useEffect(() => {
    if (resetGen === 0) return;
    setCombosMetrics({});
    setHistory([]);
    setLastResult(null);
    setPredictError(null);
  }, [resetGen]);

  // ---- Cleanup any in-flight SSE on unmount ----
  useEffect(() => {
    return () => {
      stressEsRef.current?.close();
    };
  }, []);

  const recordPrediction = useCallback(
    (
      m: ModelId,
      me: MethodId,
      latencies: number[],
      hits: number,
      misses: number,
      errors: number,
    ) => {
      setCombosMetrics((prev) => {
        const key = comboKey(m, me);
        const cur = prev[key] ?? emptyMetrics();
        const next: ComboMetrics = {
          latencies: [...cur.latencies, ...latencies].slice(-LATENCY_BUFFER_CAP),
          total: cur.total + latencies.length + errors,
          hits: cur.hits + hits,
          misses: cur.misses + misses,
          errors: cur.errors + errors,
          artifactSizeBytes: cur.artifactSizeBytes,
        };
        return { ...prev, [key]: next };
      });
    },
    [],
  );

  // ---- Single predict ----
  const handlePredict = useCallback(async () => {
    if (userId === null || hotelId === null) return;
    if (!isCompatible) return;
    setPredictError(null);
    setPredicting(true);
    try {
      const res = await api.predict({
        model: effectiveModel,
        method,
        user_id: userId,
        hotel_id: hotelId,
      });
      setLastResult(res);
      const hits = res.outcome === "hit" ? 1 : 0;
      const misses = res.outcome === "miss" ? 1 : 0;
      const errors = res.outcome === "error" ? 1 : 0;
      recordPrediction(effectiveModel, method, [res.latency_ms], hits, misses, errors);
    } catch (e) {
      const err = e as ApiError;
      setPredictError(err.message);
      recordPrediction(effectiveModel, method, [], 0, 0, 1);
    } finally {
      setPredicting(false);
    }
  }, [effectiveModel, method, userId, hotelId, isCompatible, recordPrediction]);

  // ---- Random / force miss helpers ----
  const handleRandom = useCallback(() => {
    if (!inputs) return;
    const u = inputs.users[Math.floor(Math.random() * inputs.users.length)];
    const h = inputs.hotels[Math.floor(Math.random() * inputs.hotels.length)];
    if (u) setUserId(u.user_id);
    if (h) setHotelId(h.hotel_id);
  }, [inputs]);

  const handleForceMiss = useCallback(() => {
    if (!inputs) return;
    const not = inputs.users.filter((u) => !u.precomputed_in_lookup);
    if (not.length === 0) return;
    const u = not[Math.floor(Math.random() * not.length)];
    setUserId(u.user_id);
  }, [inputs]);

  // ---- Stress test (SSE) ----
  const handleStressTest = useCallback(() => {
    if (!isCompatible) return;
    setStressProgress({ processed: 0, total: stressN });
    const url = api.stressTestStreamUrl({
      model: effectiveModel,
      method,
      n_requests: stressN,
      sample_strategy: "uniform",
    });
    stressEsRef.current?.close();
    const es = new EventSource(url);
    stressEsRef.current = es;

    let lastHits = 0;
    let lastMisses = 0;
    let lastErrors = 0;

    es.addEventListener("progress", (event) => {
      const data = JSON.parse(
        (event as MessageEvent).data,
      ) as StressProgressEvent;
      const dh = data.hits - lastHits;
      const dm = data.misses - lastMisses;
      const de = data.errors - lastErrors;
      lastHits = data.hits;
      lastMisses = data.misses;
      lastErrors = data.errors;
      recordPrediction(effectiveModel, method, data.latencies_ms, dh, dm, de);
      setStressProgress({ processed: data.processed, total: data.total });
    });

    es.addEventListener("done", (event) => {
      const data = JSON.parse(
        (event as MessageEvent).data,
      ) as StressDoneEvent;
      setHistory((prev) => [
        {
          ts: Date.now(),
          model: data.model,
          method: data.method,
          n_requests: data.n_requests,
          p50: data.p50,
          p95: data.p95,
          p99: data.p99,
          hits: data.hits,
          misses: data.misses,
          errors: data.errors,
        },
        ...prev,
      ]);
      es.close();
      stressEsRef.current = null;
      setStressProgress(null);
    });

    es.addEventListener("error", () => {
      es.close();
      stressEsRef.current = null;
      setStressProgress(null);
    });
  }, [isCompatible, effectiveModel, method, stressN, recordPrediction]);

  // ---- Render ----
  if (bootstrapError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Could not load Serving tab
          </CardTitle>
          <CardDescription>{bootstrapError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!inputs || !compat) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading sample inputs and compatibility matrix…
      </div>
    );
  }

  const stressRunning = stressProgress !== null;

  return (
    <div className="space-y-4">
      {/* Top bar: selectors + compatibility callout */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Model
            </label>
            {scriptedActive ? (
              <div
                role="status"
                aria-label="Model is fixed to MLP because the Scripted method always wraps the PyTorch MLP (paper §3.4)"
                className="inline-flex h-9 min-w-[230px] items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 pr-1.5"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: MODEL_COLORS.mlp }}
                  aria-hidden
                />
                <span className="text-xs font-medium text-foreground">MLP</span>
                <span className="text-[11px] text-muted-foreground">
                  fixed by Scripted (§3.4)
                </span>
                <ScriptedInfoDialog />
              </div>
            ) : (
              <SegmentedControl
                value={model}
                onChange={setModel}
                options={MODEL_OPTIONS}
                ariaLabel="Model"
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Method
            </label>
            <SegmentedControl
              value={method}
              onChange={setMethod}
              options={METHOD_OPTIONS}
              ariaLabel="Method"
            />
          </div>
          {!isCompatible && incompatibleReason && (
            <div className="ml-auto flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="max-w-md leading-snug">
                {`${model.toUpperCase()} × ${method.toUpperCase()} is not supported.`}{" "}
                <WhyDialog reason={incompatibleReason} />
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3-column layout */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left column: input selector + features */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm">Input</CardTitle>
            <CardDescription className="text-xs">
              The pair sent to the model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InputSelector
              users={inputs.users}
              hotels={inputs.hotels}
              userId={userId}
              hotelId={hotelId}
              onUserChange={setUserId}
              onHotelChange={setHotelId}
              onRandomize={handleRandom}
              onForceMiss={handleForceMiss}
            />
            <div className="mt-4">
              <FeatureDisplay user={selectedUser} hotel={selectedHotel} />
            </div>
          </CardContent>
        </Card>

        {/* Center column: result + flow + stress */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
            <CardDescription className="text-xs">
              Single request → flow → stress test.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Probability
                </div>
                <div className="font-mono text-5xl font-semibold tabular-nums leading-tight">
                  {lastResult?.probability !== null &&
                  lastResult?.probability !== undefined
                    ? lastResult.probability.toFixed(3)
                    : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {lastResult?.outcome === "miss"
                    ? "Lookup miss"
                    : lastResult
                      ? `${fmtMs(lastResult.latency_ms)} • outcome=${lastResult.outcome}`
                      : "Run a prediction to see metrics"}
                </div>
                {predictError && (
                  <div className="mt-1 text-xs text-destructive">
                    {predictError}
                  </div>
                )}
              </div>
              <Button
                size="lg"
                onClick={handlePredict}
                disabled={!isCompatible || userId === null || hotelId === null || predicting}
                className="h-12 px-6"
              >
                {predicting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
                Predict
              </Button>
            </div>

            <MethodFlow model={effectiveModel} method={method} />

            <LookupGlmExplainer method={method} />

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  Stress test
                </div>
                <div className="flex items-center gap-2">
                  {STRESS_PRESETS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setStressN(n)}
                      disabled={stressRunning}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        n === stressN
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-input text-muted-foreground hover:text-foreground",
                        stressRunning && "opacity-50",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleStressTest}
                  disabled={!isCompatible || stressRunning}
                >
                  {stressRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Run"
                  )}
                </Button>
              </div>
              {stressRunning && (
                <div className="mt-3 space-y-1">
                  <Progress
                    value={(stressProgress!.processed / stressProgress!.total) * 100}
                  />
                  <div className="text-[10px] text-muted-foreground">
                    {stressProgress!.processed} / {stressProgress!.total} requests
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right column: live metrics */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm">Live metrics</CardTitle>
            <CardDescription className="text-xs">
              {effectiveModel.toUpperCase()} × {method.toUpperCase()} — latencies and counters
              for this combo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Counter label="total" value={currentMetrics.total} />
              <Counter label="hits" value={currentMetrics.hits} />
              <Counter label="misses" value={currentMetrics.misses} muted />
              <Counter label="errors" value={currentMetrics.errors} muted />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Latency distribution</span>
                <span className="font-mono">
                  p50 {fmtMs(percentile(currentMetrics.latencies, 50))} ·
                  p95 {fmtMs(percentile(currentMetrics.latencies, 95))} ·
                  p99 {fmtMs(percentile(currentMetrics.latencies, 99))}
                </span>
              </div>
              <LatencyHistogram latencies={currentMetrics.latencies} />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Trade-off radar (paper §4)</span>
                {p95 !== null && (
                  <Badge variant="outline">p95 {fmtMs(p95)}</Badge>
                )}
              </div>
              <MethodRadarChart method={method} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Stress test history</CardTitle>
          <CardDescription className="text-xs">
            Every stress run is appended here. Click "Reset metrics" in the
            header to clear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StressHistory entries={history} />
        </CardContent>
      </Card>
    </div>
  );
}

function Counter({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-muted/20 px-2 py-2",
        muted && "opacity-80",
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}
