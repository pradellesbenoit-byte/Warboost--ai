package fr.warboost.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.content.Intent;
import android.net.Uri;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WarBoostSecureStorage.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if ("https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()))
                    return super.shouldOverrideUrlLoading(view, request);
                String host=uri.getHost()==null?"":uri.getHost().toLowerCase(java.util.Locale.ROOT);
                if ("https".equals(uri.getScheme()) && uri.getUserInfo()==null
                    && !host.matches("(^|.*\\.)(stripe\\.com|lastwar\\.com|funfly\\.com)")) {
                    startActivity(new Intent(Intent.ACTION_VIEW,uri));
                }
                return true;
            }
        });
    }
}
