package com.sekkan.monitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Vibrator;
import android.util.Base64;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;

import io.socket.client.IO;
import io.socket.client.Socket;

public class ScreenCaptureService extends Service {
    private static final String TAG = "ScreenCaptureService";
    private static final String CHANNEL_ID = "SekkanCaptureChannel";
    private static final String SERVER_URL = "https://sekkan-screen-monitor.onrender.com";

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private Socket socket;
    private Handler mainHandler;

    private int screenWidth = 720;
    private int screenHeight = 1280;
    private int screenDensity = 320;
    private long lastFrameTime = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        int resultCode = intent.getIntExtra("resultCode", -1);
        Intent resultData = intent.getParcelableExtra("data");
        String studentName = intent.getStringExtra("studentName");
        String roomCode = intent.getStringExtra("roomCode");

        screenWidth = intent.getIntExtra("width", 720);
        screenHeight = intent.getIntExtra("height", 1280);
        screenDensity = intent.getIntExtra("density", 320);

        // Iniciar servicio en primer plano con notificación
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Sekkan Monitor Activo")
                .setContentText("Transmitiendo pantalla escolar en vivo a tu profesor")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1001, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(1001, notification);
        }

        // Inicializar conexión Socket.io
        initSocket(studentName, roomCode);

        // Inicializar captura de pantalla
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm != null && resultData != null) {
            mediaProjection = mpm.getMediaProjection(resultCode, resultData);
            startScreenCapture();
        }

        return START_STICKY;
    }

    private void initSocket(String name, String room) {
        try {
            socket = IO.socket(SERVER_URL);
            socket.on("connect", args -> {
                Log.d(TAG, "Conectado al servidor en Render desde Android");
                try {
                    JSONObject joinData = new JSONObject();
                    joinData.put("roomId", room);
                    joinData.put("role", "student");
                    joinData.put("name", name + " (Android)");
                    socket.emit("join-room", joinData);
                    socket.emit("student-status", new JSONObject().put("status", "sharing"));
                } catch (Exception e) {
                    Log.e(TAG, "Error join-room", e);
                }
            });

            // Alerta del profesor
            socket.on("receive-warning", args -> {
                try {
                    JSONObject obj = (JSONObject) args[0];
                    String message = obj.optString("message", "El profesor solicita tu atención.");
                    mainHandler.post(() -> {
                        Toast.makeText(getApplicationContext(), "⚠️ " + message, Toast.LENGTH_LONG).show();
                        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        if (v != null) v.vibrate(500);
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Error warning", e);
                }
            });

            socket.connect();
        } catch (URISyntaxException e) {
            Log.e(TAG, "Error URL Socket", e);
        }
    }

    private void startScreenCapture() {
        // Escalar a 540p para optimizar ancho de banda y rendimiento en Android
        int captureWidth = 540;
        int captureHeight = (int) (540f * ((float) screenHeight / (float) screenWidth));
        // Dimensiones pares requeridas por ImageReader
        if (captureHeight % 2 != 0) captureHeight++;

        imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);
        virtualDisplay = mediaProjection.createVirtualDisplay(
                "SekkanCapture",
                captureWidth,
                captureHeight,
                screenDensity,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                null
        );

        imageReader.setOnImageAvailableListener(reader -> {
            Image image = null;
            try {
                image = reader.acquireLatestImage();
                if (image != null) {
                    long now = System.currentTimeMillis();
                    // Limitar a ~5-6 FPS para eficiencia de batería y datos
                    if (now - lastFrameTime >= 180 && socket != null && socket.connected()) {
                        lastFrameTime = now;
                        processAndSendImage(image, captureWidth, captureHeight);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error al procesar fotograma", e);
            } finally {
                if (image != null) image.close();
            }
        }, null);
    }

    private void processAndSendImage(Image image, int width, int height) {
        Image.Plane[] planes = image.getPlanes();
        ByteBuffer buffer = planes[0].getBuffer();
        int pixelStride = planes[0].getPixelStride();
        int rowStride = planes[0].getRowStride();
        int rowPadding = rowStride - pixelStride * width;

        Bitmap bitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
        );
        bitmap.copyPixelsFromBuffer(buffer);

        // Recortar padding si existía
        Bitmap cleanBitmap = Bitmap.createBitmap(bitmap, 0, 0, width, height);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        cleanBitmap.compress(Bitmap.CompressFormat.JPEG, 55, baos);
        byte[] bytes = baos.toByteArray();
        String base64 = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);

        try {
            JSONObject frameObj = new JSONObject();
            frameObj.put("frame", base64);
            socket.emit("screen-frame", frameObj);
        } catch (Exception e) {
            Log.e(TAG, "Error al enviar frame", e);
        }

        bitmap.recycle();
        cleanBitmap.recycle();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Sekkan Monitor Screen Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (virtualDisplay != null) virtualDisplay.release();
        if (imageReader != null) imageReader.close();
        if (mediaProjection != null) mediaProjection.stop();
        if (socket != null) {
            socket.disconnect();
            socket.close();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
