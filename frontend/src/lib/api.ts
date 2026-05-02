import type {
  CompareResponse,
  CompatibilityResponse,
  IncompatibleErrorDetail,
  LookupStatus,
  ModelInfo,
  ModelQualityResponse,
  PredictRequest,
  PredictResponse,
  SampleInputsResponse,
  StressRequest,
  StressResponse,
} from "./types";

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8000/api";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "ApiError";
  }

  isIncompatibleCombination(): this is ApiError & {
    detail: IncompatibleErrorDetail;
  } {
    return (
      this.status === 400 &&
      typeof this.detail === "object" &&
      this.detail !== null &&
      (this.detail as { error?: string }).error === "incompatible_combination"
    );
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(0, null, `Network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    let detail: unknown = null;
    try {
      const body = await res.json();
      detail = body?.detail ?? body;
    } catch {
      // ignore — non-JSON body
    }
    throw new ApiError(res.status, detail, `HTTP ${res.status} on ${path}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  listModels: () => request<{ models: ModelInfo[] }>("/models"),
  modelMetrics: () => request<ModelQualityResponse>("/models/metrics"),

  listMethods: () =>
    request<{
      methods: { id: string; display_name: string; description: string }[];
    }>("/methods"),
  compatibility: () => request<CompatibilityResponse>("/compatibility"),

  sampleInputs: () => request<SampleInputsResponse>("/sample-inputs"),

  predict: (body: PredictRequest) =>
    request<PredictResponse>("/predict", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  stressTest: (body: StressRequest) =>
    request<StressResponse>("/stress-test", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  stressTestStreamUrl: (body: StressRequest) => {
    const params = new URLSearchParams({
      model: body.model,
      method: body.method,
      n: String(body.n_requests),
      sample_strategy: body.sample_strategy ?? "uniform",
    });
    return `${BASE_URL}/stress-test/stream?${params.toString()}`;
  },

  compare: (n_requests_per_combo = 500) =>
    request<CompareResponse>("/compare", {
      method: "POST",
      body: JSON.stringify({ n_requests_per_combo }),
    }),

  lookupStatus: () => request<LookupStatus>("/lookup/status"),

  resetMetrics: () =>
    request<{ reset: boolean }>("/metrics/reset", { method: "POST" }),

  metrics: () =>
    request<{
      snapshots: Record<
        string,
        {
          total_requests: number;
          hits: number;
          misses: number;
          errors: number;
          p50_ms: number | null;
          p95_ms: number | null;
          p99_ms: number | null;
          n_latencies: number;
        }
      >;
    }>("/metrics"),
};

export type { ApiError as ApiErrorType };
