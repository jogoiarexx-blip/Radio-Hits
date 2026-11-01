package br.com.radiohits.app;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Abre o Radio Hits e entrega toda a reprodução a uma sessão Media3 nativa. */
public final class MainActivity extends Activity {
    private static final String SITE = "https://jogoiarexx-blip.github.io/Radio-Hits/";
    private static final String MUSIC = SITE + "musicas/";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private final ExecutorService downloader=Executors.newSingleThreadExecutor();
    private ListenableFuture<MediaController> future;
    private MediaController controller;
    private String waitingPlay = null;
    private String latestState = "{}";
    private double masterVolume = 0.75;
    private boolean levelingEnabled = true;

    private void applyNativeVolume() {
        if (controller == null) return;
        MediaItem item = controller.getCurrentMediaItem();
        Bundle extras = item == null ? null : item.mediaMetadata.extras;
        double gainDb = levelingEnabled && extras != null ?
            extras.getDouble("radiohits_gain_db", 0.0) : 0.0;
        if (!Double.isFinite(gainDb)) gainDb = 0.0;
        gainDb = Math.max(-10.0, Math.min(0.0, gainDb));
        // Volume do ExoPlayer varia de 0 a 1. Não amplificamos faixas baixas.
        controller.setVolume((float)Math.max(0.0,Math.min(1.0,
            masterVolume * Math.pow(10.0,gainDb/20.0))));
    }
    private boolean pageReady = false;
    private boolean forceOfflineShell = false;
    private int lastSongIndex = -1;
    private boolean lastPlaying = false;
    private String lastSongId = "";
    private final Runnable statusTick = new Runnable() {
        @Override public void run() {
            updateState();
            handler.postDelayed(this, 600);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0B0E13);
        getWindow().setNavigationBarColor(0xFF0B0E13);
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 99);
        }
        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0E13);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        // Bridge restrita à origem legítima e ao frame principal. Sem fallback
        // para addJavascriptInterface: este expõe métodos a iframes externos.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "RadioHitsNative",
                java.util.Collections.singleton("https://jogoiarexx-blip.github.io"),
                (view, message, sourceOrigin, isMainFrame, replyProxy) ->
                    onNativeMessage(message.getData(), sourceOrigin, isMainFrame, replyProxy));
        }
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();
                if ("https".equals(uri.getScheme()) &&
                    "jogoiarexx-blip.github.io".equalsIgnoreCase(uri.getHost()) &&
                    uri.getPath() != null && uri.getPath().startsWith("/Radio-Hits/"))
                    return false;
                if (url.startsWith("https://")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return offlineAsset(request.getUrl());
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest request,
                WebResourceError error) {
                if (request.isForMainFrame() && !forceOfflineShell) {
                    forceOfflineShell = true;
                    v.loadUrl(SITE + "index.html?native-offline=1");
                }
            }
            @Override public void onPageFinished(WebView v, String url) {
                pageReady = url.startsWith(SITE);
                updateState();
            }
        });
        setContentView(web);
        SessionToken token = new SessionToken(this,
            new ComponentName(this, PlaybackService.class));
        future = new MediaController.Builder(this, token).buildAsync();
        future.addListener(() -> {
            try {
                controller = future.get();
                controller.addListener(new Player.Listener() {
                    @Override public void onMediaItemTransition(MediaItem item, int reason) {
                        applyNativeVolume();
                        updateState();
                    }
                    @Override public void onIsPlayingChanged(boolean isPlaying) {
                        updateState();
                    }
                    @Override public void onPlaybackStateChanged(int state) {
                        updateState();
                    }
                    @Override public void onPlayerError(androidx.media3.common.PlaybackException error) {
                        updateState();
                    }
                });
                if (waitingPlay != null) {
                    String value = waitingPlay;
                    waitingPlay = null;
                    startQueue(value);
                }
                updateState();
            } catch (Exception e) {
                Toast.makeText(this, "Falha ao ligar o player Android", Toast.LENGTH_LONG).show();
            }
        }, this::runOnUiThread);
        web.loadUrl(SITE);
        handler.post(statusTick);
    }

    private boolean hasInternet() {
        try {
            ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
            if(cm==null || cm.getActiveNetwork()==null) return false;
            NetworkCapabilities caps=cm.getNetworkCapabilities(cm.getActiveNetwork());
            return caps!=null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch(Exception error) { return false; }
    }

    private WebResourceResponse offlineAsset(Uri uri) {
        if(!forceOfflineShell && hasInternet()) return null;
        String path=uri.getPath();
        if(!"https".equals(uri.getScheme()) ||
           !"jogoiarexx-blip.github.io".equalsIgnoreCase(uri.getHost()) ||
           path==null || !path.startsWith("/Radio-Hits/")) return null;
        String relative=path.substring("/Radio-Hits/".length());
        if(relative.isEmpty()) relative="index.html";
        if(relative.contains("..") || relative.contains("\\") || relative.startsWith("/")) return null;
        if(relative.startsWith("musicas/")) return null;
        String mime=relative.endsWith(".js")?"application/javascript":
            relative.endsWith(".css")?"text/css":
            relative.endsWith(".json")||relative.endsWith(".webmanifest")?"application/json":
            relative.endsWith(".svg")?"image/svg+xml":
            relative.endsWith(".png")?"image/png":
            relative.endsWith(".webp")?"image/webp":
            relative.endsWith(".html")?"text/html":"application/octet-stream";
        try {
            InputStream data;
            File cached = new File(getFilesDir(),"catalogo-offline.json");
            if(relative.equals("catalogo.json") && cached.isFile()) {
                data=new java.io.FileInputStream(cached);
            } else {
                data=getAssets().open("offline-site/"+relative);
            }
            return new WebResourceResponse(mime,"UTF-8",data);
        } catch(Exception ignored) { return null; }
    }

    private void sendOfflineEvent(String type,String url,int percent,String message) {
        JSONObject event=new JSONObject();
        try {
            event.put("type",type);
            event.put("url",url);
            event.put("percent",percent);
            event.put("message",message);
            handler.post(()->{
                if(web!=null && pageReady)
                    web.evaluateJavascript("window.RadioHitsOfflineEvent && window.RadioHitsOfflineEvent("+event.toString()+")",null);
            });
        } catch(Exception ignored) { }
    }

    private boolean approvedMusic(String url) {
        try {
            Uri uri = Uri.parse(url);
            return "https".equals(uri.getScheme()) &&
                "jogoiarexx-blip.github.io".equalsIgnoreCase(uri.getHost()) &&
                uri.getEncodedPath() != null &&
                uri.getEncodedPath().startsWith("/Radio-Hits/musicas/");
        } catch (Exception ignored) { return false; }
    }

    private void startQueue(String raw) {
        if (controller == null) { waitingPlay = raw; return; }
        try {
            JSONObject req = new JSONObject(raw);
            JSONArray tracks = req.optJSONArray("tracks");
            if (tracks == null || tracks.length() == 0 || tracks.length() > 1500) return;
            List<MediaItem> items = new ArrayList<>();
            String mode = req.optString("mode", "ondemand");
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject track = tracks.getJSONObject(i);
                String url = track.optString("src");
                if (!approvedMusic(url)) return;
                Bundle extra = new Bundle();
                extra.putString("radiohits_mode", mode);
                extra.putString("radiohits_url",url);
                double gainDb = track.optDouble("gainDb",0);
                if (!Double.isFinite(gainDb)) gainDb = 0.0;
                extra.putDouble("radiohits_gain_db",Math.max(-10,Math.min(0,gainDb)));
                MediaMetadata metadata = new MediaMetadata.Builder()
                    .setTitle(track.optString("title", "Música"))
                    .setArtist(track.optString("artist", "Radio Hits"))
                    .setAlbumTitle("radio".equals(mode) ? "Radio Hits — Rádio" : "Radio Hits")
                    .setExtras(extra).build();
                File local=OfflineStore.saved(this,url);
                items.add(new MediaItem.Builder()
                    .setMediaId(track.optString("id"))
                    .setUri(local!=null?Uri.fromFile(local):Uri.parse(url))
                    .setMediaMetadata(metadata).build());
            }
            int index = Math.max(0, Math.min(items.size()-1, req.optInt("index", 0)));
            long pos = Math.max(0, req.optLong("positionMs", 0));
            MediaItem now = controller.getCurrentMediaItem();
            boolean same = now != null && now.mediaId.equals(items.get(index).mediaId)
                && controller.getMediaItemCount() == items.size();
            // Uma playlist diferente pode ter a mesma quantidade de faixas.
            // Compare o conteúdo inteiro, inclusive URLs locais/online.
            if (same) {
                for (int i = 0; i < items.size(); i++) {
                    MediaItem previous = controller.getMediaItemAt(i);
                    MediaItem upcoming = items.get(i);
                    if (!previous.mediaId.equals(upcoming.mediaId)
                        || previous.localConfiguration == null
                        || upcoming.localConfiguration == null
                        || !previous.localConfiguration.uri.equals(upcoming.localConfiguration.uri)) {
                        same = false;
                        break;
                    }
                }
            }
            // No rádio, re-sincroniza o início ao relógio mesmo após pausa.
            if (!same || "radio".equals(mode)) {
                controller.setMediaItems(items, index, pos);
                controller.prepare();
            }
            controller.setRepeatMode("radio".equals(mode) || req.optBoolean("repeat")
                ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
            controller.setShuffleModeEnabled(req.optBoolean("shuffle", false) &&
                !"radio".equals(mode));
            masterVolume=Math.max(0.0,Math.min(1.0,req.optDouble("volume",0.75)));
            levelingEnabled=req.optBoolean("leveling",true);
            applyNativeVolume();
            controller.play();
            updateState();
        } catch (Exception ignored) { }
    }

    private void updateState() {
        if (controller == null) return;
        JSONObject status = new JSONObject();
        try {
            MediaItem item = controller.getCurrentMediaItem();
            boolean playing = controller.isPlaying();
            status.put("playing", playing);
            status.put("paused", !controller.getPlayWhenReady());
            status.put("id", item == null ? "" : item.mediaId);
            Uri mediaUri=item==null || item.localConfiguration==null ? null : item.localConfiguration.uri;
            status.put("isLocal",mediaUri!=null && "file".equalsIgnoreCase(mediaUri.getScheme()));
            status.put("src",mediaUri==null ? "" : mediaUri.toString());
            Bundle extras = item == null ? null : item.mediaMetadata.extras;
            status.put("mode", extras == null ? "" : extras.getString("radiohits_mode", ""));
            if(extras!=null && extras.getString("radiohits_url")!=null)
                status.put("src",extras.getString("radiohits_url"));
            status.put("position", controller.getCurrentPosition()/1000.0);
            status.put("duration", controller.getDuration() < 0 ? 0 : controller.getDuration()/1000.0);
            status.put("readyState", controller.getPlaybackState() == Player.STATE_READY ? 4 : 1);
            status.put("ended", controller.getPlaybackState() == Player.STATE_ENDED);
            status.put("index", controller.getCurrentMediaItemIndex());
            status.put("count", controller.getMediaItemCount());
            status.put("error", controller.getPlayerError() != null);
            latestState = status.toString();
            if (pageReady && web != null) {
                web.evaluateJavascript("window.RadioHitsAndroidState && window.RadioHitsAndroidState("+latestState+")", null);
            }
            lastSongIndex = controller.getCurrentMediaItemIndex();
            lastPlaying = playing;
            lastSongId = item == null ? "" : item.mediaId;
        } catch (Exception ignored) { }
    }

    /** Recebe somente mensagens do frame principal da origem Radio Hits. */
    private void onNativeMessage(String raw, Uri origin, boolean mainFrame,
        JavaScriptReplyProxy reply) {
        if (!mainFrame || origin == null ||
            !"https".equalsIgnoreCase(origin.getScheme()) ||
            !"jogoiarexx-blip.github.io".equalsIgnoreCase(origin.getHost()) ||
            (origin.getPort() != -1 && origin.getPort() != 443) ||
            raw == null || raw.length() > 2_000_100) return;
        try {
            JSONObject req = new JSONObject(raw);
            String method = req.optString("method", "");
            int id = req.optInt("id", -1);
            String value = req.optString("value", "");
            switch (method) {
                case "listDownloads":
                    respond(reply, id, OfflineStore.list(getApplicationContext()));
                    break;
                case "state":
                    respond(reply, id, latestState);
                    break;
                case "saveOffline":
                    if (value.length() > 8_192) return;
                    downloader.submit(() -> {
                        try {
                            DownloadWorker.enqueue(getApplicationContext(),value);
                        } catch (Exception ignored) { }
                    });
                    break;
                case "pauseOffline":
                    if (value.length() > 2048) return;
                    downloader.submit(() -> DownloadWorker.pause(getApplicationContext(),value));
                    break;
                case "deleteOffline":
                case "cancelOffline":
                    if (value.length() > 2048) return;
                    downloader.submit(() -> DownloadWorker.cancelAndDelete(getApplicationContext(),value));
                    break;
                case "listDownloadJobs":
                    downloader.submit(() -> {
                        try {
                            String jobs=DownloadWorker.jobs(getApplicationContext());
                            handler.post(() -> respond(reply,id,jobs));
                        } catch (Exception ignored) {
                            handler.post(() -> respond(reply,id,"[]"));
                        }
                    });
                    break;
                case "saveCatalog":
                    if (value.length() > 2_000_000) return;
                    JSONObject catalog = new JSONObject(value);
                    if (catalog.optJSONArray("tracks") == null) return;
                    File file = new File(getFilesDir(),"catalogo-offline.json");
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(value.getBytes(StandardCharsets.UTF_8));
                    }
                    break;
                case "playQueue":
                    if (value.length() > 1_000_000) return;
                    handler.post(() -> startQueue(value));
                    break;
                case "resume":
                    handler.post(() -> {
                        if (controller != null && controller.getMediaItemCount() > 0) {
                            controller.play();
                            updateState();
                        }
                    });
                    break;
                case "pause":
                    handler.post(() -> {
                        if (controller != null) { controller.pause(); updateState(); }
                    });
                    break;
                case "seek": {
                    double seconds = req.optDouble("value", 0);
                    if (!Double.isFinite(seconds) || seconds < 0) return;
                    handler.post(() -> {
                        if (controller != null && controller.getMediaItemCount() > 0) {
                            controller.seekTo(Math.min((long)(seconds * 1000), 86_400_000L));
                            updateState();
                        }
                    });
                    break;
                }
                case "volume": {
                    double volume = req.optDouble("value", 0.75);
                    if (!Double.isFinite(volume)) return;
                    handler.post(() -> {
                        masterVolume = Math.max(0,Math.min(1,volume));
                        applyNativeVolume();
                    });
                    break;
                }
                case "setLeveling": {
                    boolean enabled = req.optBoolean("value", true);
                    handler.post(() -> {
                        levelingEnabled = enabled;
                        applyNativeVolume();
                    });
                    break;
                }
                default:
                    // O método desconhecido não recebe permissões.
            }
        } catch (Exception ignored) {
            // Mensagens malformadas não chegam à camada privilegiada.
        }
    }

    private void respond(JavaScriptReplyProxy reply, int id, String value) {
        if (id < 0 || id > 100_000_000) return;
        try {
            reply.postMessage(new JSONObject().put("id", id)
                .put("value", value).toString());
        } catch (Exception ignored) { }
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true); // Minimizar não interrompe o áudio.
    }
    @Override protected void onDestroy() {
        handler.removeCallbacks(statusTick);
        if (web != null) { web.destroy(); web = null; }
        if (future != null) MediaController.releaseFuture(future);
        downloader.shutdown();
        super.onDestroy();
    }
}
