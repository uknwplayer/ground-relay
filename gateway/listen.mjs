export function resolveListenHost(env = process.env) {
  const configured = env.HOST?.trim();
  return configured || "0.0.0.0";
}
