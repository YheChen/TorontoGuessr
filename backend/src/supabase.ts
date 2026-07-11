import { loadEnv } from "./env.js";
import { recordDb } from "./observability.js";

loadEnv();

const rawSupabaseUrl = process.env.SUPABASE_URL ?? null;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

/** PostgREST filter written as an explicit operator, e.g. `{ op: "gte", value: ts }`. */
export interface FilterOperator {
  op: string;
  value: string | number | boolean | null;
}

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number>
  | FilterOperator;

export type Filters = Record<string, FilterValue>;

export interface QueryOptions {
  columns?: string;
  filters?: Filters;
  order?: string;
  limit?: number;
  offset?: number;
}

interface RequestOptions {
  method?: string;
  query?: URLSearchParams;
  body?: unknown;
  preferCount?: boolean;
  preferRepresentation?: boolean;
}

function getSupabaseBaseUrl(): string {
  if (!rawSupabaseUrl) {
    throw new Error("Missing SUPABASE_URL for backend.");
  }

  return rawSupabaseUrl.endsWith("/") ? rawSupabaseUrl : `${rawSupabaseUrl}/`;
}

function getSupabaseKey(): string {
  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for backend.");
  }

  return supabaseKey;
}

function isFilterOperator(value: FilterValue): value is FilterOperator {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "op" in value
  );
}

function formatFilterValue(value: FilterOperator["value"] | Array<string | number>): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `(${value.map((entry) => String(entry)).join(",")})`;
  }

  return String(value);
}

function buildQueryString({
  columns = "*",
  filters = {},
  order,
  limit,
  offset,
}: QueryOptions = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("select", columns);

  for (const [field, value] of Object.entries(filters)) {
    if (isFilterOperator(value)) {
      params.set(field, `${value.op}.${formatFilterValue(value.value)}`);
      continue;
    }

    if (value === null) {
      params.set(field, "is.null");
      continue;
    }

    params.set(field, `eq.${value}`);
  }

  if (order) {
    params.set("order", order);
  }

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  if (typeof offset === "number") {
    params.set("offset", String(offset));
  }

  return params;
}

async function performSupabaseRequest(
  pathname: string,
  {
    method = "GET",
    query,
    body,
    preferCount = false,
    preferRepresentation = false,
  }: RequestOptions = {}
): Promise<{ payload: unknown; headers: Headers }> {
  const url = new URL(pathname, getSupabaseBaseUrl());
  if (query) {
    url.search = query.toString();
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    apikey: getSupabaseKey(),
    Authorization: `Bearer ${getSupabaseKey()}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }

  if (preferCount) {
    headers.Prefer = headers.Prefer
      ? `${headers.Prefer},count=exact`
      : "count=exact";
  }

  if (preferRepresentation && body === undefined) {
    headers.Prefer = headers.Prefer
      ? `${headers.Prefer},return=representation`
      : "return=representation";
  }

  const dbStartedAt = performance.now();
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  recordDb(
    performance.now() - dbStartedAt,
    method === "GET" || method === "HEAD" ? "read" : "write"
  );

  const payload: unknown =
    method === "HEAD" ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? ((payload as Record<string, unknown>).message ??
          (payload as Record<string, unknown>).error_description ??
          (payload as Record<string, unknown>).error)
        : null;
    throw new Error(
      (typeof message === "string" && message) ||
        `Supabase request failed with ${response.status}.`
    );
  }

  return { payload, headers: response.headers };
}

async function supabaseRequest(
  pathname: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const { payload } = await performSupabaseRequest(pathname, options);
  return payload;
}

export async function selectRows<T>(
  table: string,
  options: QueryOptions = {}
): Promise<T[]> {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    query: buildQueryString(options),
  });

  return Array.isArray(payload) ? (payload as T[]) : [];
}

export async function selectSingleRow<T>(
  table: string,
  options: QueryOptions = {}
): Promise<T | null> {
  const rows = await selectRows<T>(table, {
    ...options,
    limit: 1,
  });

  return rows[0] ?? null;
}

export async function insertRow<T>(
  table: string,
  values: Record<string, unknown>,
  { columns = "*" }: { columns?: string } = {}
): Promise<T> {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: buildQueryString({ columns }),
    body: values,
  });

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Supabase insert for ${table} did not return a row.`);
  }

  return payload[0] as T;
}

export async function insertRows<T>(
  table: string,
  values: Array<Record<string, unknown>>,
  { columns = "*" }: { columns?: string } = {}
): Promise<T[]> {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: buildQueryString({ columns }),
    body: values,
  });

  return Array.isArray(payload) ? (payload as T[]) : [];
}

export async function updateSingleRow<T>(
  table: string,
  values: Record<string, unknown>,
  { filters = {}, columns = "*" }: { filters?: Filters; columns?: string } = {}
): Promise<T | null> {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    query: buildQueryString({ columns, filters }),
    body: values,
  });

  if (!Array.isArray(payload)) {
    return null;
  }

  return (payload[0] as T) ?? null;
}

export async function countRows(
  table: string,
  { filters = {} }: { filters?: Filters } = {}
): Promise<number> {
  const { headers } = await performSupabaseRequest(`/rest/v1/${table}`, {
    method: "HEAD",
    query: buildQueryString({
      columns: "id",
      filters,
      limit: 1,
    }),
    preferCount: true,
  });

  const contentRange = headers.get("content-range");
  if (!contentRange) {
    throw new Error(`Supabase count for ${table} did not return content-range.`);
  }

  const total = Number(contentRange.split("/")[1]);
  if (!Number.isFinite(total)) {
    throw new Error(`Supabase count for ${table} returned an invalid total.`);
  }

  return total;
}

export async function deleteRows<T>(
  table: string,
  { filters = {}, columns = "*" }: { filters?: Filters; columns?: string } = {}
): Promise<T[]> {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    query: buildQueryString({ columns, filters }),
    preferRepresentation: true,
  });

  return Array.isArray(payload) ? (payload as T[]) : [];
}

/** Call a Postgres function through PostgREST RPC. */
export async function callRpc<T>(
  functionName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const payload = await supabaseRequest(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: args,
  });

  return payload as T;
}
