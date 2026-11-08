package br.com.radiohits.app;

/** Cálculos do temporizador, sem dependências Android. */
public final class SleepTimerClock {
    private SleepTimerClock() {}
    public static boolean validMinutes(int minutes) {
        return minutes == 15 || minutes == 30 || minutes == 60;
    }
    public static long deadlineMs(long nowMs, int minutes) {
        if (!validMinutes(minutes) || nowMs < 0L)
            throw new IllegalArgumentException("Temporizador inválido");
        return nowMs + minutes * 60_000L;
    }
    public static boolean expired(long nowMs, long deadlineMs) {
        return deadlineMs > 0L && nowMs >= deadlineMs;
    }
    public static long remainingMs(long nowMs, long deadlineMs) {
        return deadlineMs <= 0L ? 0L : Math.max(0L, deadlineMs - nowMs);
    }
}
