# RADIO HITS — REV 1.7 (execução técnica)

**Base:** auditoria de 31/10/2026. **Escopo:** correções de código; dados do catálogo e programação fixa mantidos.

## Alterações efetivas

| ID | Antes | Depois | Estado |
| --- | --- | --- | --- |
| RH-001 | CI publicava somente debug | Adiciona build release condicionado a 4 secrets, checksums e versionCode 8 | Implementado no workflow; assinatura e upgrade físico pendentes |
| RH-003 | `addJavascriptInterface` acessível a frames externos | `WebViewCompat.addWebMessageListener`, origem e frame principal validados, métodos restritos, parâmetros limitados; CSP bloqueia frames | Código alterado; teste instrumental pendente |
| RH-004 | Apagava arquivo `.part` após falha | Retém `.part`, usa HTTP Range e If-Range com ETag/Last-Modified, valida Content-Range e tamanho final e só renomeia completo | Retomada implementada; fila durável, pausa e testes em aparelho pendentes |
| RH-009 | APK recompilado apenas por `android/**` | Workflow observa JS, CSS, assets, HTML, catálogo, SW, manifest | Implementado; execução de CI a conferir |
| RH-010 | Conferia somente capacidade INTERNET | Exige `NET_CAPABILITY_VALIDATED` e tenta shell local em erro de frame principal | Melhorado; portal cativo e testes de dispositivo pendentes |
| RH-002 | Sem ficha de licenças | Documento `docs/DIREITOS_MIDIA.md` com campos e advertência | Não resolvido até comprovar autorizações |

## Invariantes mantidas

- Rádio sincronizada por relógio, `radioOrder` e 64 faixas não foram alterados.
- Sem shuffle na rádio. Player Media3 continua no `PlaybackService`.
- Downloads existentes usam a mesma pasta e mesma preferência; a extensão segue o caminho.
- A versão web sem a ponte nativa continua usando o player/cache web.

## Testes incluídos

- `node tests/teste-bridge-android.js`: contrato do adaptador de mensagens e salvaguardas estáticas Android.
- `node tests/auditoria-radio.js`: relógio, faixas, sincronização e invariantes existentes.
- `gradle :app:assembleDebug`: build Android no CI/PR.
- `gradle :app:assembleRelease`: apenas após configuração dos secrets, **não certificado aqui**.

## Pendências reais

- Atualização da **primeira release estável** para a seguinte sem perder downloads, em aparelho físico.
- Migração de instalações assinadas com debug anterior: assinatura incompatível requer plano de exportação.
- Assinatura real exige fornecimento privado da keystore; nada no repositório a substitui.
- Fila de downloads durável e pausa/cancelamento por usuário (RH-004), testes de quedas de rede e cota.
- Restauração de fila e posição nativa (RH-005), classificação e backoff de player errors (RH-006).
- Reprodução de ciclo 4h07 e medição de transições, Bluetooth, RAM, bateria, acessibilidade.
- Direitos do catálogo RH-002: sem prova de licença não há certificação para distribuição.
