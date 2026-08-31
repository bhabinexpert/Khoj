import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional classes that also *resolve conflicts*.
 *
 * `clsx` flattens the conditionals; `tailwind-merge` then makes the last class
 * in a family win, so a caller passing `className="px-8"` overrides a
 * component's built-in `px-4` instead of both landing in the DOM and leaving
 * the outcome to stylesheet order.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
