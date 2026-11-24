import { BiometryType } from "@aparajita/capacitor-biometric-auth";

// User-facing name for the device's primary biometry type. "Biometric unlock" is the fallback
// for a type this app doesn't have a specific label for yet (iris, or a future Android type).
export function biometryLabel(biometryType) {
  switch (biometryType) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint unlock";
    case BiometryType.faceAuthentication:
      return "Face unlock";
    default:
      return "Biometric unlock";
  }
}

export function biometricLockStorageKey(authUserId) {
  return `vh2o-biometric-lock:${authUserId}`;
}
