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
    val isActive: Boolean = true
)
