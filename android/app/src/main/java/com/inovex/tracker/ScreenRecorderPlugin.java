package com.inovex.tracker;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;

/**
 * Capacitor plugin exposing consent-gated screen recording to the web app.
 *
 * start() launches the system MediaProjection consent dialog. Recording only
 * begins if the user approves it; there is no way to capture the screen without
 * that per-session approval, and a persistent notification is shown throughout.
 */
@CapacitorPlugin(name = "ScreenRecorder")
public class ScreenRecorderPlugin extends Plugin {

    private PluginCall pendingStartCall;
    private int bitrate = 2_000_000;
    private int fps = 12;
    private int maxDimension = 1280;
    private String outputPath;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                && getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE) != null;
        ret.put("supported", supported);
        call.resolve(ret);
    }

    @PluginMethod
    public void isRecording(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("recording", ScreenRecordService.isRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (ScreenRecordService.isRunning()) {
            call.reject("A recording is already in progress");
            return;
        }

        bitrate = call.getInt("bitrate", 2_000_000);
        fps = call.getInt("fps", 12);
        maxDimension = call.getInt("maxDimension", 1280);

        File dir = new File(getContext().getCacheDir(), "sprint-recordings");
        if (!dir.exists()) dir.mkdirs();
        outputPath = new File(dir, "sprint_" + System.currentTimeMillis() + ".mp4").getAbsolutePath();

        MediaProjectionManager mpm = (MediaProjectionManager)
                getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            call.reject("Screen recording is not available on this device");
            return;
        }

        pendingStartCall = call;
        bridge.saveCall(call);
        Intent permissionIntent = mpm.createScreenCaptureIntent();
        startActivityForResult(call, permissionIntent, "onProjectionResult");
    }

    @ActivityCallback
    private void onProjectionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            pendingStartCall = null;
            call.reject("Screen recording permission was denied");
            return;
        }

        ScreenRecordService.setListener(new ScreenRecordService.Listener() {
            @Override
            public void onRecordingStopped(String path) {
                // Resolved later via stop(); nothing to do on the start call here.
            }

            @Override
            public void onRecordingError(String message) {
                notifyListeners("recordingError", new JSObject().put("message", message));
            }
        });

        Intent svc = new Intent(getContext(), ScreenRecordService.class);
        svc.setAction(ScreenRecordService.ACTION_START);
        svc.putExtra(ScreenRecordService.EXTRA_RESULT_CODE, result.getResultCode());
        svc.putExtra(ScreenRecordService.EXTRA_RESULT_DATA, result.getData());
        svc.putExtra(ScreenRecordService.EXTRA_BITRATE, bitrate);
        svc.putExtra(ScreenRecordService.EXTRA_FPS, fps);
        svc.putExtra(ScreenRecordService.EXTRA_MAX_DIMENSION, maxDimension);
        svc.putExtra(ScreenRecordService.EXTRA_OUTPUT_PATH, outputPath);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }

        pendingStartCall = null;
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        if (!ScreenRecordService.isRunning()) {
            call.reject("No recording is in progress");
            return;
        }

        ScreenRecordService.setListener(new ScreenRecordService.Listener() {
            @Override
            public void onRecordingStopped(String path) {
                try {
                    JSObject ret = new JSObject();
                    ret.put("path", path);
                    ret.put("mimeType", "video/mp4");
                    File f = new File(path);
                    ret.put("size", f.length());
                    // Base64 keeps the bridge dependency-free; the web layer turns it into a Blob.
                    ret.put("base64", readAsBase64(f));
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Failed to read recording: " + e.getMessage());
                } finally {
                    ScreenRecordService.setListener(null);
                }
            }

            @Override
            public void onRecordingError(String message) {
                ScreenRecordService.setListener(null);
                call.reject(message);
            }
        });

        Intent svc = new Intent(getContext(), ScreenRecordService.class);
        svc.setAction(ScreenRecordService.ACTION_STOP);
        getContext().startService(svc);
    }

    private String readAsBase64(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            int read;
            while (offset < bytes.length && (read = in.read(bytes, offset, bytes.length - offset)) != -1) {
                offset += read;
            }
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        }
    }
}
