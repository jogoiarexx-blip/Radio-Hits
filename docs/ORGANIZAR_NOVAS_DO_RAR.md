# Organização automática de novas músicas — Radio Hits

## Objetivo
Transferir os áudios enviados pelo proprietário tanto para `musicas/novas-do-rar/` quanto diretamente para a raiz de `musicas/` à pasta com estilo correspondente, preservando os bytes dos arquivos e a compatibilidade com o catálogo do Radio Hits.

## Destinos

| Pasta | Estilo | Exemplos |
|---|---|---|
| `as melhores 80 e 90/` | Anos 80 e 90, pop, new wave | a-ha, Madonna, Hanson, Rick Astley, Eros Ramazzotti, Toni Braxton, Tears for Fears |
| `rock/` | Rock, classic rock e soft rock | INXS, Joan Osborne, Crowded House, Red Hot Chili Peppers, Whitesnake |
| `dance/` | Dance, eurodance e freestyle | Vengaboys, Ice MC, Mr. President, Stevie B |
| `mpb/` | Música brasileira | ANAVITÓRIA |
| `pop/` | Pop contemporâneo | Jason Mraz, New West |
| `reggae/` | Reggae pop | MAGIC! |
| `country/` | Country e country pop | Luke Combs, Shania Twain |
| `romanticas/` | Baladas sem estilo confirmado | Glory of Love, Run to Me |
| `classicos/` | Clássicos antigos | Elvis Presley |

## Como funciona

1. O GitHub detecta um novo envio para `musicas/novas-do-rar/` ou um MP3/M4A na raiz de `musicas/`.
2. A action `Organizar músicas novas por estilo` executa `python tests/test_organizar_novas.py` e, na branch main, `python scripts/organizar_novas.py`.
3. A transferência usa movimentação de arquivos no checkout (sem conversão MP3/M4A e sem alterar os bytes).
4. A entrada antiga de `musicas/metadados.json` migra para o destino; artista, título e gênero são preenchidos com dados catalogados. Os perfis de volume, se existentes, também migram.
5. A action faz commit na branch `main` com os novos caminhos, solicita a execução do workflow de publicação e gera APK debug atualizado.
6. Faixas desconhecidas e arquivos com destinos já existentes permanecem na pasta original, com aviso nos logs. Nenhum arquivo existente é sobrescrito ou excluído por essa regra.
7. A organização pode ser repetida por `workflow_dispatch` sem criar movimentos duplicados.

### Atenção
A organização **não** estabelece autorização para distribuir músicas comerciais. `downloadAllowed` permanece false nas músicas movidas. O usuário deve confirmar os direitos de distribuição antes de tornar gravações públicas. A alteração de caminhos modifica IDs gerados por `scripts/gerar_catalogo.py`, portanto favoritos/filas salvos em clientes que tenham consumido estas faixas sob o caminho temporário podem precisar de atualização. As posições da rádio continuam ligadas ao catálogo atualizado e à sua ordem fixa; não há embaralhamento.

## Testes
`python tests/test_organizar_novas.py` verifica as 46 regras de correspondência, transferência sem alterações, integridade de arquivos existentes, preservação de metadados/perfis, conflitos e idempotência. Testes de integração e build são efetuados pelos workflows do repositório.

## Novas músicas recebidas na raiz — lote adicional (11 faixas)

| Música | Artista | Destino | Gênero |
|---|---|---|---|
| The Final Countdown | Europe | `rock/` | Rock |
| I Want to Know What Love Is | Foreigner | `rock/` | Rock |
| Iris | Goo Goo Dolls | `rock/` | Rock |
| Nothing Else Matters | Metallica | `rock/` | Rock |
| Smells Like Teen Spirit | Nirvana | `rock/` | Rock |
| Right Here Waiting | Richard Marx | `romanticas/` | Românticas |
| Awake and Alive | Skillet | `rock/` | Rock |
| Monster | Skillet | `rock/` | Rock |
| Hero | Skillet | `rock/` | Rock |
| Nothing's Gonna Stop Us Now | Starship | `as melhores 80 e 90/` | Anos 80 e 90 |
| Eye of the Tiger | Survivor | `rock/` | Rock |

As 6 faixas demonstrativas originalmente presentes na raiz de `musicas/` permanecem intactas. Arquivos desconhecidos não são movidos e aparecem como `REVISAR` nos logs. Arquivos de mídia não são reencodados: o Git mantém o mesmo blob SHA ao reconhecer a movimentação.

A classificação por estilo não garante que uma faixa esteja ausente da biblioteca; duplicatas devem ser verificadas antes de aceitar futuras importações. Publicação de mídia comercial requer a licença pertinente.
