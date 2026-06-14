export function isMissingAllowanceEntriesTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  const details = "details" in error ? error.details : undefined;
  const hint = "hint" in error ? error.hint : undefined;
  const status = "status" in error ? error.status : undefined;
  const text = [message, details, hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "PGRST205" ||
    (status === 404 && text.includes("allowance_entries")) ||
    text.includes("public.allowance_entries") ||
    text.includes("allowance_entries")
  );
}
