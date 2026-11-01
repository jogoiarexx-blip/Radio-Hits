package br.com.radiohits.app;

/** Política finita: 4 tentativas temporizadas; após isso, aguardar reconexão. */
final class PlaybackRetryPolicy {
    private static final long[] DELAYS = {2000L,5000L,10000L,20000L};
    static int maxRetries() { return DELAYS.length; }
    static long delayMs(int retryIndex) {
        return retryIndex>=0 && retryIndex<DELAYS.length ? DELAYS[retryIndex] : -1L;
    }
    static boolean retryableHttp(int status) {
        return status==408 || status==425 || status==429 || status>=500 && status<=599;
    }
    static boolean retryableIoCode(int media3Code) {
        // Códigos 2000–2999 pertencem à família IO do Media3.
        return media3Code>=2000 && media3Code<3000;
    }
}
