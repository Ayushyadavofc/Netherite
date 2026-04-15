export type CharacterGender = 'male' | 'female'
export type CharacterId =
  | 'swordsman'
  | 'dark-mage'
  | 'archer-m'
  | 'swordswoman'
  | 'dark-mage-f'
  | 'archer-f'
export type CharacterDirection = 'down' | 'left' | 'right' | 'up'
export type CharacterAnimation =
  | 'idle'
  | 'walk'
  | 'shoot'
  | 'slash'
  | 'backslash'
  | 'spell'
  | 'thrust'
  | 'hurt'

type CharacterArchetype = 'archer' | 'swordsman' | 'dark-mage'

export interface CharacterDefinition {
  id: CharacterId
  name: string
  gender: CharacterGender
  animations: CharacterAnimation[]
  rarity: 'default'
  archetype: CharacterArchetype
  assetFolder: string
}

export type CharacterCosmeticSeed = CharacterDefinition & {
  category: 'character'
  totalPieces: number
}

export const CHARACTER_DIRECTIONS: CharacterDirection[] = ['down', 'left', 'right', 'up']

export const CHARACTER_ANIMATION_DURATIONS: Record<CharacterAnimation, number> = {
  idle: 800,
  walk: 3000,
  shoot: 1040,
  slash: 480,
  backslash: 480,
  thrust: 640,
  spell: 700,
  hurt: 600
}

export const CHARACTER_ROSTER: CharacterDefinition[] = [
  {
    id: 'swordsman',
    name: 'Swordsman',
    gender: 'male',
    animations: ['idle', 'walk', 'slash', 'backslash'],
    rarity: 'default',
    archetype: 'swordsman',
    assetFolder: 'male swordsman'
  },
  {
    id: 'dark-mage',
    name: 'Dark Mage',
    gender: 'male',
    animations: ['idle', 'walk', 'spell', 'thrust'],
    rarity: 'default',
    archetype: 'dark-mage',
    assetFolder: 'male magician'
  },
  {
    id: 'archer-m',
    name: 'Archer',
    gender: 'male',
    animations: ['idle', 'walk', 'shoot'],
    rarity: 'default',
    archetype: 'archer',
    assetFolder: 'archer male'
  },
  {
    id: 'swordswoman',
    name: 'Swordswoman',
    gender: 'female',
    animations: ['idle', 'walk', 'slash', 'backslash'],
    rarity: 'default',
    archetype: 'swordsman',
    assetFolder: 'female swordsman'
  },
  {
    id: 'dark-mage-f',
    name: 'Dark Mage',
    gender: 'female',
    animations: ['idle', 'walk', 'spell', 'thrust'],
    rarity: 'default',
    archetype: 'dark-mage',
    assetFolder: 'female magician'
  },
  {
    id: 'archer-f',
    name: 'Archer',
    gender: 'female',
    animations: ['idle', 'walk', 'shoot'],
    rarity: 'default',
    archetype: 'archer',
    assetFolder: 'female archer'
  }
]

export const CHARACTER_SEED_DOCUMENTS: CharacterCosmeticSeed[] = CHARACTER_ROSTER.map((character) => ({
  ...character,
  category: 'character',
  totalPieces: 1
}))

export const DEFAULT_CHARACTER_BY_GENDER: Record<CharacterGender, CharacterId> = {
  male: 'swordsman',
  female: 'swordswoman'
}

export const getCharactersForGender = (gender: CharacterGender) =>
  CHARACTER_ROSTER.filter((character) => character.gender === gender)

export const getCharacterById = (characterId: string | null | undefined) =>
  CHARACTER_ROSTER.find((character) => character.id === characterId)

export const getDefaultCharacterId = (gender: CharacterGender | null | undefined): CharacterId =>
  DEFAULT_CHARACTER_BY_GENDER[gender === 'female' ? 'female' : 'male']

export const resolveCharacterId = (
  characterId: string | null | undefined,
  gender: CharacterGender | null | undefined
): CharacterId => {
  const fallback = getDefaultCharacterId(gender)
  const candidate = getCharacterById(characterId)

  if (!candidate) {
    return fallback
  }

  return candidate.gender === (gender === 'female' ? 'female' : 'male') ? candidate.id : fallback
}

export const getCharacterAnimationLabel = (animation: CharacterAnimation) => {
  switch (animation) {
    case 'idle':
      return 'Idle'
    case 'walk':
      return 'Walking...'
    case 'slash':
    case 'backslash':
      return 'Attacking!'
    case 'spell':
    case 'thrust':
      return 'Casting!'
    case 'shoot':
      return 'Shooting!'
    case 'hurt':
      return 'Ouch!'
    default:
      return 'Idle'
  }
}
