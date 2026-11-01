package br.com.radiohits.app;

/** Testes executaveis de verdade com javac/java, sem emulador. */
public final class PlaybackRecoveryCheck {
    private static void check(boolean condition,String message) {
        if(!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        long start=PlaybackClock.EPOCH_MS;
        long[] tracks={60000L,125000L,90000L};
        PlaybackClock.Position p=PlaybackClock.at(start,tracks);
        check(p.index==0 && p.offsetMs==0,"inicio da radio");
        p=PlaybackClock.at(start+60000L,tracks);
        check(p.index==1 && p.offsetMs==0,"troca de faixa");
        p=PlaybackClock.at(start+60000L+25000L,tracks);
        check(p.index==1 && p.offsetMs==25000,"offset");
        p=PlaybackClock.at(start+275000L,tracks);
        check(p.index==0 && p.offsetMs==0,"ciclo completo");
        p=PlaybackClock.at(start-1000L,tracks);
        check(p.index==2 && p.offsetMs==89000L,"relogio antes de epoch");
        p=PlaybackClock.at(start+60000L-3L,tracks);
        check(p.index==0 && p.offsetMs==59950L,"margem final");
        check(PlaybackClock.at(start,new long[]{1,0,3})==null,"duracao invalida");
        check(PlaybackRetryPolicy.maxRetries()==4,"retentativas limitadas");
        check(PlaybackRetryPolicy.delayMs(0)==2000L,"retry inicial");
        check(PlaybackRetryPolicy.delayMs(3)==20000L,"retry final");
        check(PlaybackRetryPolicy.delayMs(4)==-1L,"sem loop infinito");
        check(!PlaybackRetryPolicy.retryableHttp(404),"404 permanente");
        check(PlaybackRetryPolicy.retryableHttp(408),"timeout transitório");
        check(PlaybackRetryPolicy.retryableHttp(429),"rate limit transitório");
        check(PlaybackRetryPolicy.retryableHttp(503),"falha de servidor transitória");
        check(!PlaybackRetryPolicy.retryableHttp(401),"sem retry em autenticacao");
        check(PlaybackRetryPolicy.retryableIoCode(2001),"io recuperavel");
        check(!PlaybackRetryPolicy.retryableIoCode(2004),"HTTP precisa do status real");
        check(!PlaybackRetryPolicy.retryableIoCode(2005),"arquivo ausente nao recuperavel");
        check(!PlaybackRetryPolicy.retryableIoCode(2006),"permissao negada nao recuperavel");
        check(!PlaybackRetryPolicy.retryableIoCode(3001),"decoder nao recuperavel");
        System.out.println("RECOVERY JVM OK: relogio radio e backoff finito.");
    }
}
