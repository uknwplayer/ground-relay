export interface LocalEvidenceReference {
  uri: string;
}

export interface EvidenceDeleteOptions {
  idempotent: true;
}

export type EvidenceFileDeleter = (
  uri: string,
  options: EvidenceDeleteOptions,
) => Promise<void>;

async function deleteWithExpo(
  uri: string,
  options: EvidenceDeleteOptions,
): Promise<void> {
  const FileSystem = await import("expo-file-system/legacy");
  await FileSystem.deleteAsync(uri, options);
}

export async function discardCapturedEvidence(
  evidence: LocalEvidenceReference | undefined,
  deleteFile: EvidenceFileDeleter = deleteWithExpo,
): Promise<boolean> {
  if (!evidence?.uri) return false;

  await deleteFile(evidence.uri, { idempotent: true });
  return true;
}
