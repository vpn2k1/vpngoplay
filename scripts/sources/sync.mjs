// One command to bring all open data up to date on this machine and rebuild what depends on it:
//
//   npm run crawl                    # download missing sources, look up, draft, crawl, rebuild
//   npm run crawl -- --refresh       # also re-download every source (weekly Wiktionary/Tatoeba exports)
//   npm run crawl -- --no-crawl      # skip the (slow, online) English Wiktionary crawl
//   npm run crawl -- --no-build      # only refresh data/, don't touch public/
//
// Steps: sources:download → sources:lookup → vocab:draft → sources:crawl (new words only) →
// vocab:draft again when the crawl found something → sentences:build → vocab:build (+ catalog).
// Everything downloaded stays in data/sources/ (git-ignored); lessons written by vocab:enrich
// (Claude) are never overwritten.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = join(import.meta.dirname, '..', '..')
const { values: args } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    'no-crawl': { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
  },
})

const CRAWLED = join(ROOT, 'data', 'sources', 'open', 'wiktionary-en', 'vi.json')
const crawledCount = () => (existsSync(CRAWLED) ? Object.keys(JSON.parse(readFileSync(CRAWLED, 'utf8'))).length : 0)

const started = Date.now()
function run(title, script, extra = []) {
  const t = Date.now()
  console.log(`\n▶ ${title}`)
  // The draft step holds every dictionary in memory at once.
  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', join(ROOT, script), ...extra], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(
      `\n✗ ${title} failed (exit ${result.status}) — fix it and run the command again; finished steps are cached.`,
    )
    process.exit(result.status ?? 1)
  }
  console.log(`✓ ${title} · ${((Date.now() - t) / 1000).toFixed(0)}s`)
}

run('Tải nguồn dữ liệu mở', 'scripts/sources/download.mjs', args.refresh ? ['--refresh'] : [])
run('Tra từ của lộ trình trong các nguồn', 'scripts/sources/lookup.mjs')
run('Soạn nháp các bài 3.000 từ', 'scripts/vocab/draft.mjs')
if (!args['no-crawl']) {
  const before = crawledCount()
  run('Cào bản dịch còn thiếu từ English Wiktionary', 'scripts/sources/crawl-wiktionary.mjs')
  if (crawledCount() > before) run('Soạn lại với bản dịch vừa cào', 'scripts/vocab/draft.mjs')
}
if (!args['no-build']) {
  run('Tạo gói câu Học theo câu', 'scripts/sentences/build.mjs')
  run('Build bài học và catalog', 'scripts/vocab/build.mjs')
  run('Kiểm tra bộ từ (catalog)', 'scripts/build-catalog.mjs')
  run('Kiểm tra hội thoại', 'scripts/build-talk.mjs')
}
console.log(`\nXong sau ${((Date.now() - started) / 60000).toFixed(1)} phút.`)
