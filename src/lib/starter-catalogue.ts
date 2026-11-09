/**
 * Popular Nigerian dishes and drinks a shop owner can start from when adding an item: the name, a short description and a photo
 * are filled in and can be changed; the owner always sets the price. Photos live in public/catalogue/<slug>.jpg.
 */
export type StarterCategory =
  'food' | 'drinks' | 'printing' | 'souvenirs' | 'clothing' | 'accessories' | 'gadgets' | 'games'

export type StarterItem = {
  slug: string
  name: string
  description: string
  /** the menu section the item is filed under in the shop */
  section: string
  /** left out for food (everything but Drinks) and drinks (the Drinks section) */
  category?: StarterCategory
  /** true once public/catalogue/<slug>.jpg exists */
  photo?: true
}

export const categoryOf = (i: StarterItem): StarterCategory =>
  i.category ?? (i.section === 'Drinks' ? 'drinks' : 'food')

export const STARTER_ITEMS: StarterItem[] = [
  {
    slug: 'jollof-rice-chicken',
    photo: true,
    name: 'Jollof rice and chicken',
    description: 'Smoky party-style jollof with a piece of chicken.',
    section: 'Mains',
  },
  {
    slug: 'fried-rice-chicken',
    photo: true,
    name: 'Fried rice and chicken',
    description: 'Fried rice with vegetables and chicken.',
    section: 'Mains',
  },
  {
    slug: 'white-rice-stew',
    photo: true,
    name: 'White rice and stew',
    description: 'Steamed white rice with tomato stew.',
    section: 'Mains',
  },
  {
    slug: 'jollof-spaghetti',
    photo: true,
    name: 'Jollof spaghetti',
    description: 'Spaghetti cooked in jollof sauce.',
    section: 'Mains',
  },
  {
    slug: 'ofada-rice',
    photo: true,
    name: 'Ofada rice and sauce',
    description: 'Local ofada rice with ayamase pepper sauce.',
    section: 'Mains',
  },
  {
    slug: 'beans-plantain',
    photo: true,
    name: 'Beans and plantain',
    description: 'Stewed beans with fried plantain.',
    section: 'Mains',
  },
  {
    slug: 'yam-egg-sauce',
    photo: true,
    name: 'Yam and egg sauce',
    description: 'Boiled yam with fried egg sauce.',
    section: 'Mains',
  },
  {
    slug: 'fried-yam-pepper-sauce',
    photo: true,
    name: 'Fried yam and pepper sauce',
    description: 'Golden fried yam with pepper sauce.',
    section: 'Mains',
  },
  {
    slug: 'egusi-pounded-yam',
    photo: true,
    name: 'Egusi soup and pounded yam',
    description: 'Melon-seed soup with pounded yam.',
    section: 'Soups and swallows',
  },
  {
    slug: 'amala-ewedu-gbegiri',
    photo: true,
    name: 'Amala, ewedu and gbegiri',
    description: 'Amala with ewedu and gbegiri soups.',
    section: 'Soups and swallows',
  },
  {
    slug: 'eba-okra-soup',
    photo: true,
    name: 'Eba and okra soup',
    description: 'Eba with okra soup and assorted meat.',
    section: 'Soups and swallows',
  },
  {
    slug: 'efo-riro-pounded-yam',
    photo: true,
    name: 'Efo riro and pounded yam',
    description: 'Rich vegetable soup with pounded yam.',
    section: 'Soups and swallows',
  },
  {
    slug: 'pepper-soup',
    photo: true,
    name: 'Goat meat pepper soup',
    description: 'Hot and spicy goat meat pepper soup.',
    section: 'Soups and swallows',
  },
  {
    slug: 'moi-moi',
    name: 'Moi moi',
    description: 'Steamed bean pudding.',
    section: 'Sides',
    photo: true,
  },
  {
    slug: 'fried-plantain',
    photo: true,
    name: 'Fried plantain (dodo)',
    description: 'A generous portion of fried ripe plantain.',
    section: 'Sides',
  },
  {
    slug: 'akara',
    photo: true,
    name: 'Akara',
    description: 'Fried bean cakes.',
    section: 'Snacks',
  },
  {
    slug: 'suya',
    photo: true,
    name: 'Suya',
    description: 'Spicy grilled beef skewers with onions and yaji.',
    section: 'Snacks',
  },
  {
    slug: 'meat-pie',
    photo: true,
    name: 'Meat pie',
    description: 'Flaky pastry filled with minced meat.',
    section: 'Snacks',
  },
  {
    slug: 'puff-puff',
    photo: true,
    name: 'Puff puff',
    description: 'Soft, sweet fried dough balls.',
    section: 'Snacks',
  },
  {
    slug: 'chin-chin',
    photo: true,
    name: 'Chin chin',
    description: 'Crunchy sweet fried snack.',
    section: 'Snacks',
  },
  {
    slug: 'shawarma',
    photo: true,
    name: 'Shawarma',
    description: 'Chicken shawarma wrap with sauce.',
    section: 'Snacks',
  },
  {
    slug: 'zobo',
    photo: true,
    name: 'Zobo drink',
    description: 'Chilled hibiscus drink.',
    section: 'Drinks',
  },
  {
    slug: 'chapman',
    photo: true,
    name: 'Chapman',
    description: 'Fruity Nigerian cocktail drink, no alcohol.',
    section: 'Drinks',
  },
  {
    slug: 'kunu',
    photo: true,
    name: 'Kunu',
    description: 'Chilled millet drink.',
    section: 'Drinks',
  },
  {
    slug: 'tigernut-drink',
    photo: true,
    name: 'Tigernut drink (kunu aya)',
    description: 'Sweet creamy tigernut drink.',
    section: 'Drinks',
  },
  {
    slug: 'bottled-water',
    photo: true,
    name: 'Bottled water',
    description: 'Cold bottled water.',
    section: 'Drinks',
  },
  {
    slug: 'soft-drink',
    photo: true,
    name: 'Soft drink',
    description: 'Chilled bottled soft drink.',
    section: 'Drinks',
  },
  {
    slug: 'fresh-juice',
    photo: true,
    name: 'Fresh fruit juice',
    description: 'Freshly squeezed orange juice.',
    section: 'Drinks',
  },
]

/** Ready-made items (other than food and drinks) that have a photo in public/catalogue. */
const HAS_PHOTO = new Set([
  'plain-tshirt',
  'polo-shirt',
  'hoodie',
  'ankara-shirt',
  'jeans',
  'jogging-pants',
  'canvas-sneakers',
  'slippers',
  'wrist-watch',
  'sunglasses',
  'backpack',
  'leather-belt',
  'wallet',
  'necklace',
  'phone-charger',
  'power-bank',
  'earphones',
  'bluetooth-speaker',
  'flash-drive',
  'phone-case',
  'laptop-sleeve',
  'computer-mouse',
  'ludo-board',
  'scrabble',
  'playing-cards',
  'whot-cards',
  'chess-set',
  'draughts',
  'football',
  'table-tennis-set',
  'black-white-print',
  'colour-print',
  'photocopy',
  'scanning',
  'spiral-binding',
  'project-binding',
  'lamination',
  'passport-photos',
  'biro-pen-pack',
  'a4-paper-ream',
  'campus-keyring',
  'souvenir-tshirt',
  'souvenir-cap',
  'lanyard',
  'sticker-pack',
  'sandals',
  'long-sleeve-shirt',
  'sweatshirt',
  'jersey',
  'crop-top',
  'kaftan',
  'senator-top',
  'chinos',
  'shorts',
  'skirt',
  'leggings',
  'leather-shoes',
  'running-shoes',
  'heels',
  'wristband',
  'bracelet',
  'earrings',
  'ring',
  'face-cap',
  'scarf',
  'handbag',
  'tote-bag',
  'umbrella',
  'perfume',
  'usb-cable',
  'wireless-earbuds',
  'headphones',
  'smart-watch',
  'phone-stand',
  'ring-light',
  'memory-card',
  'laptop-stand',
  'keyboard',
  'webcam',
  'screen-protector',
  'calculator',
  'uno-cards',
  'jenga',
  'ayo-board',
  'badminton-set',
  'basketball',
  'game-controller',
  'exercise-book',
  'highlighters',
  'geometry-set',
  'campus-hoodie',
  'water-bottle',
  'notebook',
  'souvenir-mug',
])

const mk = (
  category: StarterCategory,
  section: string,
  rows: [slug: string, name: string, description: string][],
): StarterItem[] =>
  rows.map(([slug, name, description]) => ({
    slug,
    name,
    description,
    section,
    category,
    ...(HAS_PHOTO.has(slug) ? { photo: true as const } : {}),
  }))

STARTER_ITEMS.push(
  ...mk('clothing', 'Tops', [
    ['plain-tshirt', 'Plain T-shirt', 'Soft cotton T-shirt. Say which sizes you have.'],
    ['polo-shirt', 'Polo shirt', 'Neat collared polo shirt.'],
    ['hoodie', 'Hoodie', 'Warm pullover hoodie.'],
    ['ankara-shirt', 'Ankara shirt', 'Colourful Ankara print shirt.'],
    [
      'long-sleeve-shirt',
      'Long-sleeve shirt',
      'Smart long-sleeve shirt. Say which sizes you have.',
    ],
    ['sweatshirt', 'Sweatshirt', 'Warm crew-neck sweatshirt.'],
    ['jersey', 'Jersey', 'Sports jersey. Say the team and sizes.'],
    ['crop-top', 'Crop top', 'Light crop top. Say which sizes you have.'],
    ['kaftan', 'Kaftan', 'Loose kaftan top.'],
    ['senator-top', 'Senator top', 'Neat senator-style top.'],
  ]),
  ...mk('clothing', 'Bottoms', [
    ['jeans', 'Jeans', 'Denim jeans. Say which sizes you have.'],
    ['jogging-pants', 'Jogging pants', 'Comfortable jogging pants.'],
    ['chinos', 'Chinos', 'Smart chino trousers. Say which sizes you have.'],
    ['shorts', 'Shorts', 'Comfortable shorts.'],
    ['skirt', 'Skirt', 'Skirt in your colours and sizes.'],
    ['leggings', 'Leggings', 'Stretch leggings.'],
    ['ankara-trousers', 'Ankara trousers', 'Trousers in Ankara print.'],
  ]),
  ...mk('clothing', 'Shoes', [
    ['canvas-sneakers', 'Canvas sneakers', 'Light canvas sneakers.'],
    ['slippers', 'Slippers', 'Comfortable everyday slippers.'],
    ['leather-shoes', 'Leather shoes', 'Smart leather shoes. Say which sizes you have.'],
    ['sandals', 'Sandals', 'Open everyday sandals.'],
    ['heels', 'Heels', 'Heeled shoes. Say which sizes you have.'],
    ['running-shoes', 'Running shoes', 'Light running shoes.'],
    ['socks-pack', 'Socks (pack)', 'A pack of socks.'],
  ]),
  ...mk('accessories', 'Accessories', [
    ['wrist-watch', 'Wrist watch', 'Simple everyday wrist watch.'],
    ['sunglasses', 'Sunglasses', 'Sunglasses with UV protection.'],
    ['backpack', 'Backpack', 'Roomy backpack for books and a laptop.'],
    ['leather-belt', 'Belt', 'Strong belt in black or brown.'],
    ['wallet', 'Wallet', 'Slim wallet with card slots.'],
    ['necklace', 'Necklace', 'Light fashion necklace.'],
    ['wristband', 'Wristband', 'Fashion wristband.'],
    ['bracelet', 'Bracelet', 'Light bracelet.'],
    ['earrings', 'Earrings', 'A pair of earrings.'],
    ['ring', 'Ring', 'Fashion ring. Say which sizes you have.'],
    ['face-cap', 'Face cap', 'Adjustable cap.'],
    ['scarf', 'Scarf', 'Soft scarf or head wrap.'],
    ['handbag', 'Handbag', 'Handbag in your colours.'],
    ['tote-bag', 'Tote bag', 'Roomy tote bag.'],
    ['umbrella', 'Umbrella', 'Folding umbrella.'],
    ['hair-accessories', 'Hair accessories', 'Hair bands, clips and ties.'],
    ['perfume', 'Perfume', 'Body spray or perfume.'],
  ]),
  ...mk('gadgets', 'Gadgets', [
    ['phone-charger', 'Phone charger', 'Fast charger with cable.'],
    ['power-bank', 'Power bank', 'Portable battery for your phone.'],
    ['earphones', 'Earphones', 'Wired earphones with a microphone.'],
    ['bluetooth-speaker', 'Bluetooth speaker', 'Small wireless speaker.'],
    ['flash-drive', 'Flash drive', 'USB flash drive for your files.'],
    ['phone-case', 'Phone case', 'Protective case. Say which phone it fits.'],
    ['laptop-sleeve', 'Laptop sleeve', 'Padded sleeve for a laptop.'],
    ['computer-mouse', 'Computer mouse', 'Wireless mouse.'],
    ['usb-cable', 'Charging cable', 'Phone charging cable. Say the type.'],
    ['wireless-earbuds', 'Wireless earbuds', 'Bluetooth earbuds with charging case.'],
    ['headphones', 'Headphones', 'Over-ear headphones.'],
    ['smart-watch', 'Smart watch', 'Fitness and notification watch.'],
    ['phone-stand', 'Phone stand', 'Stand for watching on your desk.'],
    ['ring-light', 'Ring light', 'Light for photos and video calls.'],
    ['memory-card', 'Memory card', 'Memory card for phone or camera.'],
    ['extension-socket', 'Extension socket', 'Multi-plug extension for your room.'],
    ['laptop-stand', 'Laptop stand', 'Raised stand for a laptop.'],
    ['keyboard', 'Keyboard', 'USB or wireless keyboard.'],
    ['webcam', 'Webcam', 'Webcam for classes and calls.'],
    ['screen-protector', 'Screen protector', 'Tempered glass. Say which phone it fits.'],
    ['calculator', 'Scientific calculator', 'Scientific calculator for lectures and exams.'],
  ]),
  ...mk('games', 'Games', [
    ['ludo-board', 'Ludo board', 'Ludo board with pieces and dice.'],
    ['scrabble', 'Scrabble', 'Word board game.'],
    ['playing-cards', 'Playing cards', 'Standard deck of playing cards.'],
    ['whot-cards', 'Whot cards', 'A pack of Whot cards.'],
    ['chess-set', 'Chess set', 'Chess board with pieces.'],
    ['draughts', 'Draughts', 'Draughts board with pieces.'],
    ['football', 'Football', 'Size 5 football.'],
    ['table-tennis-set', 'Table tennis set', 'Two bats and balls.'],
    ['monopoly', 'Property trading board game', 'Board game for buying and trading properties.'],
    ['uno-cards', 'Colour matching card game', 'A pack of colour and number matching cards.'],
    ['jenga', 'Jenga', 'Wooden block tower game.'],
    ['ayo-board', 'Ayo board', 'Traditional ayo board with seeds.'],
    ['badminton-set', 'Badminton set', 'Rackets and shuttlecocks.'],
    ['basketball', 'Basketball', 'Size 7 basketball.'],
    ['skipping-rope', 'Skipping rope', 'Skipping rope for exercise.'],
    ['game-controller', 'Game controller', 'Controller for phone or console.'],
  ]),
  ...mk('printing', 'Printing', [
    [
      'black-white-print',
      'Black and white printing (per page)',
      'Clear black and white print on A4.',
    ],
    ['colour-print', 'Colour printing (per page)', 'Full colour print on A4.'],
    ['photocopy', 'Photocopy (per page)', 'Photocopy on A4.'],
    ['scanning', 'Scanning (per page)', 'Scan to PDF and send to your e-mail.'],
    ['spiral-binding', 'Spiral binding', 'Spiral binding for notes and reports.'],
    ['project-binding', 'Project binding', 'Hard cover binding for your project.'],
    ['lamination', 'Lamination', 'Lamination of one A4 page.'],
    ['passport-photos', 'Passport photographs', 'A set of passport photographs.'],
  ]),
  ...mk('printing', 'Stationery', [
    ['notebook', 'Notebook', 'Ruled notebook.'],
    ['biro-pen-pack', 'Pens (pack)', 'A pack of ballpoint pens.'],
    ['a4-paper-ream', 'A4 paper (ream)', 'A ream of A4 paper.'],
    ['exercise-book', 'Exercise book', 'Exercise book for lectures.'],
    ['highlighters', 'Highlighters (pack)', 'A pack of highlighters.'],
    ['geometry-set', 'Geometry set', 'Ruler, protractor, compass and set squares.'],
    ['sticky-notes', 'Sticky notes', 'A pack of sticky notes.'],
    ['folder', 'Folder', 'Document folder.'],
    ['stapler', 'Stapler', 'Stapler with staples.'],
    ['flash-cards', 'Flash cards', 'Pack of study flash cards.'],
  ]),
  ...mk('souvenirs', 'Souvenirs', [
    ['campus-keyring', 'Campus keyring', 'Keyring to remember your campus.'],
    ['souvenir-mug', 'Souvenir mug', 'Ceramic mug.'],
    ['souvenir-tshirt', 'Souvenir T-shirt', 'T-shirt printed for the campus.'],
    ['souvenir-cap', 'Souvenir cap', 'Cap printed for the campus.'],
    ['lanyard', 'Lanyard', 'Neck strap for your ID card.'],
    ['sticker-pack', 'Sticker pack', 'A pack of stickers.'],
    ['campus-hoodie', 'Campus hoodie', 'Hoodie printed for the campus.'],
    ['water-bottle', 'Water bottle', 'Reusable bottle.'],
    ['tote-souvenir', 'Campus tote bag', 'Tote bag printed for the campus.'],
    ['wristband-souvenir', 'Campus wristband', 'Wristband printed for the campus.'],
    ['notebook-souvenir', 'Campus notebook', 'Notebook with a campus cover.'],
  ]),
)

/** Category names an administrator may have typed slightly differently (for example a spelling slip) map to the right list. */
const ALIASES: Record<string, StarterCategory> = {
  acccessories: 'accessories',
  accessory: 'accessories',
  souvenir: 'souvenirs',
  game: 'games',
  gadget: 'gadgets',
  print: 'printing',
  stationery: 'printing',
}

/** The ready-made items for a shop's categories (one or several). Food and drinks shops see both lists; a category we have no list for adds nothing (the shop adds its own). */
export function startersFor(categorySlugs: string | string[] | null | undefined): StarterItem[] {
  const list = Array.isArray(categorySlugs) ? categorySlugs : [categorySlugs]
  const wanted = new Set<StarterCategory>()
  for (const raw of list) {
    const lower = (raw ?? '').toLowerCase()
    const slug = ALIASES[lower] ?? lower
    if (slug === 'food' || slug === 'drinks') {
      wanted.add('food')
      wanted.add('drinks')
    } else wanted.add(slug as StarterCategory)
  }
  return STARTER_ITEMS.filter((i) => wanted.has(categoryOf(i)))
}

/** The menu sections in the order they first appear. */
export const sectionsOf = (items: StarterItem[]): string[] => [
  ...new Set(items.map((i) => i.section)),
]

export const starterPhotoUrl = (i: StarterItem) => `/catalogue/${i.slug}.jpg`
