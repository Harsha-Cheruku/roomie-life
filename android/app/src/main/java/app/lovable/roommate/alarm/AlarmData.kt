package app.lovable.roommate.alarm

data class AlarmData(
    val id: String,
    val title: String,
    val hour: Int,
    val minute: Int,
    val repeatDaily: Boolean = false,
    val ringtoneUri: String? = null,
    val stopCondition: String = "anyone", // "anyone", "owner_only"
    val createdBy: String = "",
    val isActive: Boolean = true,
    val repeatWeekly: Boolean = false,
    val dayOfWeek: Int = -1 // 1=Sun..7=Sat (Calendar.DAY_OF_WEEK), -1 = none
)
