package br.com.radiohits.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Map;

/** Guarda apenas arquivos baixados explicitamente em armazenamento privado do aplicativo. */
final class OfflineStore {
    private static final String PREF = "radiohits_offline_v1";
    private static final long MAX_BYTES = 95L * 1024 * 1024;
    private static final String ROOT = "https://jogoiarexx-blip.github.io/Radio-Hits/musicas/";
    interface Progress {
        void report(String type, String src, int percent, String message);
    }

    static boolean validUrl(String src) {
        try {
            Uri uri = Uri.parse(src);
            String path = uri.getEncodedPath();
            return "https".equals(uri.getScheme())
                && "jogoiarexx-blip.github.io".equalsIgnoreCase(uri.getHost())
                && path != null && path.startsWith("/Radio-Hits/musicas/")
                && (path.toLowerCase().endsWith(".mp3")
                 || path.toLowerCase().endsWith(".m4a")
                 || path.toLowerCase().endsWith(".ogg")
                 || path.toLowerCase().endsWith(".opus")
                 || path.toLowerCase().endsWith(".wav")
                 || path.toLowerCase().endsWith(".aac")
                 || path.toLowerCase().endsWith(".flac"));
        } catch (Exception e) { return false; }
    }

    private static String key(String url) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(url.getBytes("UTF-8"));
            StringBuilder builder = new StringBuilder();
            for (byte b : bytes) builder.append(String.format("%02x", b & 0xff));
            return builder.toString();
        } catch (Exception e) { throw new IllegalArgumentException(e); }
    }

    static File file(Context ctx, String url) {
        if (!validUrl(url)) throw new IllegalArgumentException("URL de áudio inválida");
        File directory = new File(ctx.getFilesDir(), "radiohits-musicas");
        if (!directory.isDirectory()) directory.mkdirs();
        String ext = url.substring(url.lastIndexOf('.')).toLowerCase();
        return new File(directory, key(url) + ext);
    }

    static File saved(Context ctx, String url) {
        if (!validUrl(url)) return null;
        File candidate = file(ctx, url);
        return candidate.isFile() && candidate.length() > 0 ? candidate : null;
    }

    static String list(Context ctx) {
        SharedPreferences pref=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        JSONArray arr=new JSONArray();
        for (Map.Entry<String,?> item : pref.getAll().entrySet()) {
            String url=item.getKey();
            if (saved(ctx,url)!=null) arr.put(url);
        }
        return arr.toString();
    }

    static void delete(Context ctx, String url) {
        if (!validUrl(url)) return;
        File file=file(ctx,url);
        if(file.exists()) file.delete();
        ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(url).apply();
    }

    static void download(Context ctx, String json, Progress callback) {
        String url="";
        HttpURLConnection conn=null;
        File partial=null;
        try {
            JSONObject req=new JSONObject(json);
            url=req.getString("src");
            if(!validUrl(url)) throw new SecurityException("Origem não permitida");
            if(saved(ctx,url)!=null) {callback.report("done",url,100,"Já está salvo");return;}
            File target=file(ctx,url);
            partial=new File(target.getAbsolutePath()+".part");
            callback.report("started",url,0,"Preparando download");
            conn=(HttpURLConnection)new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Accept-Encoding","identity");
            int code=conn.getResponseCode();
            if(code!=200) throw new Exception("HTTP "+code);
            long expected=conn.getContentLengthLong();
            if(expected>MAX_BYTES) throw new Exception("Faixa acima de 95 MB");
            long size=0;
            int lastPercent=-1;
            try(InputStream input=conn.getInputStream();FileOutputStream output=new FileOutputStream(partial)) {
                byte[] buffer=new byte[32768];
                for(int n;(n=input.read(buffer))!=-1;) {
                    size+=n;
                    if(size>MAX_BYTES) throw new Exception("Limite de tamanho atingido");
                    output.write(buffer,0,n);
                    if(expected>0){
                        int percent=(int)Math.min(100,(size*100)/expected);
                        if(percent>=lastPercent+5 || percent==100){
                            lastPercent=percent;
                            callback.report("progress",url,percent,"Baixando");
                        }
                    }
                }
                output.flush();
            }
            if(size==0 || (expected>0 && size!=expected)) throw new Exception("Download incompleto");
            if(target.exists()) target.delete();
            if(!partial.renameTo(target)) throw new Exception("Não foi possível salvar arquivo");
            ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putBoolean(url,true).apply();
            callback.report("done",url,100,"Salvo offline");
        } catch(Exception error) {
            if(partial!=null) partial.delete();
            callback.report("error",url,0,error.getMessage()==null?"Erro no download":error.getMessage());
        } finally {
            if(conn!=null)conn.disconnect();
        }
    }
}
