package com.zoya.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.floatingactionbutton.FloatingActionButton;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private View pageLoader;
    private static final int PERMISSION_REQUEST_CODE = 1234;
    private static final String TAG = "ZoyaMain";
    private final OkHttpClient client = new OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build();
    
    // Gemini API Key: No longer needed in the APK as we use a backend proxy for security.
    // The key is now managed in AI Studio Settings.

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        pageLoader = findViewById(R.id.page_loader);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setSupportMultipleWindows(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Set a modern User Agent to ensure compatibility with Gemini Live API
        webSettings.setUserAgentString("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36");

        swipeRefresh.setOnRefreshListener(() -> {
            webView.reload();
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageLoader.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoader.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView Error: " + description + " (" + errorCode + ") for URL: " + failingUrl);
                pageLoader.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                // Show a user-friendly error page or a Toast
                Toast.makeText(MainActivity.this, "Connection Error: " + description, Toast.LENGTH_LONG).show();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep the app and auth flows inside the WebView
                // We use a custom User Agent to bypass Google's block
                if (url.contains("run.app") || url.contains("firebaseapp.com") || url.contains("google.com")) {
                    return false;
                }
                
                // Open other external links in the system browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                // Handle popups (like Google Login) inside the same WebView or a dialog
                // For simplicity and to maintain state, we'll try to load it in the same view
                // if it's an auth-related URL
                WebView.HitTestResult result = view.getHitTestResult();
                String data = result.getExtra();
                if (data != null && (data.contains("google.com") || data.contains("firebaseapp.com"))) {
                    view.loadUrl(data);
                    return false;
                }

                // Fallback: Open in a new "window" but keep it in the app if possible
                WebView newWebView = new WebView(MainActivity.this);
                newWebView.getSettings().setJavaScriptEnabled(true);
                newWebView.getSettings().setSupportMultipleWindows(true);
                newWebView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
                newWebView.getSettings().setDomStorageEnabled(true);
                newWebView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString());
                
                newWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url.contains("run.app") || url.contains("firebaseapp.com") || url.contains("google.com")) {
                            webView.loadUrl(url); // Load back in main view
                            return true;
                        }
                        return false;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                MainActivity.this.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        // Use the Shared App URL which is public and doesn't require Google Sign-in
        webView.loadUrl("https://ais-pre-f52mjptsf7gkx2qpse2dvp-434933623132.asia-east1.run.app");

        checkPermissions();
        setupFab();
        checkForUpdates();
    }

    private void setupFab() {
        FloatingActionButton fab = findViewById(R.id.fab_world_update);
        fab.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                fetchWorldUpdate();
            }
        });
        
        fab.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                // Clear cache and cookies on long press
                android.webkit.CookieManager.getInstance().removeAllCookies(null);
                webView.clearCache(true);
                webView.reload();
                Toast.makeText(MainActivity.this, "System Cache Cleared", Toast.LENGTH_SHORT).show();
                return true;
            }
        });
    }

    private void fetchWorldUpdate() {
        final ProgressDialog progressDialog = new ProgressDialog(this);
        progressDialog.setMessage("Syncing with Zoya Core...");
        progressDialog.setCancelable(false);
        progressDialog.show();

        // Use the current URL as base to handle redirects or custom domains correctly
        String baseUrl = webView.getUrl();
        if (baseUrl == null || baseUrl.isEmpty() || !baseUrl.contains("run.app")) {
            baseUrl = "https://ais-pre-f52mjptsf7gkx2qpse2dvp-434933623132.asia-east1.run.app";
        }
        
        // Ensure clean base URL without query strings
        if (baseUrl.contains("?")) baseUrl = baseUrl.split("\\?")[0];
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        
        final String apiUrl = baseUrl + "/api/world-update";
        
        // SYNC AUTH: Get current cookies from the WebView to pass it to the native request
        // This solves the "Cookie check" / "DOCTYPE HTML" error caused by bot protection
        String cookies = android.webkit.CookieManager.getInstance().getCookie(baseUrl);
        String userAgent = webView.getSettings().getUserAgentString();

        Request request = new Request.Builder()
                .url(apiUrl)
                .addHeader("User-Agent", userAgent)
                .addHeader("Cookie", cookies != null ? cookies : "")
                .addHeader("Referer", baseUrl + "/")
                .post(RequestBody.create(MediaType.parse("application/json"), "{}"))
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    String msg = e.getMessage();
                    if (msg.contains("follow-up")) {
                        msg = "Bot check loop detected. Please wait 10 seconds and try again.";
                        webView.reload();
                    }
                    Toast.makeText(MainActivity.this, "Connection Error: " + msg, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                final String responseData = response.body().string();
                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    if (response.isSuccessful()) {
                        try {
                            // First, check if the response looks like HTML (bot check)
                            if (responseData.toLowerCase().contains("<!doctype") || responseData.toLowerCase().contains("<html")) {
                                showWorldUpdateDialog("Security Check Required: Please interact with the app for 10 seconds and try again.\n\n(Zoya is verifying your connection)");
                                webView.reload(); // Refresh to ensure cookies are fresh
                                return;
                            }
                            
                            JSONObject jsonResponse = new JSONObject(responseData);
                            if (jsonResponse.has("text")) {
                                String text = jsonResponse.getString("text");
                                showWorldUpdateDialog("V3.0 - CORE SYNC\n\n" + text);
                            } else {
                                String error = jsonResponse.optString("error", "Configuration Required");
                                if (error.toLowerCase().contains("leaked")) {
                                    showWorldUpdateDialog("SECURITY ALERT: Your API Key was reported as LEAKED and disabled by Google.");
                                } else if (error.toLowerCase().contains("quota") || error.toLowerCase().contains("429")) {
                                    showWorldUpdateDialog("QUOTA EXCEEDED: The system's API key has hit its usage limit. Please wait or update the key in Admin Panel.");
                                } else {
                                    showWorldUpdateDialog(error);
                                }
                            }
                        } catch (JSONException e) {
                            if (responseData.toLowerCase().contains("leaked")) {
                                showWorldUpdateDialog("SECURITY ALERT: Your API Key was reported as LEAKED and disabled by Google.");
                            } else if (responseData.toLowerCase().contains("quota") || responseData.toLowerCase().contains("429")) {
                                showWorldUpdateDialog("QUOTA EXCEEDED: The system's API key has hit its usage limit.");
                            } else {
                                showWorldUpdateDialog("Sync Initialized: Please try once more in 5 seconds to complete the handshake.");
                            }
                            Log.e(TAG, "JSON Parse Error: " + e.getMessage());
                        }
                    } else if (response.code() >= 300 && response.code() < 400) {
                        // Manual redirect handling for Cloud Run security challenges
                        showWorldUpdateDialog("Security Handshake Required: Please refresh the app and wait 5 seconds before trying again.");
                        webView.reload();
                    } else if (response.code() == 400 || response.code() == 500) {
                        try {
                            JSONObject jsonResponse = new JSONObject(responseData);
                            String error = jsonResponse.optString("error", "Configuration Required: Please set the Global Gemini API Key in the Admin Panel.");
                            if (error.toLowerCase().contains("leaked")) {
                                showWorldUpdateDialog("SECURITY ALERT: Your API Key has been LEAKED and disabled by Google.\n\nPlease log in as Admin and set a NEW key in the Config tab.");
                            } else {
                                showWorldUpdateDialog(error);
                            }
                        } catch (Exception e) {
                            showWorldUpdateDialog("Configuration Required: Please log in as Admin (ID: 587311, Pass: admin123) and set the Global Gemini API Key in the Config tab.");
                        }
                    } else if (response.code() == 403 || response.code() == 401) {
                        showWorldUpdateDialog("Session Expired: Re-opening Zoya to refresh your session...");
                        webView.reload();
                    } else {
                        showWorldUpdateDialog("System Error (" + response.code() + "): " + response.message());
                    }
                });
            }
        });
    }

    private void showWorldUpdateDialog(String content) {
        new AlertDialog.Builder(this)
                .setTitle("World Awareness Update")
                .setMessage(content)
                .setPositiveButton("OK", null)
                .show();
    }

    private void checkForUpdates() {
        // Simple simulation of an auto-update check
        // In a real app, you would fetch a version JSON from your server/GitHub
        Log.d(TAG, "Checking for updates...");
        // If update found:
        // showUpdateDialog("https://example.com/zoya-latest.apk");
    }

    private void showUpdateDialog(final String apkUrl) {
        new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage("A new version of Zoya is available. Would you like to upgrade now?")
                .setPositiveButton("Upgrade", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialogInterface, int i) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
                        startActivity(intent);
                    }
                })
                .setNegativeButton("Later", null)
                .show();
    }

    private void checkPermissions() {
        String[] permissions = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.WRITE_CONTACTS,
            Manifest.permission.READ_CALENDAR,
            Manifest.permission.WRITE_CALENDAR,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.WRITE_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION
        };

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            // Add Android 13+ specific permissions
            String[] tPermissions = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS
            };
            String[] combined = new String[permissions.length + tPermissions.length];
            System.arraycopy(permissions, 0, combined, 0, permissions.length);
            System.arraycopy(tPermissions, 0, combined, permissions.length, tPermissions.length);
            permissions = combined;
        } else {
            // Add legacy storage permissions
            String[] legacyPermissions = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
            String[] combined = new String[permissions.length + legacyPermissions.length];
            System.arraycopy(permissions, 0, combined, 0, permissions.length);
            System.arraycopy(legacyPermissions, 0, combined, permissions.length, legacyPermissions.length);
            permissions = combined;
        }

        boolean allGranted = true;
        for (String s : permissions) {
            if (ContextCompat.checkSelfPermission(this, s) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (!allGranted) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
