# 📚 คู่มือผู้ดูแลระบบ (Admin Guide)

## 🎯 ภาพรวม

คู่มือนี้จัดทำขึ้นสำหรับผู้ดูแลระบบ Photo Booth เพื่อช่วยในการจัดการอีเว้นท์ กรอบรูป และรูปภาพต่างๆ

## 🔐 การเข้าสู่ระบบ

### ข้อมูล Login เริ่มต้น
- **URL**: http://localhost:3000/admin
- **Username**: `admin`
- **Password**: `admin123`

### ⚠️ สำคัญมาก!
**เปลี่ยนรหัสผ่านก่อนใช้งานจริง**

แก้ไขในไฟล์ `server.js` บรรทัดที่ 95-96:
```javascript
if (username === 'admin' && password === 'admin123') {
  // เปลี่ยนเป็นรหัสผ่านของคุณ
}
```

สำหรับความปลอดภัยสูงสุด ควรใช้ bcrypt:
```javascript
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash('your-password', 10);
```

## 📋 การจัดการอีเว้นท์

### สร้างอีเว้นท์ใหม่

1. **คลิกปุ่ม "สร้างอีเว้นท์ใหม่"**

2. **กรอกข้อมูล:**

   **ชื่ออีเว้นท์** (จำเป็น)
   - ชื่อที่จะแสดงให้ผู้ใช้เห็น
   - ตัวอย่าง: "งานแต่งงานคุณสมชาย-สมหญิง", "วันเกิดครบรอบ 50 ปี"

   **Prefix ชื่อไฟล์** (จำเป็น)
   - คำนำหน้าชื่อไฟล์รูป
   - ใช้ตัวอักษรภาษาอังกฤษและตัวเลขเท่านั้น
   - ตัวอย่าง: `WEDDING`, `BIRTHDAY`, `EVENT2024`
   - ระบบจะเพิ่มเลขอัตโนมัติ: `WEDDING_0001`, `WEDDING_0002`

   **โฟลเดอร์สำหรับอัพโหลด** (ไม่จำเป็น)
   - ชื่อโฟลเดอร์ที่จะเก็บไฟล์
   - ถ้าไม่ระบุจะใช้ "default"
   - ตัวอย่าง: `wedding-2024`, `birthday-party`

3. **คลิก "สร้างอีเว้นท์"**

4. **ระบบจะสร้าง:**
   - อีเว้นท์ใหม่
   - QR Code สำหรับแชร์
   - โฟลเดอร์เก็บไฟล์

### ดูรายละเอียดอีเว้นท์

คลิกที่ card อีเว้นท์ใดๆ จะเห็น:
- ข้อมูลอีเว้นท์ (ชื่อ, prefix, โฟลเดอร์)
- QR Code
- รายการกรอบรูป
- รูปภาพทั้งหมดในอีเว้นท์

### แก้ไขอีเว้นท์

ปัจจุบันยังไม่มีฟีเจอร์แก้ไข แต่สามารถ:
- เพิ่มกรอบใหม่
- ลบรูปภาพ
- ลบอีเว้นท์ทั้งหมด

### ลบอีเว้นท์

1. คลิกที่อีเว้นท์ที่ต้องการลบ
2. เลื่อนลงล่างสุด
3. คลิก "ลบอีเว้นท์" (สีแดง)
4. ยืนยันการลบ

**⚠️ คำเตือน**: การลบอีเว้นท์จะลบรูปภาพทั้งหมดในอีเว้นท์นั้นด้วย!

## 🖼️ การจัดการกรอบรูป

### ข้อกำหนดของกรอบรูป

**ขนาดที่แนะนำ:**
- ความกว้าง: 600 pixels
- ความสูง: 1800 pixels
- อัตราส่วน: 1:3 (2x6 นิ้ว)
- DPI: 300 (สำหรับพิมพ์คุณภาพสูง)

**โครงสร้างกรอบ:**
```
┌─────────────────┐
│   Margin Top    │ 300px
│   (กรอบบน)      │
├─────────────────┤
│   Photo 1       │ 400px
├─────────────────┤
│   Photo 2       │ 400px
├─────────────────┤
│   Photo 3       │ 400px
├─────────────────┤
│  Margin Bottom  │ 300px
│   (กรอบล่าง)    │
└─────────────────┘
```

**รูปแบบไฟล์:**
- PNG (แนะนำ - รองรับความโปร่งใส)
- JPEG
- ขนาดไฟล์: ไม่เกิน 10MB

### วิธีสร้างกรอบรูป

**ใช้ Photoshop:**
1. สร้างไฟล์ใหม่ 600x1800 pixels, 300 DPI
2. วาดกรอบที่ต้องการ
3. เว้นพื้นที่กลาง 600x1200 pixels (เริ่มที่ y=300)
4. Save as PNG

**ใช้ Canva:**
1. สร้าง Custom size: 600x1800 pixels
2. ออกแบบกรอบ
3. เว้นพื้นที่กลางสำหรับรูป
4. Download as PNG

**ใช้ GIMP (ฟรี):**
1. File > New > 600x1800 pixels
2. ออกแบบกรอบ
3. Export as PNG

### อัพโหลดกรอบรูป

1. **เปิดรายละเอียดอีเว้นท์**
   - คลิกที่อีเว้นท์ที่ต้องการ

2. **ในส่วน "กรอบรูป"**
   - คลิก "+ อัพโหลดกรอบ"

3. **เลือกไฟล์**
   - เลือกไฟล์รูปกรอบจากเครื่อง
   - รอระบบอัพโหลด (อาจใช้เวลาสักครู่)

4. **ตรวจสอบ**
   - กรอบจะแสดงในรายการ
   - ผู้ใช้จะเห็นกรอบนี้ในตัวเลือก

### เคล็ดลับการออกแบบกรอบ

**สำหรับงานแต่งงาน:**
- ใช้สีทอง, ขาว, ชมพูอ่อน
- เพิ่มลวดลายดอกไม้
- ใส่ชื่อเจ้าบ่าวเจ้าสาว
- ใส่วันที่จัดงาน

**สำหรับวันเกิด:**
- ใช้สีสดใส
- เพิ่มบอลลูน, ดาว
- ใส่ "Happy Birthday"
- ใส่อายุหรือปีเกิด

**สำหรับงานบริษัท:**
- ใช้สีตามแบรนด์
- ใส่โลโก้บริษัท
- ใส่ชื่องาน
- ดูเป็นทางการ

**ข้อควรระวัง:**
- อย่าใส่รายละเอียดมากเกินไปในพื้นที่กลาง
- ใช้สีที่ไม่ทับกับสีผิวคน
- ทดสอบกับรูปจริงก่อน

## 📱 QR Code

### การใช้งาน QR Code

QR Code จะถูกสร้างอัตโนมัติเมื่อสร้างอีเว้นท์

**ดาวน์โหลด QR Code:**
1. เปิดรายละเอียดอีเว้นท์
2. ในส่วน "QR Code"
3. คลิก "ดาวน์โหลด QR Code"
4. ไฟล์จะถูกบันทึกเป็น PNG

**วิธีใช้ QR Code:**
- พิมพ์ติดที่โต๊ะถ่ายรูป
- แสดงบนหน้าจอ
- ใส่ในการ์ดเชิญ
- โพสต์บน Social Media

**ขนาดที่แนะนำสำหรับพิมพ์:**
- ขนาดเล็ก: 5x5 cm
- ขนาดกลาง: 10x10 cm
- ขนาดใหญ่: 20x20 cm

### ทดสอบ QR Code

ก่อนใช้งานจริง:
1. สแกน QR Code ด้วยมือถือ
2. ตรวจสอบว่าเปิดหน้าถ่ายรูปถูกต้อง
3. ทดสอบถ่ายรูปจริง
4. ตรวจสอบว่ารูปบันทึกได้

## 📸 การจัดการรูปภาพ

### ดูรูปภาพทั้งหมด

ในหน้ารายละเอียดอีเว้นท์:
- เลื่อนลงส่วน "รูปภาพทั้งหมด"
- จะเห็นรูป composite (รูปพร้อมกรอบ)
- แสดงเรียงตามเวลาล่าสุด

### ลบรูปภาพ

1. คลิกที่รูปที่ต้องการลบ
2. ยืนยันการลบ
3. รูปจะถูกลบทั้งชุด (5 ไฟล์)

**⚠️ คำเตือน**: การลบไม่สามารถย้อนกลับได้!

### โครงสร้างไฟล์รูป

แต่ละชุดรูปจะมี 5 ไฟล์:
```
uploads/photos/[set-id]/
├── photo_1.jpg       # รูปที่ 1
├── photo_2.jpg       # รูปที่ 2
├── photo_3.jpg       # รูปที่ 3
├── composite.jpg     # รูปพร้อมกรอบ
└── animation.gif     # GIF Animation
```

### Backup รูปภาพ

**แนะนำให้ backup เป็นประจำ:**

**วิธีที่ 1: Manual Backup**
1. คัดลอกโฟลเดอร์ `uploads/`
2. เก็บไว้ที่ปลอดภัย (External HDD, Cloud)

**วิธีที่ 2: Google Drive Sync**
1. ติดตั้ง Google Drive Desktop
2. Sync โฟลเดอร์ `uploads/`

**วิธีที่ 3: Automated Script**
```bash
# สร้าง backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf backup_$DATE.tar.gz uploads/ data/
```

## 🔧 การตั้งค่าขั้นสูง

### เปลี่ยนขนาดรูป

แก้ไขใน `server.js` (บรรทัด ~180):
```javascript
// ขนาดปัจจุบัน: 2x6 นิ้ว = 600x1800 pixels
const width = 600;
const height = 1800;
const topMargin = 300;
```

**ตัวอย่างขนาดอื่นๆ:**
- 4x6 นิ้ว: 1200x1800 pixels
- 3x5 นิ้ว: 900x1500 pixels

### เปลี่ยนจำนวนรูป

แก้ไขใน `public/capture.js`:
```javascript
// เปลี่ยนจาก 3 เป็นจำนวนที่ต้องการ
if (currentPhotoIndex >= 3) {
  // เปลี่ยนเป็น 4, 5, etc.
}
```

และใน `server.js`:
```javascript
if (!photos || photos.length !== 3) {
  // เปลี่ยนเป็นจำนวนเดียวกัน
}
```

### เปลี่ยน Port

แก้ไขใน `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
// เปลี่ยน 3000 เป็น port ที่ต้องการ
```

หรือใช้ environment variable:
```bash
PORT=8080 npm start
```

### เชื่อมต่อ Google Drive

**ขั้นตอนการเชื่อม Google Drive:**

1. **ติดตั้ง Google Drive API**
```bash
npm install googleapis
```

2. **สร้าง Service Account**
   - ไปที่ Google Cloud Console
   - สร้าง Project ใหม่
   - Enable Google Drive API
   - สร้าง Service Account
   - ดาวน์โหลด credentials.json

3. **แก้ไข server.js**
```javascript
const { google } = require('googleapis');
const drive = google.drive('v3');

// Upload to Google Drive
async function uploadToDrive(filePath, fileName) {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  
  const driveService = google.drive({ version: 'v3', auth });
  
  const fileMetadata = {
    name: fileName,
    parents: ['YOUR_FOLDER_ID']
  };
  
  const media = {
    mimeType: 'image/jpeg',
    body: fs.createReadStream(filePath)
  };
  
  const file = await driveService.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  });
  
  return file.data.id;
}
```

## 📊 สถิติและรายงาน

### ดูสถิติอีเว้นท์

ในหน้า Admin Panel จะเห็น:
- จำนวนอีเว้นท์ทั้งหมด
- จำนวนรูปในแต่ละอีเว้นท์
- จำนวนกรอบในแต่ละอีเว้นท์

### Export ข้อมูล

**Export รายการอีเว้นท์:**
```bash
# ไฟล์อยู่ที่
data/events.json
```

**Export รายการรูป:**
```bash
# ไฟล์อยู่ที่
data/photos.json
```

สามารถเปิดด้วย Text Editor หรือ Excel

## 🚨 การแก้ปัญหา

### ปัญหาที่พบบ่อย

**1. ไม่สามารถ Login ได้**
- ตรวจสอบ username/password
- ลบ localStorage: `localStorage.clear()`
- Restart server

**2. อัพโหลดกรอบไม่ได้**
- ตรวจสอบขนาดไฟล์ (ต้องไม่เกิน 50MB)
- ตรวจสอบรูปแบบไฟล์ (PNG, JPEG)
- ตรวจสอบ permissions โฟลเดอร์ `uploads/`

**3. QR Code ไม่แสดง**
- Restart server
- ตรวจสอบ package `qrcode` ติดตั้งแล้ว
- ลองสร้างอีเว้นท์ใหม่

**4. รูปไม่บันทึก**
- ตรวจสอบพื้นที่ว่างในเครื่อง
- ตรวจสอบ permissions โฟลเดอร์
- ดู console logs: `node server.js`

**5. GIF ไม่สร้าง**
- ตรวจสอบ package `canvas` และ `gifencoder`
- บน Windows: ติดตั้ง build tools
- ลองถ่ายรูปใหม่

### ดู Logs

**Server logs:**
```bash
node server.js
# ดู console output
```

**Browser logs:**
- เปิด Developer Tools (F12)
- ไปที่ tab Console
- ดู error messages

### Reset ระบบ

**Reset ข้อมูลทั้งหมด:**
```bash
# ลบข้อมูล (ระวัง!)
rm -rf data/ uploads/
# Restart server
npm start
```

**Reset เฉพาะอีเว้นท์:**
- ลบใน Admin Panel
- หรือแก้ไข `data/events.json`

## 💡 เคล็ดลับการใช้งาน

### สำหรับงานขนาดใหญ่

1. **เตรียมกรอบล่วงหน้า**
   - อัพโหลดกรอบก่อนงาน 1-2 วัน
   - ทดสอบกับรูปจริง

2. **ทดสอบระบบ**
   - ทดสอบถ่ายรูปจริง
   - ทดสอบดาวน์โหลด
   - ทดสอบ QR Code

3. **เตรียม Backup**
   - มี laptop สำรอง
   - มี internet backup (4G/5G)
   - มี power bank

4. **จัดทีมงาน**
   - มีคนคอยช่วยเหลือผู้ใช้
   - มีคนคอย monitor ระบบ

### สำหรับประสิทธิภาพสูงสุด

1. **ใช้ SSD**
   - เก็บไฟล์ใน SSD
   - เร็วกว่า HDD มาก

2. **ใช้ Wired Connection**
   - ใช้สาย LAN แทน WiFi
   - เสถียรกว่า

3. **ปิดโปรแกรมอื่น**
   - ปิดโปรแกรมที่ไม่จำเป็น
   - เหลือ RAM ให้ระบบ

4. **Monitor Resources**
   - ดู CPU, RAM usage
   - ดูพื้นที่ disk

## 📞 ติดต่อและสนับสนุน

หากมีปัญหาหรือข้อสงสัย:
1. อ่านคู่มือนี้อีกครั้ง
2. ตรวจสอบ README.md
3. ดู console logs
4. ลองค้นหาใน Google

---

**ขอให้ใช้งานระบบอย่างมีความสุข! 🎉**
