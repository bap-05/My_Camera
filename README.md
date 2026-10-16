# My Camera

Ứng dụng chụp và chỉnh sửa ảnh/video bằng React, Vite, Capacitor, Node.js, Express, MongoDB Atlas và Cloudinary.

## Tính năng

- Đăng ký, đăng nhập và quản lý dữ liệu theo tài khoản.
- Upload ảnh/video lên Cloudinary, lưu lịch sử trong MongoDB.
- Chỉnh sửa ảnh, xóa nền và tạo ảnh ghép.
- Chỉnh sửa video nhiều clip.
- Cắt clip, thêm âm thanh, văn bản và lớp phủ.
- Điều chỉnh độ sáng, tương phản, màu sắc, grayscale và blur.
- Xuất MP4, upload lên Cloudinary và lưu video vào thư viện Android.

## Kiến trúc

```text
Frontend React/Vite hoặc APK Android
              |
              v
Backend Node.js/Express
          /           \
         v             v
MongoDB Atlas      Cloudinary
```

## Yêu cầu

- Node.js 20 trở lên và npm.
- MongoDB Atlas hoặc MongoDB local.
- Tài khoản Cloudinary để upload media.
- Android Studio/Android SDK nếu cần build APK.

## Cấu trúc

```text
camera/
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

## Chạy backend local

```powershell
cd backend
npm install
```

Tạo `backend/.env` dựa trên `backend/.env.example`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=camera_app
JWT_SECRET=tao-mot-chuoi-bi-mat-dai-va-ngau-nhien
PORT=5000
FRONTEND_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Với MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/camera_app?retryWrites=true&w=majority
```

Chạy backend:

```powershell
npm start
```

Backend mặc định chạy tại `http://localhost:5000`.

## Chạy frontend local

```powershell
cd frontend
npm install
```

Tạo `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Chạy:

```powershell
npm run dev
```

Build frontend:

```powershell
npm run build
```

## Deploy backend lên Render

Tạo Web Service từ repository GitHub với cấu hình:

| Thiết lập | Giá trị |
|---|---|
| Root Directory | `backend` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Thêm Environment Variables trên Render:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/camera_app?retryWrites=true&w=majority
MONGODB_DB=camera_app
JWT_SECRET=chuoi-bi-mat-dai-va-ngau-nhien
PORT=10000
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Render sẽ cung cấp URL dạng:

```text
https://YOUR-BACKEND.onrender.com
```

Không commit `backend/.env` hoặc secret vào GitHub.

## Cấu hình MongoDB Atlas

1. Tạo cluster gói `M0 Free`.
2. Tạo Database User có quyền `Read and write to any database`.
3. Vào `Security → Database & Network Access`.
4. Trong `Network Access`, thêm IP phù hợp. Với Render Free có thể cần `0.0.0.0/0`.
5. Nếu password có ký tự đặc biệt, URL encode trước khi đưa vào `MONGODB_URI`; ví dụ `@` thành `%40`.

## Deploy frontend lên Vercel

Tạo project Vercel từ repository:

| Thiết lập | Giá trị |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Thêm Environment Variable:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com
```

Chọn `Production` và `Preview`, sau đó redeploy.

Khi có domain Vercel, cập nhật Render:

```env
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
```

Backend đã cho phép các origin Capacitor (`http://localhost`, `https://localhost`, `capacitor://localhost`) để APK gọi API.

## Build APK Android

Đặt URL backend deploy trong `frontend/.env`:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com
```

Build APK debug:

```powershell
cd frontend
npm run build
npx cap sync android
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

APK nằm tại:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Bảo mật

- Không commit `.env`, password MongoDB, JWT secret hoặc Cloudinary secret.
- Không đưa secret vào frontend hoặc APK.
- Nếu secret bị lộ, rotate secret trên dịch vụ tương ứng và cập nhật Render.
- Dùng HTTPS khi deploy.
- Chỉ dùng `0.0.0.0/0` cho môi trường thử nghiệm nếu không thể giới hạn IP.

## Xử lý lỗi

### Không thể kết nối đến Server Node.js

Kiểm tra `VITE_API_URL`, trạng thái Render `Live`, việc redeploy Vercel sau khi đổi biến môi trường và APK có được build lại hay chưa.

### MongoServerSelectionError hoặc lỗi SSL

Kiểm tra `MONGODB_URI`, Database User, password đã URL encode, Network Access và trạng thái cluster.

### Lỗi CORS

Đặt trên Render:

```env
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
```

Không thêm dấu `/` cuối URL, sau đó redeploy backend.

## Kiểm tra trước khi phát hành

```powershell
cd frontend
npm run build

cd ..\backend
node --check server.js
node --check src/app.js
```

Kiểm tra thủ công đăng ký, đăng nhập, upload ảnh/video, lịch sử tài khoản, xuất video và lưu video vào thư viện Android.
