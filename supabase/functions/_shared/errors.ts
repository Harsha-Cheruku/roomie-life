// Shared error-normalization helper for all edge functions.
// Converts unknown caught values into a stable string message and
// returns a JSON Response with consistent shape + logging.

export interface NormalizedError {
  message: string;
  name?: string;
  stack?: string;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const anyErr = error as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === "string") return { message: anyErr.message };
    if (typeof anyErr.error === "string") return { message: anyErr.error };
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: "Unknown error" };
    }
  }
  return { message: "Unknown error" };
}

export function logError(context: string, error: unknown): NormalizedError {
  const n = normalizeError(error);
  console.error(`[${context}]`, n.message, n.stack ?? "");
  return n;
}

export function errorResponse(
  context: string,
  error: unknown,
  corsHeaders: Record<string, string>,
  status = 500,
): Response {
  const n = logError(context, error);
  return new Response(JSON.stringify({ error: n.message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
