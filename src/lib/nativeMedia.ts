/**
 * Native media helpers built on top of Capacitor's Camera, Filesystem and
 * Share plugins. All helpers fall back gracefully to browser APIs when the
 * app runs in the web (preview / PWA).
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** Pick an image from the camera (native) or fall back to a file input (web). */
export async function pickImage(options: { fromCamera?: boolean; quality?: number } = {}): Promise<File | null> {
  if (isNative()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: options.quality ?? 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: options.fromCamera ? CameraSource.Camera : CameraSource.Prompt,
      saveToGallery: false,
    });
    if (!photo.base64String) return null;
    const mime = `image/${photo.format || "jpeg"}`;
    const bin = atob(photo.base64String);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new File([buf], `photo-${Date.now()}.${photo.format || "jpg"}`, { type: mime });
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (options.fromCamera) input.setAttribute("capture", "environment");
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Share text/files via the native share sheet, falling back to Web Share. */
export async function shareContent(opts: { title?: string; text?: string; url?: string; files?: File[] }) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.title,
    });
    return;
  }
  if (navigator.share) {
    await navigator.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      files: opts.files,
    } as ShareData);
  }
}