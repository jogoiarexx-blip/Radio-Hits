# RADIO HITS — Rádio sincronizada + biblioteca musical

Site musical estático criado para **GitHub Pages**, com dois modos: "Rádio" (todos na mesma faixa por horário) e "Explorar" (faixas sob demanda).

## O que já funciona

- Página responsiva para computadores e celulares; sem dependências externas, ícones vetoriais próprios.
- Modo rádio sincronizado pelo relógio UTC, com indicação da faixa atual e próximas músicas.
- Catálogo, busca por nome/artista, filtro de gênero e reprodução por demanda.
- Tocar, pausar, pular, retroceder, procurar trecho, ajustar volume, shuffle, repetição e fila (somente modo sob demanda).
- Favoritos e playlists salvos em **localStorage**, apenas no dispositivo/navegador.
- Seis faixas instrumentais **originais**, geradas especialmente para demonstração.
- Catálogo gerado pelo GitHub Actions em cada publicação, sem precisar cadastrar faixa por faixa manualmente.
- Progressive Web App básico e interface cacheável; arquivos de áudio **não** são baixados todos ao entrar no site.

## Publicar no GitHub (primeira vez)

1. Crie um **repositório público vazio**, por exemplo `Radio-Hits`, na sua conta GitHub.
2. Envie **todo o conteúdo desta pasta** para a raiz do repositório, incluindo a pasta oculta `.github/workflows`.
3. No repositório: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Acesse a aba **Actions** e verifique o fluxo `Publicar Radio Hits no GitHub Pages`. Se necessário, clique `Run workflow`.
5. Seu endereço será similar a `https://SEU-USUARIO.github.io/Radio-Hits/`.

**Não use `Deploy from a branch`** com esta versão se quiser que o catálogo seja atualizado automaticamente no Pages. A opção `GitHub Actions` é a indicada.

## Adicionar músicas ao catálogo

1. Envie seus arquivos `.mp3`, `.ogg`, `.m4a`, `.wav` para `musicas/` (subpastas também são suportadas).
2. Edite opcionalmente `musicas/metadados.json` para cadastrar título, artista, gênero e capa (o caminho da capa começa com `./assets/capas/`).
3. Faça o commit. O GitHub Actions lê os novos arquivos e gera `catalogo.json` para o site publicado. Não é necessário rodar `criar_demos.py`.

Exemplo de entrada em `musicas/metadados.json`:

```json
{
  "minha-musica.mp3": {
    "title": "Minha música",
    "artist": "Meu artista",
    "genre": "Rock",
    "cover": "./assets/capas/minha-capa.svg",
    "year": 2026
  }
}
```

A sequência do rádio segue a ordem das entradas presentes em `metadados.json`, e depois as outras músicas por nome. Se mudar nomes ou subir outros arquivos, os favoritos e playlists salvos com IDs antigos podem deixar de encontrá-los.

**Direitos autorais:** utilize somente arquivos de sua autoria, domínio público ou que você tenha autorização para disponibilizar para reprodução via web (inclusive rádio e on demand quando aplicável). Comprar ou possuir MP3 não autoriza automaticamente transmissão pública.

## Teste local

Dentro desta pasta execute:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000/` no navegador. Não abra o `index.html` diretamente via `file://`, porque o navegador poderá bloquear o carregamento do catálogo JSON.

Para regenerar manualmente o catálogo:

```bash
python3 -m pip install mutagen
python3 scripts/gerar_catalogo.py
```

Para gerar a mesma pasta usada no deploy: `python3 scripts/preparar_site.py`.

## Como a rádio funciona

**Atenção:** não é uma transmissão contínua real nem um servidor de rádio/DJ ao vivo. Todos que abrirem a mesma versão do site usam um ponto inicial fixo (1º jan. 2026, UTC) e a duração de cada arquivo para calcular a faixa atual e a posição correta. O site só baixa a música que estiver tocando. Relógios desajustados, buffering ou atualizações do catálogo podem gerar pequenas diferenças de sincronismo.

Para um DJ ao vivo real, servidor de streaming e backend seriam necessários, não são oferecidos pelo GitHub Pages.

## Limitações do GitHub Pages

- Site publicado: máximo de **1 GB**; fonte do repositório com limite recomendado de 1 GB.
- Tráfego: limite flexível de **100 GB/mês**, com possibilidade de 429/throttling, conforme GitHub Docs.
- Não usar como substituto de servidor/CDN de alto volume. O GitHub Pages é hospedagem estática, não um serviço de streaming dedicado.
- Evite arquivos individuais muito grandes (GitHub recusa arquivos acima de 100 MB via Git normal).
- Playlists e favoritos não sincronizam entre aparelhos e não existem contas de usuário nesta versão.

Documentação oficial: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Estrutura

```text
Radio-Hits/
├── index.html                # Interface
├── catalogo.json             # Catálogo local de demonstração, regenerado no deploy
├── css/style.css             # Tema responsivo
├── js/app.js                 # Player, rádio, biblioteca, favoritos, playlists
├── assets/capas/*.svg        # Capas originais
├── musicas/*.mp3             # Áudios hospedados no próprio GitHub Pages
├── musicas/metadados.json    # Metadados editáveis
├── scripts/gerar_catalogo.py # Varredura automática de áudios
├── scripts/preparar_site.py  # Geração do dist/ no deploy
└── .github/workflows/        # Publicação GitHub Pages
```

Demos originais: o script `scripts/criar_demos.py` é opcional e utiliza `numpy` e `ffmpeg` para refazer os arquivos de demonstração. Não é executado durante a publicação.
