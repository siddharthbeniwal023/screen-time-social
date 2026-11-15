package com.screentimesocial

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Calendar

class ScreenTimeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName() = "ScreenTimeModule"

  @ReactMethod
  fun openUsageAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getTodayUsage(promise: Promise) {
    try {
      val result = Arguments.createMap()
      val hasPermission = hasUsagePermission()
      result.putBoolean("hasPermission", hasPermission)

      if (!hasPermission) {
        result.putInt("totalMinutes", 0)
        result.putArray("apps", Arguments.createArray())
        promise.resolve(result)
        return
      }

      val calendar = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val stats = manager.queryAndAggregateUsageStats(calendar.timeInMillis, System.currentTimeMillis())
      val packageManager = context.packageManager
      val apps = Arguments.createArray()
      val activeStats = stats.values.filter { it.totalTimeInForeground > 0 }
      val totalMilliseconds = activeStats.sumOf { it.totalTimeInForeground }

      activeStats
          .sortedByDescending { it.totalTimeInForeground }
          .take(12)
          .forEach { usage ->
            val item = Arguments.createMap()
            val label = try {
              val applicationInfo = packageManager.getApplicationInfo(usage.packageName, 0)
              packageManager.getApplicationLabel(applicationInfo).toString()
            } catch (_: Exception) {
              usage.packageName.substringAfterLast('.')
            }
            item.putString("name", label)
            item.putInt("minutes", (usage.totalTimeInForeground / 60_000L).toInt())
            apps.pushMap(item)
          }

      result.putInt("totalMinutes", (totalMilliseconds / 60_000L).toInt())
      result.putArray("apps", apps)
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("USAGE_QUERY_FAILED", error.message, error)
    }
  }

  private fun hasUsagePermission(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName,
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
