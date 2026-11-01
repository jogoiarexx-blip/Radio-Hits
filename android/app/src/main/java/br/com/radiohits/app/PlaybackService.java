package br.com.radiohits.app;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Network;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/** Media3 permanece fora da WebView; snapshot e recuperacao vivem no servico. */
public final class PlaybackService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession session;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean restoring=false;
    private boolean waitingForNetwork=false;
    private boolean retryScheduled=false;
    private int attempts=0;
    private long playbackStableSince=0;
    private int radioSyncTicks=0;
    private final Runnable periodicSave=new Runnable() {
        @Override public void run() {
            if(player!=null && !restoring) {
                PlaybackSnapshot.save(PlaybackService.this,player,false);
                if(++radioSyncTicks >= 3) {
                    radioSyncTicks=0;
                    synchronizeRadioClock();
                }
                if(player.isPlaying()) {
                    if(playbackStableSince==0) playbackStableSince=System.currentTimeMillis();
                    if(System.currentTimeMillis()-playbackStableSince>30_000L) attempts=0;
                }
            }
            handler.postDelayed(this,5000L);
        }
    };
    private final Runnable retryPlayback=() -> {
        retryScheduled=false;
        if(player==null || !player.getPlayWhenReady()) return;
        if(!hasValidatedNetwork()) {
            waitingForNetwork=true;
            return;
        }
        waitingForNetwork=false;
        player.prepare();
        player.play();
    };

    @Override public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this)
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL).build();
        player.addListener(new Player.Listener() {
            @Override public void onMediaItemTransition(MediaItem item,int reason) {
                resetRecovery();
                PlaybackPreferences.apply(PlaybackService.this,player);
                saveSnapshot(false);
            }
            @Override public void onIsPlayingChanged(boolean playing) {
                if(playing && playbackStableSince==0) playbackStableSince=System.currentTimeMillis();
                if(!playing) playbackStableSince=0;
                saveSnapshot(false);
            }
            @Override public void onPlayerError(PlaybackException error) {
                playbackStableSince=0;
                recoverIfTransient(error);
            }
            @Override public void onEvents(Player player,Player.Events events) {
                // Inclui seek, shuffle, repeat, pause e trocas por headset.
                saveSnapshot(false);
                if (!player.getPlayWhenReady()) {
                    waitingForNetwork=false;
                    handler.removeCallbacks(retryPlayback);
                    retryScheduled=false;
                }
            }
        });
        restoring=true;
        try { PlaybackSnapshot.restore(this,player); }
        finally { restoring=false; }
        PlaybackPreferences.apply(this,player);
        session = new MediaSession.Builder(this,player).build();
        monitorNetwork();
        handler.postDelayed(periodicSave,5000L);
    }

    /**
     * O player avança pela duracao real dos arquivos, mas a programação
     * da rádio avança pelo relógio UTC do catálogo. Corrige diferenças
     * superiores a 4 segundos ou faixa trocada fora de hora.
     */
    private void synchronizeRadioClock() {
        if(player==null || !player.isPlaying()
            || player.getPlaybackState()!=Player.STATE_READY) return;
        MediaItem current=player.getCurrentMediaItem();
        if(current==null || current.mediaMetadata.extras==null
            || !"radio".equals(current.mediaMetadata.extras.getString("radiohits_mode",""))) return;
        int count=player.getMediaItemCount();
        if(count<1 || count>1500) return;
        long[] durations=new long[count];
        for(int i=0;i<count;i++) {
            MediaItem item=player.getMediaItemAt(i);
            if(item.mediaMetadata.extras==null) return;
            durations[i]=item.mediaMetadata.extras.getLong("radiohits_duration_ms",0);
        }
        PlaybackClock.Position clock=PlaybackClock.at(System.currentTimeMillis(),durations);
        if(clock==null) return;
        long drift=Math.abs(player.getCurrentPosition()-clock.offsetMs);
        if(player.getCurrentMediaItemIndex()!=clock.index || drift>4000L) {
            player.seekTo(clock.index,clock.offsetMs);
        }
    }

    private void saveSnapshot(boolean sync) {
        if(player!=null && !restoring) PlaybackSnapshot.save(this,player,sync);
    }

    private void resetRecovery() {
        handler.removeCallbacks(retryPlayback);
        retryScheduled=false;
        waitingForNetwork=false;
        attempts=0;
        playbackStableSince=0;
    }

    private boolean hasValidatedNetwork() {
        try {
            if(connectivity==null) return false;
            Network net=connectivity.getActiveNetwork();
            NetworkCapabilities caps=net==null?null:connectivity.getNetworkCapabilities(net);
            return caps!=null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch(Exception ignored) { return false; }
    }

    private static boolean transientFailure(PlaybackException error) {
        for (Throwable cause=error;cause!=null;cause=cause.getCause()) {
            if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
                int code=((HttpDataSource.InvalidResponseCodeException)cause).responseCode;
                return PlaybackRetryPolicy.retryableHttp(code);
            }
        }
        return PlaybackRetryPolicy.retryableIoCode(error.errorCode);
    }

    private void recoverIfTransient(PlaybackException error) {
        if(player==null || !player.getPlayWhenReady() || !transientFailure(error)) return;
        if(attempts>=PlaybackRetryPolicy.maxRetries()) {
            // Sem loop infinito: apenas comando do usuario pode reiniciar
            // apos 4 falhas em rede ainda validada.
            if(!hasValidatedNetwork()) waitingForNetwork=true;
            return;
        }
        if(!hasValidatedNetwork()) {
            waitingForNetwork=true;
            return;
        }
        if(retryScheduled) return;
        long delay=PlaybackRetryPolicy.delayMs(attempts++);
        retryScheduled=true;
        handler.postDelayed(retryPlayback,delay);
    }

    private void monitorNetwork() {
        connectivity=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
        if(connectivity==null) return;
        networkCallback=new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                if(!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return;
                handler.post(() -> {
                    if(waitingForNetwork && player!=null && player.getPlayWhenReady()) {
                        waitingForNetwork=false;
                        attempts=0;
                        recoverNow();
                    }
                });
            }
        };
        try { connectivity.registerDefaultNetworkCallback(networkCallback); }
        catch (Exception ignored) { networkCallback=null; }
    }

    private void recoverNow() {
        handler.removeCallbacks(retryPlayback);
        retryScheduled=false;
        if(player!=null && player.getPlayWhenReady()) {
            player.prepare();
            player.play();
        }
    }

    @Override @Nullable public MediaSession onGetSession(MediaSession.ControllerInfo info) {
        return session;
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        saveSnapshot(true);
        if(player!=null && player.isPlaying()) return;
        stopSelf();
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(periodicSave);
        handler.removeCallbacks(retryPlayback);
        if(connectivity!=null && networkCallback!=null) {
            try { connectivity.unregisterNetworkCallback(networkCallback); }
            catch(Exception ignored) { }
        }
        saveSnapshot(true);
        if(session!=null) {session.release();session=null;}
        if(player!=null) {player.release();player=null;}
        super.onDestroy();
    }
}
