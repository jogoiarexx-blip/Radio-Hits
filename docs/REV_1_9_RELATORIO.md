# Radio Hits — REV 1.9: recuperação de sessão e reprodução

Data: 31/10/2026 (código da revisão, testes do CI na integração).

## Antes x depois

| Área | REV 1.8 (antes) | REV 1.9 (código implementado) |
|---|---|---|
| Sessão | MediaSessionService criava player vazio quando processo morria | Snapshot da fila/index/posição é salvo pelo próprio PlaybackService e restaurado ao criar o serviço |
| Música local | File URI anterior podia ficar obsoleto | Cada URL é revalidada; URI de arquivo privado é recalculada ao restaurar |
| Rádio | Restaurar offset antigo quebraria sincronização | Restauro recalcula faixa/posição do ciclo UTC 2026-01-01, com durações do catálogo |
| Play após morte | Sem política | Restauro pausado, sem áudio inesperado; o usuário pode retomar |
| Volume | Ajuste aplicado pela Activity | Preferências de volume/atenuação disponíveis ao serviço, inclusive sem Activity |
| Rede | Erro só atualizava estado | Erros transitórios de IO / HTTP 408, 425, 429, 5xx podem gerar até 4 retries temporizados; espera rede validada quando offline |
| Erro permanente | Toast a cada atualização de estado | Sem retry de 404/401/codec; JS emite erro apenas quando código muda |
| UI da fila | Podia voltar ao catálogo padrão | Queue IDs e índice sincronizados com Media3 restaurado |

## Testes disponíveis

- Execução real Java (sem Android): `tests/PlaybackRecoveryCheck.java`
  valida relógio, fronteiras de troca de faixa, loop e limites de retentativas.
- Contrato de integração: `node tests/teste-recuperacao-android.js`.
- Regressões existentes: clock da rádio, 64 faixas, volume, UI e offline.
- Build Android: `assembleDebug` no GitHub Actions; release assinado só com secrets.

## Limitações importantes

1. Restauro é **pausado**, por decisão de segurança/experiência; não promete
   continuar automaticamente um áudio após força de encerramento.
2. Só são restauradas URLs do próprio catálogo; se o catálogo mudar ou o
   download local for removido, o serviço volta para a URL online validada.
3. A precisão do relógio nativo usa `Math.round(duration * 1000)`; possíveis
   diferenças submilissegundo não foram medidas em celular.
4. Rede pode ser adiada pelo Android; 4 retries não equivalem à garantia de
   10 minutos contínuos sem internet. O retorno de rede validada pode
   disparar nova tentativa quando o serviço está vivo e aguardando rede.
5. Ainda **não** foram certificados: teste físico de morte de processo, troca
   para rede móvel, Bluetooth e bloqueio de tela, 64 faixas/4h07 sem interrupção,
   transições com diferenças de duração reais e bateria/RAM.
6. A REV 1.9 não resolve RH-002: direitos de mídia sem documentação.
7. Release assinado exige keystore privada; não desinstalar versões debug
   anteriores sem proteger dados.

## Próxima etapa recomendada

QA Android físico e instrumentação das transições (RH-011), caso as rotas
básicas já sejam estáveis, seguido por limites de memória do PWA (RH-008).
