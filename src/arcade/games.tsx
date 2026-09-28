import type { ComponentType } from 'react'
import type { Lang } from '../lib/types'
import type { ArcadeGameProps } from './ArcadeShell'
import { standardMode, type ModeOption } from './challenge'
import { Dino } from './games/Dino'
import { Flappy } from './games/Flappy'
import { Memory } from './games/Memory'
import { Racing } from './games/Racing'
import { Rain } from './games/Rain'
import { Shooter } from './games/Shooter'
import { Snake } from './games/Snake'
import { TrueFalse } from './games/TrueFalse'
import { Whack } from './games/Whack'
import { SCRIPT_SETS } from './scripts'

export interface ArcadeGame {
  id: string
  title: string
  icon: string
  color: string
  blurb: string
  intro: string
  controls: string[]
  modes: (lang: Lang) => ModeOption[]
  Game: ComponentType<ArcadeGameProps>
  trackSrs?: boolean
  /** false when the game has its own content (Mưa chữ uses each language's alphabet, not a deck) */
  usesDeck?: boolean
}

export const ARCADE_GAMES = {
  shooter: {
    id: 'shooter',
    title: 'Bắn chữ',
    icon: '🚀',
    color: 'from-violet-500 to-indigo-700',
    blurb: 'Gõ đáp án để bắn hạ thiên thạch',
    intro: 'Thiên thạch mang chữ đang rơi xuống! Gõ đúng đáp án để bắn hạ trước khi chúng chạm vạch đỏ.',
    controls: [
      'Gõ đáp án — tàu tự lướt tới, khóa mục tiêu và bắn khi đúng',
      'Chế độ gõ ngoại ngữ: dòng gợi ý dưới thiên thạch (d _ _ · ね＿ · m _ _) tự điền khi bạn gõ, hiện cả kanji/chữ Hán',
      'Enter: xác nhận khi đáp án là phần đầu của đáp án khác · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('meaning', lang), standardMode('write', lang)],
    Game: Shooter,
  },
  dino: {
    id: 'dino',
    title: 'Khủng long',
    icon: '🦖',
    color: 'from-lime-400 to-emerald-600',
    blurb: 'Trả lời đúng để nhảy qua xương rồng, cúi né chim',
    intro: 'Khủng long chạy mãi không ngừng! Trả lời đúng từ trên chướng ngại vật để nó tự nhảy hoặc cúi né.',
    controls: [
      'Chế độ gõ: gõ đáp án của chướng ngại vật gần nhất trước khi va chạm',
      'Chế độ chọn: ↑ hoặc ↓ (hay chạm nút) chọn nghĩa đúng — hộp ❓ chỉ lộ ra khi đã quá muộn!',
      'Chọn sai thì khủng long nhảy/cúi nhầm và va chạm · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('meaning', lang), standardMode('write', lang)],
    Game: Dino,
  },
  racing: {
    id: 'racing',
    title: 'Đua xe',
    icon: '🏎️',
    color: 'from-red-500 to-orange-500',
    blurb: 'Lái vào làn có nghĩa đúng, né rào chắn',
    intro:
      'Chạy thật nhanh trên đường 3 làn. Lái qua cổng có nghĩa đúng để nhận Nitro, hoặc gõ đáp án để phá rào chắn.',
    controls: [
      'Chọn làn: ← → / A D, phím 1 2 3, hoặc chạm vào làn/nút',
      'Chế độ gõ: gõ từ trên rào để phá — xe tự lái vào làn vừa mở',
      'Đi nhầm làn hoặc đâm rào mất một mạng · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('meaning', lang), standardMode('write', lang)],
    Game: Racing,
  },
  whack: {
    id: 'whack',
    title: 'Đập chuột',
    icon: '🔨',
    color: 'from-amber-400 to-yellow-600',
    blurb: '60 giây đập đúng chú chuột mang đáp án',
    intro: 'Các chú chuột thò lên cầm biển đáp án. Đập thật nhanh vào chú chuột đúng trong 60 giây!',
    controls: ['Chạm/bấm vào chuột đúng, hoặc phím 1–9', 'Đập càng nhanh càng nhiều điểm · đập nhầm bị trừ 2 giây'],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: Whack,
  },
  flappy: {
    id: 'flappy',
    title: 'Chim bay',
    icon: '🐤',
    color: 'from-sky-400 to-cyan-600',
    blurb: 'Vỗ cánh bay qua khe có đáp án đúng',
    intro: 'Mỗi cột ống có hai khe mang hai đáp án. Vỗ cánh để bay qua đúng khe!',
    controls: ['Space / ↑ / chạm màn hình để vỗ cánh', 'Bay nhầm khe, đâm ống hay chạm đất đều mất một mạng'],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: Flappy,
  },
  rain: {
    id: 'rain',
    title: 'Mưa chữ',
    icon: '🎈',
    color: 'from-fuchsia-500 to-purple-700',
    blurb: 'Bắn bóng bay mang chữ cái / chữ Hán / hình',
    intro: 'Bóng bay mang chữ đang bay lên! Gõ cách đọc để bắn nổ trước khi chúng chạm hàng xương rồng.',
    controls: [
      'Gõ cách đọc — bóng tự nổ khi đúng',
      'Enter: xác nhận khi đáp án là phần đầu của đáp án khác (vd. “n” và “na”)',
    ],
    modes: (lang) => SCRIPT_SETS[lang].map(({ id, icon, label, hint }) => ({ id, icon, label, hint })),
    Game: Rain,
    trackSrs: false,
    usesDeck: false,
  },
  memory: {
    id: 'memory',
    title: 'Lật hình',
    icon: '🧠',
    color: 'from-pink-500 to-rose-600',
    blurb: 'Lật thẻ tìm cặp từ và nghĩa',
    intro:
      'Các thẻ đang úp! Lật 2 thẻ một lượt để tìm cặp từ và nghĩa của nó. Nhớ vị trí thật giỏi để dùng ít lượt nhất.',
    controls: [
      'Chạm vào thẻ để lật',
      'Thẻ tím là từ, thẻ vàng là nghĩa — ghép đúng cặp thì thẻ ở lại',
      'Ít lượt và nhanh thì nhiều điểm',
    ],
    modes: () => [
      { id: 'easy', icon: '6', label: '6 cặp', hint: 'Lưới nhỏ — nhẹ nhàng' },
      { id: 'hard', icon: '8', label: '8 cặp', hint: 'Lưới 4×4 — thử thách trí nhớ' },
    ],
    Game: Memory,
  },
  snake: {
    id: 'snake',
    title: 'Rắn săn mồi',
    icon: '🐍',
    color: 'from-green-500 to-emerald-700',
    blurb: 'Bò tới quả táo mang nghĩa đúng',
    intro: 'Mỗi quả táo mang một đáp án. Điều khiển rắn ăn đúng quả để dài ra — ăn nhầm hay đâm tường là mất mạng!',
    controls: [
      'Phím mũi tên / WASD, vuốt màn hình hoặc nút điều hướng trên điện thoại',
      'Ăn đúng: rắn dài thêm và chạy nhanh dần',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: Snake,
  },
  truefalse: {
    id: 'truefalse',
    title: 'Đúng hay sai',
    icon: '✅',
    color: 'from-teal-400 to-cyan-600',
    blurb: '60 giây vuốt thẻ: nghĩa này đúng hay sai?',
    intro: 'Mỗi thẻ ghép một từ với một nghĩa. Vuốt phải nếu đúng, vuốt trái nếu sai — càng nhanh càng nhiều điểm!',
    controls: ['Vuốt thẻ, bấm nút, hoặc phím → (đúng) / ← (sai)', 'Trả lời sai bị trừ 3 giây'],
    modes: () => [
      { id: 'meaning', icon: '🇻🇳', label: 'Từ = nghĩa?', hint: 'Thấy từ và một nghĩa — đúng hay sai?' },
      { id: 'listen', icon: '👂', label: 'Nghe = nghĩa?', hint: 'Nghe từ (không thấy chữ) rồi đoán' },
    ],
    Game: TrueFalse,
  },
} satisfies Record<string, ArcadeGame>

export type ArcadeGameId = keyof typeof ARCADE_GAMES
