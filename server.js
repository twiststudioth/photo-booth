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
      connectSrc: ["'self'", "https://res.cloudinary.com"]
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

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
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
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid credentials' 
    });
  }
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
    
    // Delete frame from Cloudinary
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    try {
      await cloudinary.uploader.destroy(`${cloudinaryFolder}/frames/${req.params.frameId}`);
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

// Save photo set (admin only)
app.post('/api/events/:id/photos', authMiddleware, async (req, res) => {
  try {
    const { photos, frameId } = req.body;
    
    if (!photos || photos.length !== 3) {
      return res.status(400).json({ error: 'Must provide exactly 3 photos' });
    }
    
    const event = await db.getEventById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Increment counter
    event.photoCounter++;
    const photoSetId = uuidv4();
    const fileName = `${event.filePrefix}_${String(event.photoCounter).padStart(4, '0')}`;
    
    const cloudinaryFolder = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
    const photoSetFolder = `${cloudinaryFolder}/photos/${photoSetId}`;
    
    // Upload individual photos to Cloudinary with high quality
    const savedPhotos = [];
    for (let i = 0; i < photos.length; i++) {
      const uploadResult = await cloudinary.uploader.upload(photos[i], {
        folder: photoSetFolder,
        public_id: `photo_${i + 1}`,
        resource_type: 'image',
        quality: 'auto:best', // คุณภาพสูงสุดสำหรับภาพขนาดใหญ่
        fetch_format: 'auto'
      });
      savedPhotos.push(uploadResult.secure_url);
    }
    
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
    
    // Save photo set data
    const photoSet = {
      id: photoSetId,
      eventId: event.id,
      fileName,
      photos: savedPhotos,
      composite: compositePath,
      gif: null, // ไม่เก็บ GIF ไว้ล่วงหน้า
      frameId,
      createdAt: new Date().toISOString()
    };
    
    await db.createPhoto(photoSet);
    
    // Update event counter
    await db.updateEvent(event.id, { photoCounter: event.photoCounter });
    
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
      .jpeg({ quality: 95, progressive: true })
      .toBuffer();
    
    // Upload composite to Cloudinary with high quality
    const base64Composite = `data:image/jpeg;base64,${compositeBuffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(base64Composite, {
      folder: cloudinaryFolder,
      public_id: 'composite',
      resource_type: 'image',
      quality: 'auto:best',
      fetch_format: 'auto'
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
