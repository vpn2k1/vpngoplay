// Illustrated icons (Microsoft Fluent Emoji, flat) and round flags (circle-flags),
// bundled as SVG components at build time by unplugin-icons — they look the same
// on every OS, unlike system emoji (Windows shows flags as "GB", "JP"…).
// UI controls use line icons from lucide-react instead.
import type { ComponentType, SVGProps } from 'react'
import FlagCn from '~icons/circle-flags/cn'
import FlagGb from '~icons/circle-flags/gb'
import FlagJp from '~icons/circle-flags/jp'
import FlagVn from '~icons/circle-flags/vn'
import BackhandIndexPointingUp from '~icons/fluent-emoji-flat/backhand-index-pointing-up'
import Balloon from '~icons/fluent-emoji-flat/balloon'
import Books from '~icons/fluent-emoji-flat/books'
import Brain from '~icons/fluent-emoji-flat/brain'
import Brick from '~icons/fluent-emoji-flat/brick'
import Briefcase from '~icons/fluent-emoji-flat/briefcase'
import Bullseye from '~icons/fluent-emoji-flat/bullseye'
import CardIndexDividers from '~icons/fluent-emoji-flat/card-index-dividers'
import CheckMarkButton from '~icons/fluent-emoji-flat/check-mark-button'
import Child from '~icons/fluent-emoji-flat/child'
import Compass from '~icons/fluent-emoji-flat/compass'
import CrossMark from '~icons/fluent-emoji-flat/cross-mark'
import Ear from '~icons/fluent-emoji-flat/ear'
import Fire from '~icons/fluent-emoji-flat/fire'
import Fox from '~icons/fluent-emoji-flat/fox'
import FramedPicture from '~icons/fluent-emoji-flat/framed-picture'
import FrontFacingBabyChick from '~icons/fluent-emoji-flat/front-facing-baby-chick'
import GlowingStar from '~icons/fluent-emoji-flat/glowing-star'
import GraduationCap from '~icons/fluent-emoji-flat/graduation-cap'
import DeciduousTree from '~icons/fluent-emoji-flat/deciduous-tree'
import Hammer from '~icons/fluent-emoji-flat/hammer'
import Hamster from '~icons/fluent-emoji-flat/hamster'
import KnockedOutFace from '~icons/fluent-emoji-flat/knocked-out-face'
import SquintingFaceWithTongue from '~icons/fluent-emoji-flat/squinting-face-with-tongue'
import Headphone from '~icons/fluent-emoji-flat/headphone'
import Herb from '~icons/fluent-emoji-flat/herb'
import HighVoltage from '~icons/fluent-emoji-flat/high-voltage'
import Joystick from '~icons/fluent-emoji-flat/joystick'
import Keyboard from '~icons/fluent-emoji-flat/keyboard'
import Memo from '~icons/fluent-emoji-flat/memo'
import LightBulb from '~icons/fluent-emoji-flat/light-bulb'
import Owl from '~icons/fluent-emoji-flat/owl'
import Panda from '~icons/fluent-emoji-flat/panda'
import PartyPopper from '~icons/fluent-emoji-flat/party-popper'
import PuzzlePiece from '~icons/fluent-emoji-flat/puzzle-piece'
import Pushpin from '~icons/fluent-emoji-flat/pushpin'
import RacingCar from '~icons/fluent-emoji-flat/racing-car'
import RedQuestionMark from '~icons/fluent-emoji-flat/red-question-mark'
import RedHeart from '~icons/fluent-emoji-flat/red-heart'
import RepeatButton from '~icons/fluent-emoji-flat/repeat-button'
import Rocket from '~icons/fluent-emoji-flat/rocket'
import Seedling from '~icons/fluent-emoji-flat/seedling'
import Snake from '~icons/fluent-emoji-flat/snake'
import SpeakerHighVolume from '~icons/fluent-emoji-flat/speaker-high-volume'
import Star from '~icons/fluent-emoji-flat/star'
import TRex from '~icons/fluent-emoji-flat/t-rex'
import ThinkingFace from '~icons/fluent-emoji-flat/thinking-face'
import Trophy from '~icons/fluent-emoji-flat/trophy'
import WavingHand from '~icons/fluent-emoji-flat/waving-hand'
import WhiteHeart from '~icons/fluent-emoji-flat/white-heart'
import WorldMap from '~icons/fluent-emoji-flat/world-map'
import type { CourseLevel, Lang, Track } from '../lib/types'

export type IconType = ComponentType<SVGProps<SVGSVGElement>>

export const FLAG: Record<Lang, IconType> = { en: FlagGb, ja: FlagJp, zh: FlagCn }
export const TRACK_ICON: Record<Track, IconType> = { kids: Child, work: Briefcase, exam: GraduationCap }
/** Course levels grow like a plant: seedling → herb → tree */
export const COURSE_ICON: Record<CourseLevel, IconType> = {
  basic: Seedling,
  intermediate: Herb,
  advanced: DeciduousTree,
}
/** Friendly guide character per language */
export const MASCOT: Record<Lang, IconType> = { en: Owl, ja: Fox, zh: Panda }

export const EXERCISE_ICON = {
  flashcard: CardIndexDividers,
  match: PuzzlePiece,
  quiz: RedQuestionMark,
  listen: Ear,
  cloze: Memo,
  sentence: Brick,
  dictation: Headphone,
} satisfies Record<string, IconType>

export const GAME_ICON: Record<string, IconType> = {
  shooter: Rocket,
  dino: TRex,
  racing: RacingCar,
  whack: Hammer,
  flappy: FrontFacingBabyChick,
  rain: Balloon,
  memory: Brain,
  snake: Snake,
  truefalse: CheckMarkButton,
}

/** Icons for game modes; modes without one (kana / hanzi sets) show their glyph instead. */
const MODE_ICON: Record<string, IconType> = {
  meaning: FlagVn,
  write: Keyboard,
  choice: BackhandIndexPointingUp,
  reverse: RepeatButton,
  picture: FramedPicture,
  easy: Seedling,
  hard: Brain,
  listen: Ear,
}

export function ModeIcon({ mode, className }: { mode: { id: string; icon: string }; className?: string }) {
  const Icon = MODE_ICON[mode.id]
  if (Icon) return <Icon className={className} aria-hidden />
  return (
    <span className={`inline-flex items-center justify-center font-black leading-none ${className ?? ''}`} aria-hidden>
      {mode.icon}
    </span>
  )
}

export {
  Books,
  CheckMarkButton,
  CrossMark,
  Ear,
  Bullseye,
  Compass,
  Fire,
  FlagVn,
  GlowingStar,
  Hamster,
  HighVoltage,
  Joystick,
  KnockedOutFace,
  LightBulb,
  PartyPopper,
  Pushpin,
  RedHeart,
  SpeakerHighVolume,
  SquintingFaceWithTongue,
  Star,
  ThinkingFace,
  Trophy,
  WavingHand,
  WhiteHeart,
  WorldMap,
}
