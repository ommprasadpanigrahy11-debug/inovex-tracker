package com.inovex.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

import java.io.File;

/**
 * Foreground service that owns the MediaProjection + MediaRecorder for a sprint.
 *
 * Android requires screen capture to run inside a foreground service of type
 * mediaProjection, and on Android 14+ that service must be running before
 * MediaProjectionManager.getMediaProjection() is called. The service also posts
 * a persistent, user-visible notification for the whole duration of the capture
 * (required by the platform; the user can see and stop recording at any time).
 */
public class ScreenRecordService extends Service {

    private static final String TAG = "ScreenRecordService";
    private static final String CHANNEL_ID = "inovex_screen_recording";
    private static final int NOTIFICATION_ID = 5400;

    static final String ACTION_START = "com.inovex.tracker.START_RECORDING";
    static final String ACTION_STOP = "com.inovex.tracker.STOP_RECORDING";
    static final String EXTRA_RESULT_CODE = "resultCode";
    static final String EXTRA_RESULT_DATA = "resultData";
    static final String EXTRA_BITRATE = "bitrate";
    static final String EXTRA_FPS = "fps";
    static final String EXTRA_MAX_DIMENSION = "maxDimension";
    static final String EXTRA_OUTPUT_PATH = "outputPath";

    interface Listener {
        void onRecordingStopped(String path);
        void onRecordingError(String message);
    }

    private static Listener listener;
    private static boolean running = false;

    static void setListener(Listener l) {
        listener = l;
    }

    static boolean isRunning() {
        return running;
    }

    private MediaProjectionManager projectionManager;
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private MediaRecorder recorder;
    private String outputPath;
    private MediaProjection.Callback projectionCallback;

    @Override
    public void onCreate() {
        super.onCreate();
        projectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopRecording(null);
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        int bitrate = intent.getIntExtra(EXTRA_BITRATE, 2_000_000);
        int fps = intent.getIntExtra(EXTRA_FPS, 12);
        int maxDimension = intent.getIntExtra(EXTRA_MAX_DIMENSION, 1280);
        outputPath = intent.getStringExtra(EXTRA_OUTPUT_PATH);

        startAsForeground();

        try {
            startRecording(resultCode, resultData, bitrate, fps, maxDimension);
            running = true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            notifyError("Failed to start screen recording: " + e.getMessage());
            cleanup();
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Sprint Screen Recording",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while your screen is being recorded for a sprint.");
            nm.createNotificationChannel(channel);
        }

        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Sprint recording active")
                .setContentText("Your screen is being recorded for this sprint.")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setContentIntent(contentIntent)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startRecording(int resultCode, Intent resultData, int bitrate, int fps, int maxDimension) throws Exception {
        projection = projectionManager.getMediaProjection(resultCode, resultData);
        if (projection == null) {
            throw new IllegalStateException("MediaProjection was not granted");
        }

        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);

        int[] size = scaledSize(metrics.widthPixels, metrics.heightPixels, maxDimension);
        int width = size[0];
        int height = size[1];
        int density = metrics.densityDpi;

        recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? new MediaRecorder(this)
                : new MediaRecorder();
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        recorder.setVideoEncodingBitRate(bitrate);
        recorder.setVideoFrameRate(fps);
        recorder.setVideoSize(width, height);
        recorder.setOutputFile(outputPath);
        recorder.prepare();

        // Android 14+ requires a registered callback before creating the virtual display.
        projectionCallback = new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopRecording(null);
            }
        };
        projection.registerCallback(projectionCallback, null);

        virtualDisplay = projection.createVirtualDisplay(
                "InovexSprintCapture",
                width, height, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                recorder.getSurface(),
                null, null);

        recorder.start();
        Log.i(TAG, "Recording started: " + width + "x" + height + " @" + fps + "fps -> " + outputPath);
    }

    /** Scales the display down so its longest edge is at most maxDimension, keeping it even. */
    private int[] scaledSize(int w, int h, int maxDimension) {
        int longest = Math.max(w, h);
        double scale = longest > maxDimension ? (double) maxDimension / longest : 1.0;
        int sw = (int) Math.round(w * scale);
        int sh = (int) Math.round(h * scale);
        return new int[]{ sw - (sw % 2), sh - (sh % 2) };
    }

    private void stopRecording(String errorMessage) {
        String path = outputPath;
        boolean produced = false;
        try {
            if (recorder != null) {
                try {
                    recorder.stop();
                    produced = true;
                } catch (RuntimeException stopErr) {
                    // stop() throws if no frames were captured; the file is unusable
                    Log.w(TAG, "Recorder stop produced no valid output", stopErr);
                }
            }
        } finally {
            cleanup();
            running = false;
            stopForeground(true);
            stopSelf();
        }

        if (errorMessage != null) {
            notifyError(errorMessage);
        } else if (produced && path != null && new File(path).length() > 0) {
            if (listener != null) listener.onRecordingStopped(path);
        } else {
            notifyError("Recording produced no usable file");
        }
    }

    private void cleanup() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (recorder != null) {
            try { recorder.reset(); } catch (Exception ignored) {}
            recorder.release();
            recorder = null;
        }
        if (projection != null) {
            if (projectionCallback != null) {
                try { projection.unregisterCallback(projectionCallback); } catch (Exception ignored) {}
            }
            projection.stop();
            projection = null;
        }
        projectionCallback = null;
    }

    private void notifyError(String message) {
        Log.e(TAG, message);
        if (listener != null) listener.onRecordingError(message);
    }

    @Override
    public void onDestroy() {
        cleanup();
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
