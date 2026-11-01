# AUDITORIA TÉCNICA — RADIO HITS v1.6

**Data:** 31/10/2026  
**Repositório:** https://github.com/jogoiarexx-blip/Radio-Hits  
**Site:** https://jogoiarexx-blip.github.io/Radio-Hits/  
**Referência auditada:** branch \`main\`, commit \`7e645840f1d6e99330f53be3693670b0a77a41f1\`  
**Escopo:** PWA/website, APK Android, player, streaming, rádio sincronizada, downloads, offline, UI/UX, segurança, testes, CI/CD, desempenho e comparação com soluções open source.  
**Natureza:** auditoria estática de arquivos + consulta aos resultados públicos de CI + comparação documentada. **Não houve instalação num celular real nem reprodução integral de todas as músicas nesta auditoria.** Este MD é um plano/checklist; os itens marcados como pendentes NÃO foram implementados por esta entrega.

---

## 1. Resumo executivo

**Conclusão:** o Radio Hits já é um player funcional com diferenciais reais (rádio de ordem fixa sincronizada por relógio, biblioteca e favoritos, PWA, APK com Media3/ExoPlayer em segundo plano, downloads individuais, artes próprias e atenuação de volume por faixa). A arquitetura é válida para uma biblioteca pequena, mas ainda **não está certificada como aplicativo de música robusto para uso diário sem internet**.

**As 5 prioridades reais:**
1. **P0 — Distribuição/atualização de APK:** parar de depender de \`assembleDebug\` assinado com chaves efêmeras de CI e criar assinatura de release persistente, sem obrigar a desinstalação que pode apagar downloads.
2. **P0 — Offline e downloads:** downloads Android sem pausa/retomada, sem fila durável e sem verificação criptográfica; downloads web carregam blobs inteiros em RAM. Implementar gerenciador robusto e testes de rede interrompida.
3. **P0 — Segurança e licenças:** revisar \`addJavascriptInterface\` (exposição em todos os frames), os controles de origem da WebView e **validar os direitos de distribuição pública e download das gravações comerciais** antes de crescer o catálogo.
4. **P1 — Retomada e erros:** persistir fila/música/posição nativamente e implementar retry com backoff e estado de buffering/offline. Hoje a recuperação após morte do processo é insuficiente.
5. **P1 — QA real:** testar no navegador e em aparelhos Android com Wi‑Fi desligado, Bluetooth, bloqueio de tela, 4h+ de reprodução, reconexão e atualizações entre versões.

**Decisão de produto:** manter a **rádio em ordem fixa e sincronizada** como o usuário estabeleceu. Shuffle, crossfade e ordem por horário NÃO devem alterar a rádio nesta etapa; se oferecidos, devem ficar restritos à biblioteca pessoal.

## 2. Inventário verificado

| Indicador | Situação na referência |
|---|---:|
| Arquivos de áudio no GitHub | **64** |
| Músicas no \`catalogo.json\` | **64** |
| IDs únicos / posições na ordem da rádio | **64 / 64** |
| Tempo total informado pelos metadados | **14.836,454 s = 4h 07min 16,454 s** |
| Espaço dos arquivos de áudio | **245.128.769 bytes = 233,77 MiB** |
| Formatos | **54 MP3 + 10 M4A** |
| Rock | **11 músicas / 47min 37,7s** |
| Hip Hop | **17 músicas / 1h 15min 45,3s** |
| Anos 80 e 90 | **14 músicas / 59min 55,9s** |
| Malhação 2003 | **16 músicas / 1h 01min 09,3s** |
| Instrumentais de demonstração | **6 músicas / 2min 48,3s** |
| Volume estimado | **64/64 perfis medidos; 47 atenuados; 17 sem atenuação; referência −13,7 LUFS** |
| Compatibilidade mínima declarada no Gradle | **Android 8.0 (API 26)** |
| Versão Android | **1.6 / versionCode 7** |
| APK último build conhecido | **GitHub Actions concluído com sucesso**, rodada \`40983498072\` |
| Publicação última conhecida | **GitHub Actions concluído com sucesso**, rodada \`40983833158\` |
| Licença de código no GitHub | **Arquivo LICENSE ausente / licença não declarada na API do repositório** |

**Observação:** embora o catálogo ainda inclua \`downloadAllowed: true\` em 6 faixas e \`false\` nas demais, o código atual de \`js/app.js\` e \`js/offline.js\` oferece o botão **Baixar para as 64 músicas**. É uma inconsistência de modelo de dados. O botão técnico não é prova de licença para redistribuição.

### 2.1 Evidências verificáveis

- [Execução CI do site](https://github.com/jogoiarexx-blip/Radio-Hits/actions/runs/40983833158): compilação/publicação e verificações marcadas como sucesso.
- [Compilação Android v1.6](https://github.com/jogoiarexx-blip/Radio-Hits/actions/runs/40983498072): \`assembleDebug\` e disponibilização do APK concluídas.
- [Catálogo](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/catalogo.json), [gerador](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/scripts/gerar_catalogo.py) e [verificação](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/scripts/verificar_catalogo.py).
- [Player web](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/js/app.js), [armazenamento web](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/js/offline.js), [player Android](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/android/app/src/main/java/br/com/radiohits/app/MainActivity.java) e [serviço Media3](https://github.com/jogoiarexx-blip/Radio-Hits/blob/main/android/app/src/main/java/br/com/radiohits/app/PlaybackService.java).

## 3. O que está bom — preservar

| Subsistema | Evidência no código | Decisão |
|---|---|---|
| Reprodução Android nativa | \`PlaybackService\` usa \`MediaSessionService\` e \`ExoPlayer\`, com \`WAKE_MODE_LOCAL\`, atributos de música e tratamento de áudio desconectado | Preservar Media3. Não voltar a tocar pelo WebView em segundo plano. |
| Rádio sincronizada | \`getRadioInfo()\` calcula faixa e posição usando horário, durações e ordem fixa do catálogo | Preservar; melhorar precisão e falhas sem alterar a lógica de ordem. |
| Biblioteca gerada automaticamente | \`scripts/gerar_catalogo.py\` percorre áudios, extrai duração e publica dados | Manter com testes incrementais e IDs estáveis. |
| Downloads explícitos | \`js/offline.js\` com Cache Storage e \`OfflineStore.java\` com arquivos privados; opção de remoção | Evoluir para transações duráveis, retomada e integridade. |
| Sem amplificação positiva | \`gainDb\` entre −10 e 0 dB e ajuste no web/Media3 | Preservar; melhorar medição e transições de volume. |
| Pré-carregamento web | Segundo elemento \`audio\` prepara próxima faixa perto dos 25 segundos finais | Manter como otimização best effort, não prometer continuidade offline. |
| Interface | Temas escuros, capas temáticas SVG, busca, gêneros, playlists, botões explícitos de download | Refinar responsividade, estados de erro e acessibilidade. |
| Pipeline básico | Testes Node/Python, conferência de catálogo/capas, Gradle CI | Expandir com integração, dispositivo e instrumentação. |

## 4. Falhas e riscos por prioridade

Classificação: **CONFIRMADO NO CÓDIGO** = comportamento/ausência demonstrável por inspeção; **RISCO REPRODUZÍVEL** = cenário lógico provável, mas precisa teste em execução; **NÃO CERTIFICADO** = não há evidência de teste suficiente. Não confundir uma hipótese com uma falha reproduzida em dispositivo.

### P0 — Antes de considerar o APK pronto para distribuição

#### RH-001 — APK debug não atualizável de forma confiável
**Estado:** CONFIRMADO NO PIPELINE; impacto entre instalações depende da assinatura real dos APKs.

**Evidência:** \`.github/workflows/android-apk.yml\` executa \`gradle :app:assembleDebug\` em runner novo; não fornece keystore persistente nem executa \`assembleRelease\`. Em builds Android padrão, a chave debug pode ser diferente de um runner para outro.

**Impacto:** o Android pode rejeitar uma atualização sobre o APK anterior por assinatura divergente; desinstalar e reinstalar pode destruir downloads no armazenamento privado.

**Correção:** criar chave de release persistente protegida por Secrets GitHub, assinar em CI, configurar \`versionCode\` monotônico, gerar APK release e preservar identidade de aplicação. Publicar SHA-256 e release versionada. Nunca colocar a chave no repositório.

**Teste de aceite:** instalar vX, baixar 3 músicas, atualizar para vX+1 SEM desinstalar e reproduzir as 3 músicas offline. Repetir em API 26, 29, 33 e 35.

#### RH-002 — Distribuição pública de músicas e downloads sem auditoria de direitos
**Estado:** RISCO DE CONFORMIDADE CONFIRMADO PELO MODELO DE DISTRIBUIÇÃO; direitos específicos não verificados.

**Evidência:** repositório é público, \`dist/musicas\` inclui todos os 64 áudios; o site oferece download para todos, enquanto \`downloadAllowed\` permanece \`true\` somente em 6 faixas.

**Impacto:** disponibilizar gravações de terceiros para streaming/download pode exigir licenças de direitos autorais e conexos. A mera presença do arquivo no GitHub não prova autorização.

**Correção:** manter registro por faixa com titular, origem, tipo de autorização, território, validade e permissões de streaming, download, exposição pública e cache. Remover do deploy público qualquer mídia sem autorização suficiente. Ajustar a UI para refletir permissões válidas, sem inventá-las. O arquivo \`LICENSE\` do código deve ser tratado separadamente das licenças dos áudios.

**Aceite:** 100% dos arquivos publicados têm autorização documentada para o modo de uso oferecido; licença do código especificada e suas dependências revisadas.

#### RH-003 — Ponte JavaScript/Android acessível a frames sem validação da origem
**Estado:** CONFIRMADO NO CÓDIGO; exploração não demonstrada.

**Evidência:** \`MainActivity.java\` chama \`web.addJavascriptInterface(new WebBridge(), "RadioHitsAndroid")\`. Há métodos expostos para downloads, catálogo, reprodução e exclusão. A API injeta a interface em todos os frames; controle de URL da navegação principal não equivale à verificação do origin de cada chamada.

**Impacto:** uma inclusão inesperada de conteúdo ou XSS no site pode acionar operações nativas de forma indevida. O risco cresce com novos componentes/iframes no site.

**Correção:** limitar operações privilegiadas a mensagens com validação explícita de origem, idealmente por \`WebViewCompat.addWebMessageListener\` com allowedOriginRules; restringir conteúdo não confiável, desabilitar navegação de esquemas inesperados, aplicar CSP e revisar \`shouldOverrideUrlLoading\`. Validar dados mesmo na camada nativa.

**Aceite:** iframe externo não consegue acionar bridge; casos com HTML malicioso/URLs forjadas rejeitados; navegação e downloads legítimos continuam funcionando.

#### RH-004 — Offline não possui gerenciador resiliente
**Estado:** CONFIRMADO NO CÓDIGO e NÃO CERTIFICADO em celular.

**Evidência:** \`OfflineStore.download()\` executa GET completo num \`ExecutorService\` da \`MainActivity\`, escreve \`.part\`, apaga parcial em erro e só salva booleano por URL. Não há pausa, \`Range\`, retries automáticos, \`DownloadService\`, checksum, retomada após término do processo ou fila persistente.

**Impacto:** perda de internet exige reiniciar downloads grandes; fechar/matar o app pode interromper downloads. O usuário pode ver estado enganoso se o callback não chegar com WebView fechada.

**Correção:** avaliar \`Media3 DownloadManager + DownloadService + DownloadIndex\` (ou \`WorkManager\` para arquivos simples com lógica de recomeço); persistir estados \`queued/downloading/paused/error/complete\`, suportar Wi‑Fi only, cancelamento e retomada HTTP Range quando o servidor oferecer. Verificar integridade por tamanho + hash, finalizar atomicamente e restaurar UI no boot.

**Aceite:** downloads parciais sobrevivem a modo avião, perda de processo, bloqueio de tela, troca Wi‑Fi/dados e reinício; nenhum arquivo truncado é marcado como concluído.

### P1 — Robustez diária do player

#### RH-005 — Estado de reprodução e fila não persistidos no Android
**Estado:** CONFIRMADO NO CÓDIGO.

**Evidência:** \`PlaybackService.java\` cria nova sessão/player em \`onCreate\` e não restaura fila/posição após recriação. \`js/app.js\` persiste favoritos, playlists, volume e leveling, mas não fila, posição e modo atuais como snapshot persistente.

**Correção:** guardar \`trackId\`, fila, índice, posição, relógio da rádio e modo de reprodução; reconstruir serviço após morte do processo. Para rádio, ressincronizar ao horário atual em vez de continuar um seek obsoleto. Preservar preferências sob atualização do APK.

**Aceite:** interromper forçadamente processo e voltar ao app; playlist retoma no ponto esperado; rádio entra na música correta pelo relógio.

#### RH-006 — Falhas de rede/arquivo sem recuperação robusta
**Estado:** CONFIRMADO NO CÓDIGO e RISCO REPRODUZÍVEL.

**Evidência:** \`onPlayerError\` apenas atualiza estado; \`requestPlay()\` mostra toast; não há estratégia explícita para timeout, HTTP 404/429, erro de decoder, skip opcional e retry escalonado.

**Correção:** classificar erros (rede, arquivo, codec, armazenamento); adicionar backoff limitado (ex.: 2/5/10s), estado visível \`Buffering / Reconectando / Offline\` e opção manual de tentar novamente. Rádio deve sincronizar novamente ao relógio na reconexão; não alterar ordem sem decisão explícita.

**Aceite:** teste de rede desligada por 30s/2min/10min e religada; sem loop infinito de toast e sem travamento da UI.

#### RH-007 — Preload ≠ cache offline; reprodução web ainda pode parar
**Estado:** CONFIRMADO NO DESIGN.

**Evidência:** \`js/app.js\` prepara segunda mídia nos últimos 25s, mas \`sw.js\` não cacheia áudio em streaming. Mesmo quando \`canplay\` dispara, isso não certifica faixa completa local.

**Correção:** mostrar estados \`Aguardando / Preparando / Pronta parcialmente / Offline salva\` com semântica correta; modo separado \`Tocar somente baixadas\`; informar o que acontecerá ao perder internet. Manter ordem fixa da rádio online.

**Aceite:** desligar internet no meio de faixa e na transição; mensagens corretas e seleção local funcional.

#### RH-008 — Memória e cota de armazenamento no PWA
**Estado:** CONFIRMADO NO CÓDIGO; consumo real NÃO MEDIDO.

**Evidência:** \`js/offline.js\` acumula chunks, constrói \`Blob\` e \`Response\`; \`playableSource\` lê a resposta inteira como Blob e cria URL \`blob:\` guardada em \`blobURLs\`. Limpeza dessas URLs só ocorre na exclusão da faixa.

**Correção:** evitar duplicar grandes buffers, considerar reprodução via URL cacheada/serviço dedicado ou File System Access/OPFS onde suportado; gerenciar ciclo de vida de Object URLs, quota, eviction e downloads por lote. Informar tamanho antes de baixar e mostrar progresso em bytes.

**Aceite:** baixar/reproduzir 20 faixas em Android com pouca RAM; nenhuma falha por memória ou descarte inesperado; app mostra espaço usado/restante e recuperação por falta de armazenamento.

#### RH-009 — Aplicativo Android pode embarcar interface desatualizada
**Estado:** CONFIRMADO NO PIPELINE.

**Evidência:** APK inclui \`index.html\`, \`catalogo.json\`, \`js/\`, \`css/\` e \`assets/\` no build, mas o workflow Android é disparado apenas quando alteram \`android/**\` ou seu próprio YAML. Mudanças somente no site não geram novo APK.

**Impacto:** se instalar o APK offline, ele pode mostrar UI/catalogo antigo; quando volta online, aparece a UI mais recente. O usuário percebe inconsistência.

**Correção:** incluir \`index.html\`, \`js/**\`, \`css/**\`, \`assets/**\`, \`sw.js\`, \`catalogo.json\` nos paths de build; versão do shell embutido exibida na tela; smoke test de boot offline e atualização online.

**Aceite:** qualquer mudança relevante na UI gera build Android correspondente; boot offline exibe assets e catálogo coerentes.

#### RH-010 — Checagem de internet insuficiente para determinar disponibilidade
**Estado:** CONFIRMADO NO CÓDIGO.

**Evidência:** \`hasInternet()\` verifica \`NET_CAPABILITY_INTERNET\`, não \`NET_CAPABILITY_VALIDATED\`; \`offlineAsset()\` só fornece assets embutidos quando \`hasInternet()==false\`. Pode existir rede local sem saída real ou captive portal.

**Correção:** decidir por \`VALIDATED\` quando apropriado, mas principalmente fazer fallback robusto em erros de rede/WebView, não apenas pela conectividade declarada. A tela offline deve abrir inclusive se o DNS falhar apesar da conexão Wi‑Fi.

**Aceite:** Wi‑Fi sem internet, DNS indisponível, portal cativo, dados móveis sem crédito e modo avião.

#### RH-011 — Possível hiato ao fim antecipado da faixa da rádio web
**Estado:** RISCO REPRODUZÍVEL, não comprovado em reprodução real.

**Evidência:** evento \`ended\` chama \`tick()\`; \`tick\` depende da mudança do ID pelo relógio. Se o arquivo terminar ligeiramente antes do horário previsto, a faixa pode ficar silenciosa até o relógio indicar a próxima, mesmo com a próxima pronta.

**Correção:** estado explícito \`ended-waiting-clock\`, com tolerância controlada para duração real vs catálogo; testar passagem de fim com diferenças de 50ms, 500ms e 3s.

**Aceite:** 64 transições reproduzidas (no mínimo uma volta completa), registrar silêncio por transição; nenhuma lacuna indevida acima do limite acordado.

### P2 — Qualidade e experiência

#### RH-012 — Normalização sonora aproximada
**Estado:** LIMITAÇÃO CONFIRMADA.

**Evidência:** \`scripts/analisar_volume.py\` analisa cerca de 35s centrais por faixa usando FFmpeg EBU R128; \`gainDb\` reduz somente níveis acima do alvo, não é ReplayGain pleno/álbum. O pico real pode diferir em outras partes da música.

**Melhoria:** análise integrada da faixa inteira com true peak, opção de ReplayGain por música/álbum e limite de pico; transição suave de ganho. Proibir clipping e comparar LUFS percebido em equipamento real.

**Aceite:** relatório de LUFS integral + true peak 64/64, sem clipping novo, diferença percebida mais consistente.

#### RH-013 — UI/UX, acessibilidade e descoberta
**Estado:** OPORTUNIDADE DE MELHORIA.

**Melhorias:** barra de download por faixa em bytes/percentual, cancelamento e retry, tela \`Downloads\` própria com filtros (Baixadas, Pendentes, Com erro), indicador offline no topo, ação \`Baixar playlist\` sujeita a autorizações e quota, feedback acessível, foco visível, leitores de tela, tamanho mínimo de alvo de toque, animações reduzidas. Não exibir controles que não funcionam no modo rádio.

**Aceite:** auditoria com TalkBack, navegação teclado, contraste WCAG 2.2 AA onde aplicável e mobile 320/360/390/412 px.

#### RH-014 — Metadados e identidade dos áudios
**Estado:** OPORTUNIDADE.

**Evidência:** organização vem de \`metadados.json\`, tags ou nome do arquivo. Capas por gênero são genéricas; fontes com nomes longos e títulos importados. IDs derivados do caminho do arquivo podem mudar quando o nome muda, quebrando favoritos e playlists.

**Melhoria:** ID estável independente de caminho; migração de IDs ao renomear; título, artista, álbum, ano, faixa/disco, qualidade/bitrate, artwork local/licenciado; detecção de duplicatas por hash.

**Aceite:** renomear MP3 sem perder playlists/favoritos; nenhum ID duplicado, tags consistentes e screenshots sem overflow.

#### RH-015 — Crescimento do catálogo e hospedagem
**Estado:** ESCALABILIDADE LIMITADA POR DESIGN.

**Evidência:** 233,77 MiB de áudio para 4h07; o deploy copia \`musicas/\` integralmente; origem é GitHub Pages. O catálogo e a rádio dependem da publicação estática.

**Melhoria:** para uso pessoal pequeno, manter GH Pages. Para biblioteca pública maior: servidor compatível OpenSubsonic (Navidrome), storage com CDN e políticas de cache/rate limiting, autenticação quando necessário, transcodificação para economizar dados. Evitar depender de GitHub Pages como serviço de streaming em escala.

**Aceite:** teste de 10/50/100 ouvintes simultâneos com telemetria de resposta/buffering e custos, respeitando termos do provedor.

#### RH-016 — Organização do código e manutenção
**Estado:** OPORTUNIDADE E RISCO DE REGRESSÃO.

**Evidência:** \`js/app.js\` tem ~52 KB e mistura estado, DOM, sincronização, áudio e integração nativa; \`MainActivity.java\` tem ~381 linhas e acumula WebView, controles, cache e downloads. \`css/style.css\` ~30 KB.

**Melhoria:** módulos claros \`radio-clock\`, \`playback-controller\`, \`offline-library\`, \`download-manager\`, \`audio-leveling\`, \`ui-components\`; no Android, separar \`WebBridge\`, repositório de downloads, Media3 e recuperação de sessão. Testes de contrato JS↔Android.

**Aceite:** testes continuam verdes, redução de responsabilidades por arquivo e sem perda de recursos atuais.

#### RH-017 — Controles e integração com ecossistema
**Estado:** NÃO CERTIFICADO / PENDENTE.

**Melhoria:** Android Auto (avaliar \`MediaLibraryService\`), Bluetooth AVRCP/metadata/capas, troca de headset e perda de foco, widget, Android 13–16, equalizador do sistema, temporizador para dormir, histórico recente, botão \`Compartilhar\`.

**Aceite:** matriz de testes com headsets e carros. Não afirmar compatibilidade Android Auto apenas por usar MediaSession.

### P3 — Experimentos opcionais (depois da estabilização)
- Modo **somente downloads**, sem alterar a rádio online.
- Importação/exportação local de playlists e backup dos favoritos sem dados pessoais.
- Qualidade de streaming por rede quando houver infraestrutura de transcoding.
- Estatísticas locais opt-in (tempo ouvido, interrupções e transições); evitar rastreamento não consentido.
- Tema claro opcional, navegação por álbuns/artistas e imagens maiores.
- Visualização de fila no player nativo com ações consistentes.

## 5. Comparação com projetos open source

**Referências consultadas em 31/10/2026:** características publicadas pelos projetos. Não foram executados benchmarks comparativos nem testados APKs concorrentes.

| Função | Radio Hits v1.6 | [Finamp](https://github.com/finamp-app/finamp) | [Auxio](https://github.com/OxygenCobalt/Auxio) | [AntennaPod](https://github.com/AntennaPod/AntennaPod) | [Navidrome](https://www.navidrome.org/) |
|---|---|---|---|---|---|
| Propósito | Rádio simulada + biblioteca web/APK | Cliente de biblioteca Jellyfin/servidor | Biblioteca local Android | Podcasts e episódios | Servidor pessoal de músicas |
| Fundo Android | Media3/MediaSessionService | Player mobile com integração de mídia | Media3/ExoPlayer | Playback Android maduro | Depende de cliente |
| Download offline | **Sim**, individual, simples | **Sim**, recurso central | Música já local | **Sim**, episódios | Via clientes |
| Retomar downloads e fila durável | **Não demonstrado** | Fluxo offline maduro a estudar | Não é foco de download em rede | Referência de gestão de episódios | Depende do cliente |
| Gapless/qualidade | Web com pré-carga; certificação pendente | Gapless, ReplayGain | Gapless, ReplayGain | Recursos para áudio falado | Transcodificação/cliente |
| Biblioteca e metadados | Gênero, título, artista, playlist local | Álbuns, artistas, metadados ricos | Metadados avançados e playlists | Feeds/episódios | Multi-bibliotecas, API |
| Android Auto | **Não implementado/certificado** | Suportado | Suportado | Verificar implementação por versão | Via cliente |
| Sincronização de rádio por relógio | **Diferencial do Radio Hits** | Não é sua proposta central | Não | Não | Não |
| Infraestrutura própria | GH Pages estático | Jellyfin ou compatível | Nenhum servidor | Feeds/servidores externos | Servidor próprio |

**O que aproveitar como orientação, sem copiar código:**

- **Finamp:** Downloads offline previsíveis, tratamento de biblioteca e uso claro online/offline; gapless e ReplayGain.
- **Auxio:** UI focada na reprodução, persistência, controles de headset, metadados e testes de estabilidade Media3.
- **AntennaPod:** Fluxos de fila de downloads, erro, repetição, retomada e feedback de progresso (embora seja podcast, é boa referência operacional).
- **Navidrome:** Caminho futuro para biblioteca maior, streaming pessoal, transcoding e clientes OpenSubsonic; não instalar servidor só para 64 arquivos.
- **Android Developers:** \`MediaSessionService\`, gerenciamento de downloads com \`DownloadService\`, e segurança da bridge WebView.

**Licenças:** as soluções citadas têm licenças próprias, inclusive GPL e MPL. Estudar arquitetura e comportamento é diferente de incorporar código; qualquer reutilização exige checagem de compatibilidade e obrigações da licença.

### Referências externas
1. Finamp — https://github.com/finamp-app/finamp
2. Auxio — https://github.com/OxygenCobalt/Auxio
3. AntennaPod — https://github.com/AntennaPod/AntennaPod
4. Navidrome — https://www.navidrome.org/
5. Android Media3, background — https://developer.android.com/media/media3/session/background-playback
6. Android Media3, downloads — https://developer.android.com/media/media3/exoplayer/downloading-media
7. Android, WebView native bridge security — https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges

## 6. Testes: o que passou vs. o que NÃO está certificado

### Passou conforme GitHub Actions (não equivale a teste físico)
- [x] Gradle \`assembleDebug\` para v1.6.
- [x] Publicação GH Pages a partir de \`main\`.
- [x] \`node --check\` dos JS.
- [x] Teste de IDs, ordem, duração e sincronização do relógio com dados controlados.
- [x] Teste simulado de pré-carregamento/transição.
- [x] Teste lógico de volume/atenuação.
- [x] Teste com Cache Storage **simulado**: download, Blob, listagem e exclusão.
- [x] Validação do catálogo sem faixa faltando e das capas SVG.
- [x] Medição de nível dos 64 arquivos via FFmpeg.

### Ainda NÃO certificado
- [ ] Instalar/atualizar APK sem desinstalar e mantendo músicas salvas.
- [ ] Abrir APK pela primeira vez totalmente offline após instalação e tocar downloads.
- [ ] Baixar/abrir 64 arquivos **reais** no Android, verificando decodificação e integridade.
- [ ] Reprodução contínua de todas as 64 faixas em celular, transições e offsets registrados.
- [ ] Tela bloqueada 4h+, troca de apps, modo economia de bateria e processo morto.
- [ ] Modo avião no meio de download, sem corrupção, com retomada após reconectar.
- [ ] Headsets Bluetooth, controle físico, carro e áudio desconectado.
- [ ] PWA em Chrome Android, Samsung Internet, Firefox e desktop com quota baixa.
- [ ] Consumo de CPU, RAM, bateria, tráfego e tempo de primeiro áudio.
- [ ] Cenários 404, 429, timeout, arquivo corrompido e CDN indisponível.
- [ ] Acessibilidade com TalkBack e telas pequenas.
- [ ] Auditoria de dependências/SBOM e checagem de licenças de áudios.

**Instrumentação recomendada:** Playwright/Chromium para UI web com fixtures locais; testes Android instrumentados (Espresso ou UI Automator), Media3 \`TestExoPlayerBuilder\`/testes de mídia e um proxy controlável para simular rede, mais teste manual em aparelho real. Os testes devem publicar log, resultado, ambiente e vídeo/screenshot nos artefatos do CI.

## 7. Plano de execução por revisões

### REV-1.7 — Correção estrutural e atualizações (P0)
- [ ] RH-001: assinatura de release persistente e atualização in-place comprovada.
- [ ] RH-009: gatilhos do APK também observam arquivos web usados no pacote.
- [ ] RH-003: reduzir superfície da ponte JS e testes de origem.
- [ ] RH-002: plano de permissões/licenciamento e distinção entre código, áudio, streaming e download.
- [ ] Testar atualização preservando 3 músicas offline.
- [ ] Entregar relatório antes/depois com APK, commit, logs e pendências.

**Critério de conclusão:** CI release assinado, instalação/upgrade no mesmo aparelho sem perda de dados, bridge protegida e inventário de direitos revisado.

### REV-1.8 — Downloads realmente confiáveis (P0/P1)
- [ ] RH-004: estados persistidos, pausa, cancelamento, retry e retomada.
- [ ] RH-008: quota, tamanho estimado, limpeza de blobs e memória.
- [ ] RH-010: offline shell quando há Wi‑Fi sem internet.
- [ ] Tela de downloads com fila/progresso/falhas e \`Somente baixadas\`.
- [ ] Testes de rede interrompida, processo morto e arquivo incompleto.

**Critério de conclusão:** uma música parcialmente baixada recupera normalmente após interrupção e nenhuma falha é confundida com download concluído.

### REV-1.9 — Reprodução contínua e recuperação (P1)
- [ ] RH-005: restaurar posição/fila após morte do processo.
- [ ] RH-006: retry/backoff por tipo de erro e estados de buffering.
- [ ] RH-007/011: medir lacunas e tolerância de clock, com pré-carregamento honesto.
- [ ] Testar 64 faixas e 4h07m em Android com tela desligada.
- [ ] Medir RAM, bateria, rede, tempo de início e silêncios.

**Critério de conclusão:** 64/64 faixas completas em campanha contínua; retomada de falha sem travamento; teste de áudio registrado.

### REV-2.0 — Qualidade open-source e acabamento (P2/P3)
- [ ] RH-012: medição de volume integral e true peak.
- [ ] RH-013/014: UI, acessibilidade, metadados estáveis e busca avançada.
- [ ] RH-016: modularização e testes de contrato JS/Android.
- [ ] RH-017: Bluetooth/Android Auto somente após testes reais.
- [ ] Documentação de contribuição, versão, changelog e licença de código.
- [ ] Revisão de crescimento da biblioteca, CDN/servidor apenas se justificada.

**Critério de conclusão:** testes de regressão reproduzíveis, manual de QA, builds atualizáveis e checklist sem P0 aberto.

## 8. Escala de maturidade (estimativa qualitativa, não benchmark)

| Área | Nota / 10 | Justificativa |
|---|---:|---|
| Base de reprodução Android | 7,0 | Media3, serviço em segundo plano e sessão; faltam restore e testes físicos. |
| Rádio sincronizada | 7,0 | Relógio e ordem fixa funcionam logicamente; faltam transições longas e tolerância. |
| Streaming/PWA | 6,5 | Catálogo e preload; falhas de rede e armazenamento precisam evoluir. |
| Downloads/offline | 5,0 | Funcionalidade existe; sem fila persistente, retomada e certificação física. |
| UI/identidade visual | 7,0 | Assets SVG próprios e UX funcional; precisa acessibilidade e estados de erro. |
| Áudio/normalização | 6,5 | 64 perfis, sem boost; medição por trecho e avaliação perceptiva pendente. |
| Segurança/privacidade | 4,5 | Origem parcialmente limitada; bridge, dependências e licenças exigem revisão. |
| Testes/CI | 6,0 | Testes Node/Python e build; faltam instrumentação e assinatura release. |
| Distribuição/atualização | 3,5 | APK debug sem identidade de assinatura estável certificada. |
| **Maturidade geral estimada** | **6,0** | **Protótipo avançado / beta técnico; ainda não versão final certificada.** |

As notas são julgamento técnico baseado no código auditado e na cobertura de evidências, não medições instrumentais, benchmarks nem testes de usabilidade de usuários reais.

## 9. Regras de trabalho para próximas iterações

1. **Não alterar a ordem fixa da rádio** sem novo pedido do proprietário.
2. Primeiro reproduzir e registrar falha; depois corrigir no menor conjunto de arquivos; por fim repetir o teste e medir regressões.
3. Para cada mudança: commit exato, antes/depois, testes realmente executados, APK gerado, versão web, impacto em músicas salvas e pendências.
4. Proteger dados persistentes antes de mudar assinatura, banco de downloads, IDs de faixas ou esquema do catálogo; incluir migração.
5. Não declarar "offline 100%" até provar em dispositivo e com a internet totalmente desligada.
6. Não declarar "gapless" até medir lacunas e registrar evidências.
7. Não usar "open source" como licença automática para copiar mídia ou código de terceiros.
8. Preservar as features existentes: rádio sincronizada, playlists, favoritos, downloads, volume equilibrado, áudio de fundo, capas e suporte mobile.
9. A cada comando **"próxima"**, priorizar o primeiro item P0 ainda pendente, depois P1, P2 e P3; não gastar iteração inteira em cosmética se existir falha estrutural.
10. Manter este documento como checklist cumulativo: ao concluir um item, registrar commit, teste e evidência, sem apagar problemas ainda não resolvidos.

---

**Estado final da auditoria:** documento concluído; **nenhuma correção de código foi aplicada nesta entrega**, somente análise e planejamento. A próxima revisão de maior impacto é **REV-1.7: assinatura estável, atualização do APK sem perda dos downloads e segurança da ponte Android ↔ WebView**.
