package br.com.radiohits.app;

public final class SleepTimerCheck {
    private static void require(boolean ok,String reason) {
        if(!ok) throw new AssertionError(reason);
    }
    public static void main(String[] args) {
        long start=1_800_000_000_000L;
        require(SleepTimerClock.validMinutes(15),"15 min");
        require(SleepTimerClock.validMinutes(30),"30 min");
        require(SleepTimerClock.validMinutes(60),"60 min");
        require(!SleepTimerClock.validMinutes(0),"sem tempo 0");
        require(!SleepTimerClock.validMinutes(1440),"tempo fora do limite");
        for(int minutes:new int[]{15,30,60}) {
            long end=SleepTimerClock.deadlineMs(start,minutes);
            require(end-start==minutes*60_000L,"duracao exata");
            require(!SleepTimerClock.expired(end-1L,end),"nao antecipar");
            require(SleepTimerClock.expired(end,end),"expirar ao atingir prazo");
            require(SleepTimerClock.remainingMs(end+10L,end)==0L,"restante nunca negativo");
        }
        require(!SleepTimerClock.expired(start,0),"desativado");
        require(SleepTimerClock.remainingMs(start,0)==0,"sem temporizador");
        boolean invalid=false;
        try {SleepTimerClock.deadlineMs(start,5);}catch(IllegalArgumentException e){invalid=true;}
        require(invalid,"recusar prazo inesperado");
        System.out.println("SLEEP TIMER OK: 15/30/60, contagem, cancelamento e expiracao.");
    }
}
