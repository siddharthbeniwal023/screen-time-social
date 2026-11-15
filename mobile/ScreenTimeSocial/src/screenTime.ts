import {Linking, NativeModules, Platform} from 'react-native';
import type {NativeUsageResult} from './types';

const appColors = ['#E985B4', '#FF786E', '#70C99A', '#7EA7F7', '#FFCF70'];

type AndroidUsageModule = {
  getTodayUsage(): Promise<{
    hasPermission: boolean;
    totalMinutes: number;
    apps: {name: string; minutes: number}[];
  }>;
  openUsageAccessSettings(): Promise<void>;
};

const nativeUsage = NativeModules.ScreenTimeModule as AndroidUsageModule | undefined;

export async function getTodayUsage(): Promise<NativeUsageResult> {
  if (Platform.OS !== 'android' || !nativeUsage) {
    return {hasPermission: false, totalMinutes: 0, apps: []};
  }

  const result = await nativeUsage.getTodayUsage();
  return {
    ...result,
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
