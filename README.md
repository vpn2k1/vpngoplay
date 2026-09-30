# 🎮 VpngoPlay

Web học ngoại ngữ (Anh · Nhật · Trung) bằng trò chơi, dành cho 3 nhóm: **Trẻ em**, **Người đi làm** và **Luyện thi** (IELTS / JLPT / HSK).

## Nội dung theo nhóm người học

Câu hỏi **"Bạn thuộc nhóm nào?"** (lúc bắt đầu và trong Cài đặt) quyết định bài học được đưa ra. Kế hoạch của từng nhóm nằm ở `src/lib/track.ts` (`TRACK_PLAN`):

| | 🧒 Trẻ em | 💼 Người đi làm | 🎓 Luyện thi |
|---|---|---|---|
| Thứ tự trang chủ | Chủ đề → Giao tiếp, Học theo câu → lộ trình | Giao tiếp, Học theo câu, Thành ngữ → chủ đề → lộ trình → ngữ pháp | Lộ trình → ngữ pháp → chủ đề → luyện câu |
| Chủ đề | bộ Trẻ em | bộ Người đi làm | bộ Luyện thi (IELTS / JLPT / HSK) |
| Lộ trình 3.000 từ | chỉ Cơ bản | cả 3 cấp | cả 3 cấp |
| Học theo câu | A1–A2 · N5–N4 · HSK1–2 | mọi cấp | mọi cấp |
| Giao tiếp | tình huống hằng ngày (làm quen, gọi món, mua sắm, hỏi đường) | mọi tình huống | mọi tình huống |
| Thành ngữ, Ngữ pháp | không | có | có |

- Nội dung không thuộc nhóm vẫn mở được: trang chủ gom ở mục **Nội dung của nhóm khác**, trang Giao tiếp ở **Tình huống khác**, trang Học theo câu ở **Cấp độ cao hơn**.
- Trong trò chơi, bộ từ mặc định và **Tất cả chủ đề của bạn** chỉ lấy bộ từ của nhóm; các bộ khác nằm ở **Bộ từ của nhóm khác**. Nhóm Trẻ em chơi mặc định ở chế độ chọn đáp án, có hình minh hoạ.
- Mỗi hội thoại khai báo các nhóm phù hợp trong trường `tracks` (`public/talk/*.json`).

**Stack:** React 19 · Vite · TanStack Router (file-based) · TanStack Query · react-hook-form + zod · Zustand (persist) · Tailwind CSS v4 · Motion (animation) · canvas-confetti · deploy lên Vercel.

**Icon:**
- [Lucide](https://lucide.dev) (`lucide-react`) cho nút điều khiển.
- [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (bản color: hoạt hình bo tròn, đổ bóng mềm) và [Circle Flags](https://github.com/HatScripts/circle-flags) cho hình minh hoạ, linh vật và cờ. Hai bộ này nạp qua `unplugin-icons` (`import X from '~icons/fluent-emoji/rocket'`): chỉ icon nào được dùng mới vào bản build, và máy nào cũng hiển thị giống nhau, kể cả cờ trên Windows. Tất cả gom ở `src/components/icons.tsx`.

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
- **🕹️ Trò chơi** (`/games`): 22 game dùng chung cho mọi ngôn ngữ, chia 4 nhóm: Phản xạ nhanh · Chữ & trí nhớ · Đố vui · Đấu với robot (`GAME_GROUPS` trong `src/arcade/games.tsx`).

Trong mỗi game (`/games/<game>?lang=ja&deck=all`), bạn chọn ngôn ngữ, bộ từ (một bộ, một lộ trình hoặc ⭐ **Tất cả chủ đề của bạn**) và chế độ chơi. Khi chơi "Tất cả chủ đề", từ bị lọt vẫn được xếp lịch ôn trong bộ gốc của nó (`Word.srsKey`).

| Game | Chế độ | Cách chơi |
|---|---|---|
| 🚀 Bắn chữ | Gõ nghĩa · Gõ ngoại ngữ | Thiên thạch mang chữ rơi xuống, gõ đáp án để bắn hạ; combo nhân điểm, lên level nhanh dần |
| 🦖 Khủng long | Chọn ↑/↓ · Gõ nghĩa · Gõ ngoại ngữ | Trả lời đúng thì khủng long tự nhảy qua xương rồng hoặc cúi né chim. Ở chế độ chọn, chướng ngại vật là hộp ❓ nên không đoán được đáp án qua hình dạng. Đồ hoạ pixel đơn sắc như trò khủng long offline của Chrome: điểm và kỷ lục "HI", cứ 700 điểm lại chuyển ngày/đêm |
| 🏎️ Đua xe | Chọn làn · Gõ nghĩa · Gõ ngoại ngữ | Lái qua cổng có nghĩa đúng để nhận Nitro, hoặc gõ từ trên rào để phá rào (xe tự lái vào làn vừa mở) |
| 🔨 Đập chuột | Chọn nghĩa · Chọn từ | 60 giây đập đúng chú chuột, phím 1–9 hoặc chạm |
| 🐤 Chim bay | Chọn nghĩa · Chọn từ | Vỗ cánh bay qua khe mang đáp án đúng |
| 🎈 Mưa chữ | Hiragana/Katakana · 60 chữ Hán · 50 từ qua hình | Học bảng chữ: gõ romaji, pinyin hoặc từ tiếng Anh để bắn nổ bóng bay |
| 🧠 Lật hình | 6 cặp · 8 cặp | Lật 2 thẻ một lượt để ghép từ với nghĩa, càng ít lượt càng nhiều điểm |
| 🐍 Rắn săn mồi | Chọn nghĩa · Chọn từ | Điều khiển rắn ăn quả táo mang đáp án đúng; ăn nhầm hay đâm tường mất mạng |
| ✅ Đúng hay sai | Từ = nghĩa? · Nghe = nghĩa? | 60 giây vuốt thẻ: nghĩa đi kèm từ đúng hay sai |
| 💪 Kéo co | Chọn nghĩa · Chọn từ · Gõ nghĩa · Gõ ngoại ngữ | Đấu với đội robot: mỗi câu đúng kéo dây về phía bạn, sai hay bỏ qua thì robot giật lại. Đưa cờ qua vạch bên mình là thắng vòng; robot mạnh dần qua từng vòng |
| 🎟️ Lô tô | Nhìn và nghe · Chỉ nghe · Chọn từ | Người xướng đọc từng từ, tìm ô đúng trên vé trước khi hết lượt. Đủ hàng ngang, dọc hoặc chéo là "Kinh!" (+50). Vé 4×4 khi bộ từ đủ 16 nghĩa khác nhau, không thì 3×3 |
| 🔤 Xếp chữ | Nhìn nghĩa · Nghe rồi xếp | 90 giây xếp lại các chữ bị xáo (lẫn vài chữ thừa) thành từ: chữ cái cho tiếng Anh, kana cho tiếng Nhật (kể cả từ viết bằng kanji), chữ Hán cho tiếng Trung. Nhầm 3 lần thì lộ đáp án; có Gợi ý và Bỏ qua |
| 🎣 Câu cá | Chọn nghĩa · Chọn từ | 60 giây thả câu: chạm chú cá mang đáp án đúng (hoặc bấm số 1–4 trên nhãn) để kéo lên thuyền; câu nhanh và combo được thêm điểm. Câu nhầm bị trừ 3 giây, cá đúng nhấp nháy để bạn câu lại. Cá bơi ra khỏi màn hình sẽ quay lại từ phía bên kia |
| 🧺 Hứng quả | Chọn nghĩa · Chọn từ | Di chuyển giỏ (← → / A D hoặc kéo ngón tay) hứng quả mang đáp án đúng trong 2–3 quả rơi so le (trẻ em: 2 quả, rơi chậm hơn). Hứng nhầm hoặc để quả đúng rơi xuống đất mất một mạng; quả rơi nhanh dần |
| ⛏️ Đào vàng | Chọn nghĩa · Chọn từ | 60 giây: móc câu đung đưa, chạm màn hình / Space / ↓ để thả móc gắp cục vàng mang đáp án đúng. Gắp nhanh và giữ combo được nhiều tiền, cục to đáng giá hơn nhưng kéo lên chậm; gắp nhầm thì kéo chậm và cục đúng sáng lên, gắp phải đá chỉ mất thời gian |
| ⛄ Người tuyết | Nhìn nghĩa · Nghe rồi đoán | Đoán từ bị giấu từng chữ: chữ cái cho tiếng Anh, kana cho tiếng Nhật, pinyin không dấu cho tiếng Trung (giải xong hiện chữ Hán). Mỗi lần đoán sai người tuyết tan thêm một chút (rơi mũ, khăn, tay, mũi…) dưới mặt trời to dần; sai 6 lần là mất từ. 8 từ một ván (trẻ em 5), có Gợi ý mở một chữ (tối đa 2 lần mỗi từ) |
| 🔍 Tìm từ | Dễ · Khó | Tìm các từ giấu trong bảng chữ theo nghĩa tiếng Việt: kéo qua các chữ hoặc chạm chữ đầu rồi chữ cuối. Dễ: 5 từ nằm ngang/dọc; Khó: 7 từ theo cả 8 hướng, kể cả viết ngược (trẻ em luôn 5 từ). Chữ cái cho tiếng Anh, kana cho tiếng Nhật, chữ Hán cho tiếng Trung. Tìm hết càng nhanh càng nhiều điểm; Bỏ cuộc thì lộ các từ còn lại |
| 💰 Ai là triệu phú | Chọn nghĩa · Chọn từ · Nghe và chọn | 15 câu 4 đáp án A–D, tiền thưởng leo từ 200.000đ tới 150.000.000đ, mỗi câu 30 giây (trẻ em 45 giây). Sai hoặc hết giờ thì ra về với mốc an toàn (câu 5: 2.000.000đ, câu 10: 22.000.000đ), hoặc "Dừng cuộc chơi" để giữ tiền đang có. Ba quyền trợ giúp một lần: 50:50, Hỏi ý kiến khán giả, Đổi câu hỏi |
| 🔔 Rung chuông vàng | Gõ nghĩa tiếng Việt · Gõ ngoại ngữ | Viết đáp án lên bảng rồi "Giơ bảng" (Enter) trong 20 giây (trẻ em 30 giây). Sai hay hết giờ là bị loại, trừ một lần Cứu trợ. Vượt qua cả 20 câu để rung chuông vàng |
| 🥅 Sút luân lưu | Chọn nghĩa · Chọn từ · Nghe và chọn | Đá luân lưu với đội robot, mỗi đội 5 quả: lượt bạn sút vào ô (1–4) có đáp án đúng, lượt robot bay người đỡ ở ô khớp với từ trên quả bóng. Hòa thì đá cân não; mỗi quả có đồng hồ đếm ngược |
| ⭕ Cờ caro | Chọn nghĩa · Chọn từ | Cờ caro 3×3 đấu với robot, mỗi ô là một từ: chạm ô rồi trả lời đúng để đánh ✕, sai thì mất lượt. Robot (◯) biết thắng và biết chặn nhưng thỉnh thoảng đi hớ (trẻ em: hớ nhiều hơn). Thắng 2 ván trước là thắng trận (hòa thì chơi lại, tối đa 5 ván); mỗi ván một bộ từ mới |
| 🎲 Cờ rắn | Chọn nghĩa · Chọn từ | Đua với robot trên bàn cờ 30 ô: trả lời đúng mới được tung xúc xắc, sai thì mất lượt tung. Chân thang leo lên, đầu rắn trượt xuống; về ô 30 trước là thắng. Robot trả lời đúng 70% (trẻ em 55%); tối đa 40 lượt mỗi bên |

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
- **Tốc độ** 🐢 Chậm · 🐰 Vừa (mặc định) · ⚡ Nhanh, chọn trong menu mỗi game và được lưu lại. Tương ứng 50% · 70% · 100% tốc độ gốc: chữ rơi, đường chạy, rắn và thời gian chờ đều chậm theo. Không áp dụng cho các game không có gì tự chạy: Lật hình, Đúng hay sai, Xếp chữ, Người tuyết, Tìm từ, Ai là triệu phú, Rung chuông vàng, Cờ caro, Cờ rắn.
- **Mỗi ván một bộ từ khác:** mỗi bộ từ nhớ (trong `localStorage`) từ nào đã ra ở ván thứ mấy. Ván mới bắt đầu bằng những từ lâu chưa gặp nhất, từ ngang nhau thì xáo ngẫu nhiên, nên vào lại cùng một chủ đề vẫn gặp từ khác ván trước. Trong một ván, phải ra hết các từ của bộ mới lặp lại, và mỗi vòng được xáo lại. Từ đến hạn ôn được hỏi trước, nhưng không hai ván liền nhau (`src/arcade/rotation.ts`, `createWordSource` trong `challenge.ts`).
- **Thêm game mới:** viết một component nhận `ArcadeGameProps` rồi đăng ký trong `src/arcade/games.tsx`.

Có XP, chuỗi ngày học (streak), mục tiêu mỗi ngày. Tiến độ lưu trong `localStorage`, và đồng bộ lên tài khoản khi đăng nhập (xem [Tài khoản & bảng xếp hạng](#tài-khoản--bảng-xếp-hạng)).

## Ngữ pháp & Phát âm (tiếng Anh, `/grammar`)

Mở từ thẻ **Ngữ pháp & Phát âm** ở trang học tiếng Anh. Có 27 chủ đề chia 3 nhóm:

| Nhóm | Chủ đề | Lý thuyết |
|---|---|---|
| ⏳ Các thì | 12 thì và "Used to · Would · Be going to" | công thức khẳng định / phủ định / nghi vấn (với to be và động từ thường), cách dùng, dấu hiệu nhận biết, lưu ý |
| 📖 Từ loại & cấu trúc | 11 chủ điểm: động từ, danh từ, tính từ, cụm động từ, động từ khuyết thiếu, mạo từ, từ hạn định, động từ nối, liên từ, đại từ, giới từ | khái niệm, vị trí, cấu trúc, cách dùng, dấu hiệu, trường hợp đặc biệt |
| 🗣️ Phát âm IPA | nguyên âm đơn, nguyên âm đôi, phụ âm | mỗi âm có từ ví dụ kèm phiên âm, nghĩa và nút nghe |

Mỗi chủ đề có bài luyện trắc nghiệm, tổng cộng 290 câu:
- **Dạng câu hỏi:** điền chỗ trống, chọn đáp án, tìm từ có cách phát âm khác (chữ cái được gạch chân), tìm từ chứa âm.
- **Sau mỗi câu:** có giải thích bằng tiếng Việt, và đọc to câu tiếng Anh đã điền đáp án.
- **Tiến độ:** lưu kết quả tốt nhất (%) của từng chủ đề. Chủ đề đạt từ 80% được tính là "đã vững".

Nội dung lấy từ phần dữ liệu đóng gói sẵn trong app NEnglish (`modules/*.ts`):

```bash
npm run grammar:import -- /Users/mn13/Projects/ReactNative/NEnglish
```

Script dùng TypeScript để đọc các module, chuẩn hoá rồi ghi vào `public/grammar/<topic>.json` và `index.json`:
- ký hiệu IPA `:` → `ː`, `g` → `ɡ`;
- tách ví dụ "câu (bản dịch)";
- đáp án nhiều chỗ trống "an...the";
- bỏ câu hỏi trùng.

Từ vựng, hội thoại và bài nghe của NEnglish nằm trên Firebase Realtime Database. Database này đã bị tắt nên không lấy được; nếu có file export JSON thì có thể viết thêm bước nhập.

## Học theo câu · Giao tiếp · Thành ngữ

Ba mục này có ở trang học của cả 3 ngôn ngữ, ngay dưới lời chào.

### ✍️ Học theo câu (`/sentences`)

Các gói 10 câu thật, lấy từ [Tatoeba](https://tatoeba.org/vi), có sẵn bản dịch tiếng Việt, xếp theo cấp độ: 133 gói tiếng Anh (A1 → C1–C2), 125 gói tiếng Nhật (N5 → N1) và 51 gói tiếng Trung (HSK1 → HSK7–9).

Mỗi câu học theo hai bước:
1. **Học câu:** nghe (thường hoặc chậm), đọc câu kèm furigana (tiếng Nhật) hoặc pinyin (tiếng Trung), tự đoán nghĩa rồi bấm để xem. Có thể bấm **Nói theo**: trình duyệt nhận dạng giọng nói và chấm độ khớp (Chrome, Edge, Safari; nút này ẩn trên Firefox). Nói khớp từ 80% được +2 XP.
2. **Luyện:** xếp lại câu từ các từ bị xáo trộn, hoặc chỉ nghe rồi chọn nghĩa đúng trong 4 đáp án. Hai dạng này xen kẽ nhau.

Kết quả tốt nhất của từng gói được lưu; gói đúng từ 80% được tính là "đã vững".

```bash
npm run sentences:build   # cần data/sources/open (npm run sources:download) và data/courses (npm run vocab:prepare)
```

Script `scripts/sentences/build.mjs` chọn câu và ghi ra `public/sentences/`:
- **Cấp độ** của câu là cấp của từ khó nhất trong câu, tính theo danh sách từ của lộ trình.
- **Tiếng Anh:** nhận ra dạng chia của từ (went → go, stopped → stop), và bỏ các câu có từ không nằm trong danh sách.
- **Tiếng Nhật:** tách từ theo chỉ mục Tanaka và lấy furigana từ Tatoeba.
- **Tiếng Trung:** tách từ theo pinyin của Tatoeba, và đổi câu viết chữ phồn thể sang giản thể.
- **Lọc nội dung:** câu về bạo lực, tình dục hay ma tuý bị loại. Bản dịch là do cộng đồng Tatoeba đóng góp nên chất lượng không đều.

### 💬 Giao tiếp (`/talk`)

Có 8 tình huống cho mỗi ngôn ngữ: làm quen, gọi món, mua sắm, hỏi đường, khách sạn, khám bệnh, gọi điện công việc và phỏng vấn xin việc. Mỗi hội thoại có 8–10 lượt thoại, bản dịch, phiên âm, cùng 4 mẫu câu hay dùng kèm ghi chú.
- **Nghe cả bài:** đọc lần lượt từng câu và tô sáng câu đang đọc. Bấm vào câu nào để nghe riêng câu đó.
- **Nhập vai:** bạn đóng vai B. App đọc lời của người kia, bạn chọn câu mình cần nói trong 3 câu (có gợi ý nghĩa tiếng Việt), rồi có thể bấm **Nói theo** để luyện phát âm.

Nội dung nằm ở `public/talk/<id>.json`. `npm run catalog` kiểm tra các file này (`scripts/build-talk.mjs`: đủ vai, đủ lượt, phiên âm kana/pinyin, trường `tracks` ghi nhóm phù hợp, mỗi ngôn ngữ có hội thoại cho cả 3 nhóm…) rồi sinh `public/talk/index.json`.

### 📜 Thành ngữ (`/idioms`)

Có 6 bộ, mỗi bộ 12 câu:
- **Tiếng Anh:** thành ngữ thường ngày, thành ngữ công sở & IELTS.
- **Tiếng Nhật:** tục ngữ ことわざ, thành ngữ bốn chữ 四字熟語.
- **Tiếng Trung:** thành ngữ 成语, quán dụng ngữ 惯用语.

Mỗi câu có nghĩa tương đương trong tiếng Việt, và âm Hán Việt nếu có (一石二鳥 nhất thạch nhị điểu, 入乡随俗 nhập gia tùy tục).
- **Cách học:** đây là bộ từ bình thường (`public/decks/*-idioms-*.json`, `"category": "idioms"`), nên dùng được cả 7 dạng ôn luyện và 22 trò chơi.
- **Nơi hiển thị:** các bộ này có trang riêng, không nằm trong mục "Chủ đề" ở trang học.

## Ôn tập (tab riêng, `/review`)

- **Sổ từ:** bấm 🔖 cạnh một từ để lưu. Nút này có ở danh sách từ của bộ bài, mặt sau Flashcard và màn kết quả game (có thêm nút **Lưu tất cả** cho các từ bị lọt).
- **Nguồn từ để ôn:**
  - **Sổ từ của tôi**: các từ đã lưu.
  - **Tất cả từ đã học**: mọi từ đã có lịch ôn Flashcard, lấy lại từ bộ bài gốc.
  - Cả hai đều cần ít nhất 6 từ.
- **Ôn bằng trò chơi:** bấm **Ôn ngay bằng trò ngẫu nhiên** để mở một game từ vựng ngẫu nhiên (`/games/<game>?deck=saved|learned`). Trong game có nút đổi sang trò ngẫu nhiên khác.
- **Xếp lịch ôn:** từ bị lọt vẫn được xếp lịch ôn trên thẻ gốc của nó.
- **Lưu trữ:** sổ từ nằm trong `localStorage`, cùng với tiến độ học. Mỗi từ được lưu kèm bản sao nội dung nên không cần tải lại bộ bài.

## Lộ trình 3.000 từ mỗi cấp

Mỗi ngôn ngữ có 3 lộ trình **Cơ bản · Trung cấp · Nâng cao**, mỗi lộ trình 3.000 từ (150 bài). Từ được chia thành các bài 20 từ, mỗi bài là một bộ bài bình thường nên dùng được cả 7 dạng ôn luyện. Trong tab Trò chơi có thể chọn cả lộ trình làm bộ từ, và từ bị lọt vẫn được xếp lịch ôn trong đúng bài của nó. Các bộ Trẻ em / Đi làm / Luyện thi được giữ lại dưới mục **Chủ đề**.

| | Cơ bản | Trung cấp | Nâng cao |
|---|---|---|---|
| 🇬🇧 Anh (CEFR) | A1–B1 · 3.000 từ | B1–B2 · 3.000 từ | B2–C2 · 3.000 từ |
| 🇯🇵 Nhật (JLPT) | N5–N3 · 3.000 từ | N3–N1 · 3.000 từ | N1–N1+ · 3.000 từ |
| 🇨🇳 Trung (HSK 3.0) | HSK1–4 · 3.000 từ | HSK4–7-9 · 3.000 từ | HSK7-9 · 3.000 từ |

Trang lộ trình (`/courses/<id>`) luôn hiện đủ 150 bài, kể cả khi nội dung chưa soạn xong:
- Bài đã soạn học được ngay; bài chưa soạn bị khoá và ghi "Đang soạn".
- Tab **Danh sách 3.000 từ** xem được toàn bộ từ của cấp, tìm được theo từ, phiên âm hoặc nghĩa.
- Từ đã soạn hiện nghĩa tiếng Việt; từ chưa soạn tạm hiện nghĩa tiếng Anh hoặc từ loại của danh sách gốc.

Danh sách mở không đủ 9.000 từ cho mọi ngôn ngữ, nên phần thiếu được bổ sung theo tần suất:
- **Tiếng Anh:** CEFR-J và Octanove có khoảng 8.640 từ; 356 từ còn lại lấy từ NGSL/NAWL (chủ yếu từ học thuật, gán cấp theo tần suất).
- **Tiếng Nhật:** JLPT có khoảng 7.590 từ dùng được; 1.411 từ còn lại là từ thông dụng của JMdict chưa có trong danh sách JLPT, xếp theo hạng tần suất và ghi cấp **N1+**. Tiểu từ, tiền tố, hậu tố, cụm cố định và từ cổ bị loại.

### Pipeline dữ liệu (`scripts/vocab/`)

```bash
npm run vocab:prepare   # 1. tải danh sách chuẩn → data/courses/<lang>-<level>.json (không tốn phí)
npm run vocab:enrich    # 2. gọi Claude API: nghĩa tiếng Việt, ví dụ, emoji, IPA/pinyin, 5 câu mỗi bài → data/enriched/
npm run vocab:build     # 3. kiểm tra lại, sinh public/decks/<course>-<nnn>.json + public/courses/*.json
```

#### Bước 2 miễn phí: bản nháp từ dữ liệu mở (`vocab:draft`)

Không có API key thì có thể soạn **bản nháp** cho mọi bài từ các nguồn mở đã tải về máy. **Một lệnh làm hết** (tải nguồn còn thiếu → tra từ → soạn nháp → cào từ còn thiếu → soạn lại → gói câu → build), chạy lại bất cứ lúc nào, bước nào đã có sẵn thì bỏ qua:

```bash
npm run crawl                  # khoảng 1–2 phút khi đã có dữ liệu; lần đầu lâu hơn vì phải tải khoảng 190 MB
npm run crawl -- --refresh     # tải lại bản mới nhất của mọi nguồn (Wiktionary, Tatoeba cập nhật hằng tuần)
npm run crawl -- --no-crawl    # bỏ bước cào English Wiktionary (cần mạng, chạy chậm)
npm run crawl -- --no-build    # chỉ cập nhật data/, không đụng tới public/
```

Hoặc chạy từng bước:

```bash
npm run sources:download && npm run sources:lookup   # một lần
npm run vocab:draft      # soạn nháp, ghi danh sách từ chưa dịch được
npm run sources:crawl    # tra thêm các từ đó trên English Wiktionary (kaikki.org), chạy chậm và lịch sự, có cache
npm run vocab:draft      # soạn lại với bản dịch vừa tải
npm run vocab:build
```

- **Nghĩa:**
  - **Tiếng Anh:** Wiktionary tiếng Việt và từ điển Anh–Việt, chọn nghĩa khớp từ loại; từ ghép (nightclub, tablespoon) lấy từ bảng dịch của English Wiktionary.
  - **Tiếng Trung:** từ điển Trung–Việt, chỉ khi pinyin khớp cách đọc HSK (的, 得 có nhiều cách đọc).
  - **Tiếng Nhật:** dịch bắc cầu qua nghĩa tiếng Anh của danh sách JLPT và JMdict; chỉ dùng từ tiếng Trung cùng mặt chữ khi nghĩa tiếng Anh trong CC-CEDICT khớp. Từ nào không dịch được thì giữ nghĩa tiếng Anh, có ghi "(EN)".
- **Ví dụ:**
  - Lấy câu Tatoeba, ví dụ trong Wiktionary, và ví dụ trong từ điển Anh–Việt / Trung–Việt (TrungViet-big) có bản dịch tiếng Việt.
  - Từ nào không có ví dụ thì dùng câu mẫu "Cùng học từ …".
  - 5 câu luyện của mỗi bài lấy từ kho câu Tatoeba, ưu tiên câu chứa từ của bài.
- **Đánh dấu bản nháp:**
  - File được ghi `"draft": true`; trang lộ trình và trang bài hiện nhãn **Bản nháp**.
  - Khi có API key, `vocab:enrich` sẽ soạn lại các bài nháp và không bao giờ ghi đè bài Claude đã soạn.
- **Giọng đọc:** bài nháp không được tạo sẵn file mp3 (tránh hàng chục nghìn file cho nội dung chưa rà soát), nên dùng giọng có sẵn của trình duyệt.
- **Chất lượng:** kém hơn bản Claude, nhất là phần nghĩa tiếng Nhật. Chỉ nên dùng để chạy thử hoặc làm dữ liệu mẫu, nên rà soát trước khi phát hành. Dữ liệu dẫn xuất từ nguồn GPL / CC BY-SA phải giữ cùng giấy phép.

Bước 2 cần API key Anthropic: đặt `ANTHROPIC_API_KEY`, ghi vào file `.env` (đã có trong `.gitignore`), hoặc đăng nhập bằng `ant auth login`. Nên chạy thử trước:

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
- **Batch API (khuyên dùng cho lần chạy lớn):** `npm run vocab:enrich -- --batch`. Script gửi mọi bài còn thiếu thành một batch và kiểm tra lại mỗi phút cho tới khi xong (thường dưới 1 giờ, tối đa 24 giờ). Sau đó nó kiểm tra từng bài và gửi lại các bài sai kèm danh sách lỗi (tối đa 3 vòng). Mã batch đang chờ được lưu ở `data/enriched/.batch.json`; nếu bị ngắt, chạy lại đúng lệnh đó để tiếp tục mà không trả tiền hai lần. Batch không hỗ trợ fallback.
- **Model:** mặc định `claude-opus-5-5` với effort `medium`; đổi bằng `--model` / `--effort`. Chế độ gọi trực tiếp bật **server-side fallback** (`fallbacks: 'default'`): nếu model chính từ chối trả lời, API tự chuyển sang model dự phòng.
- **Chi phí:** toàn bộ 1.348 bài (27.000 từ) ước tính **khoảng $46 qua Batch** hoặc **khoảng $93 nếu gọi trực tiếp**, với Opus 5.5. Đây là ước tính thô vì số token suy nghĩ thay đổi; script in ra chi phí thực tế sau khi chạy.

### Nguồn dữ liệu và giấy phép

- **Tiếng Anh:**
  - [CEFR-J Wordlist 1.5](https://github.com/openlanguageprofiles/olp-en-cefrj), phải ghi nguồn: *Tono Lab, Tokyo University of Foreign Studies (2020)*.
  - [Octanove Vocabulary Profile C1/C2](https://github.com/openlanguageprofiles/olp-en-cefrj), giấy phép **CC BY-SA 4.0**: phần dữ liệu tiếng Anh dẫn xuất từ nguồn này phải giữ cùng giấy phép.
  - [NGSL 1.01 with SFI / NAWL](https://www.newgeneralservicelist.com/) của Browne, Culligan & Phillips, **CC BY-SA 4.0** (tải qua bản sao ở [antdurrant/word.lists](https://github.com/antdurrant/word.lists)).
- **Tiếng Nhật:**
  - [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks), MIT, dựa trên danh sách của Jonathan Waller (tanos.co.uk).
  - [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) của Electronic Dictionary Research and Development Group, **CC BY-SA 4.0**, phải ghi nguồn EDRDG.
- **Tiếng Trung:** [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), MIT, theo chuẩn HSK 3.0.

Nghĩa tiếng Việt, câu ví dụ và câu luyện tập được Claude sinh ra, sau đó kiểm tra tự động; vẫn nên rà soát lại trước khi phát hành.

### Nguồn dữ liệu mở tải về máy (`scripts/sources/`)

Từ điển song ngữ và kho câu mở, dùng để đối chiếu hoặc giảm bớt phần phải nhờ Claude sinh ra:

```bash
npm run sources:download   # tải khoảng 190 MB, giải nén ra khoảng 300 MB, vào data/sources/open/ (đã có trong .gitignore)
npm run sources:lookup     # tra 27.000 từ của lộ trình → data/sources/open/lookup/<course>.json + bảng độ phủ
```

| Nguồn | Nội dung | Giấy phép |
|---|---|---|
| [Wiktionary tiếng Việt](https://vi.wiktionary.org) qua [kaikki.org](https://kaikki.org/viwiktionary/) | nghĩa tiếng Việt, IPA, ví dụ có dịch (Anh · Nhật · Trung) | CC BY-SA 4.0 / GFDL |
| [Tatoeba](https://tatoeba.org/vi/downloads) | câu Anh / Nhật / Trung kèm bản dịch tiếng Việt hoặc tiếng Anh | CC BY 2.0 FR |
| [catusf/tudien](https://github.com/catusf/tudien): `star_anhviet` (OVDP, Hồ Ngọc Đức) | Anh → Việt, 386 nghìn mục | GPL (dữ liệu gốc) |
| catusf/tudien: `TrungViet-small` | Trung → Việt, có pinyin và âm Hán Việt | repo ghi CC0, chưa rõ nguồn gốc dữ liệu |
| catusf/tudien: `TudienThienChuu` | âm Hán Việt từng chữ (Thiều Chửu, 1942) | repo ghi CC0 |
| catusf/tudien: `star_nhatviet` (OVDP) | Nhật → Việt, **dịch bắc cầu qua tiếng Anh nên hay sai**, chỉ dùng làm gợi ý | GPL (dữ liệu gốc) |
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) | Trung → Anh | CC BY-SA 4.0 |
| [ipa-dict](https://github.com/open-dict-data/ipa-dict) | IPA tiếng Anh (Mỹ, Anh) | MIT |
| [Unicode CLDR](https://github.com/unicode-org/cldr-json) annotations | tên và từ khoá emoji bằng tiếng Việt / Anh | Unicode License |
| [OpenJLPT](https://github.com/evanclan/OpenJLPT) | ngữ pháp JLPT N5–N1: 526 điểm, có công thức và ví dụ kèm furigana, bằng tiếng Anh | CC BY-SA 4.0 |
| [Akari](https://github.com/khoitran3012/learning-japanese-for-beginners-website) | ngữ pháp N5–N4: 48 điểm, **giải thích bằng tiếng Việt**, viết bằng LLM nên cần rà soát | MIT |
| Chuẩn HSK 3.0 GF 0025-2021, phụ lục A (bản chép của [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0)) | ngữ pháp HSK 1 – 7-9: 572 điểm, có ví dụ tiếng Trung chính thức | văn bản nhà nước; repo không ghi giấy phép |
| [ivankra/hsk30](https://github.com/ivankra/hsk30) `hsk30-grammar.csv` | cùng danh sách trên dạng bảng (cấp, nhóm, loại, nội dung) | MIT |
| [no7z/hsk-sentences-audio](https://github.com/no7z/hsk-sentences-audio) | 413 điểm ngữ pháp HSK 1–6, câu gắn với từng điểm, có pinyin và dịch tiếng Anh | MIT |

Độ phủ trên 27.000 từ của lộ trình (lần chạy ngày 30/09/2026):
- **Tiếng Anh:** có nghĩa tiếng Việt cho 97–98% số từ và IPA cho 96–97%. Câu ví dụ có sẵn bản dịch tiếng Việt: 82% ở Cơ bản, 53% ở Trung cấp, 33% ở Nâng cao.
- **Tiếng Trung:** 100% số từ có nghĩa tiếng Việt và âm Hán Việt. Câu ví dụ có bản dịch tiếng Việt: 3–35%; có bản dịch tiếng Việt hoặc tiếng Anh: 66–96%.
- **Tiếng Nhật:** chỉ 2–6% số từ có nghĩa tiếng Việt đáng tin cậy. Câu ví dụ có bản dịch tiếng Việt: 19–67%; có bản dịch tiếng Việt hoặc tiếng Anh: 84–98%. Nghĩa tiếng Nhật vẫn cần `vocab:enrich`.

Lưu ý:
- Câu ví dụ được chọn bằng cùng quy tắc với `validate.mjs`: câu tiếng Anh phải chứa nguyên từ, còn câu tiếng Nhật/Trung chỉ cần chứa chuỗi ký tự của từ. Vì vậy một từ ngắn như 本 có thể khớp nhầm vào 日本.
- Chưa có nguồn mở nào giải thích ngữ pháp tiếng Trung bằng tiếng Việt, và tiếng Nhật chỉ có phần N5–N4. Phần còn lại phải tự dịch; bản dịch từ nguồn CC BY-SA phải giữ CC BY-SA 4.0. Chinese Grammar Wiki (CC BY-NC-SA, cấm dùng trong app có quảng cáo) và Tae Kim (CC BY-NC-SA) không được đưa vào vì giấy phép phi thương mại.
- Dữ liệu GPL và CC BY-SA chỉ nên dùng để đối chiếu. Nếu chép thẳng vào `public/`, phần đó phải giữ cùng giấy phép và ghi nguồn.

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

1. **File âm thanh tạo sẵn** (`public/audio/`, Kokoro trên GitHub Actions). Đọc rõ và giống nhau trên mọi thiết bị.
2. **Giọng của trình duyệt** (Web Speech API). App tự chấm điểm và chọn giọng tốt nhất, bỏ qua các giọng robot như "Albert" hay "Eddy" trên macOS. Người dùng có thể đổi giọng và tốc độ trong **Cài đặt**.

### Giọng đọc chuẩn trên mọi thiết bị (miễn phí, tự động)

Mọi từ, câu ví dụ, câu luyện, nội dung Ngữ pháp & Phát âm, hội thoại Giao tiếp và gói Học theo câu đều có **file mp3 tạo sẵn** bằng model mã nguồn mở [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0).
- Trình duyệt nào, máy nào (iPhone, Android, Windows, Mac…) cũng phát cùng một giọng, kể cả máy không có giọng tiếng Nhật hay tiếng Trung.
- File được tạo **trên GitHub Actions** ([.github/workflows/audio.yml](.github/workflows/audio.yml)), không cần cài gì trên máy, không cần API key. Repo private có 2.000 phút chạy miễn phí mỗi tháng.

Cách workflow chạy:
1. Mỗi lần push lên `main` có thay đổi nội dung (`public/decks`, `public/grammar`, `public/talk`, `public/sentences`…), workflow chỉ tạo file cho câu mới hoặc câu đã sửa.
2. Nó xoá file không còn dùng, ghi `public/audio/manifest.json`, rồi tự commit.
3. Vercel deploy lại theo commit đó.

Chạy tay: GitHub → **Actions → Generate audio → Run workflow**. Trong lúc chờ, câu chưa có file sẽ dùng giọng có sẵn của máy.

- **Giọng mặc định:** `af_heart` (Anh), `jf_alpha` (Nhật), `zf_xiaoxiao` (Trung). Đổi bằng biến `TTS_VOICE_EN`, `TTS_VOICE_JA`, `TTS_VOICE_ZH` trong workflow.
- **Dùng Google Cloud TTS thay Kokoro:** cần key và bật thanh toán, rồi chạy `npm run audio -- --provider google` với `GOOGLE_TTS_API_KEY` trong `.env`.
- **Khi đủ 27.000 từ** (khoảng 60.000 đoạn, vài trăm MB): nên đưa `public/audio/` lên Cloudflare R2 và đặt `VITE_AUDIO_BASE_URL`.

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

## Tài khoản & bảng xếp hạng

Phần này không bắt buộc: chưa cấu hình Supabase thì app vẫn chạy, tiến độ chỉ lưu trên máy.

- **Đăng ký:** tên tài khoản + mật khẩu (không cần email), kèm tên hiển thị và avatar. Có thể đăng nhập bằng Google.
- **Mỗi tài khoản là 1 dòng, dữ liệu là 1 chuỗi JSON** (`accounts.data`), gồm tên, avatar, XP, streak, lịch ôn flashcard, kỷ lục và sổ từ.
  - Định dạng `PackedProgress` trong `src/lib/cloud.ts`: khoá 1 chữ cái, mảng thay cho object, flashcard gom theo bộ từ, thời gian tính theo phút.
  - Kích thước chỉ còn khoảng 1/3 so với dữ liệu trên máy (1.000 thẻ flashcard: 83 KB → 26 KB).
- **Đồng bộ:**
  - Khi đăng nhập, dữ liệu trên cloud được gộp với dữ liệu trên máy, không mất gì.
  - Sau đó, mỗi thay đổi được gửi lên sau 3 giây bằng **1 request**, và chỉ gửi khi dữ liệu có thay đổi.
  - App không bao giờ gửi lên trước khi đã gộp xong, nên lỗi mạng không làm mất tiến độ trên cloud.
- **Bảng xếp hạng** (XP tuần, XP mọi lúc, điểm từng game):
  - Đọc các cột Postgres tự sinh từ JSON, không phải đọc cả JSON của mọi người.
  - Chỉ hiện tên hiển thị và avatar.
  - Tên và avatar chỉ đổi được qua `set_profile`, nên một máy khác gửi tiến độ cũ lên cũng không làm tên bị đổi lại.

Cài đặt (làm một lần):

1. Tạo project trên [supabase.com](https://supabase.com) (gói Free là đủ).
2. Vào **SQL Editor**, chạy lần lượt các file trong `supabase/migrations/`: `0001_accounts_leaderboard.sql`, `0002_community_questions.sql` (tab Cộng đồng), `0003_community_samples.sql` (30 câu hỏi mẫu).
3. Vào **Authentication → Sign In / Providers → Email**: giữ Email ở trạng thái bật, và **tắt "Confirm email"**. Tài khoản đăng ký bằng tên dùng một email ảo (`<tên>@vpngoplay.vercel.app`) nên không nhận được thư xác nhận.
4. Vào Project Settings → API, lấy Project URL và publishable key:
   - Ghi vào `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`).
   - Thêm vào Environment Variables trên Vercel, rồi redeploy.
5. (Tuỳ chọn) Đăng nhập bằng Google:
   - Tạo OAuth client trên Google Cloud Console, với redirect URI `https://<project>.supabase.co/auth/v1/callback`.
   - Bật provider Google trong Supabase.
   - Thêm `https://<domain>/**` vào Authentication → URL Configuration → Redirect URLs.

### 👥 Cộng đồng (`/community`)

Tab dành cho người đã đăng nhập: đặt câu hỏi trắc nghiệm cho mọi người cùng trả lời, và học từ câu hỏi của người khác.

- **Đặt câu hỏi** về ngôn ngữ đang học (cờ trên header):
  - Mỗi câu có 2–4 đáp án khác nhau và 1 đáp án đúng; phần giải thích không bắt buộc.
  - Được +5 XP mỗi câu, tối đa 20 câu/ngày.
  - Người đặt câu hỏi có thể xoá câu của mình.
- **Trả lời:**
  - Mỗi người trả lời một lần; lần đầu mới được tính.
  - Trả lời xong mới thấy đáp án đúng, tỉ lệ mọi người chọn từng đáp án và phần giải thích. Trả lời đúng được +5 XP.
  - Đáp án đúng không nằm trong dữ liệu gửi về trước khi trả lời, nên không xem trước được.
- **Bộ lọc:** Mới nhất · Chưa làm · Làm sai (để ôn lại) · Của tôi.
- **Câu hỏi mẫu** (`0003`): 30 câu, mỗi ngôn ngữ 10 câu, đứng tên VpngoPlay. Xoá bằng `delete from public.questions where author is null;`.
- **Dữ liệu:**
  - Bảng `questions` lưu luôn số người chọn mỗi đáp án (`counts`), nên tải danh sách không phải đếm lại câu trả lời.
  - Bảng `answers` chỉ lưu 1 dòng nhỏ cho mỗi người, mỗi câu.
  - Mọi thao tác đi qua hàm trong `0002_community_questions.sql`.

**Quên mật khẩu:** tài khoản không gắn email nên người dùng không tự đặt lại được. Quản trị viên đặt mật khẩu mới trong SQL Editor:

```sql
update auth.users
set encrypted_password = extensions.crypt('mat-khau-moi', extensions.gen_salt('bf'))
where email = 'ten_tai_khoan@vpngoplay.vercel.app';
```

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
    sentences/            # Học theo câu: danh sách gói theo cấp + $packId
    talk/                 # Giao tiếp: danh sách tình huống + $dialogueId (hội thoại, nhập vai)
    idioms.tsx            # Thành ngữ: các bộ từ category "idioms"
    community.tsx         # Cộng đồng: câu hỏi trắc nghiệm do người học đăng (lib/community.ts)
  games/                  # Flashcard, Match, SentenceBuilder, Dictation, SentencePack, RolePlay
  arcade/                 # engine + 22 game arcade (games/*.tsx), xoay vòng từ (rotation.ts), nhãn nhiều dòng trên canvas (labels.ts), bảng chữ (scripts.ts) và logic thuần của từng game có test (bingo, spell, hangman, wordsearch, goldminer, millionaire, goldenbell, tictactoe, snakesladders)
  components/             # ui.tsx, ProfileForm.tsx (react-hook-form + zod)
  lib/                    # api (queryOptions), store (zustand), srs, speech, types
public/decks/*.json       # nội dung bài học (bộ chủ đề + từng bài của lộ trình)
public/courses/*.json     # lộ trình: danh sách bài + toàn bộ từ (dùng cho game)
public/sentences/*.json   # gói câu Tatoeba (scripts/sentences/build.mjs)
public/talk/*.json        # hội thoại Giao tiếp (soạn tay, kiểm tra bởi scripts/build-talk.mjs)
scripts/vocab/            # pipeline sinh lộ trình 3.000 từ
scripts/sources/          # tải từ điển / kho câu mở về data/sources/open
data/courses/             # danh sách từ đã chia cấp (đầu vào của enrich)
data/enriched/            # kết quả Claude sinh, từng bài
```

## Lộ trình tiếp theo

- **API serverless:** thư mục `api/` (Vercel Functions) để lấy bộ từ từ DB; chỉ cần đổi URL trong `lib/api.ts`.
- **AI:** nhập vai hội thoại, sinh bộ từ theo chủ đề, chấm bài viết IELTS (gọi Claude API từ Vercel Function, có giới hạn lượt/ngày).
- Luyện phát âm bằng SpeechRecognition, PWA để cài lên điện thoại và học offline.
