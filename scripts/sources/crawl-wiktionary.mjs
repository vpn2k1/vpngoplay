// Fetches the Vietnamese translations that English Wiktionary lists for words the offline
// dictionaries lack ("nightclub" → hộp đêm, "tablespoon" → muỗng canh), one page per word from
// kaikki.org (robots.txt allows /dictionary/English/meaning/). Polite: one request at a time with a
// pause, results cached, so re-running only fetches new words.
//
//   npm run vocab:draft            # writes the words it couldn't translate to wanted.txt
//   npm run sources:crawl          # fetches them
//   npm run vocab:draft            # uses the translations
//
// Input:  data/sources/open/wiktionary-en/wanted.txt (one English word or phrase per line)
// Output: data/sources/open/wiktionary-en/vi.json — { word: [{ pos, sense, vi: [...] }] | null (no page) }
// Licence: Wiktionary content, CC BY-SA 4.0 / GFDL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const DIR = join(import.meta.dirname, '..', '..', 'data', 'sources', 'open', 'wiktionary-en')
const WANTED = join(DIR, 'wanted.txt')
const CACHE = join(DIR, 'vi.json')
const PAUSE_MS = 300

const { values: args } = parseArgs({ options: { limit: { type: 'string' } } })
if (!existsSync(WANTED)) throw new Error('Nothing to fetch yet: run `npm run vocab:draft` first.')
mkdirSync(DIR, { recursive: true })

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const wanted = readFileSync(WANTED, 'utf8')
  .split('\n')
  .map((w) => w.trim())
  .filter((w) => w && !(w in cache))
const todo = args.limit ? wanted.slice(0, Number(args.limit)) : wanted
console.log(
  `${Object.keys(cache).length} cached, ${todo.length} to fetch (~${Math.ceil((todo.length * PAUSE_MS) / 60000)} min)`,
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = (word) =>
  `https://kaikki.org/dictionary/English/meaning/${[word[0], word.slice(0, 2), word]
    .map(encodeURIComponent)
    .join('/')}.jsonl`

/** The page's entries with their Vietnamese translations, or null when the word has no page. */
async function fetchWord(word) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url(word), { headers: { 'user-agent': 'vpngoplay-data-pipeline (open data import)' } })
    if (res.status === 404) return null
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * 2 ** attempt)
      continue
    }
    if (!res.ok) throw new Error(`${word}: HTTP ${res.status}`)
    const entries = (await res.text())
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    return entries
      .map((e) => {
        const bySense = new Map()
        for (const t of e.translations ?? [])
          if (t.lang_code === 'vi' && t.word)
            bySense.set(t.sense ?? '', [...(bySense.get(t.sense ?? '') ?? []), t.word])
        return [...bySense].map(([sense, vi]) => ({ pos: e.pos, sense, vi }))
      })
      .flat()
  }
  throw new Error(`${word}: still failing after retries`)
}

let done = 0
for (const word of todo) {
  let result = await fetchWord(word)
  // Pages are case-sensitive: "Olympics" vs "olympics".
  if (result === null && word !== word.toLowerCase()) result = await fetchWord(word.toLowerCase())
  cache[word] = result
  if (++done % 25 === 0 || done === todo.length) {
    writeFileSync(CACHE, JSON.stringify(cache))
    const found = Object.values(cache).filter((v) => v?.length).length
    console.log(`  ${done}/${todo.length} · ${found} words with Vietnamese translations so far`)
  }
  await sleep(PAUSE_MS)
}
writeFileSync(CACHE, JSON.stringify(cache))
