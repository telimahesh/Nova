package com.zoya.app;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.util.Log;

public class MyAccessibilityService extends AccessibilityService {
    private static final String TAG = "ZoyaAccessibility";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // This is where you can handle accessibility events
        // For example, reading screen content or responding to user actions
        Log.d(TAG, "Event: " + event.toString());
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "Service Interrupted");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        Log.d(TAG, "Service Connected");
    }
}
