// Illustrated icons (Microsoft Fluent Emoji, color: soft cartoon shading) and round flags (circle-flags),
// bundled as SVG components at build time by unplugin-icons — they look the same
// on every OS, unlike system emoji (Windows shows flags as "GB", "JP"…).
// UI controls use line icons from lucide-react instead.
import type { ComponentType, SVGProps } from 'react'
import FlagCn from '~icons/circle-flags/cn'
import FlagGb from '~icons/circle-flags/gb'
import FlagJp from '~icons/circle-flags/jp'
import FlagVn from '~icons/circle-flags/vn'
import BackhandIndexPointingUp from '~icons/fluent-emoji/backhand-index-pointing-up'
import Balloon from '~icons/fluent-emoji/balloon'
import Books from '~icons/fluent-emoji/books'
import BookmarkTabs from '~icons/fluent-emoji/bookmark-tabs'
import Brain from '~icons/fluent-emoji/brain'
import Brick from '~icons/fluent-emoji/brick'
import Briefcase from '~icons/fluent-emoji/briefcase'
import Bullseye from '~icons/fluent-emoji/bullseye'
import BustsInSilhouette from '~icons/fluent-emoji/busts-in-silhouette'
import CardIndexDividers from '~icons/fluent-emoji/card-index-dividers'
import CheckMarkButton from '~icons/fluent-emoji/check-mark-button'
import Child from '~icons/fluent-emoji/child'
import Compass from '~icons/fluent-emoji/compass'
import CrossMark from '~icons/fluent-emoji/cross-mark'
import Ear from '~icons/fluent-emoji/ear'
import Fire from '~icons/fluent-emoji/fire'
import Fox from '~icons/fluent-emoji/fox'
import FramedPicture from '~icons/fluent-emoji/framed-picture'
import FrontFacingBabyChick from '~icons/fluent-emoji/front-facing-baby-chick'
import GlowingStar from '~icons/fluent-emoji/glowing-star'
import GraduationCap from '~icons/fluent-emoji/graduation-cap'
import DeciduousTree from '~icons/fluent-emoji/deciduous-tree'
import Hammer from '~icons/fluent-emoji/hammer'
import Hamster from '~icons/fluent-emoji/hamster'
import KnockedOutFace from '~icons/fluent-emoji/knocked-out-face'
import SquintingFaceWithTongue from '~icons/fluent-emoji/squinting-face-with-tongue'
import Headphone from '~icons/fluent-emoji/headphone'
import HourglassDone from '~icons/fluent-emoji/hourglass-done'
import OpenBook from '~icons/fluent-emoji/open-book'
import SpeakingHead from '~icons/fluent-emoji/speaking-head'
import Herb from '~icons/fluent-emoji/herb'
import HighVoltage from '~icons/fluent-emoji/high-voltage'
import Rabbit from '~icons/fluent-emoji/rabbit-face'
import Turtle from '~icons/fluent-emoji/turtle'
import Joystick from '~icons/fluent-emoji/joystick'
import Keyboard from '~icons/fluent-emoji/keyboard'
import Memo from '~icons/fluent-emoji/memo'
import LightBulb from '~icons/fluent-emoji/light-bulb'
import Owl from '~icons/fluent-emoji/owl'
import Panda from '~icons/fluent-emoji/panda'
import PartyPopper from '~icons/fluent-emoji/party-popper'
import PuzzlePiece from '~icons/fluent-emoji/puzzle-piece'
import Pushpin from '~icons/fluent-emoji/pushpin'
import RacingCar from '~icons/fluent-emoji/racing-car'
import RedQuestionMark from '~icons/fluent-emoji/red-question-mark'
import RedHeart from '~icons/fluent-emoji/red-heart'
import RepeatButton from '~icons/fluent-emoji/repeat-button'
import Rocket from '~icons/fluent-emoji/rocket'
import Seedling from '~icons/fluent-emoji/seedling'
import Snake from '~icons/fluent-emoji/snake'
import SpeakerHighVolume from '~icons/fluent-emoji/speaker-high-volume'
import Star from '~icons/fluent-emoji/star'
import TRex from '~icons/fluent-emoji/t-rex'
import ThinkingFace from '~icons/fluent-emoji/thinking-face'
import Trophy from '~icons/fluent-emoji/trophy'
import WavingHand from '~icons/fluent-emoji/waving-hand'
import WhiteHeart from '~icons/fluent-emoji/white-heart'
import WorldMap from '~icons/fluent-emoji/world-map'
import WritingHand from '~icons/fluent-emoji/writing-hand'
import SpeechBalloon from '~icons/fluent-emoji/speech-balloon'
import Scroll from '~icons/fluent-emoji/scroll'
import StudioMicrophone from '~icons/fluent-emoji/studio-microphone'
import ForkAndKnifeWithPlate from '~icons/fluent-emoji/fork-and-knife-with-plate'
import ShoppingBags from '~icons/fluent-emoji/shopping-bags'
import Hotel from '~icons/fluent-emoji/hotel'
import Hospital from '~icons/fluent-emoji/hospital'
import TelephoneReceiver from '~icons/fluent-emoji/telephone-receiver'
import Necktie from '~icons/fluent-emoji/necktie'
import AdmissionTickets from '~icons/fluent-emoji/admission-tickets'
import FlexedBiceps from '~icons/fluent-emoji/flexed-biceps'
import InputLatinLetters from '~icons/fluent-emoji/input-latin-letters'
import Robot from '~icons/fluent-emoji/robot'
import TriangularFlag from '~icons/fluent-emoji/triangular-flag'
import Bell from '~icons/fluent-emoji/bell'
import MoneyBag from '~icons/fluent-emoji/money-bag'
import Pick from '~icons/fluent-emoji/pick'
import GoalNet from '~icons/fluent-emoji/goal-net'
import SnowmanIcon from '~icons/fluent-emoji/snowman'
import MagnifyingGlassTiltedLeft from '~icons/fluent-emoji/magnifying-glass-tilted-left'
import FishingPole from '~icons/fluent-emoji/fishing-pole'
import Basket from '~icons/fluent-emoji/basket'
import HollowRedCircle from '~icons/fluent-emoji/hollow-red-circle'
import GameDie from '~icons/fluent-emoji/game-die'
import type { CourseLevel, GameSpeed, GrammarGroup, Lang, Track } from '../lib/types'

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
  tug: FlexedBiceps,
  bingo: AdmissionTickets,
  spell: InputLatinLetters,
  millionaire: MoneyBag,
  goldenbell: Bell,
  goldminer: Pick,
  penalty: GoalNet,
  hangman: SnowmanIcon,
  wordsearch: MagnifyingGlassTiltedLeft,
  fishing: FishingPole,
  catch: Basket,
  tictactoe: HollowRedCircle,
  snakesladders: GameDie,
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

export const GRAMMAR_ICON: Record<GrammarGroup, IconType> = {
  tenses: HourglassDone,
  grammar: OpenBook,
  sounds: SpeakingHead,
}

export const SPEED_ICON: Record<GameSpeed, IconType> = { slow: Turtle, normal: Rabbit, fast: HighVoltage }

/** Illustrations for conversation scenes (Dialogue.icon in public/talk/*.json) */
export const TALK_ICON: Record<string, IconType> = {
  greeting: WavingHand,
  restaurant: ForkAndKnifeWithPlate,
  shopping: ShoppingBags,
  directions: Compass,
  hotel: Hotel,
  doctor: Hospital,
  phone: TelephoneReceiver,
  interview: Necktie,
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
  BookmarkTabs,
  BustsInSilhouette,
  Robot,
  TriangularFlag,
  OpenBook,
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
  WritingHand,
  SpeechBalloon,
  Scroll,
  StudioMicrophone,
}
