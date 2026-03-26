// Utilise VITE_API_BASE si fourni, sinon on pointe sur le backend local actuel.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8001/api";

const TOKEN_KEY = "logitrack_token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Petit client HTTP “humain”:
 * - pas de magie
 * - erreurs explicites
 * - JSON par défaut
 * - Authorization Bearer si token présent
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as T;
}

export type Vehicle = {
  id: number;
  label: string;
  plate_number: string;
  driver_name: string | null;
  odometer_km: number;
  next_service_km: number;
  created_at: string;
};

export type Position = {
  id: number;
  vehicle_id: number;
  lat: number;
  lon: number;
  speed_kmh: number;
  heading_deg: number;
  fuel_l_per_100km: number;
  timestamp: string;
};

export type GeoFence = {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_m: number;
};

export type MaintenanceAlert = {
  vehicle_id: number;
  label: string;
  remaining_km: number;
  severity: "high" | "medium";
};

export type FuelAnalyticsRow = {
  vehicle_id: number;
  label: string;
  avg_fuel_l_per_100km: number;
};

export type Delivery = {
  id: number;
  order_ref: string;
  status: string;
  origin: string;
  destination: string;
  vehicle_id: number | null;
  client_user_id: number | null;
  eta_minutes: number;
  last_update_at: string;
};

export type DeliveryCreate = {
  order_ref: string;
  origin?: string;
  destination?: string;
  vehicle_id?: number | null;
  eta_minutes?: number;
  client_user_id?: number | null;
};

export type RoiInput = {
  annual_maintenance_cost_eur: number;
  annual_fuel_cost_eur: number;
  annual_delay_cost_eur: number;
  target_savings_percent: number;
  dev_budget_eur: number;
};

export type RoiOut = {
  annual_total_cost_eur: number;
  target_savings_eur: number;
  payback_months: number;
  roi_year_1_percent: number;
};

export type UserMe = {
  id: number;
  email: string;
  role: "admin" | "client" | string;
};

export const api = {
  health: () => request<{ status: string }>("/health"),
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<UserMe>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<UserMe>("/auth/me"),
  vehicles: () => request<Vehicle[]>("/vehicles"),
  latest: () => request<Position[]>("/tracking/latest"),
  history: (vehicleId: number, minutes = 120) =>
    request<Position[]>(`/tracking/history/${vehicleId}?minutes=${minutes}`),
  geofences: () => request<GeoFence[]>("/geofences"),
  maintenanceAlerts: () => request<{ alerts: MaintenanceAlert[] }>("/maintenance/alerts"),
  fuelAnalytics: (minutes = 240) =>
    request<{ window_minutes: number; vehicles: FuelAnalyticsRow[] }>(`/analytics/fuel?minutes=${minutes}`),
  deliveries: () => request<Delivery[]>("/deliveries"),
  clientTrack: (orderRef: string) => request<Delivery>(`/client/track/${encodeURIComponent(orderRef)}`),
  createDelivery: (payload: DeliveryCreate) =>
    request<Delivery>("/deliveries", { method: "POST", body: JSON.stringify(payload) }),
  roi: (payload: RoiInput) => request<RoiOut>("/roi", { method: "POST", body: JSON.stringify(payload) }),
  route: (startKey = "CASA", goalKey = "PARIS") =>
    request<{ path: string[]; estimated_minutes?: number | null; message?: string | null }>(
      `/optimization/route?start_key=${encodeURIComponent(startKey)}&goal_key=${encodeURIComponent(goalKey)}`
    ),
};
