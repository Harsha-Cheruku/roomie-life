package app.lovable.roommate

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.MimeTypeMap
import app.lovable.roommate.alarm.AlarmPlugin
import com.getcapacitor.BridgeActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AlarmPlugin::class.java)
        super.onCreate(savedInstanceState)
        handleSharedIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSharedIntent(intent)
    }

    private fun handleSharedIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return

        val uris: List<Uri> = when (action) {
            Intent.ACTION_SEND -> {
                val uri = if (android.os.Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else
                    @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
                listOfNotNull(uri)
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val list = if (android.os.Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else
                    @Suppress("DEPRECATION") intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                list?.toList() ?: emptyList()
            }
            else -> emptyList()
        }

        val title = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""

        val files = JSONArray()
        val resolver: ContentResolver = contentResolver
        for (uri in uris) {
            try {
                val mime = resolver.getType(uri)
                    ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                        MimeTypeMap.getFileExtensionFromUrl(uri.toString())
                    )
                    ?: "application/octet-stream"

                val bytes = resolver.openInputStream(uri).use { input ->
                    val out = ByteArrayOutputStream()
                    input?.copyTo(out)
                    out.toByteArray()
                }
                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "shared"
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val obj = JSONObject()
                obj.put("name", name)
                obj.put("type", mime)
                obj.put("dataBase64", b64)
                files.put(obj)
            } catch (_: Exception) { /* skip unreadable uri */ }
        }

        val payload = JSONObject().apply {
            put("files", files)
            put("title", title)
            put("text", text)
            put("ts", System.currentTimeMillis())
        }

        // Stash the payload on window so the JS bootstrap can pick it up,
        // then navigate the web app to /share-import.
        val js = """
            (function(){
              try {
                window.__roommateSharedIntent = ${payload};
                if (window.location.pathname !== '/share-import') {
                  window.location.replace('/share-import?from=intent');
                }
              } catch(e) { console.error('share-intent inject failed', e); }
            })();
        """.trimIndent()

        // Defer until WebView is ready
        bridge.webView.postDelayed({
            try {
                bridge.webView.evaluateJavascript(js, null)
            } catch (_: Exception) { /* ignore */ }
        }, 600)
    }
}