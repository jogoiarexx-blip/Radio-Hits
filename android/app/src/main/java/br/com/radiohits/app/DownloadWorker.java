package br.com.radiohits.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Fila persistente via WorkManager. Cada arquivo tem um unique work independente;
 * a gravacao de cada arquivo e protegida pelo bloqueio do OfflineStore.
 * O WorkManager retoma tarefas elegiveis apos encerramento do processo/reinicio.
 */
public final class DownloadWorker extends Worker {
    static final String TAG = "radiohits-download-v2";
    private static final String PAUSED = "radiohits_paused_downloads_v2";
    private static final String URL = "src";
    private static final String RECEIVED = "received";
    private static final String TOTAL = "total";
    private static final String PERCENT = "percent";
    private static final String DETAIL = "detail";

    public DownloadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static String jobName(String url) {
        return "radiohits-track:" + OfflineStore.key(url);
    }

    static void enqueue(Context context, String json) throws Exception {
        JSONObject request = new JSONObject(json);
        String url = request.getString(URL);
        if (!OfflineStore.validUrl(url)) throw new SecurityException("Origem nao autorizada");
        if (OfflineStore.saved(context, url) != null) return;
        context.getSharedPreferences(PAUSED, Context.MODE_PRIVATE)
            .edit().remove(url).apply();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED).build();
        Data data = new Data.Builder().putString(URL, url).build();
        OneTimeWorkRequest task = new OneTimeWorkRequest.Builder(DownloadWorker.class)
            .setInputData(data)
            .addTag(TAG)
            .addTag("url:" + url)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            jobName(url), ExistingWorkPolicy.REPLACE, task);
    }

    static void pause(Context context, String url) {
        if (!OfflineStore.validUrl(url)) return;
        context.getSharedPreferences(PAUSED, Context.MODE_PRIVATE)
            .edit().putBoolean(url, true).apply();
        WorkManager.getInstance(context).cancelUniqueWork(jobName(url));
    }

    static void cancelAndDelete(Context context, String url) {
        if (!OfflineStore.validUrl(url)) return;
        WorkManager manager = WorkManager.getInstance(context);
        manager.cancelUniqueWork(jobName(url));
        // Nao excluir arquivos enquanto outro Worker ainda escreve.
        synchronized (OfflineStore.downloadLock(url)) {
            OfflineStore.delete(context,url);
            context.getSharedPreferences(PAUSED, Context.MODE_PRIVATE)
                .edit().remove(url).apply();
        }
    }

    static String jobs(Context context) throws Exception {
        JSONArray jobs = new JSONArray();
        SharedPreferences paused = context.getSharedPreferences(PAUSED,Context.MODE_PRIVATE);
        for (Map.Entry<String,?> entry : paused.getAll().entrySet()) {
            String url = entry.getKey();
            if (!Boolean.TRUE.equals(entry.getValue()) || !OfflineStore.validUrl(url)
                || OfflineStore.saved(context,url) != null) continue;
            JSONObject item = new JSONObject();
            item.put("url",url);
            item.put("state","paused");
            jobs.put(item);
        }
        List<WorkInfo> infos = WorkManager.getInstance(context).getWorkInfosByTag(TAG).get();
        for (WorkInfo info : infos) {
            WorkInfo.State state = info.getState();
            if (state != WorkInfo.State.ENQUEUED
                && state != WorkInfo.State.RUNNING
                && state != WorkInfo.State.BLOCKED) continue;
            String url = info.getProgress().getString(URL);
            if (url == null) url = info.getTags().stream()
                .filter(tag -> tag.startsWith("url:")).findFirst().orElse(null);
            if (url == null) continue;
            if (url.startsWith("url:")) url = url.substring(4);
            if (!OfflineStore.validUrl(url)
                || paused.getBoolean(url,false)
                || OfflineStore.saved(context,url) != null) continue;
            Data progress = info.getProgress();
            JSONObject item = new JSONObject();
            item.put("url",url);
            item.put("state",state == WorkInfo.State.RUNNING ? "running" : "queued");
            item.put("percent",progress.getInt(PERCENT,-1));
            item.put("bytes",progress.getLong(RECEIVED,0));
            item.put("total",progress.getLong(TOTAL,-1));
            jobs.put(item);
        }
        return jobs.toString();
    }

    @Override @NonNull public Result doWork() {
        String url = getInputData().getString(URL);
        if (!OfflineStore.validUrl(url)) return Result.failure();
        if (isStopped()) return Result.failure();
        try {
            OfflineStore.Outcome result = OfflineStore.download(
                getApplicationContext(), url,
                (type,src,percent,received,total,message) -> {
                    Data progress = new Data.Builder().putString(URL,src)
                        .putInt(PERCENT,percent)
                        .putLong(RECEIVED,received)
                        .putLong(TOTAL,total)
                        .putString(DETAIL,message)
                        .build();
                    setProgressAsync(progress);
                }, this::isStopped);
            if (result == OfflineStore.Outcome.SUCCESS) return Result.success();
            if (result == OfflineStore.Outcome.CANCELED) return Result.failure();
            if (result == OfflineStore.Outcome.RETRY && getRunAttemptCount() < 5)
                return Result.retry();
            return Result.failure();
        } catch (Exception ignored) {
            return getRunAttemptCount() < 5 && !isStopped() ? Result.retry() : Result.failure();
        }
    }
}
