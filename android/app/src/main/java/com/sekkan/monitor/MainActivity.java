package com.sekkan.monitor;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.textfield.TextInputEditText;

public class MainActivity extends AppCompatActivity {
    private static final int REQUEST_MEDIA_PROJECTION = 1002;
    private static final int REQUEST_PERMISSIONS = 1003;

    private TextInputEditText etStudentName;
    private TextInputEditText etRoomCode;
    private TextView tvStatus;
    private Button btnStart;
    private Button btnStop;

    private MediaProjectionManager mediaProjectionManager;
    private boolean isSharing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        etStudentName = findViewById(R.id.etStudentName);
        etRoomCode = findViewById(R.id.etRoomCode);
        tvStatus = findViewById(R.id.tvStatus);
        btnStart = findViewById(R.id.btnStart);
        btnStop = findViewById(R.id.btnStop);

        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);

        btnStart.setOnClickListener(v -> checkPermissionsAndStart());
        btnStop.setOnClickListener(v -> stopSharing());

        requestAppPermissions();
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_PERMISSIONS);
            }
        }
    }

    private void checkPermissionsAndStart() {
        String name = etStudentName.getText() != null ? etStudentName.getText().toString().trim() : "";
        String room = etRoomCode.getText() != null ? etRoomCode.getText().toString().trim() : "";

        if (name.isEmpty()) {
            Toast.makeText(this, "Por favor ingresa tu nombre", Toast.LENGTH_SHORT).show();
            return;
        }
        if (room.isEmpty()) {
            Toast.makeText(this, "Por favor ingresa el código del aula", Toast.LENGTH_SHORT).show();
            return;
        }

        if (mediaProjectionManager != null) {
            startActivityForResult(mediaProjectionManager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == RESULT_OK && data != null) {
                startCaptureService(resultCode, data);
            } else {
                Toast.makeText(this, "Permiso de pantalla cancelado", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void startCaptureService(int resultCode, Intent data) {
        DisplayMetrics metrics = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(metrics);

        String name = etStudentName.getText().toString().trim();
        String room = etRoomCode.getText().toString().trim().toUpperCase();

        Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
        serviceIntent.putExtra("resultCode", resultCode);
        serviceIntent.putExtra("data", data);
        serviceIntent.putExtra("studentName", name);
        serviceIntent.putExtra("roomCode", room);
        serviceIntent.putExtra("width", metrics.widthPixels);
        serviceIntent.putExtra("height", metrics.heightPixels);
        serviceIntent.putExtra("density", metrics.densityDpi);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        isSharing = true;
        tvStatus.setText("🟢 Transmitiendo pantalla al profesor");
        tvStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_green));
        btnStart.setVisibility(View.GONE);
        btnStop.setVisibility(View.VISIBLE);

        Toast.makeText(this, "🟢 Transmisión iniciada. Puedes usar tus apps escolares.", Toast.LENGTH_LONG).show();
        // Minimizar app para que el alumno trabaje en su celular
        moveTaskToBack(true);
    }

    private void stopSharing() {
        Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
        stopService(serviceIntent);

        isSharing = false;
        tvStatus.setText("● Transmisión detenida");
        tvStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_red));
        btnStart.setVisibility(View.VISIBLE);
        btnStop.setVisibility(View.GONE);

        Toast.makeText(this, "Transmisión detenida", Toast.LENGTH_SHORT).show();
    }
}
