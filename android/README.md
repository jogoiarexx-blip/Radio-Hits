# Radio Hits - aplicativo Android

App com Media3 ExoPlayer + MediaSessionService. Abre a interface original do site e executa
o audio nativamente fora da WebView. Continua tocando quando minimiza o app e bloqueia a tela.
Os controles aparecem na notificacao Android, tela de bloqueio e fones Bluetooth.

## APK de teste
Abra GitHub -> Actions -> Gerar APK Android Radio Hits -> ultima execucao bem-sucedida
-> Artefato Radio-Hits-Android-APK -> baixe ZIP -> extrair app-debug.apk -> instalar.

APK de debug para testes pessoais; nao e assinatura de lancamento.
Android 8.0+, internet necessaria, sem faixas incluidas no aplicativo.

## Codigo
Abra a pasta android no Android Studio. Java 17, Gradle 8.13, Android SDK 36.

## Limites
O APK usa faixas servidas por GitHub Pages; requer conexao. O radio e uma playlist sincronizada
simulada, nao um fluxo de radio ao vivo. Nao garante reproducao se Android forcar fechamento
do servico por falta de memoria ou configuracoes agressivas de bateria. Nao incorpora
arquivos comerciais e nao concede licencas para reproducao publica.
