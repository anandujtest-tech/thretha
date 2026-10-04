export const DEFAULT_HOMEPAGE_CONTENT = {
  intro_left: 'A little everyday. A little extraordinary.',
  intro_right: 'Find your own kind of beautiful.',
  categories_heading: 'Find your silhouette.',
  categories_eyebrow: 'Shop by category',
  arrivals_heading: 'New arrivals',
  featured_eyebrow: 'The featured edit',
  featured_heading: 'Your next look.\nYour own way.',
  featured_description: 'A few favourites from our collection. A whole lot of possibility.',
  featured_cta: 'Explore the edit',
  featured_cta_link: '/shop',
  featured_editorial_image: '',
  journey_kicker: 'A little inspiration, daily.',
  journey_heading: 'Follow The Journey',
  final_kicker: 'Something that feels like you',
  final_heading: 'Find your next\nfavourite.',
  final_cta: 'Shop all',
  final_cta_link: '/shop',
}

export function getHomepageContent(settings) {
  return { ...DEFAULT_HOMEPAGE_CONTENT, ...(settings?.homepage_content || {}) }
}
