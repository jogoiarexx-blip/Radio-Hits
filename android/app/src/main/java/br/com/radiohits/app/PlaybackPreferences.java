package br.com.radiohits.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;

/** Preferências de som do Media3; compartilhadas entre Activity e serviço. */
final class PlaybackPreferences {
    private static final String PREF = "radiohits_native_audio_v1";
    static void save(Context ctx, double volume, boolean leveling) {
        ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit()
            .putFloat("masterVolume",(float)Math.max(0,Math.min(1,volume)))
            .putBoolean("leveling",leveling)
            .apply();
    }
    static float volumeFor(Context ctx, MediaItem item) {
        SharedPreferences prefs=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        double volume=prefs.getFloat("masterVolume",0.75f);
        Bundle extras=item==null?null:item.mediaMetadata.extras;
        double gain=prefs.getBoolean("leveling",true) && extras!=null
            ? extras.getDouble("radiohits_gain_db",0) : 0;
        if(!Double.isFinite(gain)) gain=0;
        gain=Math.max(-10,Math.min(0,gain));
        return (float)Math.max(0,Math.min(1,volume*Math.pow(10,gain/20)));
    }
    static void apply(Context ctx, Player player) {
        float target=volumeFor(ctx,player.getCurrentMediaItem());
        if(Math.abs(player.getVolume()-target)>.001f) player.setVolume(target);
    }
}
