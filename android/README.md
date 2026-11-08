# Radio Hits — Android e instalação no celular

## Instalar direto do site (recomendado)

1. Abra https://jogoiarexx-blip.github.io/Radio-Hits/ no Chrome do Android.
2. Toque em Instalar aplicativo, quando oferecido. Se o navegador não permitir, abra o menu ⋮ e escolha Instalar app / Adicionar à tela inicial.
3. O Radio Hits aparece como app na tela inicial e abre sem a barra do navegador.

No iPhone (Safari), abra o site, escolha Compartilhar → Adicionar à Tela de Início.

O PWA verifica automaticamente atualizações da interface quando é aberto ou volta ao primeiro plano, e aplica novas versões ao pausar/terminar a música. Se o usuário tocar em Atualizar agora, a música pode ser interrompida. A interface pode abrir offline; ouvir músicas depende de internet ou de downloads autorizados. O navegador precisa executar o app para verificar atualizações: não atualiza em segundo plano quando totalmente fechado.

## APK Android nativo (Media3)

O APK usa Media3 + MediaSessionService, com reprodução em segundo plano, tela de bloqueio e Bluetooth. A interface HTML vem do site e verifica atualizações ao abrir e enquanto está ativo. O pacote nativo Android não pode ser substituído silenciosamente: mudanças de código Java ou permissões exigem instalação de APK com a mesma assinatura, via loja ou autorização do usuário.

### APK de teste

Abra https://github.com/jogoiarexx-blip/Radio-Hits/actions/workflows/android-apk.yml, selecione uma execução bem-sucedida e baixe o artefato Radio-Hits-Android-Debug (ZIP). Extraia app-debug.apk e instale no Android 8+. Artefatos GitHub Actions podem exigir login.

Debug é para teste, não para distribuição pública. Uma atualização do APK precisa da mesma assinatura. Release assinado só é gerado se os segredos de assinatura estiverem configurados; ele não é instalado automaticamente.

## Desenvolvimento e limites

Abra a pasta android no Android Studio. Java 17, Gradle 8.13, Android SDK 36.

A rádio é uma playlist sincronizada pelo relógio, não um fluxo de rádio ao vivo. Use apenas músicas autorizadas para distribuição.

## Temporizador para dormir (Android 2.5 e PWA)

Toque no botão de lua no topo do aplicativo. Escolha 15, 30 ou 60 minutos e cancele quando quiser. O prazo fica salvo e não é apagado ao trocar de faixa. No APK Android, o Media3 verifica o limite durante reprodução em segundo plano (tolerância de até ~15 segundos); o sistema pode atrasá-lo se encerrar o serviço à força. No PWA, o navegador controla a contagem e pode atrasar timers ao bloquear a tela.
