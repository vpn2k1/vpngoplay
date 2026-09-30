// Downloads open dictionaries and sentence corpora that can fill the Vietnamese meanings,
// example sentences, IPA and emoji of the course words without calling the Claude API.
//
//   npm run sources:download                 # everything still missing (≈ 300 MB on disk)
//   npm run sources:download -- --only tatoeba,wiktionary,grammar/ja
//
// Output: data/sources/open/<group>/… (git-ignored, like the rest of data/sources).
// Licences are listed next to each source; see README › Nguồn dữ liệu mở.
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'

const ROOT = join(import.meta.dirname, '..', '..')
const OUT = join(ROOT, 'data', 'sources', 'open')
const RAW = 'https://raw.githubusercontent.com'
const TATOEBA = 'https://downloads.tatoeba.org/exports/per_language'
const TUDIEN = `${RAW}/catusf/tudien/master/dict`
const CLDR = `${RAW}/unicode-org/cldr-json/main/cldr-json`

/**
 * group: folder under data/sources/open · unpack: 'bz2' (→ same file without .bz2) or 'tar.bz2' (→ its files)
 * Sizes are the compressed download.
 */
const SOURCES = [
  // Vietnamese Wiktionary as JSON lines (wiktextract, all languages): ~190k English senses, ~13k Japanese
  // and ~16k Chinese senses glossed in Vietnamese, with IPA, pinyin and some examples. CC BY-SA 4.0 + GFDL.
  {
    group: 'wiktionary',
    file: 'vi-extract.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/vi/vi-extract.jsonl.gz',
  }, // 34 MB

  // Tatoeba sentences and translation links. CC BY 2.0 FR (some sentences CC0).
  ...['vie', 'eng', 'jpn', 'cmn'].map((lang) => ({
    group: 'tatoeba',
    file: `${lang}_sentences.tsv.bz2`,
    url: `${TATOEBA}/${lang}/${lang}_sentences.tsv.bz2`,
    unpack: 'bz2',
  })), // 0.4 + 25 + 3.4 + 1.3 MB
  // Furigana for Japanese and pinyin for Chinese sentences (auto-generated, some reviewed by users).
  ...['jpn', 'cmn'].map((lang) => ({
    group: 'tatoeba',
    file: `${lang}_transcriptions.tsv.bz2`,
    url: `${TATOEBA}/${lang}/${lang}_transcriptions.tsv.bz2`,
    unpack: 'bz2',
  })), // 4.3 + 2.6 MB
  // Dictionary form (and reading) of the words each Japanese sentence uses (Tanaka corpus indices);
  // used to grade sentences by JLPT level.
  {
    group: 'tatoeba',
    file: 'jpn_indices.tar.bz2',
    url: 'https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2',
    unpack: 'tar.bz2',
  }, // 2.9 MB
  ...['eng-vie', 'jpn-vie', 'cmn-vie', 'jpn-eng', 'cmn-eng'].map((pair) => ({
    group: 'tatoeba',
    file: `${pair}_links.tsv.bz2`,
    url: `${TATOEBA}/${pair.split('-')[0]}/${pair}_links.tsv.bz2`,
    unpack: 'bz2',
  })),

  // Bilingual dictionaries collected by catusf/tudien (tab-separated: headword \t definition).
  // OVDP = Free Vietnamese Dictionary Project (Hồ Ngọc Đức), GPL; the repo itself is CC0.
  { group: 'dict', file: 'star_anhviet.tab', url: `${TUDIEN}/star_anhviet.tab` }, // EN→VI, OVDP, 386k entries, 41 MB
  { group: 'dict', file: 'star_nhatviet.tab', url: `${TUDIEN}/star_nhatviet.tab` }, // JA→VI, OVDP (kana headwords, partly English), 41 MB
  { group: 'dict', file: 'TrungViet-small.tab', url: `${TUDIEN}/TrungViet-small.tab` }, // ZH→VI with pinyin and Hán-Việt, 139k entries, 16 MB
  { group: 'dict', file: 'TudienThienChuu.tab', url: `${TUDIEN}/TudienThienChuu.tab` }, // Hán-Việt per character (Thiều Chửu), 2 MB
  // The same ZH→VI dictionary with numbered senses and Chinese example sentences translated into Vietnamese.
  { group: 'dict', file: 'TrungViet-big.tab.bz2', url: `${TUDIEN}/TrungViet-big.tab.bz2`, unpack: 'bz2' }, // 31 MB

  // CC-CEDICT (MDBG): Chinese → English, CC BY-SA 4.0.
  {
    group: 'dict',
    file: 'cedict.txt.gz',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
  }, // 4 MB

  // English IPA (open-dict-data/ipa-dict, MIT).
  { group: 'ipa', file: 'en_US.txt', url: `${RAW}/open-dict-data/ipa-dict/master/data/en_US.txt` }, // 3 MB
  { group: 'ipa', file: 'en_UK.txt', url: `${RAW}/open-dict-data/ipa-dict/master/data/en_UK.txt` }, // 1.7 MB

  // Emoji names and keywords in Vietnamese and English (Unicode CLDR, Unicode licence).
  ...['en', 'vi'].flatMap((lang) => [
    {
      group: 'emoji',
      file: `annotations-${lang}.json`,
      url: `${CLDR}/cldr-annotations-full/annotations/${lang}/annotations.json`,
    },
    {
      group: 'emoji',
      file: `annotations-derived-${lang}.json`,
      url: `${CLDR}/cldr-annotations-derived-full/annotationsDerived/${lang}/annotations.json`,
    },
  ]),

  // --- Grammar (Japanese / Chinese) ---
  // OpenJLPT: 526 JLPT grammar points N5–N1 (pattern, meaning, formation, examples with furigana), English. CC BY-SA 4.0.
  ...[5, 4, 3, 2, 1].map((n) => ({
    group: 'grammar/ja',
    file: `openjlpt-n${n}.json`,
    url: `${RAW}/evanclan/OpenJLPT/main/data/json/grammar/n${n}.json`,
  })), // 88–203 KB each
  // Akari (khoitran3012): 48 N5–N4 points explained in Vietnamese, as TypeScript source. MIT, written with an LLM.
  ...[5, 4].map((n) => ({
    group: 'grammar/ja',
    file: `akari-n${n}.ts`,
    url: `${RAW}/khoitran3012/learning-japanese-for-beginners-website/main/src/data/grammar-n${n}.ts`,
  })),
  // Official HSK 3.0 grammar syllabus (GF 0025-2021, appendix A) as text: 572 points with Chinese examples.
  // Government standard transcribed by krmanik/HSK-3.0; the repo states no licence.
  ...['1', '2', '3', '4', '5', '6', '7-9'].map((level) => ({
    group: 'grammar/zh',
    file: `gf0025-hsk${level}.txt`,
    url: `${RAW}/krmanik/HSK-3.0/main/New%20HSK%20(2021)/HSK%20Grammar/HSK%20${level}.txt`,
  })),
  // The same syllabus as one CSV (level, group, category, details, content). MIT (ivankra/hsk30).
  { group: 'grammar/zh', file: 'hsk30-grammar.csv', url: `${RAW}/ivankra/hsk30/master/hsk30-grammar.csv` }, // 39 KB
  // 413 HSK 1–6 grammar points with official ids + example sentences tagged by point, pinyin and English. MIT.
  {
    group: 'grammar/zh',
    file: 'no7z-grammar-points.json',
    url: `${RAW}/no7z/hsk-sentences-audio/main/data/grammar_points.json`,
  }, // 130 KB
  {
    group: 'grammar/zh',
    file: 'no7z-sentences.json',
    url: `${RAW}/no7z/hsk-sentences-audio/main/dist/sentences.json`,
  }, // 6.4 MB
]

const { values: args } = parseArgs({ options: { only: { type: 'string' } } })
const only = args.only?.split(',')

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`

/** Where the usable file ends up once unpacked (used to skip finished downloads). */
const target = (s) =>
  join(
    OUT,
    s.group,
    s.unpack === 'bz2'
      ? s.file.replace(/\.bz2$/, '')
      : s.unpack === 'tar.bz2'
        ? s.file.replace(/\.tar\.bz2$/, '.csv')
        : s.file,
  )

async function download(s) {
  const path = join(OUT, s.group, s.file)
  mkdirSync(dirname(path), { recursive: true })
  const res = await fetch(s.url, { headers: { 'user-agent': 'vpngoplay-data-pipeline (open data import)' } })
  if (!res.ok) throw new Error(`${s.url}: HTTP ${res.status}`)
  // Write to a .part file first so an interrupted download is retried rather than kept.
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${path}.part`))
  renameSync(`${path}.part`, path)
  const size = statSync(path).size
  if (s.unpack === 'bz2') execFileSync('bunzip2', ['-f', path])
  if (s.unpack === 'tar.bz2') {
    execFileSync('tar', ['-xjf', path, '-C', dirname(path)])
    rmSync(path)
  }
  return size
}

const todo = SOURCES.filter((s) => (!only || only.includes(s.group)) && !existsSync(target(s)))
console.log(`${SOURCES.length - todo.length} already downloaded, ${todo.length} to fetch → ${OUT}`)
let total = 0
const failed = []
for (const s of todo) {
  try {
    const size = await download(s)
    total += size
    console.log(`  ✓ ${s.group}/${s.file}  ${mb(size)}`)
  } catch (err) {
    failed.push(s.file)
    console.error(`  ✗ ${s.group}/${s.file}  ${err.message}`)
  }
}
console.log(`downloaded ${mb(total)}${failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : ''}`)
if (failed.length) process.exitCode = 1
