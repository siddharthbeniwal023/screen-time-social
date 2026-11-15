export type AppUsage = {
  name: string;
  minutes: number;
  color: string;
};

export type UsageSummary = {
  totalMinutes: number;
  pickups: number;
  changePercent: number;
  apps: AppUsage[];
};

export type Friend = {
  id: string;
  name: string;
  username: string;
  minutes: number;
  initials: string;
  color: string;
};

export type NativeUsageResult = {
  hasPermission: boolean;
  totalMinutes: number;
  apps: AppUsage[];
};
