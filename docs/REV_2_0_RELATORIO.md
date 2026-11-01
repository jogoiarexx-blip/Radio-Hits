# Radio Hits REV 2.0 — memória offline, rádio 64 faixas e UI mobile

## Comparativo técnico (REV 1.9 → REV 2.0)

| Sistema | Antes | Depois |
| --- | --- | --- |
| Download web | `chunks.push()`, Blob completo e Response ocupavam memória JS durante download | `ReadableStream` alimenta Cache Storage gradualmente; fallback Blob somente em navegadores sem API de streaming |
| Proteção de tamanho | Limite 95 MiB e Content-Length | Mantidos, inclusive streaming sem Content-Length e arquivo truncado |
| Áudio offline em execução | Mapa de `blob:` retinha URLs indefinidamente ao percorrer a biblioteca | Limite nominal de 2 URLs, com referências em uso protegidas durante troca; liberação após troca e ao descarregar o player secundário |
| Concorrência | Duas solicitações podiam duplicar o mesmo Blob | Promise compartilhada por URL enquanto a leitura offline ocorre |
| Preload mobile | Player secundário ativo na maior parte dos Android browsers | Em dispositivos que informam até 2 GiB de RAM, desativa-se o segundo decoder; a pré-carga também cessa ao ocultar a página |
| Transições | Trocava para a faixa preparada já com `readyState >= 1` | Só usa o player preparado após `readyState >= 2` (dados de áudio disponíveis) |
| Rádio Media3 | O serviço avança pelos tempos reais dos arquivos; diferenças acumuladas podem desalinhar o horário | A cada 15 s durante reprodução pronta compara faixa/posição com relógio do catálogo; corrige quando diferente ou deriva acima de 4 s |
| UI downloads | Botões menores e compressão em telas pequenas | Ajustes para 40–44 px de altura e ações reordenáveis em telas até 380 px |

## Limites dos testes

- `tests/teste-radio-64.js`: simula programaticamente todas as janelas da programação de 64 faixas e sete ciclos completos, sem reproduzir áudio real.
- `tests/teste-memoria-stream.js`: simula 64 downloads, 64 trocas de Blob, contagem de URLs revogadas e rejeição de arquivo incompleto.
- `tests/teste-download-real.js`: Cache Storage de teste realmente consome a resposta streaming.
- Testes de áudio, UI, bridge, fila e recuperação existentes continuam no workflow; Android `assembleDebug` usa Gradle.
- O QA acima **não** substitui 4h07 de reprodução humana, medição de heap com WebView real ou ensaios de Android com modo avião.

## Pendências

- Assinatura de APK release continua dependendo de segredos de assinatura; build debug não atualiza instalação release.
- Licenciamento das gravações precisa de documentação própria.
- Próximo passo de performance: perfil real de RAM/CPU em celular de 2 GiB e teste de 64 músicas em tempo real, incluindo bloqueio de tela e Bluetooth.
- Carga offline muito grande em navegadores sem `ReadableStream` ainda pode usar memória do Blob fallback; alternativa seria bloquear download em browsers antigos ou usar mecanismo de armazenamento especializado.

**A auditoria não declara áudio integralmente testado em tempo real.**
