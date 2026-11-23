package com.mangaTracker.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenOrientationPlugin")
class ScreenOrientationPlugin extends Plugin {
    @PluginMethod
    public void lock(PluginCall call) {
        getActivity().runOnUiThread(() ->
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)
        );
        call.resolve();
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        getActivity().runOnUiThread(() ->
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED)
        );
        call.resolve();
    }
}

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenOrientationPlugin.class);
        registerPlugin(ReaderPlugin.class);
        super.onCreate(savedInstanceState);
        applyStoredRotationLock();
    }

    // Der Reader-WebView liegt als Overlay ueber dieser Activity und hat daher
    // keine eigene Zurueck-Behandlung. Erst ihn fragen, dann normal weiter.
    @Override
    public void onBackPressed() {
        ReaderPlugin reader = null;
        try {
            if (getBridge() != null) {
                com.getcapacitor.PluginHandle handle = getBridge().getPlugin("ReaderWebView");
                if (handle != null && handle.getInstance() instanceof ReaderPlugin) {
                    reader = (ReaderPlugin) handle.getInstance();
                }
            }
        } catch (Exception ignored) {
            // Bridge noch nicht bereit — dann gibt es auch keinen offenen Reader
        }
        if (reader != null && reader.handleBackPressed()) return;
        super.onBackPressed();
    }

    // Liest die lockRotation-Einstellung direkt aus SharedPreferences,
    // bevor JS geladen ist, und setzt die Orientierung sofort.
    private void applyStoredRotationLock() {
        try {
            SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String json = prefs.getString("app-settings", null);
            boolean locked = (json == null) || !json.contains("\"lockRotation\":false");
            setRequestedOrientation(locked
                ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } catch (Exception e) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
    }
}
