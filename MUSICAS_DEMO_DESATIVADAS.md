# Músicas demonstrativas desativadas

As seguintes faixas criadas inicialmente para o Radio Hits foram **desativadas**, sem remoção dos MP3 originais do repositório:

- `musicas/horizonte-azul.mp3`
- `musicas/cidade-neon.mp3`
- `musicas/calma-de-outubro.mp3`
- `musicas/entre-ondas.mp3`
- `musicas/rota-noturna.mp3`
- `musicas/sol-de-vidro.mp3`

Cada faixa tem `"enabled": false` no arquivo `musicas/metadados.json`. A geração de `catalogo.json` ignora essas músicas, incluindo a programação de rádio, busca, gêneros, favoritos, playlists e downloads oferecidos pela interface. A pasta `musicas/` no Git conserva os arquivos por segurança; a publicação do site não copia essas faixas, nem gera as versões leves AAC correspondentes.

**As vinhetas da rádio são independentes e continuam ativas.** Todas as músicas enviadas posteriormente para outras pastas, incluindo Summer EletroHits, permanecem habilitadas.

Se futuramente quiser reativar uma das demos, altere `"enabled": true` em seu registro, regenere o catálogo e publique novamente. Favoritos antigos com IDs dessas demos ficam armazenados localmente, mas não aparecem na biblioteca enquanto não houver a faixa no catálogo.
