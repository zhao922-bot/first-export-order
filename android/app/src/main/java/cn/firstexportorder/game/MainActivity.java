package cn.firstexportorder.game;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalJsonPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        // Capacitor SystemBars handles status/navigation bars, cutouts and IME insets.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
                else moveTaskToBack(true);
            }
        });
    }
}
