// src/utils/storage.js
// Uses @capacitor/preferences on native, localStorage on web/electron

const isCapacitorNative =
  typeof window !== 'undefined' &&
  window.Capacitor &&
  window.Capacitor.isNativePlatform();

export async function storageGet(key) {
  if (isCapacitorNative) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function storageSet(key, value) {
  if (isCapacitorNative) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function storageRemove(key) {
  if (isCapacitorNative) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}
