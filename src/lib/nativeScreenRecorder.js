import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge to the native Android ScreenRecorder plugin (see android/.../ScreenRecorderPlugin.java).
// On web / iOS this plugin is absent, so every call below is guarded by isNativeScreenRecordingAvailable().
const ScreenRecorder = registerPlugin('ScreenRecorder');

export function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch (e) {
    return false;
  }
}

// Whether the native MediaProjection recorder can be used on this device.
export async function isNativeScreenRecordingAvailable() {
  if (!isNativePlatform()) return false;
  try {
    const { supported } = await ScreenRecorder.isSupported();
    return Boolean(supported);
  } catch (e) {
    return false;
  }
}

// Launches the system screen-capture consent dialog and begins recording if approved.
// Rejects if the user denies permission or recording cannot start.
export async function startNativeScreenRecording(options = {}) {
  return ScreenRecorder.start({
    bitrate: options.bitrate ?? 2_000_000,
    fps: options.fps ?? 12,
    maxDimension: options.maxDimension ?? 1280
  });
}

// Stops recording and returns the finished video as a Blob.
export async function stopNativeScreenRecording() {
  const result = await ScreenRecorder.stop();
  const mimeType = result?.mimeType || 'video/mp4';
  const blob = base64ToBlob(result?.base64 || '', mimeType);
  return { blob, mimeType, path: result?.path, size: result?.size };
}

export async function isNativeRecording() {
  if (!isNativePlatform()) return false;
  try {
    const { recording } = await ScreenRecorder.isRecording();
    return Boolean(recording);
  } catch (e) {
    return false;
  }
}

export function onNativeRecordingError(handler) {
  if (!isNativePlatform()) return () => {};
  const promise = ScreenRecorder.addListener('recordingError', (e) => handler(e?.message || 'Recording error'));
  return () => { promise.then((h) => h.remove()).catch(() => {}); };
}

function base64ToBlob(base64, mimeType) {
  if (!base64) return new Blob([], { type: mimeType });
  const byteChars = atob(base64);
  const sliceSize = 8192;
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
    const slice = byteChars.slice(offset, offset + sliceSize);
    const bytes = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      bytes[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(bytes));
  }
  return new Blob(byteArrays, { type: mimeType });
}
