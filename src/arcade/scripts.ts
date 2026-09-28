// Basic building blocks of each language's writing system, for the "Mưa chữ" game:
//   ja → hiragana / katakana, typed as romaji (Hepburn or Kunrei: shi/si, tsu/tu…)
//   zh → common characters, typed as pinyin (tones optional)
//   en → picture words, typed in English
import { pinyinKey } from '../lib/answer'
import type { Lang } from '../lib/types'
import { normalizeAnswer } from '../lib/utils'

export interface ScriptItem {
  id: string
  /** What is shown on the balloon */
  glyph: string
  /** Text spoken on a hit */
  speakText: string
  /** Accepted answers, already normalised */
  keys: string[]
  /** Answer shown after a miss */
  answer: string
  meaning: string
}

// [kana, romaji...] — first romaji is the Hepburn spelling shown to learners.
const GOJUON: [string, ...string[]][] = [
  ['あ', 'a'],
  ['い', 'i'],
  ['う', 'u'],
  ['え', 'e'],
  ['お', 'o'],
  ['か', 'ka'],
  ['き', 'ki'],
  ['く', 'ku'],
  ['け', 'ke'],
  ['こ', 'ko'],
  ['さ', 'sa'],
  ['し', 'shi', 'si'],
  ['す', 'su'],
  ['せ', 'se'],
  ['そ', 'so'],
  ['た', 'ta'],
  ['ち', 'chi', 'ti'],
  ['つ', 'tsu', 'tu'],
  ['て', 'te'],
  ['と', 'to'],
  ['な', 'na'],
  ['に', 'ni'],
  ['ぬ', 'nu'],
  ['ね', 'ne'],
  ['の', 'no'],
  ['は', 'ha'],
  ['ひ', 'hi'],
  ['ふ', 'fu', 'hu'],
  ['へ', 'he'],
  ['ほ', 'ho'],
  ['ま', 'ma'],
  ['み', 'mi'],
  ['む', 'mu'],
  ['め', 'me'],
  ['も', 'mo'],
  ['や', 'ya'],
  ['ゆ', 'yu'],
  ['よ', 'yo'],
  ['ら', 'ra'],
  ['り', 'ri'],
  ['る', 'ru'],
  ['れ', 're'],
  ['ろ', 'ro'],
  ['わ', 'wa'],
  ['を', 'wo'],
  ['ん', 'nn', 'n'],
]

const toKatakana = (kana: string) => String.fromCharCode(kana.charCodeAt(0) + 0x60)

function kanaItems(katakana: boolean): ScriptItem[] {
  return GOJUON.map(([kana, ...romaji]) => {
    const glyph = katakana ? toKatakana(kana) : kana
    return {
      id: `${katakana ? 'kata' : 'hira'}-${romaji[0]}`,
      glyph,
      speakText: glyph,
      keys: romaji,
      answer: romaji.join(' / '),
      meaning: `${katakana ? 'Katakana' : 'Hiragana'} “${romaji[0]}”`,
    }
  })
}

// [character, pinyin, Vietnamese meaning]
const HANZI: [string, string, string][] = [
  ['一', 'yī', 'một'],
  ['二', 'èr', 'hai'],
  ['三', 'sān', 'ba'],
  ['四', 'sì', 'bốn'],
  ['五', 'wǔ', 'năm'],
  ['六', 'liù', 'sáu'],
  ['七', 'qī', 'bảy'],
  ['八', 'bā', 'tám'],
  ['九', 'jiǔ', 'chín'],
  ['十', 'shí', 'mười'],
  ['人', 'rén', 'người'],
  ['大', 'dà', 'to, lớn'],
  ['小', 'xiǎo', 'nhỏ'],
  ['中', 'zhōng', 'giữa'],
  ['上', 'shàng', 'trên'],
  ['下', 'xià', 'dưới'],
  ['山', 'shān', 'núi'],
  ['水', 'shuǐ', 'nước'],
  ['火', 'huǒ', 'lửa'],
  ['木', 'mù', 'cây, gỗ'],
  ['日', 'rì', 'mặt trời, ngày'],
  ['月', 'yuè', 'mặt trăng, tháng'],
  ['口', 'kǒu', 'miệng'],
  ['手', 'shǒu', 'tay'],
  ['心', 'xīn', 'tim'],
  ['天', 'tiān', 'trời'],
  ['门', 'mén', 'cửa'],
  ['牛', 'niú', 'con bò'],
  ['羊', 'yáng', 'con dê'],
  ['鱼', 'yú', 'con cá'],
  ['鸟', 'niǎo', 'con chim'],
  ['猫', 'māo', 'con mèo'],
  ['狗', 'gǒu', 'con chó'],
  ['我', 'wǒ', 'tôi'],
  ['你', 'nǐ', 'bạn'],
  ['他', 'tā', 'anh ấy'],
  ['好', 'hǎo', 'tốt'],
  ['爱', 'ài', 'yêu'],
  ['吃', 'chī', 'ăn'],
  ['喝', 'hē', 'uống'],
  ['看', 'kàn', 'nhìn, xem'],
  ['书', 'shū', 'sách'],
  ['家', 'jiā', 'nhà'],
  ['车', 'chē', 'xe'],
  ['米', 'mǐ', 'gạo'],
  ['茶', 'chá', 'trà'],
  ['花', 'huā', 'hoa'],
  ['云', 'yún', 'mây'],
  ['雨', 'yǔ', 'mưa'],
  ['风', 'fēng', 'gió'],
  ['白', 'bái', 'trắng'],
  ['红', 'hóng', 'đỏ'],
  ['学', 'xué', 'học'],
  ['字', 'zì', 'chữ'],
  ['国', 'guó', 'đất nước'],
  ['年', 'nián', 'năm'],
  ['早', 'zǎo', 'sớm'],
  ['走', 'zǒu', 'đi bộ'],
  ['来', 'lái', 'đến'],
  ['耳', 'ěr', 'tai'],
]

// [emoji, English word, Vietnamese meaning]
const PICTURES: [string, string, string][] = [
  ['🐱', 'cat', 'con mèo'],
  ['🐶', 'dog', 'con chó'],
  ['🐟', 'fish', 'con cá'],
  ['🐦', 'bird', 'con chim'],
  ['🐘', 'elephant', 'con voi'],
  ['🐰', 'rabbit', 'con thỏ'],
  ['🐻', 'bear', 'con gấu'],
  ['🦁', 'lion', 'sư tử'],
  ['🐯', 'tiger', 'con hổ'],
  ['🐵', 'monkey', 'con khỉ'],
  ['🐮', 'cow', 'con bò'],
  ['🐷', 'pig', 'con lợn'],
  ['🐔', 'chicken', 'con gà'],
  ['🦆', 'duck', 'con vịt'],
  ['🐸', 'frog', 'con ếch'],
  ['🐍', 'snake', 'con rắn'],
  ['🍎', 'apple', 'quả táo'],
  ['🍌', 'banana', 'quả chuối'],
  ['🍇', 'grapes', 'quả nho'],
  ['🍉', 'watermelon', 'dưa hấu'],
  ['🍊', 'orange', 'quả cam'],
  ['🍓', 'strawberry', 'dâu tây'],
  ['🥕', 'carrot', 'cà rốt'],
  ['🍞', 'bread', 'bánh mì'],
  ['🥛', 'milk', 'sữa'],
  ['🍚', 'rice', 'cơm'],
  ['🥚', 'egg', 'quả trứng'],
  ['🍰', 'cake', 'bánh ngọt'],
  ['☀️', 'sun', 'mặt trời'],
  ['🌙', 'moon', 'mặt trăng'],
  ['⭐', 'star', 'ngôi sao'],
  ['☁️', 'cloud', 'đám mây'],
  ['🌧️', 'rain', 'mưa'],
  ['❄️', 'snow', 'tuyết'],
  ['🌳', 'tree', 'cái cây'],
  ['🌸', 'flower', 'bông hoa'],
  ['🏠', 'house', 'ngôi nhà'],
  ['🚕', 'taxi', 'xe taxi'],
  ['🚌', 'bus', 'xe buýt'],
  ['✈️', 'plane', 'máy bay'],
  ['🚲', 'bike', 'xe đạp'],
  ['⚽', 'ball', 'quả bóng'],
  ['📖', 'book', 'quyển sách'],
  ['✏️', 'pencil', 'bút chì'],
  ['👕', 'shirt', 'áo sơ mi'],
  ['👟', 'shoes', 'đôi giày'],
  ['🎩', 'hat', 'cái mũ'],
  ['⏰', 'clock', 'đồng hồ'],
  ['🔑', 'key', 'chìa khóa'],
  ['🪑', 'chair', 'cái ghế'],
]

export interface ScriptSet {
  id: string
  icon: string
  label: string
  hint: string
  items: ScriptItem[]
}

export const SCRIPT_SETS: Record<Lang, ScriptSet[]> = {
  ja: [
    { id: 'hiragana', icon: 'あ', label: 'Hiragana', hint: '46 chữ cái mềm — gõ romaji', items: kanaItems(false) },
    { id: 'katakana', icon: 'ア', label: 'Katakana', hint: '46 chữ cái cứng — gõ romaji', items: kanaItems(true) },
    {
      id: 'kana',
      icon: 'あア',
      label: 'Trộn cả hai',
      hint: 'Hiragana + Katakana',
      items: [...kanaItems(false), ...kanaItems(true)],
    },
  ],
  zh: [
    {
      id: 'hanzi',
      icon: '字',
      label: '60 chữ Hán cơ bản',
      hint: 'Gõ pinyin, không cần dấu',
      items: HANZI.map(([glyph, pinyin, meaning]) => ({
        id: `hanzi-${glyph}`,
        glyph,
        speakText: glyph,
        keys: [pinyinKey(pinyin)],
        answer: pinyin,
        meaning,
      })),
    },
  ],
  en: [
    {
      id: 'picture',
      icon: '🖼️',
      label: '50 từ qua hình',
      hint: 'Thấy hình → gõ từ tiếng Anh',
      items: PICTURES.map(([glyph, word, meaning]) => ({
        id: `pic-${word}`,
        glyph,
        speakText: word,
        keys: [normalizeAnswer(word)],
        answer: word,
        meaning,
      })),
    },
  ],
}

/** Normalises typed input for a language's script items. */
export function scriptInputKey(lang: Lang, input: string) {
  if (lang === 'ja') return input.toLowerCase().replace(/[^a-z]/g, '')
  if (lang === 'zh') return pinyinKey(input)
  return normalizeAnswer(input)
}
