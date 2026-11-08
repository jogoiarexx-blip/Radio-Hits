# Auditoria de novos áudios — 08/11/2026

## Resumo
- Biblioteca observada antes da organização: **151 músicas** e **3 arquivos físicos de vinheta**.
- **14 músicas soltas** na raiz de `musicas/`: classificadas abaixo.
- **0 duplicatas binárias exatas** pelo SHA Git entre os 151 áudios. Nomes/títulos repetidos podem representar versões diferentes; nenhum áudio foi excluído.
- **17 músicas Hip Hop** já tinham pasta e metadados adequados e foram preservadas.
- Seis demos originais mantidas na raiz.
- Correção adicional: **“Maniac” — Michael Sembello**, anteriormente atribuída incorretamente a Irene Cara.
- IDs das 14 músicas preservados no catálogo por `metadados.json:id`, mesmo com alteração do caminho.
- Perfis de volume (gain/luFS) movidos junto com as músicas; nenhum áudio foi recompactado.

| Música | Pasta |
|---|---|
| Bon Jovi — Wanted Dead or Alive | `musicas/rock/` |
| Eric Carmen — Hungry Eyes | `musicas/romanticas/` |
| Europe — Carrie | `musicas/rock/` |
| Guns N' Roses — Don't Cry | `musicas/rock/` |
| Guns N' Roses — Patience | `musicas/rock/` |
| Kansas — Carry On Wayward Son | `musicas/rock/` |
| Kenny Loggins — Danger Zone | `musicas/as melhores 80 e 90/` |
| Kenny Loggins — Footloose | `musicas/as melhores 80 e 90/` |
| Kim Carnes — Bette Davis Eyes | `musicas/as melhores 80 e 90/` |
| Limahl — The NeverEnding Story | `musicas/as melhores 80 e 90/` |
| Men at Work — Down Under | `musicas/as melhores 80 e 90/` |
| Simple Minds — Don't You (Forget About Me) | `musicas/as melhores 80 e 90/` |
| Skillet — Rise | `musicas/rock/` |
| Foghat — Slow Ride (Full Version) | `musicas/rock/` |

## Validação
A geração de `catalogo.json`, a verificação de arquivos e os testes de organização são executados nos workflows do GitHub Actions. A auditoria de blobs detecta duplicatas binárias exatas; não substitui comparação acústica, análise de direitos autorais ou escuta individual.

Não habilitar download público de gravações comerciais sem direitos explícitos de distribuição.
