export function isAllowedBrowserRequest(
  request: Request,
  expectedOrigin: string,
  additionalOrigins?: string,
): boolean;

declare const worker: {
  fetch(request: Request, env: Record<string, string>): Promise<Response>;
};

export default worker;
