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

// Simple auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== 'Bearer admin-token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// API Routes

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple authentication (in production, use proper password hashing)
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (username === adminUsername && password === adminPassword) {
    res.json({ 
      success: true, 
      token: 'admin-token',
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
    const { frameData, frameName } = req.body;
    
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
    
    const frame = {
      id: frameId,
      name: frameName || `Frame ${event.frames.length + 1}`,
      path: uploadResult.secure_url
    };
    
    event.frames.push(frame);
    await db.updateEvent(event.id, event);
    
    res.json(frame);
  } catch (error) {
    console.error('Frame upload error:', error);
    res.status(500).json({ error: 'Failed to upload frame' });
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

// Save photo set
app.post('/api/events/:id/photos', async (req, res) => {
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
    
    // Upload individual photos to Cloudinary with optimization
    const savedPhotos = [];
    for (let i = 0; i < photos.length; i++) {
      const uploadResult = await cloudinary.uploader.upload(photos[i], {
        folder: photoSetFolder,
        public_id: `photo_${i + 1}`,
        resource_type: 'image',
        quality: 'auto:good',
        fetch_format: 'auto'
      });
      savedPhotos.push(uploadResult.secure_url);
    }
    
    // Generate composite image with frame
    const frame = event.frames.find(f => f.id === frameId);
    let compositePath = null;
    
    if (frame) {
      compositePath = await generateCompositeImage(savedPhotos, frame.path, photoSetFolder);
    }
    
    // Generate GIF
    const gifPath = await generateGIF(savedPhotos, photoSetFolder);
    
    // Save photo set data
    const photoSet = {
      id: photoSetId,
      eventId: event.id,
      fileName,
      photos: savedPhotos,
      composite: compositePath,
      gif: gifPath,
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

// Helper function to generate composite image
async function generateCompositeImage(photoUrls, frameUrl, cloudinaryFolder) {
  try {
    // Canvas size for 2x6 inch at 300 DPI = 600x1800 pixels
    // Each photo is 600x400 (3:2 ratio), with 300px margins top and bottom
    const width = 600;
    const height = 1800;
    const photoHeight = 400; // 3:2 ratio
    const topMargin = 300;
    
    // Download photos from Cloudinary and prepare buffers
    const photoBuffers = [];
    for (let i = 0; i < photoUrls.length; i++) {
      const response = await fetch(photoUrls[i]);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const photoBuffer = await sharp(buffer)
        .resize(width, photoHeight, { 
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
      
      photoBuffers.push({
        input: photoBuffer,
        top: topMargin + (i * photoHeight),
        left: 0
      });
    }
    
    // Download frame from Cloudinary
    const frameResponse = await fetch(frameUrl);
    const frameArrayBuffer = await frameResponse.arrayBuffer();
    const frameBuffer = Buffer.from(frameArrayBuffer);
    
    // Create composite with optimized quality
    const compositeBuffer = await sharp(frameBuffer)
      .resize(width, height)
      .composite(photoBuffers)
      .jpeg({ quality: 85, progressive: true }) // ลดจาก 95 เป็น 85
      .toBuffer();
    
    // Upload composite to Cloudinary with optimization
    const base64Composite = `data:image/jpeg;base64,${compositeBuffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(base64Composite, {
      folder: cloudinaryFolder,
      public_id: 'composite',
      resource_type: 'image',
      quality: 'auto:good',
      fetch_format: 'auto'
    });
    
    return uploadResult.secure_url;
  } catch (error) {
    console.error('Composite generation error:', error);
    return null;
  }
}

// Helper function to generate GIF
async function generateGIF(photoUrls, cloudinaryFolder) {
  try {
    const width = 600;
    const height = 600;
    
    const encoder = new GIFEncoder(width, height);
    
    // Prepare frames
    const frames = [];
    for (const photoUrl of photoUrls) {
      // Download photo from Cloudinary
      const response = await fetch(photoUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Resize and convert to raw pixel data
      const { data } = await sharp(buffer)
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
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
    
    // Get GIF buffer
    const gifBuffer = encoder.out.getData();
    
    // Upload GIF to Cloudinary
    const base64Gif = `data:image/gif;base64,${gifBuffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(base64Gif, {
      folder: cloudinaryFolder,
      public_id: 'animation',
      resource_type: 'image'
    });
    
    return uploadResult.secure_url;
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
