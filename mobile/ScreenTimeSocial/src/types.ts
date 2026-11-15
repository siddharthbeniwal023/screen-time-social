export type AppUsage = {
  id?: string;
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
  minutes?: number;
  initials: string;
  color: string;
};

export type NativeUsageResult = {
  hasPermission: boolean;
  totalMinutes: number;
  pickups: number;
  apps: AppUsage[];
};

export type WeeklyUsageDay = {
  date: string;
  label: string;
  totalMinutes: number;
  pickups: number;
  isToday: boolean;
};

export type WeeklyUsageSummary = {
  hasPermission: boolean;
  totalMinutes: number;
  averageMinutes: number;
  pickups: number;
  days: WeeklyUsageDay[];
  apps: AppUsage[];
};
