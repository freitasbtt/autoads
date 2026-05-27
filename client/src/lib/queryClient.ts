import { QueryClient, QueryFunction } from "@tanstack/react-query";

const CSRF_HEADER_NAME = "x-csrf-token";
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined) {
  csrfToken = typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
}

export function getCsrfToken() {
  return csrfToken;
}

export function captureCsrfTokenFromResponse(res: Response) {
  const token = res.headers.get(CSRF_HEADER_NAME);
  if (token && token.trim().length > 0) {
    setCsrfToken(token);
  }
}

export function buildCsrfHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers ?? {});
  if (csrfToken) {
    nextHeaders.set(CSRF_HEADER_NAME, csrfToken);
  }
  return nextHeaders;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const normalizedMethod = method.toUpperCase();
  const headers =
    data !== undefined
      ? buildCsrfHeaders({ "Content-Type": "application/json" })
      : buildCsrfHeaders();
  const res = await fetch(url, {
    method: normalizedMethod,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  captureCsrfTokenFromResponse(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });
    captureCsrfTokenFromResponse(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
