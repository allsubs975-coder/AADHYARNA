/**
 * Enquiry helpers — WhatsApp deep links with a prefilled message.
 *
 * The message is assembled ONLY from public fields. Grading report numbers
 * and media URLs are private and must never be added here.
 * No backend is involved: `wa.me` opens WhatsApp directly with the text.
 */

import { brand } from '../config/brand';
import { features } from '../config/features';
import type { Diamond } from './types';

export const whatsappAvailable: boolean =
  features.whatsapp && brand.contact.whatsappDigits.trim().length > 0;

/** https://wa.me/<digits>?text=<encoded message> */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${brand.contact.whatsappDigits.trim()}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Product-specific enquiry message.
 * Lines are only added when the value actually exists in the inventory.
 */
export function diamondEnquiryMessage(d: Diamond): string {
  const lines: string[] = [`Hello, I am interested in diamond ${d.id}.`];
  if (d.shape) lines.push(`Shape: ${d.shape}`);
  if (typeof d.weight === 'number') lines.push(`Carat: ${d.weight.toFixed(2)}`);
  if (d.color) lines.push(`Color: ${d.color}`);
  if (d.clarity) lines.push(`Clarity: ${d.clarity}`);
  lines.push('', 'Please share more information.');
  return lines.join('\n');
}

/** Generic enquiry used on the contact page and floating button. */
export function generalEnquiryMessage(): string {
  return 'Hello AADHYARNA, I would like to know more about your lab-grown diamonds.';
}
