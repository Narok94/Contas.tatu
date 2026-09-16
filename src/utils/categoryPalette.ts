// Existing category choices, shared without rewriting stored colors.
export const COLOR_PRESETS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#db2777', // pink
  '#7c3aed', // purple
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#475569', // slate
  '#16a34a', // green
  '#ea580c', // orange
];

const CATEGORY_DISPLAY_COLORS: Record<string, string> = {
  '#2563eb': 'var(--color-info)',
  '#059669': 'var(--color-success)',
  '#db2777': 'var(--color-expense)',
  '#7c3aed': 'var(--color-lilac)',
  '#d97706': 'var(--color-warning)',
  '#dc2626': 'var(--color-expense)',
  '#0891b2': 'var(--color-brand)',
  '#475569': 'var(--color-stone-600)',
  '#16a34a': 'var(--color-success)',
  '#ea580c': 'var(--color-warning)',
};
export const categoryDisplayColor = (storedColor: string) => CATEGORY_DISPLAY_COLORS[storedColor.toLowerCase()] ?? storedColor;
