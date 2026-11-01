package br.com.radiohits.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Arquivos de audio em armazenamento privado; retomada HTTP validada com If-Range. */
final class OfflineStore {
    private static final String PREF = "radiohits_offline_v1";
    private static final long MAX_BYTES = 95L * 1024 * 1024;
    enum Outcome { SUCCESS, RETRY, FAIL, CANCELED }
    interface StopSignal { boolean canceled(); }
    interface Progress {
        void report(String type, String src, int percent, long bytes, long total, String message);
    }
    private static final ConcurrentHashMap<String,Object> LOCKS = new ConcurrentHashMap<>();
    static Object downloadLock(String src) { return LOCKS.computeIfAbsent(src,k -> new Object()); }

    static boolean validUrl(String src) {
        try {
            Uri uri = Uri.parse(src);
            String path = uri.getEncodedPath();
            return "https".equals(uri.getScheme())
                && "jogoiarexx-blip.github.io".equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getQuery() == null && uri.getFragment() == null
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

    static String key(String url) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                .digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : bytes) builder.append(String.format("%02x", b & 0xff));
            return builder.toString();
        } catch (Exception e) { throw new IllegalArgumentException(e); }
    }

    static File file(Context ctx, String url) {
        if (!validUrl(url)) throw new IllegalArgumentException("URL de audio invalida");
        File directory = new File(ctx.getFilesDir(), "radiohits-musicas");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory())
            throw new IllegalStateException("Pasta de downloads indisponivel");
        String path = Uri.parse(url).getPath();
        String ext = path.substring(path.lastIndexOf('.')).toLowerCase(java.util.Locale.ROOT);
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
        File target=file(ctx,url);
        if(target.exists()) target.delete();
        new File(target.getAbsolutePath()+".part").delete();
        new File(target.getAbsolutePath()+".part.validator").delete();
        ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(url).apply();
    }

    private static String validator(HttpURLConnection conn) {
        String etag = conn.getHeaderField("ETag");
        if (etag != null && !etag.isEmpty() && !etag.startsWith("W/"))
            return etag;
        String lastModified = conn.getHeaderField("Last-Modified");
        return lastModified == null ? "" : lastModified;
    }

    private static String readValidator(File f) {
        try { return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8); }
        catch (Exception ignored) { return ""; }
    }

    private static void persistValidator(File f, String value) throws Exception {
        try (FileOutputStream out = new FileOutputStream(f,false)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
    }

    private static long rangeTotal(String header, long position) throws Exception {
        // Content-Range: bytes START-END/TOTAL. Sem esse header, recusa append.
        if (header == null || !header.startsWith("bytes ")) throw new Exception("Range invalido");
        String[] pair = header.substring(6).split("/", 2);
        if (pair.length != 2 || pair[1].equals("*")) throw new Exception("Range sem tamanho");
        String[] bounds = pair[0].split("-", 2);
        if (bounds.length != 2 || Long.parseLong(bounds[0]) != position)
            throw new Exception("Range nao corresponde ao arquivo parcial");
        long end = Long.parseLong(bounds[1]);
        long total = Long.parseLong(pair[1]);
        if (end < position || total <= end || total > MAX_BYTES)
            throw new Exception("Range ou tamanho invalido");
        return total;
    }

    static Outcome download(Context ctx, String url, Progress callback, StopSignal stop) {
        if (!validUrl(url)) return Outcome.FAIL;
        synchronized (downloadLock(url)) {
            return transfer(ctx,url,callback,stop);
        }
    }

    private static Outcome transfer(Context ctx, String url, Progress callback, StopSignal stop) {
        HttpURLConnection conn=null;
        File partial=null;
        File marker=null;
        boolean discardPartial=false;
        boolean permanent=false;
        try {
            if(stop.canceled()) return Outcome.CANCELED;
            if(saved(ctx,url)!=null) {
                callback.report("done",url,100,0,0,"Ja esta salvo");
                return Outcome.SUCCESS;
            }
            File target=file(ctx,url);
            partial=new File(target.getAbsolutePath()+".part");
            marker=new File(target.getAbsolutePath()+".part.validator");
            long previous=partial.isFile()?partial.length():0;
            String previousValidator=readValidator(marker);
            // Sem validator forte ou Last-Modified, descarte parcial (evita misturar versoes).
            if(previous<=0 || previous>MAX_BYTES || previousValidator.isEmpty()) {
                previous=0;
                if(partial.exists()) partial.delete();
                marker.delete();
            }
            callback.report("started",url,previous>0?-1:0,previous,-1,
                previous>0?"Retomando":"Preparando download");
            conn=(HttpURLConnection)new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Accept-Encoding","identity");
            if(previous>0) {
                conn.setRequestProperty("Range","bytes="+previous+"-");
                conn.setRequestProperty("If-Range",previousValidator);
            }
            int code=conn.getResponseCode();
            if(code==416) {
                discardPartial=true;
                throw new IOException("Range invalido; reiniciando");
            }
            if(code==429 || code==408 || code>=500) throw new IOException("HTTP "+code);
            if(code!=200 && code!=206) {
                permanent=true;
                throw new IOException("HTTP "+code);
            }
            if(code==206 && previous==0) {
                discardPartial=true;
                throw new IOException("Resposta parcial inesperada");
            }
            boolean append=previous>0 && code==206;
            long expected=code==206
                ? rangeTotal(conn.getHeaderField("Content-Range"),previous)
                : conn.getContentLengthLong();
            if(expected>MAX_BYTES) {
                permanent=true;
                discardPartial=true;
                throw new IOException("Faixa acima de 95 MB");
            }
            String currentValidator=validator(conn);
            if(append && !previousValidator.equals(currentValidator)) {
                discardPartial=true;
                throw new IOException("Arquivo alterado no servidor");
            }
            if(!append) {
                previous=0;
                partial.delete();
            }
            if(expected>0 && target.getParentFile().getUsableSpace()
                < expected-previous+1024*1024) {
                permanent=true;
                throw new IOException("Espaco insuficiente no dispositivo");
            }
            persistValidator(marker,currentValidator);
            long size=previous;
            int lastPercent=-1;
            try(InputStream input=conn.getInputStream();
                FileOutputStream output=new FileOutputStream(partial,append)) {
                byte[] buffer=new byte[32768];
                for(int n;(n=input.read(buffer))!=-1;) {
                    if(stop.canceled() || Thread.currentThread().isInterrupted())
                        throw new InterruptedIOException("Download pausado");
                    if(n==0) continue;
                    size+=n;
                    if(size>MAX_BYTES) {
                        permanent=true;
                        discardPartial=true;
                        throw new IOException("Limite de tamanho excedido");
                    }
                    output.write(buffer,0,n);
                    if(expected>0) {
                        int percent=(int)Math.min(100,(size*100)/expected);
                        if(percent>=lastPercent+5 || percent==100) {
                            lastPercent=percent;
                            callback.report("progress",url,percent,size,expected,"Baixando");
                        }
                    } else {
                        callback.report("progress",url,-1,size,-1,"Baixando");
                    }
                }
                output.flush();
                output.getFD().sync();
            }
            if(stop.canceled()) return Outcome.CANCELED;
            if(size==0 || (expected>0 && size!=expected))
                throw new IOException("Arquivo incompleto, aguardando retomada");
            if(target.exists() && !target.delete())
                throw new IOException("Falha substituindo arquivo");
            if(!partial.renameTo(target))
                throw new IOException("Falha concluindo download atomico");
            marker.delete();
            ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE)
                .edit().putBoolean(url,true).apply();
            callback.report("done",url,100,size,expected,"Salvo offline");
            return Outcome.SUCCESS;
        } catch(Exception error) {
            if(discardPartial) {
                if(partial!=null) partial.delete();
                if(marker!=null) marker.delete();
            }
            if(stop.canceled() || error instanceof InterruptedIOException)
                return Outcome.CANCELED;
            callback.report("error",url,-1,0,-1,
                error.getMessage()==null?"Erro no download":error.getMessage());
            return permanent ? Outcome.FAIL : Outcome.RETRY;
        } finally {
            if(conn!=null) conn.disconnect();
        }
    }
}
