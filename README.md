# Bàn Bài

Web chơi xì dách, bài cào, tiến lên và poker với bạn bè bằng mã phòng. Chạy tốt trên điện thoại.

## Đưa lên mạng (miễn phí, khoảng 10 phút, nên làm trên máy tính)

**Bước 1. Đưa code lên GitHub**
1. Vào github.com, tạo tài khoản nếu chưa có.
2. Bấm nút **+** góc trên phải → **New repository**. Đặt tên `danh-bai`, chọn **Public**, bấm **Create repository**.
3. Ở trang vừa tạo, bấm link **uploading an existing file**.
4. Giải nén file zip, kéo thả **toàn bộ nội dung bên trong** thư mục `danh-bai` (gồm thư mục `games`, `public` và các file `server.js`, `package.json`, `render.yaml`...) vào trang. Bấm **Commit changes**.

**Bước 2. Chạy trên Render**
1. Vào render.com, bấm **Get Started**, đăng nhập bằng tài khoản GitHub.
2. Bấm **New** → **Blueprint**, chọn repo `danh-bai`, bấm **Apply** (Render tự đọc file `render.yaml`).
   Nếu không thấy Blueprint: chọn **New** → **Web Service**, chọn repo, điền Build Command `npm install`, Start Command `npm start`, gói **Free**.
3. Đợi 2–4 phút. Khi báo **Live**, bạn có link dạng `https://danh-bai-xxxx.onrender.com`. Gửi link đó cho bạn bè là chơi được.

**Lưu ý gói miễn phí:** sau 15 phút không ai vào, server sẽ ngủ. Lần vào đầu tiên sau đó phải đợi khoảng 1 phút. Khi server ngủ hoặc khởi động lại, các phòng và điểm sẽ mất (điểm chỉ để vui).

## Sửa code sau này
Sửa file trên GitHub (bấm vào file → biểu tượng cây bút → Commit). Render sẽ tự cập nhật trong vài phút.

## Chạy thử trên máy
Cần Node.js 18 trở lên.
```
npm install
npm start
```
Mở http://localhost:3000

## Luật đang dùng
- **Xì dách (2–8 người):** dưới 16 phải rút, tối đa 5 lá. Xì bàn ăn 3 lần cược, xì dách và ngũ linh ăn 2 lần. Nhà cái cần 15 điểm mới được xét, xét từng người hoặc xét hết. Hai bên cùng quắc thì hòa.
- **Bài cào (2–17 người):** 3 lá, tính số nút hàng đơn vị. Ba tây lớn nhất, ăn 2 lần cược. Bằng nút thì hòa.
- **Tiến lên miền Nam (2–4 người):** ván đầu ai giữ lá nhỏ nhất (thường là 3 bích) đi trước và phải đánh lá đó. Ván sau người về nhất đi trước. 3 đôi thông chặt heo; tứ quý chặt heo, đôi heo, 3 đôi thông; 4 đôi thông chặt tất cả. Chặt heo đen ăn 1 lần cược, heo đỏ 2 lần. Tới trắng: sảnh rồng, tứ quý heo, 6 đôi, 5 đôi thông. Cuối ván: 4 người được +3, +1, −1, −3 lần cược (3 người: +2, 0, −2).
- **Poker Texas Hold'em (2–9 người), kiểu sòng thật (No-Limit):** mỗi người có chip riêng, chủ phòng chọn chip ban đầu (500/1000/2000/5000). Mù nhỏ bằng nửa mức cược, mù lớn bằng mức cược. Tố bao nhiêu cũng được (ít nhất bằng lần tố trước), có Tất tay và hũ phụ. Nút D xoay vòng, lượt đi theo chiều kim đồng hồ. Thứ tự bộ: Mậu thầu < Đôi < Thú < Sám cô < Sảnh < Thùng < Cù lũ < Tứ quý < Thùng phá sảnh. Hết giờ thì máy tự xem hoặc bỏ bài.
- **Hết chip:** ngồi xem, không được chia bài. Muốn chơi tiếp thì bấm Xin chip (cho luôn) hoặc Vay chip (trả thêm 10% lãi) và chọn người. Con nợ thắng ván thì tự trừ nợ; cũng có thể bấm Trả nợ giữa các ván. Chủ nợ được ném 💩 con nợ lúc nào cũng được và có mục Sai con nợ trong bảng 😈 (quạt, bưng trà, đấm lưng, hát, cúi chào, xin lỗi), hoặc Xóa nợ.
- **Nhà cái:** chủ phòng chọn "Bầu chọn" (giữ cái đến khi người khác được nhiều phiếu hơn) hoặc "Ngẫu nhiên 3 ván".
- **Hiệu ứng:** chủ phòng chọn kiểu phát bài (Bay thẳng, Xoay tít, Lật bay, Vòng cung, Búng nhanh hoặc Ngẫu nhiên mỗi ván). Mỗi người tự bật/tắt tiếng lá bài trong bảng Phòng.
- **Trò chuyện:** bấm 💬 để chat cả phòng, có emoji và câu nói nhanh. Tin nhắn hiện thành bong bóng trên ghế người gửi.
- **Chuông giục:** bấm 🔔 trên ghế người đang tới lượt để kêu "bon bon" nhắc họ đánh (mỗi người 5 giây gõ một lần).
- **Khiêu khích:** bấm 😈 ở góc ghế người khác để ném cà chua, trứng thối, dép tổ ong, bom hoặc thả emoji. Giữ nút để ném liên tục, hoặc bấm "Mưa" để ném một loạt 24 món. Đồ ném trúng dính đầy màn hình người bị ném (họ bấm "🧻 Lau màn hình" để lau); người khác chỉ thấy dính gọn trong ô ghế người bị ném. Thấy phiền thì bấm "🔇 Tắt ném đồ", tắt/bật trong bảng Phòng, hoặc chặn riêng một người trong bảng 😈 trên ghế họ (chỉ trên máy mình). 💩 chỉ ném được vào người bạn vừa ăn (chặn bài, chặt, về trên họ, thắng tiền); lúc đó nút 💩 nhấp nháy cạnh nút 😈. Mỗi người tối đa 30 món mỗi 3 giây.
- **Xếp bài (tiến lên):** bấm "Số" hoặc "Chất" cạnh số lá để xếp lại, hoặc kéo một lá sang trái/phải để đổi chỗ. Bấm nhẹ vẫn là chọn lá như cũ.
- **Đánh bài:** lá đánh ra bay từ tay người đánh xuống giữa bàn, chặt thì hiện chữ "CHẶT!" và rung bàn.
- **Bàn ngồi:** mọi trò đều là bàn bầu dục, bạn luôn ngồi giữa phía dưới, mũi tên dọc mép bàn chỉ chiều đi (mũi tên đỏ là người đang tới lượt). Xì dách, bài cào, tiến lên đi ngược chiều kim đồng hồ; poker đi theo chiều kim đồng hồ. Xì dách: nhà con rút lần lượt, nhà cái rút sau cùng.
- **Hỏi lại:** bỏ bài, tất tay, xét hết, lật hết tính tiền, rời phòng, mời người ra, trả nợ, xóa nợ đều có hộp hỏi lại trước khi làm.
- **Poker tất tay:** bài mọi người ngửa ra, rồi lật 3 lá, lá thứ tư, lá cuối, mỗi lần cách nhau một nhịp; kết quả từng hũ hiện trong khung riêng phía trên bài của bạn.
- **Ra vào linh hoạt:** đang chơi bấm "Nghỉ 1 ván" (ván sau nữa tự vào lại) hoặc "Nghỉ luôn"; người đang ngồi xem bấm "Vào chơi ván sau", bàn đủ người thì người đã chờ được ưu tiên. Giữa các ván ai cũng đổi trò được ngay dưới bàn; chủ phòng đổi được cả giữa ván (ván bị hủy, poker trả lại chip). Rời phòng vẫn giữ điểm và chip, trang chủ có nút "Vào lại phòng".
- **Hiệu ứng bộ mạnh:** tiến lên có hiệu ứng cho heo, đôi heo, sám, sảnh dài, 3/4 đôi thông, tứ quý, chặt heo, tới trắng; xì dách cho xì bàn, xì dách, ngũ linh; bài cào cho ba tây; poker cho tất tay và bộ thắng lớn (sảnh, thùng, cù lũ, tứ quý, thùng phá sảnh).
- **Sao và bậc (mọi trò, giữ chung trong phòng):** tiến lên: mỗi ván nhất +3 ⭐, nhì +1, ba 0, bét −1. Đủ 1/3/6/10 ⭐ thì lên Đồng/Bạc/Vàng/Kim cương; bậc n được n lá thưởng mỗi ván với kiểu lá của bậc đó (chỉ để đẹp, không đổi luật). Về nhất 3 ván liền thì lá thưởng thành kiểu Lửa. **Cướp sao:** về nhất cướp 1 ⭐ của người bét, chặt heo cướp 1 ⭐ (heo đen) / 2 ⭐ (heo đỏ), chặt khác (3 đôi thông, tứ quý, chặt chồng) cướp 1 ⭐, tới trắng cướp 1 ⭐ của mỗi người; cướp được thì ván sau thêm 1 lá chiến lợi phẩm mang kiểu lá của người bị cướp (không giới hạn; quá 13 lá thì giữ sang ván sau). Lá thưởng đánh ra thì cả bàn thấy. Xì dách, bài cào: mỗi nhà đấu với cái, bên thắng +1 ⭐ và cướp số sao bằng hệ số thắng (thường 1, xì dách/ngũ linh/ba tây 2, xì bàn 3). Poker: chip lời/lỗ quy ra sao, 5 mức mù lớn = 1 ⭐ (có lời ít nhất +1), ăn hũ thêm +1 ⭐, mỗi ván tối đa +5 / −3 ⭐. Lá thưởng không giới hạn (tối đa bằng số lá trên tay, chiến lợi phẩm dư giữ sang ván sau). Sao chỉ để đẹp, không ảnh hưởng điểm hay chip.
- **Hết giờ:** mỗi lượt 60 giây (người rớt mạng 15 giây), quá giờ máy tự đi giùm.

Icon (đồ ném, emoji, chat, chuông) được vẽ bằng SVG kiểu truyện tranh trong `public/icons.js`, nên máy nào cũng nhìn giống nhau. Muốn thêm icon thì vẽ thêm ở đó.

Luật nằm trong thư mục `games/`, muốn đổi cách tính tiền thì sửa ở đó.
