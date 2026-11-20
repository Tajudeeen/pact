export class AccessApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AccessApiError";
  }
}

type AccessApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
};

export async function accessApi<T>(
  path: string,
  options: AccessApiOptions = {},
): Promise<T> {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.startsWith("/api/")
  ) {
    throw new AccessApiError(
      "INVALID_ACCESS_PATH",
      "Pact Access requests must use a same-origin API path.",
      0,
    );
  }

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new AccessApiError(
      "ACCESS_API_UNAVAILABLE",
      "Pact Access could not reach its API. Check the deployment and try again.",
      0,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AccessApiError(
      "INVALID_ACCESS_API_RESPONSE",
      "Pact Access returned a response that wasn't valid JSON.",
      response.status,
    );
  }

  if (!response.ok) {
    const data =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    throw new AccessApiError(
      typeof data.code === "string" ? data.code : "ACCESS_REQUEST_FAILED",
      typeof data.message === "string"
        ? data.message
        : "Pact Access request failed.",
      response.status,
    );
  }

  return payload as T;
}
