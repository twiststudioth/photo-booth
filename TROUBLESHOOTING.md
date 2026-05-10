# 🔧 Troubleshooting Guide

## ปัญหาที่พบบ่อยและวิธีแก้ไข

---

## ❌ Error: "public_id is invalid" (มี \n ใน path)

### อาการ:
```
Photo save error: {
  message: 'public_id (photobooth\\n/photos/...) is invalid',
  name: 'Error',
  http_code: 400
}
```

### สาเหตุ:
- ไฟล์ `.env` มี newline character (`\n`) หรือช่องว่างต่อท้ายค่า `CLOUDINARY_FOLDER`

### วิธีแก้:
1. เปิดไฟล์ `.env`
2. ตรวจสอบบรรทัด `CLOUDINARY_FOLDER=photobooth`
3. ลบช่องว่างหรือ `\n` ที่ต่อท้าย
4. ควรเป็น:
   ```env
   CLOUDINARY_FOLDER=photobooth
   ```
   **ไม่ใช่:**
   ```env
   CLOUDINARY_FOLDER=photobooth\n
   CLOUDINARY_FOLDER=photobooth 
   ```
5. บันทึกไฟล์
6. Restart server:
   ```bash
   npm start
   ```

### การป้องกัน:
- ระบบได้เพิ่ม `.trim()` ให้กับทุกค่าที่อ่านจาก environment variables แล้ว
- แต่ควรตรวจสอบไฟล์ `.env` ให้ถูกต้องเสมอ

---

## ❌ Error: "Invalid API credentials"

### อาการ:
```
Error: Invalid API credentials
```

### สาเหตุ:
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, หรือ `CLOUDINARY_API_SECRET` ไม่ถูกต้อง
- มีช่องว่างหน้า-หลัง
- คัดลอกไม่ครบ

### วิธีแก้:
1. เข้า Cloudinary Dashboard: https://cloudinary.com
2. ไปที่ **Dashboard** (หน้าแรก)
3. คัดลอกข้อมูลใหม่:
   - Cloud Name
   - API Key
   - API Secret
4. แก้ไขไฟล์ `.env`:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
5. ตรวจสอบว่าไม่มีช่องว่างหน้า-หลัง
6. Restart server

---

## ❌ Error: "Upload failed" / "Request timeout"

### อาการ:
- อัพโหลดรูปไม่สำเร็จ
- ใช้เวลานานแล้ว timeout

### สาเหตุ:
- Internet connection ไม่เสถียร
- ไฟล์ใหญ่เกินไป
- Cloudinary server ช้า

### วิธีแก้:
1. ตรวจสอบ internet connection
2. ลองอัพโหลดใหม่
3. ลดขนาดรูป (ถ้าเป็นไปได้)
4. ตรวจสอบ Cloudinary Status: https://status.cloudinary.com

---

## ❌ รูปไม่แสดงใน Gallery

### อาการ:
- Gallery แสดงว่าว่างเปล่า
- หรือแสดง broken image

### สาเหตุ:
- URL ไม่ถูกต้อง
- รูปถูกลบจาก Cloudinary
- CSP (Content Security Policy) block

### วิธีแก้:

#### 1. ตรวจสอบ URL
- เปิด Developer Tools (F12)
- ดู Console มี error อะไรบ้าง
- ลองเปิด URL รูปใน browser โดยตรง

#### 2. ตรวจสอบ Cloudinary
- เข้า Cloudinary Dashboard
- ไปที่ Media Library
- ตรวจสอบว่ารูปยังอยู่หรือไม่

#### 3. ตรวจสอบ CSP
- เปิดไฟล์ `server.js`
- หาบรรทัด `imgSrc:`
- ตรวจสอบว่ามี `"https://res.cloudinary.com"`:
  ```javascript
  imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"]
  ```

---

## ❌ Error: "Quota exceeded"

### อาการ:
```
Error: Quota exceeded
```

### สาเหตุ:
- ใช้ Storage หรือ Bandwidth เกิน Free Plan (25 GB)

### วิธีแก้:

#### ระยะสั้น:
1. ลบรูปเก่าที่ไม่ใช้แล้ว
2. รอเดือนถัดไป (Bandwidth reset ทุกเดือน)

#### ระยะยาว:
1. อัพเกรดเป็น Paid Plan
2. ใช้ Cloudinary หลายบัญชี (แยกตาม event)
3. ลดคุณภาพรูป:
   ```javascript
   // ใน server.js
   .jpeg({ quality: 85 })  // ลดจาก 95 เป็น 85
   ```

---

## ❌ GIF ไม่สร้าง / Error ตอนสร้าง GIF

### อาการ:
- GIF ไม่แสดงใน Gallery
- Console แสดง "GIF generation error"

### สาเหตุ:
- Package `gif-encoder-2` มีปัญหา
- รูปดาวน์โหลดจาก Cloudinary ไม่สำเร็จ
- Memory ไม่พอ

### วิธีแก้:
1. ตรวจสอบ Console logs
2. ลองสร้างใหม่
3. ตรวจสอบว่ารูปทั้ง 3 อัพโหลดสำเร็จ
4. Restart server
5. ถ้ายังไม่ได้ ลองติดตั้ง package ใหม่:
   ```bash
   npm uninstall gif-encoder-2
   npm install gif-encoder-2
   ```

---

## ❌ Composite image ไม่สร้าง

### อาการ:
- ไม่มีรูปพร้อมกรอบใน Gallery
- Console แสดง "Composite generation error"

### สาเหตุ:
- Frame ไม่ถูกต้อง
- รูปดาวน์โหลดจาก Cloudinary ไม่สำเร็จ
- Sharp package มีปัญหา

### วิธีแก้:
1. ตรวจสอบว่า frame อัพโหลดสำเร็จ
2. ตรวจสอบขนาด frame (ควรเป็น 600x1800 pixels)
3. ลองอัพโหลด frame ใหม่
4. Restart server
5. ถ้ายังไม่ได้ ลองติดตั้ง sharp ใหม่:
   ```bash
   npm uninstall sharp
   npm install sharp
   ```

---

## ❌ กล้องไม่ทำงาน

### อาการ:
- ไม่เห็นภาพจากกล้อง
- Browser ขอ permission แล้วก็ไม่มีอะไรเกิดขึ้น

### สาเหตุ:
- Browser ไม่ได้รับอนุญาตเข้าถึงกล้อง
- ใช้ HTTP แทน HTTPS (บาง browser ต้องการ HTTPS)
- กล้องถูกใช้งานโดยโปรแกรมอื่น

### วิธีแก้:
1. ตรวจสอบ permission ใน browser:
   - Chrome: Settings → Privacy and security → Site settings → Camera
   - ลบ block list ของเว็บไซต์
2. ใช้ HTTPS (สำหรับ production)
3. ปิดโปรแกรมอื่นที่ใช้กล้อง (Zoom, Teams, etc.)
4. ลองเบราว์เซอร์อื่น (แนะนำ Chrome หรือ Edge)
5. ลอง restart เครื่อง

---

## ❌ Server ไม่ start

### อาการ:
```
Error: Cannot find module 'cloudinary'
```

### สาเหตุ:
- ไม่ได้ติดตั้ง dependencies

### วิธีแก้:
```bash
npm install
```

---

## ❌ Error: "ENOENT: no such file or directory"

### อาการ:
```
Error: ENOENT: no such file or directory, open 'data/events.json'
```

### สาเหตุ:
- โฟลเดอร์ `data/` ไม่มี
- ไฟล์ JSON ถูกลบ

### วิธีแก้:
1. Server จะสร้างโฟลเดอร์และไฟล์อัตโนมัติ
2. ถ้ายังไม่ได้ สร้างเองด้วยมือ:
   ```bash
   mkdir data
   echo "[]" > data/events.json
   echo "[]" > data/photos.json
   ```
3. Restart server

---

## ❌ Download รูปไม่ได้ (Mobile)

### อาการ:
- คลิก Download แล้วไม่มีอะไรเกิดขึ้น
- หรือเปิดรูปใน tab ใหม่แทน

### สาเหตุ:
- Mobile browser มีข้อจำกัดในการ download

### วิธีแก้:
1. **iOS**: กดค้างที่รูป → เลือก "บันทึกรูปภาพ"
2. **Android**: ใช้ Share API (ระบบรองรับอยู่แล้ว)
3. หรือเปิดรูปใน tab ใหม่แล้ว download จากนั้น

---

## 🔍 การ Debug

### เปิด Developer Tools:
- **Chrome/Edge**: F12 หรือ Ctrl+Shift+I
- **Firefox**: F12 หรือ Ctrl+Shift+K
- **Safari**: Cmd+Option+I

### ดู Console Logs:
1. เปิด Developer Tools
2. ไปที่ tab **Console**
3. ดู error messages สีแดง
4. คัดลอก error message มาค้นหาใน document นี้

### ดู Network Requests:
1. เปิด Developer Tools
2. ไปที่ tab **Network**
3. Reload หน้าเว็บ
4. ดู requests ที่ fail (สีแดง)
5. คลิกดูรายละเอียด

### ดู Server Logs:
1. เปิด Terminal ที่รัน server
2. ดู logs ที่แสดง
3. หา error messages
4. คัดลอกมาค้นหาใน document นี้

---

## 📞 ยังแก้ไม่ได้?

ถ้าลองทุกวิธีแล้วยังไม่ได้:

1. **Restart ทุกอย่าง:**
   ```bash
   # Stop server (Ctrl+C)
   # Clear cache
   npm cache clean --force
   # Reinstall
   rm -rf node_modules
   npm install
   # Restart
   npm start
   ```

2. **ตรวจสอบ Environment:**
   - Node.js version: `node --version` (ควรเป็น 18+)
   - npm version: `npm --version`
   - OS: Windows/Mac/Linux

3. **ดู Documentation:**
   - [README.md](./README.md)
   - [CLOUDINARY_SETUP.md](./CLOUDINARY_SETUP.md)
   - [MIGRATION_TO_CLOUDINARY.md](./MIGRATION_TO_CLOUDINARY.md)

4. **ติดต่อ Support:**
   - Cloudinary Support: https://support.cloudinary.com
   - Cloudinary Community: https://community.cloudinary.com

---

## 📝 Checklist ก่อนขอความช่วยเหลือ

เมื่อจะขอความช่วยเหลือ ควรเตรียมข้อมูลเหล่านี้:

- [ ] Error message ที่แสดง (คัดลอกทั้งหมด)
- [ ] ขั้นตอนที่ทำก่อนเกิด error
- [ ] Browser และ version
- [ ] OS และ version
- [ ] Node.js version
- [ ] Console logs (ทั้ง browser และ server)
- [ ] Screenshot (ถ้าเป็นปัญหา UI)
- [ ] ไฟล์ `.env` (แต่ **ห้าม** แชร์ API Secret!)

---

**หวังว่าคู่มือนี้จะช่วยแก้ปัญหาของคุณได้นะครับ! 🔧**
