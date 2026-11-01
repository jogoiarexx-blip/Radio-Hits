# Radio Hits REV 2.1 — bateria, segundo plano e QA longa duração

## Comparativo da REV 2.0 para a REV 2.1

| Sistema | Antes (2.0) | Depois (2.1) |
|---|---|---|
| Serviço Media3 pausado | Runnable acordava a cada 5 s e regravava snapshot mesmo em pausa | Pulso desativado quando não está reproduzindo; snapshot imediato ao pausar e nas mudanças relevantes |
| Serviço Media3 tocando | Snapshot a cada 5 s; verificação UTC a cada 15 s | Pulso a cada 15 s; mantém correção do relógio a cada 15 s e salva progresso no mesmo ciclo |
| Eventos nativos | Escrita em eventos genéricos do player | Gravação por eventos de seek, modo repeat, shuffle, playWhenReady ou alteração de linha do tempo |
| Activity oculta | Consultava estado a cada 600 ms mesmo fora da tela | WebView.onPause/onResume e ticker só no primeiro plano, a cada 1,2 s |
| Página PWA oculta | Atualizava UI de rádio repetidamente | Reduz renderização oculta; preserva o tick do relógio e avanço de faixa **na versão navegador**, que ainda depende do WebAudio/HTMLAudio |
| Diagnóstico de áudio | Nenhuma telemetria padronizada | 1 registro Logcat por minuto ativo, com contagem de transições, correções UTC, retries e heap Java aproximado |
| QA longo | Testes de transições e 64 faixas pontuais | Simulação de ciclo inteiro a cada 15 s, teste de primeiro/segundo plano e script de 4h07 com coleta ADB |

## Como certificar em um Android real

1. Ative a depuração USB e conecte o celular a um computador com ADB.
2. Instale o APK de **teste** correspondente à REV 2.1 (ou uma release de mesma assinatura).
3. Execute `DURATION_SEC=14820 INTERVAL_SEC=300 bash tools/qa_android_4h07.sh`.
4. Inicie a rádio no celular e pressione Enter no computador para começar o monitoramento.
5. Durante a sessão, alterne manualmente tela acesa/apagada, Bluetooth/fone, Wi-Fi/rede móvel. Anote horários de interrupção. O teste não injeta essas ações automaticamente.
6. Ao concluir, revise `radiohits-logcat.txt`, `memory-*.txt`, `cpu-*.txt`, `battery-*.txt` e `batterystats-final.txt`.

**Não foi executado ADB real nem 4h07 de música nesta revisão.** O comando grava dados na máquina do operador; apenas a simulação e os testes de contrato rodam no CI. `javaHeapMiB` não é PSS/RSS nem mede o uso total do aparelho — consulte o `dumpsys meminfo` coletado. Nenhum valor de economia de bateria é estimado sem comparar as medições reais em condições equivalentes.

## Pendências

- Certificar um celular com 2 GiB de RAM e um de capacidade moderna.
- Confirmar o comportamento quando o Android impõe restrições de bateria e em caso de perda do dispositivo de saída Bluetooth.
- Comparar percentuais reais de CPU/energia e PSS entre 2.0/2.1 com mesmas músicas, volume, rede e brilho.
- Validar uma sessão integral 4h07 e o retorno após morte do processo.
- APK release assinado depende do mesmo keystore anterior para atualizar sem desinstalação.
- A documentação de direitos de mídia segue pendente de comprovação.
