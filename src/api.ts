export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers:
      options.body === undefined ? {} : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.code ?? "REQUEST_FAILED",
      data.message ?? "Request failed.",
      response.status,
    );
  return data;
}
export const short = (value: string) =>
  value.length > 20 ? value.slice(0, 7) + "…" + value.slice(-5) : value;
export const usd = (value: string | number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
export const price = (value: string) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
