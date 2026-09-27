import { emptyMobileState, MOBILE_STATE_KEY, parseMobileState, serializeMobileState } from "./state.ts";
import type { MobileStateV1 } from "./types";

export interface MobileStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

async function resolveDefaultStorage(): Promise<MobileStorage> {
  const module = await import("@react-native-async-storage/async-storage");
  return module.default as MobileStorage;
}

export async function loadMobileState(storage?: MobileStorage): Promise<MobileStateV1> {
  try {
    const target = storage ?? (await resolveDefaultStorage());
    return parseMobileState(await target.getItem(MOBILE_STATE_KEY));
  } catch {
    return emptyMobileState();
  }
}

export async function saveMobileState(
  state: MobileStateV1,
  storage?: MobileStorage,
): Promise<void> {
  const target = storage ?? (await resolveDefaultStorage());
  await target.setItem(MOBILE_STATE_KEY, serializeMobileState(state));
}
