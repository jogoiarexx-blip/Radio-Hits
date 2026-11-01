package br.com.radiohits.app;

/** Mesmo ciclo UTC de js/app.js: EPOCH = Date.UTC(2026,0,1). */
final class PlaybackClock {
    static final long EPOCH_MS = 1767225600000L;
    static final class Position {
        final int index;
        final long offsetMs;
        Position(int index, long offsetMs) { this.index=index; this.offsetMs=offsetMs; }
    }
    static Position at(long nowMs, long[] durationsMs) {
        if (durationsMs == null || durationsMs.length == 0) return null;
        long total=0;
        for (long duration : durationsMs) {
            if (duration <= 0 || duration > 24L*60*60*1000
                || total > Long.MAX_VALUE-duration) return null;
            total += duration;
        }
        long elapsed = Math.floorMod(nowMs - EPOCH_MS,total);
        for (int i=0;i<durationsMs.length;i++) {
            long duration=durationsMs[i];
            if (elapsed<duration || i==durationsMs.length-1)
                return new Position(i,Math.max(0,Math.min(elapsed,duration-50L)));
            elapsed -= duration;
        }
        return null;
    }
}
