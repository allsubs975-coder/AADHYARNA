/**
 * Homepage content — every editable string for the homepage lives here.
 *
 * Component logic never hard-codes marketing copy; it reads this file.
 * Reorder sections by editing `homeSections` below (no component changes).
 *
 * Rebuild required after editing:  npm run build
 */

import { features } from './features';

export const home = {
  hero: {
    overline: 'Lab-grown diamonds',
    headline: 'A New Era of Brilliance.',
    support:
      'Discover exceptional lab-grown diamonds, thoughtfully selected for every meaningful moment.',
    primaryCta: { label: 'Explore Diamonds', href: '/diamonds' },
    secondaryCta: { label: 'Discover Lab-Grown Diamonds', href: '/education#lab-grown' },
  },

  discovery: {
    overline: 'Begin your search',
    title: 'Find your diamond',
    support:
      'Start with the essentials — shape, carat weight, colour and clarity — then refine across the whole catalogue.',
    ctaLabel: 'Explore matching diamonds',
  },

  shapes: {
    overline: 'Explore by shape',
    title: 'A collection built around rare and antique cuts',
    support:
      'Each shape below is taken from our live inventory, with the number of diamonds currently catalogued in that family.',
    allShapesLabel: 'View all shapes',
    allShapesHref: '/diamonds',
    secondaryNote: 'Also catalogued:',
  },

  featured: {
    overline: 'Featured diamonds',
    title: 'Selected from the current inventory',
    support:
      'Selection rule: the first eight diamonds in inventory order that carry both a recorded grading report and a media record. No popularity or pricing data is used.',
    ctaLabel: 'View all diamonds',
    ctaHref: '/diamonds',
  },

  brand: {
    overline: 'About AADHYARNA',
    title: 'Lab-grown diamonds, chosen with intent.',
    paragraphs: [
      'AADHYARNA presents lab-grown diamonds through one working inventory — listed plainly, specified completely and open to comparison.',
      'The collection leans towards what makes diamond buying interesting: European and Old Miner cuts, portrait and step cuts, rose cuts and a broad set of fancy shapes that rarely appear in a standard catalogue.',
      'Every diamond is shown with the specifications recorded for it, so you can compare like for like and ask a precise question before you decide.',
    ],
    points: [
      {
        title: 'Recorded specifications',
        text: 'Carat, colour, clarity, polish, symmetry, measurements, depth and table as held in our inventory.',
      },
      {
        title: 'Compare with clarity',
        text: 'Place up to four diamonds side by side and read the differences line by line.',
      },
      {
        title: 'A direct conversation',
        text: 'Every diamond carries its own enquiry link, so your question arrives with the right stone.',
      },
    ],
  },

  education: {
    overline: 'Diamond education',
    title: 'Understand what you are looking at',
    support: 'Short, practical guides to the specifications used across our catalogue.',
    items: [
      {
        title: 'Carat weight',
        summary: 'What carat measures, and what it does not.',
        href: '/education#carat',
      },
      {
        title: 'Diamond colour',
        summary: 'Reading the D-to-Z scale alongside fancy colours.',
        href: '/education#colour',
      },
      {
        title: 'Clarity',
        summary: 'How clarity grades are assigned and where they matter.',
        href: '/education#clarity',
      },
      {
        title: 'Cut & proportions',
        summary: 'Depth, table and how proportion shapes a diamond.',
        href: '/education#cut',
      },
      {
        title: 'Grading reports',
        summary: 'What a report records — and what it does not promise.',
        href: '/education#reports',
      },
      {
        title: 'Lab-grown fundamentals',
        summary: 'How lab-grown diamonds are made and what stays the same.',
        href: '/education#lab-grown',
      },
    ],
    ctaLabel: 'Read the education guides',
    ctaHref: '/education',
  },

  cta: {
    overline: 'Talk to us',
    title: 'Ready to explore — or ready to ask?',
    support:
      'Browse the full catalogue, or send us the stone you are considering and we will come back with more detail.',
    primaryLabel: 'Browse the catalogue',
    primaryHref: '/diamonds',
    secondaryLabel: 'Enquire on WhatsApp',
    secondaryHref: '/contact',
  },
} as const;

/**
 * Section render order. Remove an id to hide that section entirely —
 * disabled sections emit no markup and no scripts.
 */
export const homeSections = [
  'hero',
  'discovery',
  'shapes',
  'featured',
  'brand',
  'education',
  'cta',
] as const;

export type HomeSectionId = (typeof homeSections)[number];

/**
 * Sections that can be switched off without editing components.
 * Set a value to `false` to remove that homepage section from the build —
 * no empty markup and no scripts are emitted for it.
 * (Hero and the final CTA are structural; their internal WhatsApp button
 * already respects `features.whatsapp`.)
 */
export const homeSectionToggles: Record<HomeSectionId, boolean> = {
  hero: true,
  discovery: true,
  shapes: true,
  featured: true,
  brand: true,
  education: features.education,
  cta: true,
};
