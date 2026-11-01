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
        // Só erro IO genérico, conexão falha ou timeout.
        // Bad HTTP é classificado pelo status real; arquivo ausente, permissão
        // negada e conteúdo inválido são falhas permanentes.
        return media3Code==2000 || media3Code==2001 || media3Code==2002;
    }
}
