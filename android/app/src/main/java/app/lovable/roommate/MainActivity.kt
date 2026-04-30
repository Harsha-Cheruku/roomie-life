package app.lovable.roommate

import android.os.Bundle
import app.lovable.roommate.alarm.AlarmPlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AlarmPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}