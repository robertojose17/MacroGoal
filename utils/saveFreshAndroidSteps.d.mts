export function saveFreshAndroidSteps<T>(options: {
  date: Date;
  toDateKey: (date: Date) => string;
  read: (date: Date) => Promise<{
    available: boolean;
    permission: string;
    steps: number | null;
    error?: string;
  } | undefined>;
  save: (day: string, steps: number) => Promise<T>;
}): Promise<T | null>;
