/**
 * Site-wide settings: navigation, footer, SEO defaults.
 *
 * CONTACT / DOMAIN NOTE (Phase 2 §16): the production domain, contact email
 * and business address are NOT yet confirmed. Empty strings below are
 * intentional — nothing with an empty value is rendered or published.
 * Fill them in here once the owner confirms them, then rebuild.
 */


export const site = {
  /** Production origin, e.g. 'https://aadhyarna.com'. Empty = not yet confirmed. */
  url: '',

  locale: 'en',
  /** BCP-47 tag used for Open Graph. */
  ogLocale: 'en_US',

  defaultTitle: 'AADHYARNA — Discover Lab-Grown Diamonds',
  defaultDescription:
    'Explore AADHYARNA lab-grown diamonds: antique, European, Old Miner and rare fancy cuts with detailed specifications, comparison and direct enquiry.',

  /**
   * Browser chrome / OS accent colour.
   * Keep in sync with `--color-ivory` in src/styles/tokens.css.
   */
  themeColor: '#f4efe6',

  /** Applied to <html> so relative links and OG URLs resolve correctly. */
  lang: 'en',
} as const;

export interface NavItem {
  label: string;
  href: string;
}

/** Primary navigation (desktop + mobile). Edit labels and order here. */
export const primaryNav: readonly NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop Diamonds', href: '/diamonds' },
  { label: 'Diamond Education', href: '/education' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

export interface FooterColumn {
  title: string;
  links: readonly NavItem[];
}

/** Footer link columns. Only links that resolve to real pages belong here. */
export const footerColumns: readonly FooterColumn[] = [
  {
    title: 'Discover',
    links: [
      { label: 'All Diamonds', href: '/diamonds' },
      { label: 'Compare Diamonds', href: '/compare' },
      { label: 'Saved Diamonds', href: '/wishlist' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Diamond Education', href: '/education' },
      { label: 'About AADHYARNA', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Use', href: '/terms' },
    ],
  },
] as const;

export const footerNote =
  'Lab-grown diamonds shown with specifications as recorded in our inventory.';

/** Absolute URL helper — returns '' while the production domain is unconfirmed. */
export function absoluteUrl(path: string): string {
  if (!site.url) return '';
  return new URL(path, site.url).toString();
}
