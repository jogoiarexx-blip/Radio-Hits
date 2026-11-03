package br.com.radiohits.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Snapshot da fila Media3 no processo do serviço, independente da WebView.
 * Apenas URLs HTTP(S) do catálogo próprio são persistidas. Nunca guardamos
 * caminhos file: externos; ao recuperar, revalidamos cada download local.
 */
final class PlaybackSnapshot {
    private static final String PREF = "radiohits_player_snapshot_v1";
    private static final String KEY = "session";
    private static final int MAX_TRACKS = 1500;

    static boolean save(Context ctx, Player player, boolean sync) {
        if (player.getMediaItemCount()==0) return false;
        try {
            JSONArray tracks = new JSONArray();
            String mode = "ondemand";
            for (int i=0;i<player.getMediaItemCount();i++) {
                MediaItem item = player.getMediaItemAt(i);
                Bundle extra = item.mediaMetadata.extras;
                String url=extra==null?"":extra.getString("radiohits_url","");
                if (!OfflineStore.validStreamUrl(url)) return false;
                if (i==0 && extra!=null) mode=extra.getString("radiohits_mode","ondemand");
                JSONObject t=new JSONObject();
                t.put("id",item.mediaId);
                t.put("url",url);
                t.put("title",String.valueOf(item.mediaMetadata.title==null?"Música":item.mediaMetadata.title));
                t.put("artist",String.valueOf(item.mediaMetadata.artist==null?"Radio Hits":item.mediaMetadata.artist));
                t.put("gainDb",extra==null?0:extra.getDouble("radiohits_gain_db",0));
                 t.put("durationMs",extra==null?0:extra.getLong("radiohits_duration_ms",0));
                 t.put("epochMs",extra==null?PlaybackClock.EPOCH_MS:extra.getLong("radiohits_epoch_ms",PlaybackClock.EPOCH_MS));
                 t.put("scheduleRevision",extra==null?"legacy":extra.getString("radiohits_schedule_revision","legacy"));
                tracks.put(t);
                if (tracks.length()>MAX_TRACKS) return false;
            }
            JSONObject snapshot=new JSONObject();
            snapshot.put("version",1);
            snapshot.put("mode","radio".equals(mode)?"radio":"ondemand");
            snapshot.put("tracks",tracks);
            snapshot.put("index",Math.max(0,player.getCurrentMediaItemIndex()));
            snapshot.put("positionMs",Math.max(0,player.getCurrentPosition()));
            snapshot.put("shuffle","radio".equals(mode)?false:player.getShuffleModeEnabled());
            snapshot.put("repeat",player.getRepeatMode());
            snapshot.put("timestampMs",System.currentTimeMillis());
            SharedPreferences.Editor editor=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE)
                .edit().putString(KEY,snapshot.toString());
            if (sync) return editor.commit();
            editor.apply();
            return true;
        } catch (Exception ignored) { return false; }
    }

    static boolean restore(Context ctx, Player player) {
        String raw=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(KEY,null);
        if (raw==null || raw.length()>1_000_000) return false;
        try {
            JSONObject data=new JSONObject(raw);
            if (data.optInt("version")!=1) return false;
            JSONArray tracks=data.optJSONArray("tracks");
            if(tracks==null || tracks.length()==0 || tracks.length()>MAX_TRACKS) return false;
            String mode=data.optString("mode","ondemand");
            if(!"radio".equals(mode) && !"ondemand".equals(mode)) return false;
            List<MediaItem> items=new ArrayList<>();
            long[] durations=new long[tracks.length()];
            for(int i=0;i<tracks.length();i++) {
                JSONObject t=tracks.getJSONObject(i);
                String url=t.getString("url");
                String id=t.getString("id");
                if(!OfflineStore.validStreamUrl(url) || id.isEmpty() || id.length()>256) return false;
                long duration=t.optLong("durationMs",0);
                if("radio".equals(mode) && (duration<=0 || duration>86_400_000)) return false;
                durations[i]=duration;
                double gain=t.optDouble("gainDb",0);
                if(!Double.isFinite(gain)) gain=0;
                Bundle extras=new Bundle();
                extras.putString("radiohits_mode",mode);
                extras.putString("radiohits_url",url);
                extras.putDouble("radiohits_gain_db",Math.max(-10,Math.min(0,gain)));
                extras.putLong("radiohits_duration_ms",duration);
                 long epochMs=t.optLong("epochMs",PlaybackClock.EPOCH_MS);
                 if(epochMs<1577836800000L || epochMs>4102444800000L) epochMs=PlaybackClock.EPOCH_MS;
                 extras.putLong("radiohits_epoch_ms",epochMs);
                 extras.putString("radiohits_schedule_revision",t.optString("scheduleRevision","legacy"));
                MediaMetadata metadata=new MediaMetadata.Builder()
                    .setTitle(t.optString("title","Música"))
                    .setArtist(t.optString("artist","Radio Hits"))
                    .setAlbumTitle("radio".equals(mode)?"Radio Hits — Rádio":"Radio Hits")
                    .setExtras(extras).build();
                File local=OfflineStore.saved(ctx,url);
                items.add(new MediaItem.Builder()
                    .setMediaId(id)
                    .setUri(local==null?Uri.parse(url):Uri.fromFile(local))
                    .setMediaMetadata(metadata).build());
            }
            int index=Math.max(0,Math.min(items.size()-1,data.optInt("index",0)));
            long positionMs=Math.max(0,Math.min(86_400_000L,data.optLong("positionMs",0)));
            if("radio".equals(mode)) {
                long epochMs=tracks.getJSONObject(0).optLong("epochMs",PlaybackClock.EPOCH_MS);
                 PlaybackClock.Position live=PlaybackClock.at(System.currentTimeMillis(),durations,epochMs);
                if(live==null) return false;
                index=live.index;
                positionMs=live.offsetMs;
            }
            // Restaura pausado: nao inicia audio inesperadamente depois de kill.
            player.pause();
            player.setMediaItems(items,index,positionMs);
            player.setRepeatMode("radio".equals(mode)
                ? Player.REPEAT_MODE_ALL
                : data.optInt("repeat",Player.REPEAT_MODE_OFF));
            player.setShuffleModeEnabled("ondemand".equals(mode) && data.optBoolean("shuffle",false));
            player.prepare();
            player.pause();
            return true;
        } catch(Exception ignored) { return false; }
    }
}
