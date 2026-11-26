export const HENRIQUE_ID = 'ad72e2a0-2643-4c2b-9c31-e15d77103103';
export const canAccessSeven = (user: { id: string }) => user.id === HENRIQUE_ID;
export interface SevenImage { name: string; data: string }
export interface SevenExpense {
  id: string; description: string; location: string; date: string; cents: number;
  notes: string; accountId: string | null; images: SevenImage[]; version: number;
}
export type SevenSummary = Omit<SevenExpense, 'images'> & { imageCount: number };
export interface SevenMonth { expenses: SevenSummary[]; totalCents: number; accounts: { id: string; name: string; cents: number }[] }
