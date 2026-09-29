import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes text from CSV bulk imports and database records to guarantee that
 * spacing, numbering, bullet points, and multi-line paragraphs are faithfully preserved.
 * Handles literal escaped '\n' or '\r\n', standard Windows/Unix linebreaks,
 * and maintains indentations and blank paragraph lines.
 */
export function formatFormattedText(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  
  // Convert literal HTML breaks if present
  str = str.replace(/<br\s*\/?>/gi, '\n');

  // Unescape literal escaped backslash-n sequences like '\n' or '\r\n'
  str = str.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
  
  // Normalize Windows carriage returns and Mac returns to standard Unix line feed
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Trim outer edge spaces while leaving internal whitespace and paragraph breaks intact
  return str.trim();
}
