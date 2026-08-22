const enabledValues = new Set(["1", "true", "enabled", "on"]);

/**
 * Explicit local/demo switch. Production keeps the fail-closed query adapters
 * unless this server-only flag is deliberately enabled.
 */
export function previewDataEnabled(): boolean {
  return enabledValues.has((process.env.YOUONE_PREVIEW_DATA ?? "").trim().toLowerCase());
}

