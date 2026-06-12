"use client";

export function getSupabaseLikeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : undefined;
    const details = "details" in error ? error.details : undefined;
    const hint = "hint" in error ? error.hint : undefined;

    for (const value of [message, details, hint]) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}
