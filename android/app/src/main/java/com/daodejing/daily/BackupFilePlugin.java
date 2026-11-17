package com.daodejing.daily;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 导出备份必须真的落成文件。
 * WebView 对 <a download> + blob: 没有下载监听，点击后文件会被直接丢掉，
 * 页面却仍会提示导出成功，所以原生壳自己写：
 * Android 10 及以上写入系统下载目录（MediaStore，不需要存储权限），
 * 更早的系统写应用自己的外部文件目录，卸载应用时一并删除。
 */
@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {

    private static final String SUB_DIR = "道德经日课";
    private static final String MIME_TYPE = "application/json";
    private static final String FALLBACK_NAME = "daodejing-backup.json";

    @PluginMethod
    public void save(PluginCall call) {
        String content = call.getString("content");
        if (content == null) {
            call.reject("缺少备份内容");
            return;
        }

        String fileName = sanitize(call.getString("fileName", FALLBACK_NAME));
        try {
            JSObject result = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveToDownloads(fileName, content)
                : saveToAppFiles(fileName, content);
            call.resolve(result);
        } catch (Exception error) {
            // 页面会统一加「导出失败：」前缀，这里只给原因
            call.reject(messageOf(error));
        }
    }

    /** Android 10 及以上：写系统下载目录，用户能在文件管理里直接找到 */
    @RequiresApi(Build.VERSION_CODES.Q)
    private JSObject saveToDownloads(String fileName, String content) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, MIME_TYPE);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + File.separator + SUB_DIR);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IOException("系统下载目录不可用");
        }

        try {
            try (OutputStream stream = resolver.openOutputStream(uri)) {
                if (stream == null) {
                    throw new IOException("无法写入下载文件");
                }
                stream.write(content.getBytes(StandardCharsets.UTF_8));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
        } catch (Exception error) {
            // 写失败时删掉半成品，避免下载目录里留下打不开的文件
            resolver.delete(uri, null, null);
            throw error instanceof IOException ? (IOException) error : new IOException(messageOf(error), error);
        }

        String savedName = queryDisplayName(resolver, uri, fileName);
        return new JSObject().put("location", Environment.DIRECTORY_DOWNLOADS + "/" + SUB_DIR + "/" + savedName);
    }

    /** Android 9 及以下：没有免权限的公共下载目录，写入应用文件目录 */
    private JSObject saveToAppFiles(String fileName, String content) throws IOException {
        File external = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File base = external != null ? external : getContext().getFilesDir();
        File dir = new File(base, SUB_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("无法创建备份目录");
        }

        File file = uniqueFile(dir, fileName);
        try (FileOutputStream stream = new FileOutputStream(file)) {
            stream.write(content.getBytes(StandardCharsets.UTF_8));
        }
        // 回报真实可查的相对路径：外部目录挂在 Android/data 下，内部目录只能在应用内看到
        String location = external != null
            ? "Android/data/" + getContext().getPackageName() + "/files/Download/" + SUB_DIR + "/" + file.getName()
            : "应用内部存储/" + SUB_DIR + "/" + file.getName();
        return new JSObject().put("location", location);
    }

    /** 重名文件追加序号，不能覆盖上一次的备份 */
    private File uniqueFile(File dir, String fileName) {
        File file = new File(dir, fileName);
        if (!file.exists()) {
            return file;
        }
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";
        for (int index = 2; index < 1000; index++) {
            file = new File(dir, base + " (" + index + ")" + extension);
            if (!file.exists()) {
                return file;
            }
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + extension);
    }

    /** MediaStore 可能给重名文件追加序号，按库里实际的名字回报位置 */
    private String queryDisplayName(ContentResolver resolver, Uri uri, String fallback) {
        try (
            Cursor cursor = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) {
                    return name;
                }
            }
        } catch (Exception ignored) {
            // 查不到就按传入的文件名展示
        }
        return fallback;
    }

    private String sanitize(String fileName) {
        String safe = fileName == null ? "" : fileName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (safe.isEmpty() || safe.equals(".") || safe.equals("..")) {
            return FALLBACK_NAME;
        }
        return safe;
    }

    private String messageOf(Exception error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
