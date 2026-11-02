# Vinhetas femininas Radio Hits — programação 3×5

## Requisitos
- **110 músicas atuais** (podem aumentar) e uma vinheta **após cada cinco músicas**
- **Três versões alternadas:** Energia → Alto astral → Clássicos → Energia
- Locução **feminina brasileira**, sintetizada por `pt-BR-FranciscaNeural`, sem imitação de pessoas reais
- Trilha original de sintetizadores/bateria gerada por Python/Numpy, sem samples ou música comercial
- Batidas de 128, 132 e 124 BPM; efeito de subida, assinatura melódica, panorama estéreo e *ducking* da trilha sob a voz
- Tempo máximo 30 s por vinheta. Durações exatas vêm dos MP3 gerados, não de números hardcoded
- Preservar o relógio de sincronização UTC, a ordem das músicas e a fila Media3 do Android
- As vinhetas não aparecem em Explorar, playlists, favoritos, download nem biblioteca de 110 músicas

## Arquivos

| Versão | Arquivo | Chamada |
|---|---|---|
| Energia | `vinhetas/radio-hits-cada-5.mp3` | É sucesso atrás de sucesso! Você tá na Rádio Hits! Música boa, energia lá em cima! Rádio Hits, a sua frequência musical! |
| Alto astral | `vinhetas/radio-hits-alto-astral.mp3` | Aumenta o som! O melhor da música tá aqui! Rádio Hits! A trilha sonora dos seus melhores momentos! |
| Clássicos | `vinhetas/radio-hits-classicos.mp3` | Lembra daquela música? Aqui, os clássicos ganham vida de novo! Rádio Hits, a sua frequência musical! |

`scripts/gerar_vinheta.py` gera os três MP3 de forma determinística (instrumental) e com voz neural. `scripts/gerar_catalogo.py` insere os IDs `vinheta-radio-hits-001`, `002`, etc., rotacionando o caminho após cada bloco de cinco músicas. `scripts/verificar_catalogo.py` verifica a contagem e a ordem de 3 variantes. A allowlist de streaming Android permite exclusivamente esses três caminhos, preservando a restrição de download a `musicas/`.

## QA
`python tests/test_vinheta_audio.py` valida codecs, duração, pico, RMS, estéreo, variações distintas e ausência de trechos longos de silêncio.

`node tests/teste-vinheta.js` verifica a rotação a cada cinco músicas, IDs exclusivos, sincronismo UTC, o ciclo completo e a allowlist Android. Os workflows de publicação do site e APK já rodam essa verificação depois de regenerar o catálogo.

Ao atualizar o gerador, o workflow `gerar-vinheta.yml` publica as três peças e aciona a regeneração do catálogo/Pages e do APK. O arquivo `radio-hits-cada-5.mp3` mantém o nome antigo para evitar incompatibilidade.

## Considerações
As três faixas são versões de sintetizador, não uma gravação de locutora humana. A naturalidade pode variar conforme o serviço neural. Compilação, QA de áudio e publicação não substituem teste de escuta humana em navegador e celular físico. A duração alterada modifica a posição do ciclo no relógio UTC; todos os clientes devem recarregar o catálogo atualizado para permanecer sincronizados.
