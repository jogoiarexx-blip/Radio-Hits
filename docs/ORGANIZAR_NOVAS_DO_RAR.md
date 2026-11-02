# Organização automática de músicas recebidas — Radio Hits

## Objetivo
Transferir os áudios enviados pelo proprietário para `musicas/novas-do-rar/` à pasta com estilo correspondente, preservando os bytes dos arquivos e a compatibilidade com o catálogo do Radio Hits.

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

1. O GitHub detecta um novo envio para `musicas/novas-do-rar/`.
2. A action `Organizar músicas novas por estilo` executa `python tests/test_organizar_novas.py` e, na branch main, `python scripts/organizar_novas.py`.
3. A transferência usa movimentação de arquivos no checkout (sem conversão MP3/M4A e sem alterar os bytes).
4. A entrada antiga de `musicas/metadados.json` migra para o destino; artista, título e gênero são preenchidos com dados catalogados. Os perfis de volume, se existentes, também migram.
5. A action faz commit na branch `main` com os novos caminhos, solicita a execução do workflow de publicação e gera APK debug atualizado.
6. Faixas desconhecidas e arquivos com destinos já existentes permanecem na pasta original, com aviso nos logs. Nenhum arquivo existente é sobrescrito ou excluído por essa regra.
7. A organização pode ser repetida por `workflow_dispatch` sem criar movimentos duplicados.

### Atenção
A organização **não** estabelece autorização para distribuir músicas comerciais. `downloadAllowed` permanece false nas músicas movidas. O usuário deve confirmar os direitos de distribuição antes de tornar gravações públicas. A alteração de caminhos modifica IDs gerados por `scripts/gerar_catalogo.py`, portanto favoritos/filas salvos em clientes que tenham consumido estas faixas sob o caminho temporário podem precisar de atualização. As posições da rádio continuam ligadas ao catálogo atualizado e à sua ordem fixa; não há embaralhamento.

## Testes
`python tests/test_organizar_novas.py` verifica as 35 regras de correspondência, transferência sem alterações, integridade de arquivos existentes, preservação de metadados/perfis, conflitos e idempotência. Testes de integração e build são efetuados pelos workflows do repositório.
