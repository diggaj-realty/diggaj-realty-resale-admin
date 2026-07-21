/** Curated reference list of major Bangalore real-estate builders and their
 *  known projects, used to populate the cascading Builder → Project dropdown
 *  on the Add/Edit Listing forms. Not exhaustive — Bangalore has hundreds of
 *  builders; this covers the large/well-known developers active in the city.
 *  Free text is still allowed (see BuilderProjectFields "Other") for anything
 *  not on this list. */
export interface BuilderEntry {
  name: string
  projects: string[]
}

export const BANGALORE_BUILDERS: BuilderEntry[] = [
  {
    name: 'Prestige Group',
    projects: [
      'Prestige Lakeside Habitat',
      'Prestige Falcon City',
      'Prestige Shantiniketan',
      'Prestige White Meadows',
      'Prestige Song of the South',
      'Prestige Great Acres',
      'Prestige Park Grove',
      'Prestige Jindal City',
      'Prestige Waterford',
      'Prestige Rain Tree Park',
    ],
  },
  {
    name: 'Brigade Group',
    projects: [
      'Brigade Cornerstone Utopia',
      'Brigade Meadows',
      'Brigade Orchards',
      'Brigade Exotica',
      'Brigade Lakefront',
      'Brigade Citrine',
      'Brigade Xanadu',
      'Brigade Atmosphere',
      'Brigade Parkside North',
      'Brigade Gateway',
    ],
  },
  {
    name: 'Sobha Limited',
    projects: [
      'Sobha City',
      'Sobha Dream Acres',
      'Sobha Silicon Oasis',
      'Sobha Windsor',
      'Sobha Royal Pavilion',
      'Sobha Neopolis',
      'Sobha Winchester',
      'Sobha HRC Pristine',
      'Sobha Forest View',
    ],
  },
  {
    name: 'Godrej Properties',
    projects: [
      'Godrej Reflections',
      'Godrej Woodsville',
      'Godrej Aria',
      'Godrej E-City',
      'Godrej Lake Gardens',
      'Godrej Air',
      'Godrej Nature Plus',
      'Godrej Bengal Lamp',
    ],
  },
  {
    name: 'Puravankara',
    projects: [
      'Purva Palm Beach',
      'Purva Zenium',
      'Purva Atmosphere',
      'Purva Windermere',
      'Purva Highland',
      'Purva Silversands',
      'Purva Park Hill',
      'Provident Sunworth City',
      'Provident Woodfield',
    ],
  },
  {
    name: 'Salarpuria Sattva Group',
    projects: [
      'Sattva Lumina',
      'Sattva Park Cubix',
      'Sattva Songbird',
      'Sattva Greenage',
      'Sattva Magnus',
      'Sattva Divinity',
      'Salarpuria Cambridge Ivy Homes',
    ],
  },
  {
    name: 'Embassy Group',
    projects: [
      'Embassy Springs',
      'Embassy Boulevard',
      'Embassy Lake Terraces',
      'Embassy Edge',
      'Embassy Pristine',
    ],
  },
  {
    name: 'Shriram Properties',
    projects: [
      'Shriram Greenfield',
      'Shriram Chirping Woods',
      'Shriram Panorama',
      'Shriram Codename Divinity',
      'Shriram Suhaana',
      'Shriram Pristine Estates',
      'Shriram Sameeksha',
    ],
  },
  {
    name: 'Century Real Estate',
    projects: [
      'Century Ethos',
      'Century Breeze',
      'Century Wintersun',
      'Century Regalia',
      'Century Horizon',
    ],
  },
  {
    name: 'Assetz Property Group',
    projects: [
      'Assetz Marq',
      'Assetz 63 Degree East',
      'Assetz Soul and Soil',
      'Assetz Homes The Tower',
      'Assetz Sun and Bloom',
      'Assetz Bloom and Build',
      'Assetz Here and Now',
    ],
  },
  {
    name: 'Mantri Developers',
    projects: [
      'Mantri Espana',
      'Mantri Celestia',
      'Mantri Webcity',
      'Mantri Serenity',
      'Mantri Synergy',
    ],
  },
  {
    name: 'Casagrand',
    projects: [
      'Casagrand Utopia',
      'Casagrand Vitalia',
      'Casagrand ORR',
      'Casagrand First City',
    ],
  },
  {
    name: 'Kolte-Patil Developers',
    projects: ['Kolte-Patil Verve', 'Kolte-Patil Vision Vayu'],
  },
  {
    name: 'Total Environment',
    projects: [
      'Total Environment Amoda Reserve',
      'Total Environment Pursuit of a Radical Rhapsody',
      'Total Environment The Magic Faraway Tree',
      'Total Environment Windmills of Your Mind',
    ],
  },
  {
    name: 'Purva Land',
    projects: ['Purva Aerocity', 'Purva Soukhyam', 'Purva Southend'],
  },
  {
    name: 'Adarsh Developers',
    projects: [
      'Adarsh Palm Retreat',
      'Adarsh Welkin Park',
      'Adarsh Greens',
      'Adarsh Vaikuntam',
      'Adarsh Vista',
    ],
  },
  {
    name: 'Nitesh Estates',
    projects: ['Nitesh Cape Shire', 'Nitesh Long Beach', 'Nitesh Hyde Park'],
  },
  {
    name: 'Vaishnavi Group',
    projects: ['Vaishnavi Serene County', 'Vaishnavi Terraces', 'Vaishnavi Jardin'],
  },
  {
    name: 'DivyaSree Developers',
    projects: ['DivyaSree 77 Place', 'DivyaSree NSA Republic'],
  },
  {
    name: 'RMZ Corp',
    projects: ['RMZ Galleria', 'RMZ Latitude Commercial'],
  },
  {
    name: 'Sowparnika Projects',
    projects: ['Sowparnika Ashiyana', 'Sowparnika Sarovar', 'Sowparnika Vaibhava'],
  },
  {
    name: 'SNN Builders',
    projects: ['SNN Raj Serenity', 'SNN Clermont', 'SNN Estella'],
  },
  {
    name: 'Vajram Group',
    projects: ['Vajram Newtown', 'Vajram Enchante'],
  },
  {
    name: 'Concorde Group',
    projects: ['Concorde Manhattans', 'Concorde Napa Valley', 'Concorde Silicon City'],
  },
  {
    name: 'Ozone Group',
    projects: ['Ozone Urbana', 'Ozone Metrozone'],
  },
  {
    name: 'Skyline Group',
    projects: ['Skyline Icon', 'Skyline Meadows'],
  },
  {
    name: 'Sowparnika Group',
    projects: ['Sowparnika Sarvome', 'Sowparnika Vrundavan'],
  },
  {
    name: 'Bren Corp',
    projects: ['Bren Woods', 'Bren Northern Star', 'Bren Prathiksha'],
  },
  {
    name: 'Provident Housing (Puravankara)',
    projects: ['Provident Park Square', 'Provident Botanico', 'Provident Deansgate'],
  },
  {
    name: 'Ashoka Buildcon',
    projects: ['Ashoka Regalia'],
  },
  {
    name: 'Aparna Constructions',
    projects: ['Aparna Sarovar Zenith'],
  },
  {
    name: 'Independent / Not Listed',
    projects: [],
  },
]

export const BUILDER_NAMES = BANGALORE_BUILDERS.map((b) => b.name)

export function projectsForBuilder(builderName: string | null | undefined): string[] {
  if (!builderName) return []
  return BANGALORE_BUILDERS.find((b) => b.name === builderName)?.projects ?? []
}
