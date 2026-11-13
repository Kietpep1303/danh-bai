# Bàn Bài

Web chơi xì dách, bài cào và tiến lên với bạn bè bằng mã phòng. Chạy tốt trên điện thoại.

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
- **Nhà cái:** chủ phòng chọn "Bầu chọn" (giữ cái đến khi người khác được nhiều phiếu hơn) hoặc "Ngẫu nhiên 3 ván".
- **Hết giờ:** mỗi lượt 60 giây (người rớt mạng 15 giây), quá giờ máy tự đi giùm.

Luật nằm trong thư mục `games/`, muốn đổi cách tính tiền thì sửa ở đó.
