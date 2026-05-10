# 📸 Photo Booth Application

ระบบโฟโตบูธสำหรับช่างภาพมืออาชีพ - เว็บแอปพลิเคชันที่ช่วยให้คุณสร้างโฟโตบูธสำหรับงานอีเว้นท์ต่างๆ ได้อย่างง่ายดาย

> 🎬 **Developed by [Twist Studio](https://www.facebook.com/twist.studio.th)**

## ✨ คุณสมบัติหลัก

### 📱 ฝั่ง User
- **ถ่ายรูป 3 แอค** - ถ่ายรูปได้สูงสุด 3 รูปต่อชุด พร้อมฟีเจอร์ถ่ายใหม่และลบรูป
- **เลือกกล้อง** - รองรับการเลือกกล้องที่ต้องการใช้งาน (กล้องหน้า/หลัง)
- **Preview ก่อนบันทึก** - ดูตัวอย่างรูปทุกครั้งหลังถ่าย
- **เลือกกรอบรูป** - เลือกกรอบที่ชอบจากกรอบที่ admin อัพโหลดไว้
- **ดูแกลเลอรี่** - ดูรูปทั้งหมดในอีเว้นท์ แสดงเป็น card พร้อม thumbnail
- **ดาวน์โหลดรูป** - ดาวน์โหลดรูปเดี่ยวหรือทั้งชุด (5 รูป)
- **รูปครบชุด** - ได้รูป 5 ไฟล์ต่อชุด:
  1. รูปพร้อมกรอบ (composite) - รูป 3 แอคในกรอบ
  2. รูปเดี่ยวที่ 1
  3. รูปเดี่ยวที่ 2
  4. รูปเดี่ยวที่ 3
  5. GIF Animation - รวมรูปทั้ง 3 เป็น GIF

### 🔐 ฝั่ง Admin
- **Login/Logout** - ระบบ authentication แบบง่าย
- **จัดการอีเว้นท์** - สร้าง แก้ไข และลบอีเว้นท์
- **ตั้งชื่อไฟล์** - กำหนด prefix และรันเลขอัตโนมัติ (เช่น EVENT_0001)
- **เลือกโฟลเดอร์** - กำหนดโฟลเดอร์สำหรับเก็บไฟล์
- **อัพโหลดกรอบ** - อัพโหลดกรอบรูปสำหรับแต่ละอีเว้นท์
- **QR Code** - สร้าง QR Code อัตโนมัติสำหรับแต่ละอีเว้นท์
- **ดูรูปทั้งหมด** - ดูและลบรูปในอีเว้นท์
- **สถิติ** - ดูจำนวนรูปและกรอบในแต่ละอีเว้นท์

## 🚀 การติดตั้ง

### ความต้องการของระบบ
- Node.js 18 หรือสูงกว่า
- npm หรือ yarn
- บัญชี Cloudinary (สำหรับเก็บรูปภาพ)

### ขั้นตอนการติดตั้ง

1. **Clone หรือดาวน์โหลดโปรเจกต์**
```bash
cd photobooth-app
```

2. **ติดตั้ง dependencies**
```bash
npm install
```

3. **ตั้งค่า Cloudinary**
   - สมัครบัญชีฟรีที่ [Cloudinary](https://cloudinary.com)
   - คัดลอกไฟล์ `.env.example` เป็น `.env`
   - แก้ไขไฟล์ `.env` และใส่ข้อมูล Cloudinary ของคุณ:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   CLOUDINARY_FOLDER=photobooth
   ```

4. **รันโปรแกรม**
```bash
npm start
```

5. **เปิดเบราว์เซอร์**
- หน้าแรก: http://localhost:3000
- Admin Panel: http://localhost:3000/admin
- แกลเลอรี่: http://localhost:3000/gallery.html

## 📖 คู่มือการใช้งาน (Admin)

### 1. เข้าสู่ระบบ
- เปิด http://localhost:3000/admin
- ใช้ข้อมูลเริ่มต้น:
  - Username: `admin`
  - Password: `admin123`
- **⚠️ สำคัญ**: เปลี่ยนรหัสผ่านในไฟล์ `server.js` ก่อนใช้งานจริง

### 2. สร้างอีเว้นท์
1. คลิก "สร้างอีเว้นท์ใหม่"
2. กรอกข้อมูล:
   - **ชื่ออีเว้นท์**: ชื่อที่จะแสดงให้ผู้ใช้เห็น
   - **Prefix ชื่อไฟล์**: คำนำหน้าชื่อไฟล์ (เช่น WEDDING, BIRTHDAY)
   - **โฟลเดอร์**: ชื่อโฟลเดอร์ที่จะเก็บไฟล์
3. คลิก "สร้างอีเว้นท์"

### 3. อัพโหลดกรอบรูป
1. คลิกที่อีเว้นท์ที่ต้องการ
2. ในส่วน "กรอบรูป" คลิก "อัพโหลดกรอบ"
3. เลือกไฟล์รูปกรอบ (แนะนำขนาด 600x1800 pixels)
4. กรอบจะถูกบันทึกและแสดงในรายการ

**💡 เคล็ดลับ**: กรอบควรมี margin บนล่างอย่างละ 300px และพื้นที่กลาง 1200px สำหรับรูป 3 แอค

### 4. แชร์ QR Code
1. คลิกที่อีเว้นท์
2. ในส่วน "QR Code" คลิก "ดาวน์โหลด QR Code"
3. นำ QR Code ไปพิมพ์หรือแสดงให้ผู้ใช้สแกน

### 5. จัดการรูปภาพ
- ดูรูปทั้งหมดในส่วน "รูปภาพทั้งหมด"
- คลิกที่รูปเพื่อลบ (จะมีการยืนยันก่อนลบ)

### 6. ลบอีเว้นท์
1. คลิกที่อีเว้นท์ที่ต้องการลบ
2. คลิก "ลบอีเว้นท์" ที่ด้านล่าง
3. ยืนยันการลบ

## 👥 คู่มือการใช้งาน (User)

### 1. เข้าสู่อีเว้นท์
- สแกน QR Code ที่ admin แชร์ หรือ
- เปิดลิงก์ที่ได้รับ

### 2. ถ่ายรูป
1. อนุญาตการเข้าถึงกล้องเมื่อเบราว์เซอร์ขอ
2. เลือกกล้องที่ต้องการใช้ (ถ้ามีหลายตัว)
3. คลิก "ถ่ายรูป" เมื่อพร้อม
4. ดู preview และเลือก:
   - "ถ่ายใหม่" - ถ่ายรูปนี้ใหม่
   - "ถัดไป" - ไปถ่ายรูปถัดไป
5. ทำซ้ำจนครบ 3 รูป

### 3. เลือกกรอบ
1. เลือกกรอบที่ชอบจากตัวเลือกที่แสดง
2. ดู preview รูปพร้อมกรอบ
3. คลิก "บันทึกรูป" เมื่อพอใจ

### 4. ดูและดาวน์โหลดรูป
1. คลิก "ดูแกลเลอรี่" หลังบันทึกสำเร็จ
2. คลิกที่ชุดรูปที่ต้องการดู
3. ใช้ลูกศรเลื่อนดูรูปทั้ง 5 รูป
4. ดาวน์โหลด:
   - "ดาวน์โหลดรูปนี้" - ดาวน์โหลดรูปปัจจุบัน
   - "ดาวน์โหลดทั้งหมด" - ดาวน์โหลดทั้ง 5 รูป

## 🔒 ความปลอดภัย

### มาตรการความปลอดภัยที่มีอยู่:
- **Helmet.js** - ป้องกัน common web vulnerabilities
- **Rate Limiting** - จำกัดจำนวน request ต่อ IP
- **Content Security Policy** - ป้องกัน XSS attacks
- **Input Validation** - ตรวจสอบข้อมูลที่รับเข้ามา
- **File Size Limits** - จำกัดขนาดไฟล์ที่อัพโหลด (50MB)

### คำแนะนำสำหรับ Production:
1. **เปลี่ยนรหัสผ่าน Admin**
   - แก้ไขใน `server.js` บรรทัด 95-96
   - ใช้ bcrypt สำหรับ hash password

2. **ใช้ HTTPS**
   - ติดตั้ง SSL certificate
   - บังคับใช้ HTTPS เท่านั้น

3. **ตั้งค่า Environment Variables**
   ```bash
   PORT=3000
   NODE_ENV=production
   ADMIN_USERNAME=your_username
   ADMIN_PASSWORD=your_hashed_password
   ```

4. **Backup ข้อมูล**
   - สำรองโฟลเดอร์ `data/` และ `uploads/` เป็นประจำ

5. **ใช้ Reverse Proxy**
   - ใช้ Nginx หรือ Apache เป็น reverse proxy
   - ตั้งค่า rate limiting เพิ่มเติม

## ⚡ การเพิ่มประสิทธิภาพ

### ที่ทำไว้แล้ว:
- **Compression** - บีบอัด response ด้วย gzip
- **Image Optimization** - ใช้ JPEG quality 95% สำหรับรูปถ่าย
- **Caching** - Static files ถูก cache โดย Express
- **Async Operations** - ใช้ async/await ทุกที่

### แนะนำเพิ่มเติม:
1. **Database** - ย้ายจาก JSON files ไปใช้ database (MongoDB, PostgreSQL)
2. **Queue System** - ใช้ queue สำหรับ image processing (Bull, BullMQ)
3. **Load Balancer** - ใช้ load balancer สำหรับ traffic สูง

**หมายเหตุ**: ระบบใช้ Cloudinary สำหรับเก็บรูปภาพแล้ว ซึ่งช่วยเพิ่มประสิทธิภาพและลดภาระของ server

## 🎨 การปรับแต่ง

### เปลี่ยนสี Theme
แก้ไขใน `public/styles.css`:
```css
:root {
  --primary-color: #6366f1;  /* สีหลัก */
  --primary-hover: #4f46e5;  /* สีเมื่อ hover */
  --secondary-color: #64748b; /* สีรอง */
  /* ... */
}
```

### เปลี่ยนขนาดรูป
แก้ไขใน `server.js` และ `public/capture.js`:
```javascript
// ขนาดปัจจุบัน: 2x6 นิ้ว = 600x1800 pixels (300 DPI)
const width = 600;
const height = 1800;
const topMargin = 300;
const bottomMargin = 300;
```

### เพิ่มภาษา
เพิ่มไฟล์ภาษาใน `public/i18n/` และแก้ไข HTML files

## 📁 โครงสร้างโปรเจกต์

```
photobooth-app/
├── server.js              # Express server
├── package.json           # Dependencies
├── .env                   # Environment variables (Cloudinary config)
├── .env.example          # ตัวอย่างการตั้งค่า
├── README.md             # คู่มือนี้
├── ADMIN_GUIDE.md        # คู่มือ admin โดยละเอียด
├── public/               # Frontend files
│   ├── index.html        # หน้าแรก
│   ├── admin.html        # Admin panel
│   ├── capture.html      # หน้าถ่ายรูป
│   ├── gallery.html      # แกลเลอรี่
│   ├── styles.css        # Styles
│   ├── admin.js          # Admin logic
│   ├── capture.js        # Capture logic
│   └── gallery.js        # Gallery logic
└── data/                 # JSON database
    ├── events.json       # Events data
    └── photos.json       # Photos data (URLs to Cloudinary)
```

**หมายเหตุ**: รูปภาพทั้งหมดถูกเก็บบน Cloudinary แทนที่จะเก็บใน local server

## 🐛 การแก้ปัญหา

### กล้องไม่ทำงาน
- ตรวจสอบว่าเบราว์เซอร์ได้รับอนุญาตเข้าถึงกล้อง
- ใช้ HTTPS (บางเบราว์เซอร์ต้องการ HTTPS สำหรับกล้อง)
- ลองเบราว์เซอร์อื่น (แนะนำ Chrome, Edge)

### รูปไม่บันทึก
- ตรวจสอบ console ใน Developer Tools
- ตรวจสอบว่ามีพื้นที่เก็บไฟล์เพียงพอ
- ตรวจสอบ permissions ของโฟลเดอร์ `uploads/`

### QR Code ไม่แสดง
- ตรวจสอบว่า package `qrcode` ติดตั้งแล้ว
- ลอง restart server

### GIF ไม่สร้าง
- ตรวจสอบว่า package `canvas` และ `gifencoder` ติดตั้งแล้ว
- บน Windows อาจต้องติดตั้ง build tools:
  ```bash
  npm install --global windows-build-tools
  ```

## 🔄 การอัพเดท

### Version 1.0.0 (Current)
- ✅ ระบบถ่ายรูป 3 แอค
- ✅ เลือกกรอบรูป
- ✅ สร้าง GIF อัตโนมัติ
- ✅ Admin panel
- ✅ QR Code generation
- ✅ Gallery view
- ✅ Download photos

### แผนอนาคต
- [ ] Google Drive integration
- [ ] Email/SMS notification
- [ ] Social media sharing
- [ ] Photo filters and effects
- [ ] Multi-language support
- [ ] Mobile app (React Native)
- [ ] Print integration
- [ ] Analytics dashboard

## 📞 การสนับสนุน

หากพบปัญหาหรือต้องการความช่วยเหลือ:
1. ตรวจสอบ console logs
2. อ่านคู่มือนี้อีกครั้ง
3. ตรวจสอบ GitHub Issues (ถ้ามี)

## 📄 License

MIT License - ใช้งานได้อย่างอิสระ

## 🙏 Credits

สร้างด้วย:
- Express.js - Web framework
- Canvas - Image processing
- QRCode - QR code generation
- GIFEncoder - GIF creation
- Helmet - Security
- และอื่นๆ (ดูใน package.json)

---

**สนุกกับการใช้งาน Photo Booth! 📸✨**

---

## 🎬 About Twist Studio

**Twist Studio** เป็นสตูดิโอที่เชี่ยวชาญด้านการถ่ายภาพและวิดีโอสำหรับงานอีเว้นท์ต่างๆ พัฒนาระบบ Photo Booth นี้เพื่อให้ช่างภาพมืออาชีพสามารถให้บริการได้อย่างมีประสิทธิภาพ

📱 **ติดตามเราได้ที่**: [Facebook - Twist Studio](https://www.facebook.com/twist.studio.th)

---

Made with ❤️ by **Twist Studio**
