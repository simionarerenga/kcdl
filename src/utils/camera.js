// src/utils/camera.js
// Unified camera capture — uses Capacitor on mobile, file input on desktop/web

/**
 * Returns a base64 data URL string of the captured/selected image.
 * On Capacitor (Android/iOS): opens native camera.
 * On Electron / web: opens a file picker.
 */
export async function captureImage() {
  // ── Capacitor path ──────────────────────────────────────────────────────
  if (
    typeof window !== 'undefined' &&
    window.Capacitor &&
    window.Capacitor.isNativePlatform()
  ) {
    const { Camera, CameraResultType, CameraSource } = await import(
      '@capacitor/camera'
    );
    const photo = await Camera.getPhoto({
      quality: 60,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    return photo.dataUrl; // already "data:image/jpeg;base64,..."
  }

  // ── Web / Electron file-picker fallback ─────────────────────────────────
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Also support capture on mobile browser
    if (/Mobi|Android/i.test(navigator.userAgent)) {
      input.setAttribute('capture', 'environment');
    }
    input.onchange = () => {
      const file = input.files[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    };
    input.oncancel = () => reject(new Error('Cancelled'));
    input.click();
  });
}
