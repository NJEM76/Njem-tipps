package com.njem.tipps;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import androidx.appcompat.app.AppCompatActivity;
public class MainActivity extends AppCompatActivity {
  private WebView webView;
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    webView = new WebView(this);
    setContentView(webView);
    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    webView.setWebViewClient(new WebViewClient());
    webView.setWebChromeClient(new WebChromeClient());
    webView.loadUrl("https://njem-tipps.vercel.app");
  }
  @Override
  public void onBackPressed() {
    if (webView.canGoBack()) webView.goBack();
    else super.onBackPressed();
  }
}
