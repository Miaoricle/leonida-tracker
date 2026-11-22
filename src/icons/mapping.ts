// Category id -> Google Material Symbols (Rounded, filled) glyph name.
// Browse glyphs at https://fonts.google.com/icons. Edit freely: unknown names fall back to FALLBACK_ICON.
// Keys are GTABase internal category ids (see leonida-data/data/categories.json).
export const FALLBACK_ICON = 'location_on';

export const CATEGORY_ICONS: Record<string, string> = {
  // Personal
  garage: 'garage_home',
  safehouse: 'home',
  // Robberies
  bank: 'account_balance',
  fence: 'storefront',
  'gang-operation': 'local_police',
  'payday-loan': 'payments',
  safe: 'lock',
  'smash-n-grab': 'diamond',
  'towable-atm': 'local_atm',
  // Activities
  arcade: 'sports_esports',
  basketball: 'sports_basketball',
  'car-meet': 'groups',
  darts: 'target',
  'drone-race': 'flight',
  fishing: 'phishing',
  'gang-compound': 'fort',
  golf: 'golf_course',
  gym: 'fitness_center',
  hunting: 'forest',
  'mini-golf': 'sports_golf',
  parachuting: 'paragliding',
  pool: 'pool',
  race: 'sports_score',
  'random-event': 'priority_high',
  'shooting-range': 'my_location',
  // Collectibles
  mural: 'palette',
  'ahol-street-art': 'brush',
  'base-jump': 'paragliding',
  'book-swap': 'swap_horiz',
  comics: 'auto_stories',
  'hidden-package': 'package_2',
  'knife-flight': 'flare',
  'luxury-watch': 'watch',
  magazine: 'menu_book',
  meditation: 'self_improvement',
  'message-bottle': 'liquor',
  meteorite: 'planet',
  'stunt-jump': 'rocket_launch',
  treasure: 'savings',
  'under-the-bridge': 'water',
  playlist: 'queue_music',
  'waink-curiosity': 'visibility',
  'waink-landmark': 'photo_camera',
  'waink-sculpture': 'architecture',
  'yellow-loot-box': 'inventory_2',
  // Collectible cards (all share the card glyph; colour comes from the group)
  'collectible-card': 'style',
  // Vehicles
  airport: 'flight',
  'bus-stop': 'directions_bus',
  'car-wash': 'local_car_wash',
  'ev-charger': 'ev_station',
  ferry: 'directions_boat',
  'gas-station': 'local_gas_station',
  'vehicle-mod-shop': 'build',
  'pay-n-spray': 'format_paint',
  'standout-vehicle': 'directions_car',
  'public-transport': 'train',
  'vehicle-rental': 'car_rental',
  'vehicle-request': 'assignment',
  'vehicle-spawn': 'local_taxi',
  'vehicle-dealer': 'sell',
  // Weapons
  'ammu-nation': 'store',
  'weapon-spawn': 'swords',
  'armor-spawn': 'shield',
  // Style
  clothing: 'checkroom',
  electronics: 'devices',
  footwear: 'steps',
  haircut: 'content_cut',
  tattoo: 'ink_pen',
  'jewelry-store': 'diamond',
  'phone-store': 'mobile',
  // Food & Drink
  bar: 'local_bar',
  'cafe-takeout': 'local_cafe',
  'convenience-store': 'local_convenience_store',
  'food-and-drink': 'fastfood',
  'liquor-store': 'liquor',
  'street-food': 'kebab_dining',
  // Local places
  atm: 'atm',
  cinema: 'movie',
  'city-town': 'location_city',
  'fire-station': 'fire_truck',
  helipad: 'helicopter',
  hospital: 'local_hospital',
  landmark: 'attractions',
  marina: 'sailing',
  nightclub: 'nightlife',
  'police-station': 'local_police',
  // Personal markers with a custom category
  custom: 'keep',
};

/** Glyph for a category id; card-* categories share the card glyph. */
export function iconFor(categoryId: string): string {
  return CATEGORY_ICONS[categoryId] ?? (categoryId.startsWith('card-') ? CATEGORY_ICONS['collectible-card'] : FALLBACK_ICON);
}
