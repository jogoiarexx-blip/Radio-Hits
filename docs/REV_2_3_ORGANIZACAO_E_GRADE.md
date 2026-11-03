# Radio Hits REV 2.3 — organização musical, grade curada e sincronização

**Data:** 03/11/2026  
**Escopo:** Six uploads M4A em `musicas/`, biblioteca, curadoria, navegação e contrato UTC entre JS/Media3.

## Diagnóstico anterior
- 110 músicas + 22 entradas de vinheta (uma a cada cinco músicas); 132 posições no ciclo e duração aproximada de 7h24.
- O gerador organizava a **rádio na mesma ordem de inclusão dos metadados**. Havia seis demos consecutivas da mesma autoria, duas músicas seguidas do Toto, três do 50 Cent, entre outras repetições.
- `js/app.js` atualizava o `radioOrder` imediatamente, mesmo com o modo rádio tocando. Isso poderia causar saltos de faixa após uma publicação.
- O `EPOCH` estava escrito separadamente em JS e no relógio Java, sem revisão explícita da programação.
- A mensagem de atualização contabilizava também vinhetas como músicas.
- Seis novos M4A de música religiosa estavam soltos na raiz `musicas/`, sem identificação de gênero em diretórios.

## Melhorias implementadas
1. `scripts/organizar_novas.py`: seis regras explícitas adicionais (52 no total) classificam o lote na pasta `musicas/religiosas/`, sem transcodificar ou sobrescrever; metadados e perfis de volume acompanham o movimento. **Só foram verificados hashes Git diferentes**, o que não exclui duplicatas acústicas de gravações distintas.
2. Para `Eu Seguirei (Ao Vivo)` e `Eu Te Levantarei`, o artista não é inventado: a rotina preserva metadados existentes ou aceita tags internas caso existam. Conferência humana do crédito ainda é necessária.
3. `scripts/programar_radio.py`: curadoria reproduzível (não aleatória por usuário), usando identidade de faixa, histórico recente de artistas, alternância de gêneros e preferência por gêneros com mais faixas ainda não programadas. A ordem da biblioteca (Explorar) é preservada; apenas a transmissão é reorganizada.
4. `scripts/gerar_catalogo.py`: emite `radioSchedule` com revisão SHA-256 truncada, epoch UTC e contagens. Mantém exatamente **uma vinheta depois de cada cinco músicas**, com os três MP3 alternados.
5. `js/app.js`: usa epoch da revisão; congela a programação de uma transmissão **enquanto ela está tocando**, de modo que atualizar o catálogo não troque a música em execução. Ao pausar e reiniciar a rádio, o ouvinte adere à programação recém-publicada. A busca de faixas da grade usa um mapa por ID, em vez de varreduras repetidas.
6. `MainActivity.java`, `PlaybackService.java`, `PlaybackClock.java`, `PlaybackSnapshot.java`: transportam e persistem epoch/revisão no player Media3 e no snapshot, preservando o contrato do relógio na retomada Android.
7. O contador na mensagem `Biblioteca atualizada` ignora `isJingle`, mantendo o total de músicas correto. O `Explorar` reconhece a pasta **Música Religiosa**. Cache web incrementado para v19 e APK debug para versão 2.3 (versionCode 14).
8. Testes: `tests/test_programacao.py` (permutação, repetição e ordem independente do upload), `tests/test_organizar_novas.py`, `tests/teste-grade-atualizacao.js`, `tests/teste-radio-64.js`, `tests/teste-vinheta.js`, `tests/teste-explorar-pastas.js`, `tests/PlaybackRecoveryCheck.java`. Rodam nos workflows relevantes.

## Matriz antes/depois

| Subsistema | Antes | Depois | Limites de certificação |
|---|---|---|---|
| Organização dos uploads | 6 músicas religiosas sem pasta | Classificação para `religiosas/` e gênero consistente | Registros/tags de artista pendentes em 2 gravações |
| Programação | Agrupamento por artista/gênero | Curadoria determinística com penalidades a repetições | É necessário escutar a sequência completa para avaliação editorial |
| Sincronização | Mesmo epoch hardcoded em dois locais | Epoch e revisão enviados no catálogo e Media3 | Mudança de ciclo após publicação ainda não possui ativação global agendada |
| Atualização da biblioteca | Rádio podia trocar de faixa no refresh | Grade em reprodução congelada até nova entrada manual | Clientes que entram depois usam a nova grade; coexistência temporária é possível |
| Vinhetas | 3 variações após 5 faixas | Mesmo intervalo, com IDs e URLs existentes | Não foi implementado crossfade para evitar romper relógio UTC |
| UX | Contador incluía vinhetas na atualização | Contagem apenas de músicas | QA em aparelhos físicos pendente |
| Android | VersionCode 13 / app 2.2 | VersionCode 14 / app 2.3 | Assinatura release depende de secrets já configurados |

## Como validar
- `python tests/test_organizar_novas.py`
- `python tests/test_programacao.py`
- `python scripts/analisar_volume.py` (quando há novos arquivos)
- `python scripts/gerar_catalogo.py`
- `python scripts/verificar_catalogo.py`
- `node tests/teste-grade-atualizacao.js`
- `node tests/teste-radio-64.js`
- `node tests/teste-vinheta.js`
- `node tests/teste-explorar-pastas.js`
- `javac -d /tmp/radiohits-recovery android/app/src/main/java/br/com/radiohits/app/PlaybackClock.java android/app/src/main/java/br/com/radiohits/app/PlaybackRetryPolicy.java tests/PlaybackRecoveryCheck.java && java -cp /tmp/radiohits-recovery br.com.radiohits.app.PlaybackRecoveryCheck`

**Automação:** o workflow `organizar-novas.yml` faz commit das transferências no `main` com os arquivos originais sem recomprimir; em seguida dispara regeneração do catálogo/site e do APK.

## Pendências reais
1. Não há ensaio de escuta integral nem QA com tela bloqueada, rede móvel e Bluetooth em Android físico nesta revisão.
2. O novo cronograma é identificado por revisão, mas **não tem publicação em uma data de corte global**: participantes com grades distintas podem divergir temporariamente. O congelamento evita o salto local, não substitui agendamento coordenado de uma nova grade.
3. Não há crossfade DSP real nem certificação de loudness integral; permanecem pré-carga e atenuação baseadas em 35 segundos de áudio para cada música.
4. Não foi fornecida comprovação verificável de licença pública/redistribuição para os áudios comerciais. Distribuição via GitHub Pages ou download exige direitos adequados.
5. A hospedagem de áudio em GitHub Pages deve ser substituída por uma CDN/serviço apropriado se houver muitos ouvintes.
6. APK release assinado depende da configuração existente dos segredos do repositório; a compilação debug não substitui assinatura persistente.
