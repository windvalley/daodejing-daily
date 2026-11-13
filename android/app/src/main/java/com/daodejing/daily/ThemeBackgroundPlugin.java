package com.daodejing.daily;

import android.graphics.Color;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 状态栏与导航栏所在的区域由原生窗口绘制，网页管不到。
 * 旧版 WebView（低于 140）下 Capacitor 用原生 padding 让出系统栏，
 * 这块条带显示的就是窗口底色，因此主题切换时必须同步原生底色，
 * 否则应用内强制深色时会出现「浅色条 + 白色图标」，时间和信号都看不见。
 */
@CapacitorPlugin(name = "ThemeBackground")
public class ThemeBackgroundPlugin extends Plugin {

    @PluginMethod
    public void setBackground(PluginCall call) {
        String color = call.getString("color");
        if (color == null || color.isEmpty()) {
            call.reject("缺少颜色参数");
            return;
        }

        final int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException error) {
            call.reject("颜色格式不合法：" + color);
            return;
        }

        getActivity()
            .runOnUiThread(() -> {
                getActivity().getWindow().getDecorView().setBackgroundColor(parsed);
                call.resolve(new JSObject().put("color", color));
            });
    }
}
