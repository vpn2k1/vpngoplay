# 🎮 VpngoPlay

Web học ngoại ngữ (Anh · Nhật · Trung) bằng trò chơi, dành cho 3 nhóm: **Trẻ em**, **Người đi làm** và **Luyện thi** (IELTS / JLPT / HSK).

**Stack:** React 19 · Vite · TanStack Router (file-based) · TanStack Query · react-hook-form + zod · Zustand (persist) · Tailwind CSS v4 · Motion (animation) · canvas-confetti · deploy lên Vercel.

**Icon:**
- [Lucide](https://lucide.dev) (`lucide-react`) cho nút điều khiển.
- [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) và [Circle Flags](https://github.com/HatScripts/circle-flags) cho hình minh hoạ, linh vật và cờ. Hai bộ này nạp qua `unplugin-icons` (`import X from '~icons/fluent-emoji-flat/rocket'`): chỉ icon nào được dùng mới vào bản build, và máy nào cũng hiển thị giống nhau, kể cả cờ trên Windows. Tất cả gom ở `src/components/icons.tsx`.

## Trò chơi

| Game | Mô tả |
|---|---|
| 🃏 Flashcard | Lặp lại ngắt quãng (SM-2), phím tắt Space / 1–4 |
| 🧩 Ghép cặp | Nối từ ↔ nghĩa, tính giờ, trừ XP khi sai |
| 🧱 Xếp câu | Chạm để sắp xếp từ thành câu đúng |
| 🎧 Nghe chép | Nghe TTS (thường / chậm) rồi gõ lại; chấp nhận kana cho tiếng Nhật và pinyin không dấu cho tiếng Trung |

### 🕹️ Trò chơi — tab riêng (`/games`)

Học tập và trò chơi là **hai tab tách biệt** trên thanh điều hướng:
- **📚 Học tập** (`/`): các bộ từ và 4 bài ôn luyện.
- **🕹️ Trò chơi** (`/games`): 6 game dùng chung cho mọi ngôn ngữ.

Trong mỗi game (`/games/<game>?lang=ja&deck=all`), bạn chọn ngôn ngữ, bộ từ (một bộ hoặc ⭐ **Tất cả từ** của ngôn ngữ đó) và chế độ chơi. Khi chơi "Tất cả từ", từ bị lọt vẫn được xếp lịch ôn trong bộ gốc của nó (`Word.srsKey`).

| Game | Chế độ | Cách chơi |
|---|---|---|
| 🚀 Bắn chữ | Gõ nghĩa · Gõ ngoại ngữ | Thiên thạch mang chữ rơi xuống, gõ đáp án để bắn hạ; combo nhân điểm, lên level nhanh dần |
| 🦖 Khủng long | Chọn ↑/↓ · Gõ nghĩa · Gõ ngoại ngữ | Trả lời đúng thì khủng long tự nhảy qua xương rồng hoặc cúi né chim. Ở chế độ chọn, chướng ngại vật là hộp ❓ nên không đoán được đáp án qua hình dạng |
| 🏎️ Đua xe | Chọn làn · Gõ nghĩa · Gõ ngoại ngữ | Lái qua cổng có nghĩa đúng để nhận Nitro, hoặc gõ từ trên rào để phá rào (xe tự lái vào làn vừa mở) |
| 🔨 Đập chuột | Chọn nghĩa · Chọn từ | 60 giây đập đúng chú chuột, phím 1–9 hoặc chạm |
| 🐤 Chim bay | Chọn nghĩa · Chọn từ | Vỗ cánh bay qua khe mang đáp án đúng |
| 🎈 Mưa chữ | Hiragana/Katakana · 60 chữ Hán · 50 từ qua hình | Học bảng chữ: gõ romaji, pinyin hoặc từ tiếng Anh để bắn nổ bóng bay |

- **Hai hướng gõ, giống nhau cho mọi ngôn ngữ:**
  - **Gõ nghĩa tiếng Việt:** hiện từ ngoại ngữ kèm kana / pinyin / IPA nhỏ bên dưới.
  - **Gõ tiếng Anh / Nhật / Trung:** hiện nghĩa tiếng Việt, gõ theo cách nào cũng được: từ tiếng Anh; romaji, kana hoặc kanji; pinyin (có hoặc không dấu) hoặc chữ Hán.
- **Dòng gợi ý dưới mục tiêu:** chữ đầu và các ô trống (`d _ _` · `が＿＿＿` · `p _ _ _ _ _ _`), gõ tới đâu điền tới đó. Với tiếng Nhật/Trung, khi đang gõ sẽ hiện thêm kanji/chữ Hán.
- **Engine chung** (`src/arcade/`):
  - Vòng lặp và canvas (`engine.ts`).
  - Sinh đề bài, khớp tiền tố, tạo lựa chọn, chọn từ ưu tiên theo lịch ôn (`challenge.ts`).
  - Hook gõ phím (`useTyping.ts`).
  - Khung arcade: menu chọn chế độ, tạm dừng bằng Esc, kỷ lục, màn kết quả (`ArcadeShell.tsx`).
- **Từ bị lọt** trong game được thêm vào lịch ôn Flashcard.
- **Tốc độ** 🐢 Chậm · 🐰 Vừa (mặc định) · ⚡ Nhanh, chọn trong menu mỗi game và được lưu lại. Tương ứng 50% · 70% · 100% tốc độ gốc: chữ rơi, đường chạy, rắn và thời gian chờ đều chậm theo. Không áp dụng cho Lật hình và Đúng hay sai.
- **Thêm game mới:** viết một component nhận `ArcadeGameProps` rồi đăng ký trong `src/arcade/games.tsx`.

Có XP, chuỗi ngày học (streak), mục tiêu mỗi ngày. Tiến độ hiện lưu trong `localStorage`.

## Ôn tập (tab riêng, `/review`)

- **Sổ từ:** bấm 🔖 cạnh một từ để lưu. Nút này có ở danh sách từ của bộ bài, mặt sau Flashcard và màn kết quả game (có thêm nút **Lưu tất cả** cho các từ bị lọt).
- **Nguồn từ để ôn:**
  - **Sổ từ của tôi**: các từ đã lưu.
  - **Tất cả từ đã học**: mọi từ đã có lịch ôn Flashcard, lấy lại từ bộ bài gốc.
  - Cả hai đều cần ít nhất 6 từ.
- **Ôn bằng trò chơi:** bấm **Ôn ngay bằng trò ngẫu nhiên** để mở một game từ vựng ngẫu nhiên (`/games/<game>?deck=saved|learned`). Trong game có nút đổi sang trò ngẫu nhiên khác.
- **Xếp lịch ôn:** từ bị lọt vẫn được xếp lịch ôn trên thẻ gốc của nó.
- **Lưu trữ:** sổ từ nằm trong `localStorage`, cùng với tiến độ học. Mỗi từ được lưu kèm bản sao nội dung nên không cần tải lại bộ bài.

## Lộ trình ~3.000 từ mỗi cấp

Mỗi ngôn ngữ có 3 lộ trình **Cơ bản · Trung cấp · Nâng cao**, mỗi lộ trình khoảng 3.000 từ. Từ được chia thành các bài 20 từ, mỗi bài là một bộ bài bình thường nên dùng được cả 7 dạng ôn luyện. Trong tab Trò chơi có thể chọn cả lộ trình làm bộ từ, và từ bị lọt vẫn được xếp lịch ôn trong đúng bài của nó. Các bộ Trẻ em / Đi làm / Luyện thi được giữ lại dưới mục **Chủ đề**.

| | Cơ bản | Trung cấp | Nâng cao |
|---|---|---|---|
| 🇬🇧 Anh (CEFR) | A1–B1 · 2.882 từ | B1–B2 · 2.882 từ | B2–C2 · 2.880 từ |
| 🇯🇵 Nhật (JLPT) | N5–N3 · 2.530 từ | N3–N1 · 2.530 từ | N1 · 2.530 từ |
| 🇨🇳 Trung (HSK 3.0) | HSK1–4 · 3.000 từ | HSK4–7-9 · 3.000 từ | HSK7-9 · 3.000 từ |

Tiếng Nhật chỉ khoảng 2.500 từ mỗi cấp vì danh sách JLPT mở có khoảng 7.600 từ dùng được.

### Pipeline dữ liệu (`scripts/vocab/`)

```bash
npm run vocab:prepare   # 1. tải danh sách chuẩn → data/courses/<lang>-<level>.json (không tốn phí)
npm run vocab:enrich    # 2. gọi Claude API: nghĩa tiếng Việt, ví dụ, emoji, IPA/pinyin, 5 câu mỗi bài → data/enriched/
npm run vocab:build     # 3. kiểm tra lại, sinh public/decks/<course>-<nnn>.json + public/courses/*.json
```

Bước 2 cần API key Anthropic: đặt `ANTHROPIC_API_KEY`, hoặc đăng nhập bằng `ant auth login`. Nên chạy thử trước:

```bash
npm run vocab:enrich -- --dry-run
```

```bash
npm run vocab:enrich -- --course en-basic --limit 2
```

- **Kiểm tra chất lượng:** mỗi bài được kiểm tra tự động (`validate.mjs`):
  - câu ví dụ phải chứa đúng từ;
  - không có hai từ trùng nghĩa;
  - pinyin phải là một cách đọc hợp lệ của từ;
  - reading của câu tiếng Nhật chỉ gồm kana;
  - …

  Bài nào sai sẽ được gửi lại cho Claude kèm danh sách lỗi (tối đa 3 lần).
- **Chạy tiếp và làm lại:** script chạy tiếp được sau khi bị ngắt, vì bài đã có file sẽ được bỏ qua. Làm lại một số bài bằng `--redo 7,12`.
- **Model:** mặc định `claude-opus-5` với effort `medium`; đổi bằng `--model` / `--effort`. Script bật **server-side fallback** (`fallbacks: 'default'`): nếu model chính quá tải, API tự chuyển sang model dự phòng.
- **Chi phí:** toàn bộ 1.265 bài (khoảng 25.000 từ) ước tính **khoảng $110** với Opus 5. Đây là ước tính thô vì số token suy nghĩ thay đổi; script in ra chi phí thực tế sau khi chạy.

### Nguồn dữ liệu và giấy phép

- **Tiếng Anh:**
  - [CEFR-J Wordlist 1.5](https://github.com/openlanguageprofiles/olp-en-cefrj), phải ghi nguồn: *Tono Lab, Tokyo University of Foreign Studies (2020)*.
  - [Octanove Vocabulary Profile C1/C2](https://github.com/openlanguageprofiles/olp-en-cefrj), giấy phép **CC BY-SA 4.0**: phần dữ liệu tiếng Anh dẫn xuất từ nguồn này phải giữ cùng giấy phép.
- **Tiếng Nhật:** [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks), MIT, dựa trên danh sách của Jonathan Waller (tanos.co.uk).
- **Tiếng Trung:** [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), MIT, theo chuẩn HSK 3.0.

Nghĩa tiếng Việt, câu ví dụ và câu luyện tập được Claude sinh ra, sau đó kiểm tra tự động; vẫn nên rà soát lại trước khi phát hành.

## Chấm đáp án (mọi ngôn ngữ như nhau)

Mọi game đều chấm qua `src/lib/answer.ts`:

| Ngôn ngữ | Các cách gõ được chấp nhận |
|---|---|
| 🇬🇧 Anh | Không phân biệt hoa/thường, dấu câu, khoảng trắng |
| 🇯🇵 Nhật | Kanji, hiragana, katakana hoặc **romaji** (`watashi wa gakusei desu`, `watasi ha…`, `gakko`/`gakkou`/`gakkō`). Không cần cài bộ gõ tiếng Nhật |
| 🇨🇳 Trung | Chữ Hán hoặc pinyin có dấu, không dấu, hoặc số thanh điệu (`ni3 hao3`); gõ `v` thay cho `ü` |
| 🇻🇳 Nghĩa tiếng Việt | Có dấu hoặc không (`doi tac`), bất kỳ nghĩa nào trong danh sách cách nhau bằng dấu phẩy, có thể bỏ từ loại (`meo` = "con mèo"); thêm cách viết khác qua trường `answers` |

```bash
npm test
```

Lệnh này chạy test trên **toàn bộ bộ bài**:
- Mọi câu đều được chấp nhận ở mọi cách viết.
- Không câu nào bị chấm nhầm thành đáp án của câu khác.
- Không có hai từ trùng nghĩa tiếng Việt trong cùng một bộ.

`npm run catalog` (chạy trước `dev`/`build`) sẽ **làm hỏng build** nếu:
- Một ngôn ngữ thiếu nhóm trẻ em, đi làm hoặc luyện thi.
- Một bộ bài không đủ dữ liệu cho cả 4 game: dưới 6 từ, dưới 3 câu, câu tiếng Nhật thiếu `reading` kana, hoặc câu tiếng Trung thiếu `reading` pinyin.

## Giọng đọc

App dùng 2 nguồn giọng, theo thứ tự ưu tiên:

1. **File âm thanh neural tạo sẵn** (`public/audio/`, Google Cloud Text-to-Speech). Đọc rõ và giống nhau trên mọi thiết bị.
2. **Giọng của trình duyệt** (Web Speech API). App tự chấm điểm và chọn giọng tốt nhất, bỏ qua các giọng robot như "Albert" hay "Eddy" trên macOS. Người dùng có thể đổi giọng và tốc độ trong **Cài đặt**.

Tạo file âm thanh (toàn bộ nội dung hiện có khoảng 2.800 ký tự, nằm trong gói miễn phí 1 triệu ký tự/tháng của Google):

1. Vào Google Cloud Console, bật **Cloud Text-to-Speech API** và tạo một API key (nên giới hạn key chỉ dùng cho API này).
2. Chạy lệnh:

```bash
GOOGLE_TTS_API_KEY=xxx npm run audio
```

`npm run audio -- --dry-run` sẽ liệt kê các câu cần tạo. Script chỉ tạo file cho câu mới hoặc đã sửa. Hãy commit thư mục `public/audio/` để Vercel phục vụ qua CDN; API key không bao giờ lên trình duyệt. Muốn đổi giọng thì đặt các biến `TTS_VOICE_EN`, `TTS_VOICE_JA`, `TTS_VOICE_ZH` (ví dụ `en-GB-Neural2-B` nếu cần giọng Anh-Anh cho IELTS).

## Chạy local

```bash
npm install
npm run dev
```

## Deploy lên Vercel

Cách 1: đẩy repo lên GitHub → vercel.com → **Add New Project** → chọn repo. Vercel tự nhận Vite nhờ `vercel.json`.

Cách 2: dùng CLI:

```bash
npx vercel        # bản preview
npx vercel --prod # bản production
```

`vercel.json` đã có rewrite để các route của SPA (vd. `/decks/ja-exam-n5/match`) không bị 404 khi tải lại trang.

## Thêm bộ từ mới

1. Tạo file `public/decks/<lang>-<track>-<tên>.json` theo cấu trúc của file có sẵn (`words` + `sentences`).
2. `npm run catalog` (tự chạy trước `dev`/`build`) sẽ sinh lại `public/decks/index.json`.

Với tiếng Nhật và tiếng Trung, `tokens` của câu là các cụm từ (không có dấu cách). Trường `reading` (kana hoặc pinyin) là đáp án được chấp nhận thêm trong game Nghe chép.

## Cấu trúc

```
src/
  routes/                 # TanStack Router file-based
    __root.tsx            # layout + header (XP, streak)
    index.tsx             # onboarding / danh sách bộ từ (?lang=)
    settings.tsx
    courses/$courseId.tsx # trang lộ trình (các chặng, tiến độ từng bài)
    decks/$deckId/        # route.tsx (loader) + index + 7 bài ôn luyện
    games/                # tab Trò chơi: index (danh sách game) + $gameId (chọn ngôn ngữ, bộ từ, chế độ)
  games/                  # Flashcard, Match, SentenceBuilder, Dictation
  arcade/                 # engine + 6 game arcade (games/*.tsx) + dữ liệu bảng chữ (scripts.ts)
  components/             # ui.tsx, ProfileForm.tsx (react-hook-form + zod)
  lib/                    # api (queryOptions), store (zustand), srs, speech, types
public/decks/*.json       # nội dung bài học (bộ chủ đề + từng bài của lộ trình)
public/courses/*.json     # lộ trình: danh sách bài + toàn bộ từ (dùng cho game)
scripts/vocab/            # pipeline sinh lộ trình 3.000 từ
data/courses/             # danh sách từ đã chia cấp (đầu vào của enrich)
data/enriched/            # kết quả Claude sinh, từng bài
```

## Lộ trình tiếp theo

- **Đăng nhập + đồng bộ tiến độ:** Supabase Auth + Postgres (hoặc Clerk + Neon), thay `localStorage` trong `lib/store.ts`.
- **API serverless:** thư mục `api/` (Vercel Functions) để lấy bộ từ từ DB; chỉ cần đổi URL trong `lib/api.ts`.
- **AI:** nhập vai hội thoại, sinh bộ từ theo chủ đề, chấm bài viết IELTS (gọi Claude API từ Vercel Function, có giới hạn lượt/ngày).
- Luyện phát âm bằng SpeechRecognition, bảng xếp hạng tuần, PWA để cài lên điện thoại và học offline.
