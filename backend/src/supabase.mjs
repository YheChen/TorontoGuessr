import { loadEnv } from "./env.mjs";

loadEnv();

const rawSupabaseUrl = process.env.SUPABASE_URL ?? null;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

function getSupabaseBaseUrl() {
  if (!rawSupabaseUrl) {
    throw new Error("Missing SUPABASE_URL for backend.");
  }

  return rawSupabaseUrl.endsWith("/") ? rawSupabaseUrl : `${rawSupabaseUrl}/`;
}

function getSupabaseKey() {
  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for backend.");
  }

  return supabaseKey;
}

function formatFilterValue(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `(${value.map((entry) => String(entry)).join(",")})`;
  }

  return String(value);
}

function buildQueryString({ columns = "*", filters = {}, order, limit, offset } = {}) {
  const params = new URLSearchParams();
  params.set("select", columns);

  for (const [field, value] of Object.entries(filters)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "op" in value
    ) {
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

async function supabaseRequest(
  pathname,
  {
    method = "GET",
    query,
    body,
    preferCount = false,
    preferRepresentation = false,
    returnHeaders = false,
  } = {}
) {
  const url = new URL(pathname, getSupabaseBaseUrl());
  if (query) {
    url.search = query.toString();
  }

  const headers = {
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

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload =
    method === "HEAD" ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? payload.message ?? payload.error_description ?? payload.error
        : null;
    throw new Error(message || `Supabase request failed with ${response.status}.`);
  }

  if (returnHeaders) {
    return { payload, headers: response.headers };
  }

  return payload;
}

export async function selectRows(table, options = {}) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    query: buildQueryString(options),
  });

  return Array.isArray(payload) ? payload : [];
}

export async function selectSingleRow(table, options = {}) {
  const rows = await selectRows(table, {
    ...options,
    limit: 1,
  });

  return rows[0] ?? null;
}

export async function insertRow(table, values, { columns = "*" } = {}) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: buildQueryString({ columns }),
    body: values,
  });

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Supabase insert for ${table} did not return a row.`);
  }

  return payload[0];
}

export async function insertRows(table, values, { columns = "*" } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: buildQueryString({ columns }),
    body: values,
  });

  return Array.isArray(payload) ? payload : [];
}

export async function updateSingleRow(
  table,
  values,
  { filters = {}, columns = "*" } = {}
) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    query: buildQueryString({ columns, filters }),
    body: values,
  });

  if (!Array.isArray(payload)) {
    return null;
  }

  return payload[0] ?? null;
}

export async function countRows(table, { filters = {} } = {}) {
  const { headers } = await supabaseRequest(`/rest/v1/${table}`, {
    method: "HEAD",
    query: buildQueryString({
      columns: "id",
      filters,
      limit: 1,
    }),
    preferCount: true,
    returnHeaders: true,
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

export async function deleteRows(
  table,
  { filters = {}, columns = "*" } = {}
) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    query: buildQueryString({ columns, filters }),
    preferRepresentation: true,
  });

  return Array.isArray(payload) ? payload : [];
}
