import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import QuickCrypto from "react-native-quick-crypto";

export interface CapturedPhotoEvidence {
  uri: string;
  sha256: string;
  width: number;
  height: number;
  mimeType?: string;
}

function sha256Hex(value: string): string {
  return QuickCrypto.createHash("sha256").update(value).digest("hex");
}

export async function capturePhotoEvidence(
  taskId: string,
): Promise<CapturedPhotoEvidence | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Camera permission is required to capture task evidence.");
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 0.8,
    exif: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Bind the task id to the captured bytes so a receipt cannot be replayed
  // as evidence for a different Ground Relay task.
  const sha256 = sha256Hex(`ground-relay:v1:${taskId}:${base64}`);

  return {
    uri: asset.uri,
    sha256,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? undefined,
  };
}
