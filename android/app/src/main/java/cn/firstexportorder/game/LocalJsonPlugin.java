package cn.firstexportorder.game;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User chooses one document; no broad storage permissions or arbitrary filesystem API. */
@CapacitorPlugin(name = "LocalJson")
public class LocalJsonPlugin extends Plugin {
    private boolean exporting = false;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        if (filename == null || !filename.matches("[^\\\\/\\p{Cntrl}]+\\.json") || text == null
                || text.getBytes(StandardCharsets.UTF_8).length > 16 * 1024 * 1024) {
            call.reject("导出内容或文件名无效。");
            return;
        }
        if (exporting) { call.reject("请先完成当前文件选择。"); return; }
        exporting = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try { startActivityForResult(call, intent, "documentChosen"); }
        catch (Exception error) { exporting = false; call.reject("无法打开文件选择器。", error); }
    }

    @ActivityCallback
    private void documentChosen(PluginCall call, ActivityResult result) {
        exporting = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        String text = call.getString("text");
        if (text == null) { call.reject("导出已中断，请重新导出。"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
            if (output == null) throw new java.io.IOException("No writable document");
            output.write(text.getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (Exception error) { call.reject("文件写入失败，请选择其他位置重试。", error); return; }
        call.resolve(new JSObject().put("saved", true));
    }
}
