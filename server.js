import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import GIFEncoder from 'gif-encoder-2';
import jwt from 'jsonwebtoken';
import * as db from './lib/db.js';
import { getProjectStatus, wakeProject } from './lib/supabase-status.js';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim()
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
      // api.cloudinary.com: บูธอัพโหลดรูปตรงขึ้น Cloudinary (signed upload)
      connectSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://api.cloudinary.com"]
    }
  }
}));

// Performance middleware
app.use(compression());

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static('public'));

// JWT secret key (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// JWT auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// API Routes

// Login rate limit: ผิดได้ LOGIN_MAX_FAILS ครั้งต่อ IP ใน LOGIN_WINDOW_MIN นาที
// เก็บใน Supabase เพราะบน Vercel แต่ละ request อาจรันคนละ instance (เก็บใน memory ไม่ได้ผล)
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MIN = 15;

function clientIp(req) {
  return (req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0]
    || req.socket.remoteAddress
    || 'unknown').trim();
}

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = clientIp(req);

  // ถ้าเช็คกับ DB ไม่ได้ (เช่น Supabase หลับ) ให้ผ่านไปก่อน - ไม่งั้นจะ login เข้าไปกดปลุกระบบไม่ได้
  try {
    if (await db.countFailedLogins(ip, LOGIN_WINDOW_MIN) >= LOGIN_MAX_FAILS) {
      return res.status(429).json({
        success: false,
        message: `ใส่รหัสผิดเกิน ${LOGIN_MAX_FAILS} ครั้ง กรุณารอ ${LOGIN_WINDOW_MIN} นาทีแล้วลองใหม่`
      });
    }
  } catch (error) {
    console.error('Login rate limit check failed (allowing):', error.message);
  }

  // Get credentials from environment variables
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (username === adminUsername && password === adminPassword) {
    // Create JWT token with username and password encoded
    const token = jwt.sign(
      { 
        username: adminUsername,
        password: adminPassword,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: '24h' } // Token expires in 24 hours
    );
    
    res.json({ 
      success: true, 
      token: token,
      message: 'Login successful'
    });
    db.clearFailedLogins(ip).catch(error => console.error('Clear login attempts failed:', error.message));
  } else {
    try {
      await db.recordFailedLogin(ip);
    } catch (error) {
      console.error('Record login attempt failed:', error.message);
    }
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

// Database (Supabase) status - admin only
app.get('/api/admin/db-status', authMiddleware, async (req, res) => {
  res.json(await getProjectStatus());
});

// Wake a paused Supabase project - admin only
app.post('/api/admin/db-wake', authMiddleware, async (req, res) => {
  const result = await wakeProject();
  res.status(result.ok ? 200 : 502).json(result);
});

// Get all events
app.get('/api/events', async (req, res) => {
  try {
    const events = await db.getAllEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event
app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create event (admin only)
app.post('/api/events', authMiddleware, async (req, res) => {
  try {
    const newEvent = {
      id: uuidv4(),
      name: req.body.name,
      filePrefix: req.body.filePrefix || 'EVENT',
      uploadFolder: req.body.uploadFolder || 'default',
      cardEnabled: !!req.body.cardEnabled,
      frames: [],
      photoCounter: 0,
      createdAt: new Date().toISOString()
    };
    
    // Generate QR code
    const eventUrl = `${req.protocol}://${req.get('host')}/capture.html?event=${newEvent.id}`;
    const qrCode = await QRCode.toDataURL(eventUrl);
    newEvent.qrCode = qrCode;
    
    await db.createEvent(newEvent);
    
    res.json(newEvent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (admin only)
app.put('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const updatedEvent = await db.updateEvent(req.params.id, req.body);
    
    if (!updatedEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// public_id จาก Cloudinary delivery URL (.../upload/v123/<public_id>.<ext>)
function publicIdFromUrl(url) {
  const match = typeof url === 'string' && url.match(/\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return match ? match[1] : null;
}

// ลบทั้งงาน: ไฟล์รูป + กรอบบน Cloudinary แล้วจึงลบข้อมูลใน DB (admin only)
// เรียกหลังจากหน้า admin ดาวน์โหลดเก็บไว้ครบแล้ว
app.delete('/api/events/:id/purge', authMiddleware, async (req, res) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const photoSets = await db.getPhotosByEventId(event.id);
    const urls = [
      ...photoSets.flatMap(p => [...p.photos, p.composite]),
      ...(event.frames || []).flatMap(f => [f.path, f.overlayPath, f.cardPath, f.cardOverlayPath])
    ];
    const publicIds = [...new Set(urls.map(publicIdFromUrl).filter(Boolean))];

    // delete_resources รับได้ครั้งละ 100 (Admin API ~1 call ต่อ 100 ไฟล์)
    let deleted = 0;
    for (let i = 0; i < publicIds.length; i += 100) {
      const result = await cloudinary.api.delete_resources(publicIds.slice(i, i + 100), { resource_type: 'image' });
      deleted += Object.values(result.deleted || {}).filter(s => s === 'deleted').length;
    }

    // ลบ DB หลังลบไฟล์สำเร็จเท่านั้น (ถ้าพังกลางทาง กดซ้ำได้ - ไฟล์ที่ลบแล้วจะเป็น not_found)
    await db.deleteEvent(event.id);

    res.json({ success: true, photoSets: photoSets.length, files: publicIds.length, deleted });
  } catch (error) {
    console.error('Purge event error:', error);
    res.status(500).json({ error: 'Failed to purge event', message: error.message || error.error?.message });
  }
});

// Delete event (admin only)
app.delete('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    await db.deleteEvent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Upload frame (admin only)
app.post('/api/events/:id/frames', authMiddleware, async (req, res) => {
  try {
    const { frameData, overlayData, frameName } = req.body;
    
    if (!frameData) {
      return res.status(400).json({ error: 'No frame data provided' });
    }
    
    const event = await db.getEventById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Upload frame to Cloudinary
    const frameId = uuidv4();
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    
    const uploadResult = await cloudinary.uploader.upload(frameData, {
      folder: `${cloudinaryFolder}/frames`,
      public_id: frameId,
      resource_type: 'image'
    });
    
    // Upload overlay to Cloudinary (if exists)
    let overlayUrl = null;
    if (overlayData) {
      const overlayUploadResult = await cloudinary.uploader.upload(overlayData, {
        folder: `${cloudinaryFolder}/overlays`,
        public_id: `${frameId}_overlay`,
        resource_type: 'image'
      });
      overlayUrl = overlayUploadResult.secure_url;
    }
    
    const frame = {
      id: frameId,
      name: frameName || `Frame ${event.frames.length + 1}`,
      path: uploadResult.secure_url,
      overlayPath: overlayUrl
    };
    
    event.frames.push(frame);
    await db.updateEvent(event.id, event);
    
    res.json(frame);
  } catch (error) {
    console.error('Frame upload error:', error);
    res.status(500).json({ error: 'Failed to upload frame' });
  }
});

// Update frame (admin only)
app.put('/api/events/:eventId/frames/:frameId', authMiddleware, async (req, res) => {
  try {
    const { frameData, overlayData, frameName } = req.body;
    
    if (!frameData) {
      return res.status(400).json({ error: 'No frame data provided' });
    }
    
    const event = await db.getEventById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Find frame
    const frameIndex = event.frames.findIndex(f => f.id === req.params.frameId);
    if (frameIndex === -1) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    
    // Delete old frame from Cloudinary
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    try {
      await cloudinary.uploader.destroy(`${cloudinaryFolder}/frames/${req.params.frameId}`);
      // Delete old overlay if exists
      if (event.frames[frameIndex].overlayPath) {
        await cloudinary.uploader.destroy(`${cloudinaryFolder}/overlays/${req.params.frameId}_overlay`);
      }
    } catch (error) {
      console.error('Failed to delete old frame from Cloudinary:', error);
    }
    
    // Upload new frame to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(frameData, {
      folder: `${cloudinaryFolder}/frames`,
      public_id: req.params.frameId,
      resource_type: 'image'
    });
    
    // Upload overlay to Cloudinary (if exists)
    let overlayUrl = null;
    if (overlayData) {
      const overlayUploadResult = await cloudinary.uploader.upload(overlayData, {
        folder: `${cloudinaryFolder}/overlays`,
        public_id: `${req.params.frameId}_overlay`,
        resource_type: 'image'
      });
      overlayUrl = overlayUploadResult.secure_url;
    }
    
    // Update frame
    event.frames[frameIndex] = {
      ...event.frames[frameIndex], // keep card frame fields
      id: req.params.frameId,
      name: frameName || event.frames[frameIndex].name,
      path: uploadResult.secure_url,
      overlayPath: overlayUrl
    };
    
    await db.updateEvent(event.id, event);
    
    res.json(event.frames[frameIndex]);
  } catch (error) {
    console.error('Frame update error:', error);
    res.status(500).json({ error: 'Failed to update frame' });
  }
});

// Delete frame (admin only)
app.delete('/api/events/:eventId/frames/:frameId', authMiddleware, async (req, res) => {
  try {
    const event = await db.getEventById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Find and remove frame
    const frameIndex = event.frames.findIndex(f => f.id === req.params.frameId);
    if (frameIndex === -1) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    
    // Delete frame (and its card frame, if any) from Cloudinary
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    try {
      const frame = event.frames[frameIndex];
      await Promise.all([
        cloudinary.uploader.destroy(`${cloudinaryFolder}/frames/${req.params.frameId}`),
        frame.cardPath && cloudinary.uploader.destroy(`${cloudinaryFolder}/frames/${req.params.frameId}_card`),
        frame.cardOverlayPath && cloudinary.uploader.destroy(`${cloudinaryFolder}/overlays/${req.params.frameId}_card_overlay`)
      ]);
    } catch (error) {
      console.error('Failed to delete frame from Cloudinary:', error);
    }
    
    // Remove from array
    event.frames.splice(frameIndex, 1);
    await db.updateEvent(event.id, event);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete frame' });
  }
});

// Upload/replace card frame of a frame set (admin only)
app.put('/api/events/:eventId/frames/:frameId/card', authMiddleware, async (req, res) => {
  try {
    const { cardData, overlayData } = req.body;
    
    if (!cardData) {
      return res.status(400).json({ error: 'No card data provided' });
    }
    
    const event = await db.getEventById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const frame = event.frames.find(f => f.id === req.params.frameId);
    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    const cardPublicId = `${req.params.frameId}_card`;
    
    // Upload card frame (and overlay) in parallel, overwriting previous versions
    const [cardResult, overlayResult] = await Promise.all([
      cloudinary.uploader.upload(cardData, {
        folder: `${cloudinaryFolder}/frames`,
        public_id: cardPublicId,
        resource_type: 'image',
        overwrite: true
      }),
      overlayData
        ? cloudinary.uploader.upload(overlayData, {
            folder: `${cloudinaryFolder}/overlays`,
            public_id: `${cardPublicId}_overlay`,
            resource_type: 'image',
            overwrite: true
          })
        : null
    ]);
    
    // Remove old card overlay if the new card has none
    if (!overlayData && frame.cardOverlayPath) {
      try {
        await cloudinary.uploader.destroy(`${cloudinaryFolder}/overlays/${cardPublicId}_overlay`);
      } catch (error) {
        console.error('Failed to delete old card overlay from Cloudinary:', error);
      }
    }
    
    frame.cardPath = cardResult.secure_url;
    frame.cardOverlayPath = overlayResult ? overlayResult.secure_url : null;
    
    await db.updateEvent(event.id, { frames: event.frames });
    
    res.json(frame);
  } catch (error) {
    console.error('Card frame upload error:', error);
    res.status(500).json({ error: 'Failed to upload card frame' });
  }
});

// Delete card frame of a frame set (admin only)
app.delete('/api/events/:eventId/frames/:frameId/card', authMiddleware, async (req, res) => {
  try {
    const event = await db.getEventById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const frame = event.frames.find(f => f.id === req.params.frameId);
    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    try {
      await Promise.all([
        cloudinary.uploader.destroy(`${cloudinaryFolder}/frames/${req.params.frameId}_card`),
        frame.cardOverlayPath && cloudinary.uploader.destroy(`${cloudinaryFolder}/overlays/${req.params.frameId}_card_overlay`)
      ]);
    } catch (error) {
      console.error('Failed to delete card frame from Cloudinary:', error);
    }
    
    frame.cardPath = null;
    frame.cardOverlayPath = null;
    
    await db.updateEvent(event.id, { frames: event.frames });
    
    res.json(frame);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete card frame' });
  }
});

// รูปเดี่ยวทั้ง 3 ใบ: บูธอัพโหลดตรงขึ้น Cloudinary (ไม่ผ่าน Vercel ซึ่งรับ request ได้ไม่เกิน 4.5MB)
// ใช้ incoming transformation เดิม (q_auto:best) ความชัดเท่าเดิม
const PHOTO_UPLOAD_TRANSFORMATION = 'q_auto:best'; // ไม่ใส่ f_auto: ให้เก็บเป็น JPEG เสมอ (f_auto อาจแปลงเป็น PNG ไฟล์ใหญ่)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function photoSetFolderOf(photoSetId) {
  const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
  return `${cloudinaryFolder}/photos/${photoSetId}`;
}

// ขอลายเซ็นสำหรับอัพโหลด 3 รูปของชุดใหม่ (admin only)
app.post('/api/events/:id/upload-signature', authMiddleware, (req, res) => {
  const photoSetId = uuidv4();
  const folder = photoSetFolderOf(photoSetId);
  const timestamp = Math.round(Date.now() / 1000);
  const { cloud_name, api_key, api_secret } = cloudinary.config();

  const uploads = [1, 2, 3].map(n => {
    const params = { folder, public_id: `photo_${n}`, timestamp, transformation: PHOTO_UPLOAD_TRANSFORMATION };
    return { ...params, signature: cloudinary.utils.api_sign_request(params, api_secret) };
  });

  res.json({
    photoSetId,
    apiKey: api_key,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
    uploads
  });
});

// Save photo set (admin only) - รับ URL ของรูปที่บูธอัพโหลดขึ้น Cloudinary แล้ว
app.post('/api/events/:id/photos', authMiddleware, async (req, res) => {
  try {
    const { photoSetId, photos, frameId, cardPhotoIndex, fileNumber } = req.body;

    if (!UUID_RE.test(photoSetId || '') || !Array.isArray(photos) || photos.length !== 3) {
      return res.status(400).json({ error: 'Must provide photoSetId and exactly 3 photo URLs' });
    }

    // รับเฉพาะ URL ของ cloud เรา ในโฟลเดอร์ของชุดนี้ ตามลำดับ photo_1..3
    const photoSetFolder = photoSetFolderOf(photoSetId);
    const cloudName = cloudinary.config().cloud_name;
    const validUrl = (url, n) => typeof url === 'string'
      && url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`)
      && new RegExp(`/${photoSetFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/photo_${n}\\.[a-z0-9]+$`, 'i').test(url);
    if (!photos.every((url, i) => validUrl(url, i + 1))) {
      return res.status(400).json({ error: 'Invalid photo URLs' });
    }

    const event = await db.getEventById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const savedPhotos = photos;

    // Generate composite image with frame
    const frame = event.frames.find(f => f.id === frameId);
    let compositePath = null;
    
    if (frame) {
      try {
        compositePath = await generateCompositeImage(savedPhotos, frame.path, frame.overlayPath, photoSetFolder);
      } catch (error) {
        console.error('Composite generation failed:', error);
      }
    }
    
    // ไม่สร้าง GIF อัตโนมัติอีกต่อไป - จะสร้างเฉพาะตอน download

    // Next file number (atomic in DB) - use the number the booth already gave this set (local file name)
    // so both match; never go backwards (sets that were not uploaded still use up numbers)
    const requestedNumber = Number.isInteger(fileNumber) ? fileNumber : 0;
    const photoCounter = await db.nextPhotoNumber(event.id, requestedNumber);
    const fileName = `${event.filePrefix}_${String(photoCounter).padStart(4, '0')}`;

    // Save photo set data
    const photoSet = {
      id: photoSetId,
      eventId: event.id,
      fileName,
      photos: savedPhotos,
      composite: compositePath,
      gif: null, // ไม่เก็บ GIF ไว้ล่วงหน้า
      frameId,
      // รูปที่ใช้บนการ์ดอวยพร (0-2) - ไม่อัพโหลดรูปการ์ด สร้างตอนปริ้นจากรูปชุดนี้แทน
      cardPhotoIndex: Number.isInteger(cardPhotoIndex) && cardPhotoIndex >= 0 && cardPhotoIndex < 3 ? cardPhotoIndex : null,
      createdAt: new Date().toISOString()
    };
    
    await db.createPhoto(photoSet);

    res.json(photoSet);
  } catch (error) {
    console.error('Photo save error:', error);
    res.status(500).json({ error: 'Failed to save photos' });
  }
});

// Get photos for an event
app.get('/api/events/:id/photos', async (req, res) => {
  try {
    const eventPhotos = await db.getPhotosByEventId(req.params.id);
    res.json(eventPhotos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Delete photo set (admin only)
app.delete('/api/photos/:id', authMiddleware, async (req, res) => {
  try {
    const photoSet = await db.getPhotoById(req.params.id);
    
    if (photoSet) {
      // Delete files from Cloudinary
      const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
      const photoSetFolder = `${cloudinaryFolder}/photos/${photoSet.id}`;
      
      try {
        // Delete all resources in the folder
        await cloudinary.api.delete_resources_by_prefix(photoSetFolder);
        // Delete the folder
        await cloudinary.api.delete_folder(photoSetFolder);
      } catch (error) {
        console.error('Failed to delete from Cloudinary:', error);
      }
    }
    
    await db.deletePhoto(req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo set' });
  }
});

// Generate GIF on-demand (สร้างเฉพาะตอน download)
app.get('/api/photos/:id/gif', async (req, res) => {
  try {
    const photoSet = await db.getPhotoById(req.params.id);
    
    if (!photoSet) {
      return res.status(404).json({ error: 'Photo set not found' });
    }
    
    // Generate GIF from photos
    const gifBuffer = await generateGIF(photoSet.photos);
    
    if (!gifBuffer) {
      return res.status(500).json({ error: 'Failed to generate GIF' });
    }
    
    // Send GIF as response
    res.set('Content-Type', 'image/gif');
    res.set('Content-Disposition', `attachment; filename="${photoSet.fileName}.gif"`);
    res.send(gifBuffer);
  } catch (error) {
    console.error('GIF generation error:', error);
    res.status(500).json({ error: 'Failed to generate GIF' });
  }
});

// Helper function to generate composite image
async function generateCompositeImage(photoUrls, frameUrl, overlayUrl, cloudinaryFolder) {
  try {
    // Canvas size for 2x6 inch at 600 DPI = 2400x7200 pixels
    // Each photo is 2200x1467 (3:2 ratio), centered with equal top/bottom margins
    const width = 2400;
    const height = 7200;
    const photoWidth = 2200;  // Centered with 100px margins on each side
    const photoHeight = 1467; // 3:2 ratio
    const sideMargin = 100;   // Center horizontally: (2400 - 2200) / 2 = 100px
    const photoSpacing = 67;  // Reduced spacing between photos
    
    // Calculate total photos height and center vertically
    const totalPhotosHeight = (photoHeight * 3) + (photoSpacing * 2);
    const topMargin = (height - totalPhotosHeight) / 2;  // Equal top and bottom margins
    
    // Download photos from Cloudinary and prepare buffers
    const photoBuffers = [];
    for (let i = 0; i < photoUrls.length; i++) {
      const response = await fetch(photoUrls[i]);
      if (!response.ok) {
        throw new Error(`Failed to fetch photo ${i + 1}: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const photoBuffer = await sharp(buffer)
        .resize(photoWidth, photoHeight, { 
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
      
      photoBuffers.push({
        input: photoBuffer,
        top: Math.round(topMargin + (i * (photoHeight + photoSpacing))),
        left: sideMargin
      });
    }
    
    // Download frame from Cloudinary
    const frameResponse = await fetch(frameUrl);
    if (!frameResponse.ok) {
      throw new Error(`Failed to fetch frame: ${frameResponse.status} ${frameResponse.statusText}`);
    }
    const frameArrayBuffer = await frameResponse.arrayBuffer();
    const frameBuffer = Buffer.from(frameArrayBuffer);
    
    // Resize frame
    const resizedFrame = await sharp(frameBuffer)
      .resize(width, height)
      .toBuffer();
    
    // Create composite: Frame background + Photos
    let compositeBuffer = await sharp(resizedFrame)
      .composite(photoBuffers)
      .toBuffer();
    
    // Add overlay if exists
    if (overlayUrl) {
      try {
        const overlayResponse = await fetch(overlayUrl);
        if (!overlayResponse.ok) {
          throw new Error(`Failed to fetch overlay: ${overlayResponse.status} ${overlayResponse.statusText}`);
        }
        const overlayArrayBuffer = await overlayResponse.arrayBuffer();
        const overlayBuffer = Buffer.from(overlayArrayBuffer);
        
        const resizedOverlay = await sharp(overlayBuffer)
          .resize(width, height)
          .toBuffer();
        
        compositeBuffer = await sharp(compositeBuffer)
          .composite([{
            input: resizedOverlay,
            blend: 'over'
          }])
          .toBuffer();
      } catch (error) {
        console.error('Overlay processing error:', error);
        // Continue without overlay
      }
    }
    
    // Convert to JPEG
    compositeBuffer = await sharp(compositeBuffer)
      .jpeg({ quality: 88, progressive: true }) // q88: ดูไม่ต่างจาก q95 (PSNR ~47dB) ไฟล์เล็กลง ~40%
      .toBuffer();
    
    // Upload composite to Cloudinary with high quality
    const base64Composite = `data:image/jpeg;base64,${compositeBuffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(base64Composite, {
      folder: cloudinaryFolder,
      public_id: 'composite',
      resource_type: 'image',
      quality: 'auto:best' // ไม่ใส่ fetch_format: ให้เก็บเป็น JPEG เสมอ
    });
    
    return uploadResult.secure_url;
  } catch (error) {
    console.error('Composite generation error:', error.message);
    throw error;
  }
}

// Helper function to generate GIF on-demand (ไม่อัพโหลดเข้า Cloudinary)
async function generateGIF(photoUrls) {
  try {
    // ใช้ขนาดเท่ากับรูปต้นฉบับ (3:2 ratio)
    const width = 900;  // 3:2 ratio
    const height = 600;
    
    const encoder = new GIFEncoder(width, height);
    
    // Prepare frames
    const frames = [];
    for (const photoUrl of photoUrls) {
      // Download photo from Cloudinary
      const response = await fetch(photoUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Resize and convert to raw pixel data (ใช้ cover แทน contain เพื่อไม่ให้มีขอบขาว)
      const { data } = await sharp(buffer)
        .resize(width, height, { 
          fit: 'cover',  // ครอปให้เต็มขนาด ไม่มีขอบขาว
          position: 'center'
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      frames.push(data);
    }
    
    // Create GIF
    encoder.setDelay(800); // 800ms per frame
    encoder.setRepeat(0); // Loop forever
    encoder.setQuality(10);
    
    encoder.start();
    
    for (const frameData of frames) {
      encoder.addFrame(frameData);
    }
    
    encoder.finish();
    
    // Return GIF buffer (ไม่อัพโหลด)
    return encoder.out.getData();
  } catch (error) {
    console.error('GIF generation error:', error);
    return null;
  }
}

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin.html'));
});

app.get('/capture.html', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'capture.html'));
});

app.get('/gallery.html', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'gallery.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Photo Booth Server running on http://localhost:${PORT}`);
  console.log(`📸 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🖼️  Gallery: http://localhost:${PORT}/gallery.html`);
});
