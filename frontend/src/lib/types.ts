// TypeScript mirrors of the backend Pydantic models. Kept narrow on purpose: only the
// shapes the frontend reads. When the backend evolves, expand here.

export type ModelId = "logreg" | "rf" | "xgb" | "mlp";
export type MethodId = "lookup" | "glm" | "native" | "scripted";

export interface MethodInfo {
  id: MethodId;
  display_name: string;
  description: string;
}

export interface ModelInfo {
  id: ModelId;
  display_name: string;
  library: string;
  loaded: boolean;
  training_time_s: number | null;
  artifact_size_bytes: number | null;
  auc_test: number | null;
  auc_train: number | null;
}

export interface CompatibilityCell {
  compatible: boolean;
  reason: string | null;
}

export interface CompatibilityResponse {
  models: ModelId[];
  methods: MethodId[];
  matrix: CompatibilityCell[][];
  model_display: Record<string, { display_name: string; library: string }>;
  method_display: Record<string, { display_name: string; description: string }>;
}

export interface LookupStatus {
  populated: boolean;
  key_count: number;
  per_model: Record<ModelId, boolean>;
}

export interface SampleUser {
  user_id: number;
  precomputed_in_lookup: boolean;
  age: number;
  preference_luxury: number;
  preference_proximity: number;
  historical_bookings_count: number;
  is_business_traveler: number;
  country: string;
}

export interface SampleHotel {
  hotel_id: number;
  rating: number;
  price_per_night: number;
  distance_to_center_km: number;
  has_pool: number;
  has_spa: number;
  is_business_friendly: number;
  is_family_friendly: number;
  city: string;
}

export interface SampleInputsResponse {
  users: SampleUser[];
  hotels: SampleHotel[];
}

export interface PredictRequest {
  model: ModelId;
  method: MethodId;
  user_id: number;
  hotel_id: number;
}

export interface PredictResponse {
  model: ModelId;
  method: MethodId;
  user_id: number;
  hotel_id: number;
  probability: number | null;
  latency_ms: number;
  method_metadata: Record<string, unknown>;
  outcome: "hit" | "miss" | "error";
}

export interface IncompatibleErrorDetail {
  error: "incompatible_combination";
  model: ModelId;
  method: MethodId;
  reason: string;
}

export interface StressRequest {
  model: ModelId;
  method: MethodId;
  n_requests: number;
  sample_strategy?: "random" | "uniform";
}

export interface StressResponse {
  model: ModelId;
  method: MethodId;
  n_requests: number;
  sample_strategy: string;
  latencies_ms: number[];
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  misses: number;
  hits: number;
}

export interface StressProgressEvent {
  processed: number;
  total: number;
  latencies_ms: number[];
  hits: number;
  misses: number;
  errors: number;
}

export interface StressDoneEvent {
  p50: number;
  p95: number;
  p99: number;
  hits: number;
  misses: number;
  errors: number;
  n_requests: number;
  model: ModelId;
  method: MethodId;
}

export interface CompareRow {
  model: ModelId;
  method: MethodId;
  p50: number;
  p95: number;
  p99: number;
  auc: number | null;
  errors: number;
  misses: number;
  hits: number;
}

export interface CompareResponse {
  n_requests_per_combo: number;
  sample_strategy: string;
  rows: CompareRow[];
  wall_time_s: number;
}

export interface ModelQualityMetrics {
  display_name: string;
  library: string;
  artifact_path: string;
  training_time_s: number;
  artifact_size_bytes: number;
  auc_roc: number;
  auc_roc_train: number;
  log_loss: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: number[][];
  roc_curve: { fpr: number[]; tpr: number[] };
  pr_curve: { recall: number[]; precision: number[] };
  predicted_probability_histogram: {
    bin_edges: number[];
    positive: number[];
    negative: number[];
  };
  feature_importance: number[];
}

export interface ModelQualityResponse {
  feature_order: string[];
  models: Record<ModelId, ModelQualityMetrics>;
}
