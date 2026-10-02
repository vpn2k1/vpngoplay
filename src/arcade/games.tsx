import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Lang } from '../lib/types'
import type { ArcadeGameProps } from './ArcadeShell'
import { standardMode, type ModeOption } from './challenge'
import { ARCADE_GAME_IDS, type ArcadeGameId } from './gameIds'
import { SCRIPT_SETS } from './scripts'

export type { ArcadeGameId } from './gameIds'

const Bomb = lazy(() => import('./games/Bomb').then((m) => ({ default: m.Bomb })))
const Bingo = lazy(() => import('./games/Bingo').then((m) => ({ default: m.Bingo })))
const Catch = lazy(() => import('./games/Catch').then((m) => ({ default: m.Catch })))
const Dino = lazy(() => import('./games/Dino').then((m) => ({ default: m.Dino })))
const Fishing = lazy(() => import('./games/Fishing').then((m) => ({ default: m.Fishing })))
const Flappy = lazy(() => import('./games/Flappy').then((m) => ({ default: m.Flappy })))
const GoldMiner = lazy(() => import('./games/GoldMiner').then((m) => ({ default: m.GoldMiner })))
const GoldenBell = lazy(() => import('./games/GoldenBell').then((m) => ({ default: m.GoldenBell })))
const KeywordPuzzle = lazy(() => import('./games/KeywordPuzzle').then((m) => ({ default: m.KeywordPuzzle })))
const Memory = lazy(() => import('./games/Memory').then((m) => ({ default: m.Memory })))
const Millionaire = lazy(() => import('./games/Millionaire').then((m) => ({ default: m.Millionaire })))
const Penalty = lazy(() => import('./games/Penalty').then((m) => ({ default: m.Penalty })))
const Racing = lazy(() => import('./games/Racing').then((m) => ({ default: m.Racing })))
const Rain = lazy(() => import('./games/Rain').then((m) => ({ default: m.Rain })))
const Shooter = lazy(() => import('./games/Shooter').then((m) => ({ default: m.Shooter })))
const Snake = lazy(() => import('./games/Snake').then((m) => ({ default: m.Snake })))
const SnakesLadders = lazy(() => import('./games/SnakesLadders').then((m) => ({ default: m.SnakesLadders })))
const Snowman = lazy(() => import('./games/Snowman').then((m) => ({ default: m.Snowman })))
const Spell = lazy(() => import('./games/Spell').then((m) => ({ default: m.Spell })))
const TicTacToe = lazy(() => import('./games/TicTacToe').then((m) => ({ default: m.TicTacToe })))
const TrueFalse = lazy(() => import('./games/TrueFalse').then((m) => ({ default: m.TrueFalse })))
const Tug = lazy(() => import('./games/Tug').then((m) => ({ default: m.Tug })))
const WordChain = lazy(() => import('./games/WordChain').then((m) => ({ default: m.WordChain })))
const WordWheel = lazy(() => import('./games/WordWheel').then((m) => ({ default: m.WordWheel })))
const WordSearch = lazy(() => import('./games/WordSearch').then((m) => ({ default: m.WordSearch })))
const Wordle = lazy(() => import('./games/Wordle').then((m) => ({ default: m.Wordle })))
const Whack = lazy(() => import('./games/Whack').then((m) => ({ default: m.Whack })))

export interface ArcadeGame {
  id: string
  title: string
  icon: string
  color: string
  blurb: string
  intro: string
  controls: string[]
  modes: (lang: Lang) => ModeOption[]
  Game: LazyExoticComponent<ComponentType<ArcadeGameProps>>
  trackSrs?: boolean
  /** false when the game has its own content (Mưa chữ uses each language's alphabet, not a deck) */
  usesDeck?: boolean
  /** false when nothing moves on its own (the speed setting does not apply) */
  paced?: boolean
  /** The game uses the language's whole vocabulary (vocab.ts): the game page preloads it */
  vocab?: boolean
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
    paced: false,
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
    paced: false,
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
  tug: {
    id: 'tug',
    title: 'Kéo co',
    icon: '💪',
    color: 'from-orange-400 to-rose-600',
    blurb: 'Trả lời đúng để kéo dây thắng đội robot',
    intro:
      'Đội của bạn kéo co với đội robot! Mỗi câu trả lời đúng kéo dây về phía bạn. Robot kéo liên tục và mạnh dần qua từng vòng.',
    controls: [
      'Chế độ chọn: phím 1–4 hoặc chạm đáp án · chế độ gõ: gõ đáp án (Enter khi cần)',
      'Đưa cờ đỏ qua vạch xanh bên bạn là thắng vòng; qua vạch đỏ bên robot là thua',
      'Sai hoặc bỏ qua thì robot giật lại một nhịp · Esc: tạm dừng',
    ],
    modes: (lang) => [
      standardMode('choice', lang),
      standardMode('reverse', lang),
      standardMode('meaning', lang),
      standardMode('write', lang),
    ],
    Game: Tug,
  },
  bingo: {
    id: 'bingo',
    title: 'Lô tô',
    icon: '🎟️',
    color: 'from-rose-500 to-amber-500',
    blurb: 'Nghe xướng từ, dò vé — đủ hàng là “Kinh!”',
    intro:
      'Người xướng lô tô đọc từng từ. Tìm ô có nghĩa đúng trên vé của bạn trước khi hết lượt. Đủ một hàng ngang, dọc hoặc chéo là “Kinh!”',
    controls: [
      'Chạm vào ô đúng trước khi thanh thời gian hết',
      'Chọn nhầm bị trừ 2 giây của lượt · hết giờ thì ô đó bị gạch',
      'Space: nghe đọc lại · Esc: tạm dừng',
    ],
    modes: (lang) => [
      { id: 'choice', icon: '👀', label: 'Nhìn và nghe', hint: 'Thấy và nghe từ → tìm ô có nghĩa đúng' },
      { id: 'listen', icon: '👂', label: 'Chỉ nghe', hint: 'Chỉ nghe đọc, không thấy chữ → tìm ô có nghĩa' },
      { ...standardMode('reverse', lang), hint: 'Thấy nghĩa tiếng Việt → tìm ô có từ đúng' },
    ],
    Game: Bingo,
  },
  spell: {
    id: 'spell',
    paced: false,
    title: 'Xếp chữ',
    icon: '🔤',
    color: 'from-yellow-400 to-orange-500',
    blurb: '90 giây xếp lại chữ cái / kana / chữ Hán thành từ',
    intro:
      'Các chữ của một từ bị xáo trộn, lẫn vài chữ thừa. Chạm từng chữ theo đúng thứ tự để ghép lại từ — càng nhiều từ càng nhiều điểm!',
    controls: [
      'Chạm chữ theo thứ tự (tiếng Anh gõ phím cũng được)',
      'Tiếng Nhật xếp bằng kana, tiếng Trung xếp chữ Hán',
      'Nhầm 3 lần thì lộ đáp án · Gợi ý đặt giúp một chữ (bớt điểm)',
    ],
    modes: () => [
      { id: 'meaning', icon: '🇻🇳', label: 'Nhìn nghĩa', hint: 'Thấy nghĩa tiếng Việt → xếp thành từ' },
      { id: 'listen', icon: '👂', label: 'Nghe rồi xếp', hint: 'Chỉ nghe đọc từ → xếp lại cho đúng' },
    ],
    Game: Spell,
  },
  millionaire: {
    id: 'millionaire',
    paced: false,
    title: 'Ai là triệu phú',
    icon: '💰',
    color: 'from-indigo-600 to-violet-800',
    blurb: '15 câu hỏi leo thang tiền thưởng tới 150 triệu',
    intro:
      'Trả lời đúng 15 câu hỏi để leo lên đỉnh 150.000.000đ! Mốc an toàn ở câu 5 và 10, ba quyền trợ giúp, mỗi câu 30 giây.',
    controls: [
      'Chạm đáp án hoặc phím 1–4 / A–D — chờ một nhịp hồi hộp để biết đúng hay sai',
      'Quyền trợ giúp (mỗi loại một lần): 50:50, Hỏi ý kiến khán giả, Đổi câu hỏi',
      'Sai hoặc hết giờ: ra về với mốc an toàn · “Dừng cuộc chơi” để mang về tiền đang có · Esc: tạm dừng',
    ],
    modes: (lang) => [
      standardMode('choice', lang),
      standardMode('reverse', lang),
      { id: 'listen', icon: '👂', label: 'Nghe và chọn', hint: 'Chỉ nghe đọc từ (không thấy chữ) → chọn nghĩa' },
    ],
    Game: Millionaire,
  },
  goldenbell: {
    id: 'goldenbell',
    paced: false,
    title: 'Rung chuông vàng',
    icon: '🔔',
    color: 'from-amber-400 to-yellow-600',
    blurb: 'Viết đáp án lên bảng, vượt qua 20 câu để rung chuông',
    intro:
      'Viết đáp án lên bảng và giơ lên trước khi hết giờ. Sai một câu là bị loại — nhưng bạn có một lần Cứu trợ. Vượt qua cả 20 câu để rung chuông vàng!',
    controls: [
      'Gõ đáp án lên bảng rồi bấm “Giơ bảng” hoặc Enter — mỗi câu 20 giây',
      'Gõ nghĩa không cần dấu; gõ ngoại ngữ bằng chữ cái, romaji/kana/kanji hoặc pinyin/chữ Hán',
      'Sai hay hết giờ là bị loại · Cứu trợ cho bạn quay lại một lần · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('meaning', lang), standardMode('write', lang)],
    Game: GoldenBell,
  },
  goldminer: {
    id: 'goldminer',
    title: 'Đào vàng',
    icon: '⛏️',
    color: 'from-amber-400 to-yellow-700',
    blurb: '60 giây thả móc gắp cục vàng mang đáp án đúng',
    intro:
      'Móc câu đung đưa qua lại dưới chân anh thợ mỏ. Canh đúng lúc thả móc để gắp cục vàng mang đáp án đúng — cục to kéo lên chậm, tránh đá kẻo mất thời gian!',
    controls: [
      'Chạm màn hình, Space hoặc ↓ để thả móc theo hướng đang chỉ',
      'Gắp đúng được tiền: càng nhanh, combo càng cao, cục càng to càng nhiều tiền (nhưng kéo lên chậm hơn)',
      'Gắp nhầm: kéo lên chậm và cục vàng đúng sáng xanh · gắp phải đá chỉ mất thời gian · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: GoldMiner,
  },
  penalty: {
    id: 'penalty',
    title: 'Sút luân lưu',
    icon: '🥅',
    color: 'from-green-500 to-emerald-700',
    blurb: 'Đá luân lưu với đội robot: sút và bắt bóng bằng từ vựng',
    intro:
      'Loạt sút luân lưu với đội robot! Lượt bạn: sút vào ô có đáp án đúng. Lượt robot: bay người đỡ ở ô khớp với từ trên quả bóng. Mỗi đội 5 quả, hòa thì đá cân não.',
    controls: [
      'Chạm ô trong khung thành hoặc phím 1–4 (trẻ em: 1–3)',
      'Mỗi quả có thời gian đếm ngược — hết giờ là hỏng',
      'Space hoặc nút loa: nghe lại · Esc: tạm dừng',
    ],
    modes: (lang) => [
      standardMode('choice', lang),
      standardMode('reverse', lang),
      { id: 'listen', icon: '👂', label: 'Nghe và chọn', hint: 'Chỉ nghe đọc từ (không thấy chữ) → chọn nghĩa' },
    ],
    Game: Penalty,
  },
  hangman: {
    id: 'hangman',
    paced: false,
    title: 'Người tuyết',
    icon: '⛄',
    color: 'from-sky-400 to-indigo-500',
    blurb: 'Đoán từ từng chữ trước khi người tuyết tan',
    intro:
      'Một từ đang được giấu! Đoán từng chữ của nó trước khi người tuyết tan. Mỗi lần đoán sai, mặt trời to thêm và người tuyết rơi mất mũ, khăn, tay, mũi… — sai 6 lần là tan hết.',
    controls: [
      'Chạm chữ trên bàn phím hoặc gõ phím a–z · tiếng Nhật chạm kana',
      'Tiếng Trung đoán phiên âm pinyin không dấu, giải xong hiện chữ Hán',
      'Gợi ý mở giúp một chữ (tối đa 2 lần mỗi từ, bớt điểm) · Space: nghe lại · Esc: tạm dừng',
    ],
    modes: () => [
      { id: 'meaning', icon: '🇻🇳', label: 'Nhìn nghĩa', hint: 'Thấy nghĩa tiếng Việt → đoán từng chữ' },
      { id: 'listen', icon: '👂', label: 'Nghe rồi đoán', hint: 'Chỉ nghe đọc từ → đoán từng chữ' },
    ],
    Game: Snowman,
  },
  wordsearch: {
    id: 'wordsearch',
    paced: false,
    title: 'Tìm từ',
    icon: '🔍',
    color: 'from-emerald-400 to-teal-600',
    blurb: 'Tìm các từ giấu trong bảng chữ trước khi hết giờ',
    intro:
      'Các từ đang trốn trong bảng chữ! Đọc nghĩa tiếng Việt, tìm từ đó rồi kéo tay qua các chữ để khoanh lại. Tìm hết trước khi đồng hồ về 0 — hết giờ là thua.',
    controls: [
      'Kéo qua các chữ theo hàng ngang, dọc hoặc chéo — hoặc chạm chữ đầu rồi chữ cuối',
      'Đồng hồ đếm ngược (Dễ 5 phút, Khó và trẻ em 10 phút) · hết giờ thì thua và lộ các từ còn lại · tìm hết nhanh được thưởng điểm',
      'Gợi ý (3 lần, trẻ em 5, −5 điểm): khoanh chữ đầu, lần sau khoanh thêm chữ cuối · chạm một nghĩa để chọn từ cần gợi ý',
      'Tiếng Anh tìm chữ cái, tiếng Nhật tìm kana, tiếng Trung tìm chữ Hán · Bỏ cuộc (bấm 2 lần) · Esc: tạm dừng',
    ],
    modes: () => [
      { id: 'easy', icon: '🌱', label: 'Dễ', hint: '5 từ, nằm ngang → hoặc dọc ↓' },
      { id: 'hard', icon: '🧠', label: 'Khó', hint: '12 từ theo cả 8 hướng, kể cả chéo và viết ngược' },
    ],
    Game: WordSearch,
  },
  fishing: {
    id: 'fishing',
    title: 'Câu cá',
    icon: '🎣',
    color: 'from-cyan-400 to-blue-600',
    blurb: '60 giây thả câu đúng chú cá mang đáp án',
    intro:
      'Đàn cá bơi qua lại, mỗi chú mang một đáp án. Chạm vào chú cá đúng để thả câu và kéo lên thuyền — câu càng nhanh, càng liên tiếp thì càng nhiều điểm!',
    controls: [
      'Chạm vào cá hoặc nhãn của nó, hay bấm phím số trên nhãn (1–4)',
      'Câu nhanh và đúng liên tiếp được thưởng thêm điểm',
      'Câu nhầm bị trừ 3 giây và chú cá đúng sẽ nhấp nháy · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: Fishing,
  },
  catch: {
    id: 'catch',
    title: 'Hứng quả',
    icon: '🧺',
    color: 'from-lime-400 to-orange-500',
    blurb: 'Di chuyển giỏ hứng đúng quả mang đáp án',
    intro:
      'Trái cây mang chữ đang rơi xuống vườn! Di chuyển giỏ để hứng đúng quả có đáp án đúng — hứng nhầm hay để rơi quả đúng là mất một mạng.',
    controls: [
      '← → / A D, hoặc chạm và kéo trên màn hình để di chuyển giỏ',
      'Mỗi lượt chỉ có một quả đúng · bóng dưới đất cho biết quả sắp rơi vào đâu',
      'Quả rơi nhanh dần khi bạn hứng đúng · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: Catch,
  },
  tictactoe: {
    id: 'tictactoe',
    paced: false,
    title: 'Cờ caro',
    icon: '⭕',
    color: 'from-indigo-400 to-fuchsia-600',
    blurb: 'Trả lời đúng để đánh ✕ — ba ô thẳng hàng là thắng robot',
    intro:
      'Đấu cờ caro 3×3 với robot! Mỗi ô là một từ: chạm ô rồi trả lời đúng để đánh ✕ vào đó, sai thì mất lượt. Ai thắng 2 ván trước là thắng trận.',
    controls: [
      'Chạm một ô trống (hoặc phím 1–9) rồi chọn đáp án: phím 1–4 hoặc chạm',
      'Đúng: ô đó là ✕ của bạn · sai: mất lượt, robot đi thay',
      'Ba ✕ thẳng hàng ngang, dọc hoặc chéo là thắng ván · hòa thì chơi lại, tối đa 5 ván · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: TicTacToe,
  },
  snakesladders: {
    id: 'snakesladders',
    paced: false,
    title: 'Cờ rắn',
    icon: '🎲',
    color: 'from-lime-400 to-teal-600',
    blurb: 'Trả lời đúng để tung xúc xắc, leo thang, né rắn, về đích trước robot',
    intro:
      'Đua về ô 30 với robot trên bàn cờ rắn! Mỗi lượt trả lời một câu: đúng thì được tung xúc xắc. Gặp chân thang thì leo lên, gặp đầu rắn thì trượt xuống.',
    controls: [
      'Chọn đáp án đúng (phím 1–4 hoặc chạm) để mở nút “Tung xúc xắc”',
      'Space / Enter hoặc chạm nút để tung · trả lời sai thì mất lượt tung',
      'Về ô 30 trước là thắng (tung dư vẫn về đích) · tối đa 40 lượt · Esc: tạm dừng',
    ],
    modes: (lang) => [standardMode('choice', lang), standardMode('reverse', lang)],
    Game: SnakesLadders,
  },
  bomb: {
    id: 'bomb',
    title: 'Bom hẹn giờ',
    icon: '💣',
    color: 'from-orange-500 to-red-700',
    blurb: 'Trả lời đúng để chuyền quả bom đang cháy ngòi trước khi nó nổ',
    intro:
      'Bạn và 3 robot ngồi thành vòng tròn, chuyền tay một quả bom đang cháy ngòi. Ai cầm bom phải trả lời đúng mới được chuyền đi — và không ai biết khi nào bom nổ! Nổ trong tay robot thì robot bị loại, nổ trong tay bạn thì mất một mạng.',
    controls: [
      'Chế độ chọn: phím 1–4 (trẻ em 1–3) hoặc chạm đáp án · chế độ gõ: gõ đúng là bom tự bay đi',
      'Đúng: bom bay sang người kế bên · sai hoặc bỏ qua: giữ bom thêm 2 giây rồi trả lời câu mới',
      'Bom kêu tích tắc nhanh dần khi sắp nổ · loại cả 3 robot là thắng, hết 3 mạng là thua · Esc: tạm dừng',
    ],
    modes: (lang) => [
      standardMode('choice', lang),
      standardMode('reverse', lang),
      standardMode('meaning', lang),
      standardMode('write', lang),
    ],
    Game: Bomb,
  },
  crossword: {
    id: 'crossword',
    paced: false,
    vocab: true,
    title: 'Giải ô chữ',
    icon: '🔑',
    color: 'from-sky-400 to-indigo-600',
    blurb: 'Giải các hàng ngang để tìm từ khóa hàng dọc',
    intro:
      'Như trong Đường lên đỉnh Olympia! Mỗi hàng ngang là một từ, gợi ý là nghĩa tiếng Việt của nó. Cột màu vàng chạy dọc qua các hàng giấu một từ khóa — đoán ra càng sớm, thưởng càng lớn.',
    controls: [
      'Chạm một hàng (hoặc phím số 1–9, ↑ ↓) để xem gợi ý, gõ đáp án rồi Enter hoặc nút ✓',
      'Gõ tiếng Anh, romaji/kana/kanji hoặc pinyin/chữ Hán · sai 2 lần thì hàng đó tự mở',
      '“Đoán từ khóa” bất cứ lúc nào: đúng được 20 điểm + 15 điểm mỗi hàng chưa mở, sai bị trừ 10 điểm và chờ 10 giây',
      'Mỗi ô chữ 3 phút (trẻ em 1 ô chữ, còn lại 2) · Bỏ cuộc (bấm 2 lần) để xem đáp án · Esc: tạm dừng',
    ],
    modes: () => [
      { id: 'easy', icon: '🌱', label: 'Dễ', hint: 'Mỗi hàng lộ sẵn chữ cái / kana / chữ Hán đầu tiên' },
      { id: 'hard', icon: '🧠', label: 'Khó', hint: 'Không lộ chữ nào — chỉ có nghĩa tiếng Việt' },
    ],
    Game: KeywordPuzzle,
  },
  wordle: {
    id: 'wordle',
    paced: false,
    vocab: true,
    title: 'Đoán chữ',
    icon: '🟩',
    color: 'from-emerald-400 to-lime-600',
    blurb: 'Đoán từ bí mật trong 6 lượt, ô màu chỉ đường',
    intro:
      'Một từ đang được giấu! Bạn có 6 lượt đoán. Sau mỗi lượt, ô xanh là chữ đúng chỗ, ô vàng là chữ có trong từ nhưng sai chỗ, ô xám là chữ không có. Mỗi ván 3 từ (trẻ em 2).',
    controls: [
      'Tiếng Anh: gõ từ 5 chữ cái (chế độ Khó: 6) bằng bàn phím hoặc chạm chữ · Enter: đoán · ⌫: xoá',
      'Tiếng Nhật: chạm kana, ゛ ゜ 小 đổi chữ vừa gõ (か→が, は→ぱ, つ→っ) · Tiếng Trung: đoán pinyin không dấu của từ 2 chữ Hán',
      'Từ đoán phải có trong từ điển (tiếng Trung: chữ cái bất kỳ, đủ số ô) · Gợi ý mở một ô (−5 điểm, 1 lần mỗi từ) · Bỏ qua (bấm 2 lần) xem đáp án · Esc: tạm dừng',
    ],
    modes: (lang) => [
      { id: 'easy', icon: '🌱', label: 'Dễ', hint: 'Thấy nghĩa tiếng Việt ngay từ đầu' },
      { id: 'normal', icon: '🎯', label: 'Thường', hint: 'Nghĩa chỉ hiện sau 3 lần đoán sai' },
      ...(lang === 'en'
        ? [{ id: 'hard', icon: '🧠', label: 'Khó', hint: 'Từ 6 chữ cái, nghĩa hiện sau 3 lần đoán sai' }]
        : []),
    ],
    Game: Wordle,
  },
  wordchain: {
    id: 'wordchain',
    vocab: true,
    title: 'Nối chữ',
    icon: '🔗',
    color: 'from-violet-500 to-fuchsia-600',
    blurb: 'Nối từ với robot: từ sau bắt đầu bằng chữ cuối của từ trước',
    intro:
      'Chơi nối chữ với robot! Mỗi từ phải bắt đầu bằng chữ cuối của từ trước (tiếng Nhật nối kana như しりとり, tiếng Trung nối chữ Hán như 词语接龙). Nối đủ 12 từ để thắng — làm robot bí còn được thưởng điểm.',
    controls: [
      'Chế độ chọn: phím 1–4 hoặc chạm vào nghĩa của từ bắt đầu bằng chữ được tô vàng',
      'Chế độ gõ: gõ bất kỳ từ nào nối được rồi Enter (romaji/kana/kanji, pinyin/chữ Hán đều được) — có gợi ý nghĩa',
      'Sai, bỏ qua hay hết giờ mất 1 tim (có 3 tim) · robot bí: +30 điểm và bắt đầu chuỗi mới · Esc: tạm dừng',
    ],
    modes: (lang) =>
      lang === 'en'
        ? [
            {
              id: 'one',
              icon: 'a',
              label: 'Nối 1 chữ',
              hint: 'Chọn nghĩa của từ bắt đầu bằng chữ cái cuối của từ trước',
            },
            { id: 'two', icon: 'ab', label: 'Nối 2 chữ', hint: 'Khó hơn: từ sau bắt đầu bằng 2 chữ cái cuối' },
            {
              id: 'write',
              icon: '⌨️',
              label: 'Gõ từ nối',
              hint: 'Tự gõ một từ bắt đầu bằng chữ cái cuối — từ nào cũng được',
            },
          ]
        : [
            lang === 'ja'
              ? { id: 'one', icon: 'あ', label: 'Nối kana', hint: 'しりとり: chọn nghĩa của từ bắt đầu bằng kana cuối' }
              : {
                  id: 'one',
                  icon: '字',
                  label: 'Nối chữ Hán',
                  hint: '词语接龙: chọn nghĩa của từ bắt đầu bằng chữ Hán cuối',
                },
            {
              id: 'write',
              icon: '⌨️',
              label: 'Gõ từ nối',
              hint:
                lang === 'ja'
                  ? 'Tự gõ một từ bắt đầu bằng kana cuối (romaji, kana hoặc kanji)'
                  : 'Tự gõ một từ bắt đầu bằng chữ Hán cuối (pinyin hoặc chữ Hán)',
            },
          ],
    Game: WordChain,
  },
  wordwheel: {
    id: 'wordwheel',
    paced: false,
    vocab: true,
    title: 'Vòng chữ',
    icon: '🎡',
    color: 'from-amber-400 to-pink-500',
    blurb: 'Nối các chữ trên vòng tròn thành từ theo nghĩa',
    intro:
      'Các chữ xếp thành một vòng tròn. Kéo ngón tay nối các chữ để ghép thành những từ có nghĩa ở trên — ghép được từ đúng khác thì đó là từ thưởng!',
    controls: [
      'Kéo qua các chữ rồi thả tay để kiểm tra, hoặc chạm từng chữ rồi bấm ✓ · ⌫ xoá chữ cuối (tiếng Anh gõ phím cũng được)',
      'Tiếng Anh ghép chữ cái, tiếng Nhật ghép kana, tiếng Trung ghép chữ Hán · nút giữa vòng xáo lại các chữ',
      'Gợi ý mở một chữ (3 lần mỗi vòng, bớt điểm) · Bỏ qua (bấm 2 lần) để xem đáp án · Esc: tạm dừng',
    ],
    modes: () => [
      { id: 'meaning', icon: '🇻🇳', label: 'Gợi ý bằng nghĩa', hint: 'Mỗi từ cần tìm có nghĩa tiếng Việt bên cạnh' },
      {
        id: 'blind',
        icon: '🙈',
        label: 'Không gợi ý',
        hint: 'Nghĩa bị che — chạm hàng để mở nghĩa (bớt điểm); điểm mỗi từ ×1,5',
      },
    ],
    Game: WordWheel,
  },
} satisfies Record<string, ArcadeGame>

/** How the games tab groups the games (every game appears in exactly one group). */
export const GAME_GROUPS: { title: string; hint: string; ids: ArcadeGameId[] }[] = [
  {
    title: 'Phản xạ nhanh',
    hint: 'Trả lời trước khi chướng ngại vật, con mồi hay thời gian kịp tới',
    ids: ['shooter', 'dino', 'racing', 'whack', 'flappy', 'snake', 'fishing', 'catch', 'goldminer', 'rain'],
  },
  {
    title: 'Chữ & trí nhớ',
    hint: 'Ghép, xếp và nhớ mặt chữ, không vội',
    ids: ['memory', 'spell', 'wordwheel', 'hangman', 'wordle', 'wordsearch', 'truefalse'],
  },
  {
    title: 'Đố vui',
    hint: 'Như trên truyền hình: trả lời đúng để đi tiếp',
    ids: ['millionaire', 'goldenbell', 'crossword', 'bingo'],
  },
  {
    title: 'Đấu với robot',
    hint: 'Mỗi câu đúng là một nước đi của bạn',
    ids: ['wordchain', 'tug', 'penalty', 'tictactoe', 'snakesladders', 'bomb'],
  },
]

/** A random word game (not an alphabet game), different from `current` when possible. */
export function randomGameId(current?: string): ArcadeGameId {
  const ids = ARCADE_GAME_IDS.filter((id) => (ARCADE_GAMES[id] as ArcadeGame).usesDeck !== false && id !== current)
  return ids[Math.floor(Math.random() * ids.length)]
}
