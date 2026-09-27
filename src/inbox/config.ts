declare const process: {
  env: {
    EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL?: string;
  };
};

function normalizeGatewayBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (!parsed.hostname) return undefined;

  return trimmed.replace(/\/+$/, "");
}

export function resolveGatewayBaseUrl(value?: string): string | undefined {
  return normalizeGatewayBaseUrl(
    value === undefined
      ? process.env.EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL
      : value,
  );
}
