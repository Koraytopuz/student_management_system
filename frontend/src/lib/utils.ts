import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sınıf seviyeleri büyükten küçüğe (12, 11, 10, ..., 4) */
export const GRADE_LEVELS_DESCENDING = ['12', '11', '10', '9', '8', '7', '6', '5', '4'] as const;

/** Sınıf listesini büyükten küçüğe sırala (12, 11, 10, ..., 4; TYT, AYT, Mezun sonda) */
export function sortGradeLevelsDescending(grades: string[]): string[] {
  const order: Record<string, number> = {
    '12': 0, '11': 1, '10': 2, '9': 3, '8': 4, '7': 5, '6': 6, '5': 7, '4': 8,
    TYT: 9, AYT: 10, Mezun: 11,
  };
  return [...grades].sort((a, b) => {
    const ia = order[a] ?? 999;
    const ib = order[b] ?? 999;
    return ia - ib;
  });
}
