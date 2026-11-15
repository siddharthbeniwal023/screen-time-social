package com.screentimesocial

import android.app.AppOpsManager
import android.app.usage.UsageEvents
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
import java.text.SimpleDateFormat
import java.util.Locale

class ScreenTimeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  private data class ActivityKey(val packageName: String, val className: String)
  private data class UsageSnapshot(
      val totalTimeMillis: Long,
      val pickups: Int,
      val timeByPackage: Map<String, Long>,
  )
  private data class PackageGroups(
      val userApps: Set<String>,
      val homeApps: Set<String>,
  )

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
        result.putInt("pickups", 0)
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
      val now = System.currentTimeMillis()
      val packageGroups = getPackageGroups()
      val usage = calculateUsageSnapshot(
          manager = manager,
          startTime = calendar.timeInMillis,
          endTime = now,
          includedPackages = packageGroups.userApps,
          homePackages = packageGroups.homeApps,
      )

      result.putInt("totalMinutes", (usage.totalTimeMillis / ONE_MINUTE_MILLIS).toInt())
      result.putInt("pickups", usage.pickups)
      result.putArray("apps", createAppsArray(usage.timeByPackage, 12))
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("USAGE_QUERY_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getWeeklyUsage(promise: Promise) {
    try {
      val result = Arguments.createMap()
      val hasPermission = hasUsagePermission()
      result.putBoolean("hasPermission", hasPermission)
      if (!hasPermission) {
        result.putInt("totalMinutes", 0)
        result.putInt("averageMinutes", 0)
        result.putInt("pickups", 0)
        result.putArray("days", Arguments.createArray())
        result.putArray("apps", Arguments.createArray())
        promise.resolve(result)
        return
      }

      val now = System.currentTimeMillis()
      val todayStart = startOfDay(Calendar.getInstance())
      val daysSinceMonday = (todayStart.get(Calendar.DAY_OF_WEEK) - Calendar.MONDAY + 7) % 7
      val weekStart = (todayStart.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, -daysSinceMonday)
      }
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val packageGroups = getPackageGroups()
      val days = Arguments.createArray()
      val weeklyAppTimes = mutableMapOf<String, Long>()
      val dateFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val dayFormatter = SimpleDateFormat("EEE", Locale.getDefault())
      var totalTimeMillis = 0L
      var totalPickups = 0

      for (dayIndex in 0 until DAYS_PER_WEEK) {
        val dayStart = (weekStart.clone() as Calendar).apply {
          add(Calendar.DAY_OF_YEAR, dayIndex)
        }
        val nextDay = (dayStart.clone() as Calendar).apply {
          add(Calendar.DAY_OF_YEAR, 1)
        }
        val isFuture = dayStart.timeInMillis > now
        val dayEnd = minOf(nextDay.timeInMillis, now)
        val snapshot = if (isFuture) {
          UsageSnapshot(0L, 0, emptyMap())
        } else {
          calculateUsageSnapshot(
              manager = manager,
              startTime = dayStart.timeInMillis,
              endTime = dayEnd,
              includedPackages = packageGroups.userApps,
              homePackages = packageGroups.homeApps,
          )
        }

        totalTimeMillis += snapshot.totalTimeMillis
        totalPickups += snapshot.pickups
        snapshot.timeByPackage.forEach { (packageName, duration) ->
          weeklyAppTimes[packageName] =
              weeklyAppTimes.getOrDefault(packageName, 0L) + duration
        }

        val item = Arguments.createMap()
        item.putString("date", dateFormatter.format(dayStart.time))
        item.putString("label", dayFormatter.format(dayStart.time))
        item.putInt("totalMinutes", (snapshot.totalTimeMillis / ONE_MINUTE_MILLIS).toInt())
        item.putInt("pickups", snapshot.pickups)
        item.putBoolean("isToday", dayIndex == daysSinceMonday)
        days.pushMap(item)
      }

      val completedDays = daysSinceMonday + 1
      result.putInt("totalMinutes", (totalTimeMillis / ONE_MINUTE_MILLIS).toInt())
      result.putInt(
          "averageMinutes",
          (totalTimeMillis / ONE_MINUTE_MILLIS / completedDays).toInt(),
      )
      result.putInt("pickups", totalPickups)
      result.putArray("days", days)
      result.putArray("apps", createAppsArray(weeklyAppTimes, 5))
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("WEEKLY_USAGE_QUERY_FAILED", error.message, error)
    }
  }

  private fun startOfDay(calendar: Calendar): Calendar = calendar.apply {
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }

  private fun getPackageGroups(): PackageGroups {
    val packageManager = context.packageManager
    val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val launchablePackages = packageManager
        .queryIntentActivities(launcherIntent, 0)
        .mapNotNull { it.activityInfo?.packageName }
        .toSet()
    val homePackages = packageManager
        .queryIntentActivities(homeIntent, 0)
        .mapNotNull { it.activityInfo?.packageName }
        .toSet()
    return PackageGroups(launchablePackages - homePackages, homePackages)
  }

  private fun createAppsArray(timeByPackage: Map<String, Long>, limit: Int) =
      Arguments.createArray().also { apps ->
        val packageManager = context.packageManager
        timeByPackage.entries
            .filter { it.value >= ONE_MINUTE_MILLIS }
            .sortedByDescending { it.value }
            .take(limit)
            .forEach { usageEntry ->
              val item = Arguments.createMap()
              val label = try {
                val applicationInfo = packageManager.getApplicationInfo(usageEntry.key, 0)
                packageManager.getApplicationLabel(applicationInfo).toString()
              } catch (_: Exception) {
                usageEntry.key.substringAfterLast('.')
              }
              item.putString("id", usageEntry.key)
              item.putString("name", label)
              item.putInt("minutes", (usageEntry.value / ONE_MINUTE_MILLIS).toInt())
              apps.pushMap(item)
            }
      }

  /**
   * Builds one foreground-app timeline from lifecycle events. UsageStats totals are
   * bucketed and Android may expand a requested range to whole buckets, which can
   * include time from before midnight. Events preserve the exact requested range
   * and avoid counting two packages for the same instant.
   */
  @Suppress("DEPRECATION")
  private fun calculateUsageSnapshot(
      manager: UsageStatsManager,
      startTime: Long,
      endTime: Long,
      includedPackages: Set<String>,
      homePackages: Set<String>,
  ): UsageSnapshot {
    if (endTime <= startTime) {
      return UsageSnapshot(0L, 0, emptyMap())
    }

    // The lookback reconstructs the screen/app state for a session crossing midnight.
    val queryStart = (startTime - STATE_LOOKBACK_MILLIS).coerceAtLeast(0L)
    val events = manager.queryEvents(queryStart, endTime)
        ?: return UsageSnapshot(0L, 0, emptyMap())
    val usageByPackage = mutableMapOf<String, Long>()
    val resumedActivities = mutableMapOf<ActivityKey, Long>()
    var resumeOrder = 0L
    var currentActivity: ActivityKey? = null
    var screenInteractive = false
    var screenStateKnown = false
    var keyguardVisible = false
    var totalTimeMillis = 0L
    var unlockCount = 0
    var interactiveSessionCount = 0
    var previousTime = queryStart

    fun accountUntil(timestamp: Long) {
      val intervalStart = maxOf(previousTime, startTime)
      if (
          timestamp > intervalStart &&
          screenInteractive &&
          !keyguardVisible
      ) {
        val elapsed = timestamp - intervalStart
        val packageName = currentActivity?.packageName
        if (packageName != null && packageName !in homePackages) {
          totalTimeMillis += elapsed
        }
        if (packageName != null && packageName in includedPackages) {
          usageByPackage[packageName] =
              usageByPackage.getOrDefault(packageName, 0L) + elapsed
        }
      }
      previousTime = timestamp
    }

    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val eventTime = event.timeStamp.coerceIn(queryStart, endTime)
      if (eventTime < previousTime) {
        continue
      }
      accountUntil(eventTime)

      when (event.eventType) {
        // MOVE_TO_FOREGROUND and ACTIVITY_RESUMED share this event value.
        UsageEvents.Event.MOVE_TO_FOREGROUND -> {
          val packageName = event.packageName ?: continue
          val activity = ActivityKey(packageName, event.className.orEmpty())
          resumeOrder += 1
          resumedActivities[activity] = resumeOrder
          currentActivity = activity
          // Screen events were introduced in API 28. A resumed activity is the
          // best available indication of an interactive screen when none exists.
          if (!screenStateKnown) {
            screenInteractive = true
            keyguardVisible = false
          }
        }

        // MOVE_TO_BACKGROUND and ACTIVITY_PAUSED share this event value.
        UsageEvents.Event.MOVE_TO_BACKGROUND -> {
          val activity = ActivityKey(event.packageName.orEmpty(), event.className.orEmpty())
          resumedActivities.remove(activity)
          if (currentActivity == activity) {
            currentActivity = resumedActivities.maxByOrNull { it.value }?.key
          }
        }

        UsageEvents.Event.SCREEN_INTERACTIVE -> {
          if (!screenInteractive && eventTime >= startTime) {
            interactiveSessionCount += 1
          }
          screenInteractive = true
          screenStateKnown = true
        }

        UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
          screenInteractive = false
          screenStateKnown = true
        }

        UsageEvents.Event.KEYGUARD_SHOWN -> keyguardVisible = true
        UsageEvents.Event.KEYGUARD_HIDDEN -> {
          keyguardVisible = false
          if (eventTime >= startTime) {
            unlockCount += 1
          }
        }

        UsageEvents.Event.DEVICE_SHUTDOWN -> {
          resumedActivities.clear()
          currentActivity = null
          screenInteractive = false
          screenStateKnown = true
        }
      }
    }

    accountUntil(endTime)
    // KEYGUARD_HIDDEN is Android's closest equivalent to an iOS pickup. Devices
    // without a keyguard may not emit it, so screen-on sessions are the fallback.
    val pickups = if (unlockCount > 0) unlockCount else interactiveSessionCount
    return UsageSnapshot(totalTimeMillis, pickups, usageByPackage)
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

  private companion object {
    const val DAYS_PER_WEEK = 7
    const val ONE_MINUTE_MILLIS = 60_000L
    const val STATE_LOOKBACK_MILLIS = 24L * 60L * ONE_MINUTE_MILLIS
  }
}
