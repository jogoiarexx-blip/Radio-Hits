#!/usr/bin/env bash
# Radio Hits — QA longa duracao. Requer celular Android, ADB e musica autorizada.
# Uso: DURATION_SEC=14820 INTERVAL_SEC=300 bash tools/qa_android_4h07.sh
# Não inicia musica sem gesto do usuario e nao altera baterystats do aparelho.
set -euo pipefail

PACKAGE="br.com.radiohits.app"
DURATION_SEC="${DURATION_SEC:-14820}"
INTERVAL_SEC="${INTERVAL_SEC:-300}"
OUT="${OUT:-qa-android-$(date +%Y%m%d-%H%M%S)}"
[[ "$DURATION_SEC" =~ ^[0-9]+$ ]] && (( DURATION_SEC > 0 )) || { echo "DURATION_SEC inválido" >&2; exit 2; }
[[ "$INTERVAL_SEC" =~ ^[0-9]+$ ]] && (( INTERVAL_SEC > 0 )) || { echo "INTERVAL_SEC inválido" >&2; exit 2; }
command -v adb >/dev/null || { echo "ADB nao instalado" >&2; exit 2; }
[[ "$(adb get-state 2>/dev/null)" == device ]] || { echo "Conecte um dispositivo ADB autorizado" >&2; exit 2; }
mkdir -p "$OUT"
{
  echo "Radio Hits QA Android — coleta local"
  echo "Inicio: $(date -Is)"
  echo "Dispositivo: $(adb shell getprop ro.product.model | tr -d '\r')"
  echo "Android: $(adb shell getprop ro.build.version.release | tr -d '\r')"
  echo "DURATION_SEC=$DURATION_SEC INTERVAL_SEC=$INTERVAL_SEC"
  echo "ATENCAO: resultados dependem de usuario iniciar a radio manualmente."
  echo "Testes de tela apagada, fones e rede precisam de acao manual e anotacoes."
} > "$OUT/README.txt"
adb shell am start -n "$PACKAGE/.MainActivity" > "$OUT/launch.txt" 2>&1 || true
echo "Abra a radio no aparelho e pressione REPRODUZIR. Pressione Enter aqui para iniciar a coleta."
read -r _
# Cada minuto o servico envia um resumo não sensível em RadioHitsQA.
adb logcat -v threadtime RadioHitsQA:I '*:S' > "$OUT/radiohits-logcat.txt" 2>&1 &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT INT TERM
echo "started_at=$(date -Is)" >> "$OUT/README.txt"
START=$(date +%s)
END=$((START+DURATION_SEC))
SAMPLE=0
while (( $(date +%s) < END )); do
  SAMPLE=$((SAMPLE+1))
  STAMP=$(date +%Y%m%d-%H%M%S)
  {
    echo "sample=$SAMPLE timestamp=$(date -Is) elapsed_sec=$(( $(date +%s)-START ))"
    adb shell dumpsys meminfo "$PACKAGE" 2>&1 || true
  } > "$OUT/memory-$STAMP.txt"
  {
    echo "sample=$SAMPLE timestamp=$(date -Is)"
    adb shell dumpsys cpuinfo 2>&1 || true
  } > "$OUT/cpu-$STAMP.txt"
  {
    echo "sample=$SAMPLE timestamp=$(date -Is)"
    adb shell dumpsys battery 2>&1 || true
  } > "$OUT/battery-$STAMP.txt"
  REMAINING=$(( END-$(date +%s) ))
  if (( REMAINING <= 0 )); then break; fi
  if (( REMAINING < INTERVAL_SEC )); then sleep "$REMAINING"; else sleep "$INTERVAL_SEC"; fi
done
adb shell dumpsys batterystats --charged "$PACKAGE" > "$OUT/batterystats-final.txt" 2>&1 || true
echo "finished_at=$(date -Is)" >> "$OUT/README.txt"
echo "Coleta finalizada em $OUT. Verificar pausas, estalos, troca de faixas e bateria MANUALMENTE."
