import {Linking, NativeModules, Platform} from 'react-native';
import type {NativeUsageResult, WeeklyUsageSummary} from './types';

const appColors = ['#E985B4', '#FF786E', '#70C99A', '#7EA7F7', '#FFCF70'];

type AndroidUsageModule = {
  getTodayUsage(): Promise<{
    hasPermission: boolean;
    totalMinutes: number;
    pickups: number;
    apps: {id: string; name: string; minutes: number}[];
  }>;
  getWeeklyUsage(): Promise<{
    hasPermission: boolean;
    totalMinutes: number;
    averageMinutes: number;
    pickups: number;
    days: {
      date: string;
      label: string;
      totalMinutes: number;
      pickups: number;
      isToday: boolean;
    }[];
    apps: {id: string; name: string; minutes: number}[];
  }>;
  openUsageAccessSettings(): Promise<void>;
};

const nativeUsage = NativeModules.ScreenTimeModule as AndroidUsageModule | undefined;

export async function getTodayUsage(): Promise<NativeUsageResult> {
  if (Platform.OS !== 'android' || !nativeUsage) {
    return {hasPermission: false, totalMinutes: 0, pickups: 0, apps: []};
  }

  const result = await nativeUsage.getTodayUsage();
  return {
    ...result,
    pickups: result.pickups ?? 0,
    apps: result.apps.map((app, index) => ({
      ...app,
      color: appColors[index % appColors.length],
    })),
  };
}

export async function getWeeklyUsage(): Promise<WeeklyUsageSummary> {
  if (Platform.OS !== 'android' || !nativeUsage?.getWeeklyUsage) {
    return {
      hasPermission: false,
      totalMinutes: 0,
      averageMinutes: 0,
      pickups: 0,
      days: [],
      apps: [],
    };
  }

  const result = await nativeUsage.getWeeklyUsage();
  return {
    ...result,
    pickups: result.pickups ?? 0,
    apps: result.apps.map((app, index) => ({
      ...app,
      color: appColors[index % appColors.length],
    })),
  };
}

export async function openUsageAccessSettings() {
  if (Platform.OS === 'android' && nativeUsage) {
    await nativeUsage.openUsageAccessSettings();
    return;
  }

  await Linking.openSettings();
}
