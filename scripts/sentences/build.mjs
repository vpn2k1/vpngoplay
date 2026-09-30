// Builds the "Học theo câu" sentence packs from Tatoeba: English, Japanese and Chinese sentences
// that have a Vietnamese translation, graded by the hardest course word they use (CEFR / JLPT / HSK)
// and split into packs of 10.
//
//   npm run sentences:build
//
// Input:  data/sources/open/tatoeba (npm run sources:download) + data/courses (npm run vocab:prepare)
// Output: public/sentences/index.json + public/sentences/<lang>-<level>-<nn>.json
//
// Tatoeba sentences are CC BY 2.0 FR: each sentence keeps its Tatoeba id and the app links to it.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEVELS, tatoebaSentences } from './tatoeba.mjs'

const OUT = join(import.meta.dirname, '..', '..', 'public', 'sentences')
const PACK_SIZE = 10
const MAX_PACKS_PER_LEVEL = 30

// --- Packs -----------------------------------------------------------------------------------
/** Preferred sentence length per language (words for English, characters otherwise). */
const IDEAL = { en: 7, ja: 14, zh: 9 }

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const index = []
const slug = (level) => level.toLowerCase().replace(/[^a-z0-9]/g, '')
for (const lang of ['en', 'ja', 'zh']) {
  const all = tatoebaSentences(lang)
  LEVELS[lang].forEach(([level], rank) => {
    const chosen = all
      .filter((s) => s.level === rank)
      .sort((a, b) => Math.abs(a.size - IDEAL[lang]) - Math.abs(b.size - IDEAL[lang]) || a.id - b.id)
      .slice(0, PACK_SIZE * MAX_PACKS_PER_LEVEL)
      .sort((a, b) => a.size - b.size || a.id - b.id)
    const packs = Math.floor(chosen.length / PACK_SIZE)
    for (let p = 0; p < packs; p++) {
      const id = `${lang}-${slug(level)}-${String(p + 1).padStart(2, '0')}`
      const items = chosen
        .slice(p * PACK_SIZE, (p + 1) * PACK_SIZE)
        .map(({ id: sid, text, tokens, reading, ruby, meaning }) => ({ id: sid, text, tokens, reading, ruby, meaning }))
      writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ id, lang, level, index: p + 1, sentences: items }))
      index.push({ id, lang, level, index: p + 1, count: items.length, preview: items[0].text })
    }
    console.log(`${lang} ${level.padEnd(7)} ${String(chosen.length).padStart(4)} câu → ${packs} gói`)
  })
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n')
console.log(`→ ${index.length} gói trong ${OUT}`)
