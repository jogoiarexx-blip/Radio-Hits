# Radio Hits REV 1.8 — Downloads Android persistentes

## Alterações reais

- RH-004: substituído o executor da Activity para downloads por `WorkManager 2.12.0`.
- Uma tarefa única por URL, persistente no agendador Android, com restrição de rede
  e retry exponencial de até cinco novas tentativas. O trabalho pode ser retomado
  pelo sistema após a morte do processo, sujeito às políticas de bateria/rede.
- Download mantém `.part` e `If-Range`/validador HTTP quando disponíveis.
  Se o servidor não oferecer validador, o arquivo é reiniciado do zero para evitar mistura.
- Arquivo salvo somente após checagem de tamanho informado e renomeação final;
  limite de 95 MiB por faixa e avaliação preliminar de espaço livre.
- Site e ponte nativa: botões **Pausar**, **Retomar** e **Cancelar**;
  a interface consulta o estado das tarefas mesmo após reabrir o app.
- Compatibilidade web e APK 1.7: os controles novos só aparecem quando o APK oferece
  a API de fila; navegadores continuam usando Cache Storage.
- APK atualizado para versionCode 9/versionName 1.8. Workflows fazem `assembleDebug`
  e testes novos/anteriores. Cache da interface invalidado em `sw.js`.

## Limites e verificações honestas

- As tarefas usam WorkManager e não um DownloadService em primeiro plano;
  o Android pode adiar downloads sob economia de energia ou de dados.
- A retomada parcial depende de `ETag` forte ou `Last-Modified` e suporte
  HTTP Range. A perda de rede não faz o arquivo parcial ser tratado como completo.
- Integridade local: tamanho do Content-Length/Content-Range quando disponível.
  **Checksum SHA-256 por faixa não está disponível**, porque o catálogo não
  fornece hashes verificados de cada arquivo publicado.
- Pausa/cancelamento ficam registrados no dispositivo, mas o processamento
  pode levar alguns segundos para parar uma requisição em bloqueio de leitura.
- Testes de CI verificam código, contratos e compilação; **não substituem**
  modo avião, reinício, 20 downloads ou upgrade no mesmo aparelho físico.
- Direitos das músicas permanecem não certificados (RH-002).
- Em caso de erro permanente de rede, a fila deixa de tentar após o limite e
  o botão de download pode ser acionado novamente; mensagens detalhadas
  de falha e histórico de jobs ainda não são exibidos ao usuário.

## Plano próximo

RH-005: persistir e restaurar a fila, o índice, o offset e o modo da reprodução
nativa após morte do processo; preservar a sincronização da rádio pelo relógio.
