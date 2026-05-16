package app.lovable.roommate

import android.content.ContentResolver
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
    private val maxSharedImageDimension = 1400

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
                    ?: intent.type?.takeIf { it.isNotBlank() && it != "*/*" }
                    ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                        MimeTypeMap.getFileExtensionFromUrl(uri.toString())
                    )
                    ?: "application/octet-stream"

                val compressedImage = if (mime.startsWith("image/")) compressSharedImage(resolver, uri) else null
                val bytes = compressedImage ?: resolver.openInputStream(uri).use { input ->
                    val out = ByteArrayOutputStream()
                    input?.copyTo(out)
                    out.toByteArray()
                }
                val type = if (compressedImage != null) "image/jpeg" else mime
                val rawName = uri.lastPathSegment?.substringAfterLast('/') ?: "shared"
                val name = if (compressedImage != null && !rawName.endsWith(".jpg", true) && !rawName.endsWith(".jpeg", true)) {
                    rawName.substringBeforeLast('.', rawName) + ".jpg"
                } else rawName
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val obj = JSONObject()
                obj.put("name", name)
                obj.put("type", type)
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

        // Detect which share-target alias the user picked from the system
        // share sheet so we can route to the correct in-app destination
        // (bill scanner / room chat) instead of always showing the chooser.
        val componentName = intent.component?.className ?: ""
        val target = when {
            componentName.endsWith("ShareToBillActivity") -> "bill"
            componentName.endsWith("ShareToChatActivity") -> "chat"
            else -> "choose"
        }
        val targetParam = "?from=intent&as=$target&shareTs=${System.currentTimeMillis()}"

        // Stash the payload on window so the JS bootstrap can pick it up,
        // then navigate the web app to /share-import.
        val js = """
            (function(){
              try {
                window.__roommateSharedIntent = ${payload};
                try { sessionStorage.setItem('roommate_native_shared_intent', JSON.stringify(window.__roommateSharedIntent)); } catch (_) {}
                var target = '/share-import$targetParam';
                if (window.location.pathname === '/share-import') { window.location.replace(target); return 'reload'; }
                window.history.pushState({ roommateShare: true }, '', target);
                try { window.dispatchEvent(new PopStateEvent('popstate', { state: { roommateShare: true } })); }
                catch (_) { window.dispatchEvent(new Event('popstate')); }
                return 'ok';
              } catch(e) { console.error('share-intent inject failed', e); }
            })();
        """.trimIndent()

        injectWhenReady(js)
    }

    private fun injectWhenReady(js: String, attempt: Int = 0) {
        bridge.webView.postDelayed({
            try {
                bridge.webView.evaluateJavascript(
                    "(function(){ return (document.readyState === 'loading' || !document.getElementById('root')) ? 'not-ready' : (function(){ $js })(); })();"
                ) { result ->
                    if (result?.contains("not-ready") == true && attempt < 20) {
                        injectWhenReady(js, attempt + 1)
                    }
                }
            } catch (_: Exception) { /* ignore */ }
        }, if (attempt == 0) 300 else 500)
    }

    private fun compressSharedImage(resolver: ContentResolver, uri: Uri): ByteArray? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

            var sample = 1
            while ((bounds.outWidth / sample) > maxSharedImageDimension || (bounds.outHeight / sample) > maxSharedImageDimension) {
                sample *= 2
            }

            val options = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
            bitmap.recycle()
            out.toByteArray()
        } catch (_: Exception) {
            null
        }
    }
}