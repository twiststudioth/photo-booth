import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import sharp from 'sharp';
import GIFEncoder from 'gif-encoder-2';

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
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"]
    }
  }
}));

// Performance middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const ensureDirectories = async () => {
  const dirs = ['uploads', 'uploads/frames', 'uploads/photos', 'data'];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
  
  // Initialize data files
  if (!existsSync('data/events.json')) {
    await fs.writeFile('data/events.json', JSON.stringify([]));
  }
  if (!existsSync('data/photos.json')) {
    await fs.writeFile('data/photos.json', JSON.stringify([]));
  }
};

// Helper functions
const readJSON = async (filename) => {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeJSON = async (filename, data) => {
  await fs.writeFile(filename, JSON.stringify(data, null, 2));
};

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
    const events = await readJSON('data/events.json');
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event
app.get('/api/events/:id', async (req, res) => {
  try {
    const events = await readJSON('data/events.json');
    const event = events.find(e => e.id === req.params.id);
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
    const events = await readJSON('data/events.json');
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
    
    events.push(newEvent);
    await writeJSON('data/events.json', events);
    
    res.json(newEvent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (admin only)
app.put('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const events = await readJSON('data/events.json');
    const index = events.findIndex(e => e.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    events[index] = { ...events[index], ...req.body, id: req.params.id };
    await writeJSON('data/events.json', events);
    
    res.json(events[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event (admin only)
app.delete('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const events = await readJSON('data/events.json');
    const filtered = events.filter(e => e.id !== req.params.id);
    await writeJSON('data/events.json', filtered);
    
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
    
    const events = await readJSON('data/events.json');
    const event = events.find(e => e.id === req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Save frame image
    const frameId = uuidv4();
    const base64Data = frameData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const framePath = `uploads/frames/${frameId}.png`;
    
    await fs.writeFile(framePath, buffer);
    
    const frame = {
      id: frameId,
      name: frameName || `Frame ${event.frames.length + 1}`,
      path: `/${framePath}`
    };
    
    event.frames.push(frame);
    await writeJSON('data/events.json', events);
    
    res.json(frame);
  } catch (error) {
    console.error('Frame upload error:', error);
    res.status(500).json({ error: 'Failed to upload frame' });
  }
});

// Delete frame (admin only)
app.delete('/api/events/:eventId/frames/:frameId', authMiddleware, async (req, res) => {
  try {
    const events = await readJSON('data/events.json');
    const event = events.find(e => e.id === req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Find and remove frame
    const frameIndex = event.frames.findIndex(f => f.id === req.params.frameId);
    if (frameIndex === -1) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    
    // Delete frame file
    const frame = event.frames[frameIndex];
    const framePath = '.' + frame.path;
    try {
      await fs.unlink(framePath);
    } catch (error) {
      console.error('Failed to delete frame file:', error);
    }
    
    // Remove from array
    event.frames.splice(frameIndex, 1);
    await writeJSON('data/events.json', events);
    
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
    
    const events = await readJSON('data/events.json');
    const event = events.find(e => e.id === req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Increment counter
    event.photoCounter++;
    const photoSetId = uuidv4();
    const fileName = `${event.filePrefix}_${String(event.photoCounter).padStart(4, '0')}`;
    
    // Create folder for this photo set
    const setFolder = `uploads/photos/${photoSetId}`;
    await fs.mkdir(setFolder, { recursive: true });
    
    // Save individual photos
    const savedPhotos = [];
    for (let i = 0; i < photos.length; i++) {
      const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const photoPath = `${setFolder}/photo_${i + 1}.jpg`;
      await fs.writeFile(photoPath, buffer);
      savedPhotos.push(`/${photoPath}`);
    }
    
    // Generate composite image with frame
    const frame = event.frames.find(f => f.id === frameId);
    let compositePath = null;
    
    if (frame) {
      compositePath = await generateCompositeImage(savedPhotos, frame.path, setFolder);
    }
    
    // Generate GIF
    const gifPath = await generateGIF(savedPhotos, setFolder);
    
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
    
    const allPhotos = await readJSON('data/photos.json');
    allPhotos.push(photoSet);
    await writeJSON('data/photos.json', allPhotos);
    
    // Update event
    await writeJSON('data/events.json', events);
    
    res.json(photoSet);
  } catch (error) {
    console.error('Photo save error:', error);
    res.status(500).json({ error: 'Failed to save photos' });
  }
});

// Get photos for an event
app.get('/api/events/:id/photos', async (req, res) => {
  try {
    const allPhotos = await readJSON('data/photos.json');
    const eventPhotos = allPhotos.filter(p => p.eventId === req.params.id);
    res.json(eventPhotos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Delete photo set (admin only)
app.delete('/api/photos/:id', authMiddleware, async (req, res) => {
  try {
    const allPhotos = await readJSON('data/photos.json');
    const photoSet = allPhotos.find(p => p.id === req.params.id);
    
    if (photoSet) {
      // Delete files
      const setFolder = `uploads/photos/${photoSet.id}`;
      await fs.rm(setFolder, { recursive: true, force: true });
    }
    
    const filtered = allPhotos.filter(p => p.id !== req.params.id);
    await writeJSON('data/photos.json', filtered);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo set' });
  }
});

// Helper function to generate composite image
async function generateCompositeImage(photoPaths, framePath, outputFolder) {
  try {
    // Canvas size for 2x6 inch at 300 DPI = 600x1800 pixels
    // Each photo is 600x400 (3:2 ratio), with 300px margins top and bottom
    const width = 600;
    const height = 1800;
    const photoHeight = 400; // 3:2 ratio
    const topMargin = 300;
    
    // Load and place photos (already cropped to 3:2 ratio)
    const photoBuffers = [];
    for (let i = 0; i < photoPaths.length; i++) {
      const photoBuffer = await sharp('.' + photoPaths[i])
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
    
    // Load frame and composite
    const compositePath = `${outputFolder}/composite.jpg`;
    
    await sharp('.' + framePath)
      .resize(width, height)
      .composite(photoBuffers)
      .jpeg({ quality: 95 })
      .toFile(compositePath);
    
    return `/${compositePath}`;
  } catch (error) {
    console.error('Composite generation error:', error);
    return null;
  }
}

// Helper function to generate GIF
async function generateGIF(photoPaths, outputFolder) {
  try {
    const width = 600;
    const height = 600;
    
    const gifPath = `${outputFolder}/animation.gif`;
    const encoder = new GIFEncoder(width, height);
    
    // Prepare frames
    const frames = [];
    for (const photoPath of photoPaths) {
      // Resize and convert to raw pixel data
      const { data, info } = await sharp('.' + photoPath)
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
    
    // Write to file
    const buffer = encoder.out.getData();
    await fs.writeFile(gifPath, buffer);
    
    return `/${gifPath}`;
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
await ensureDirectories();

app.listen(PORT, () => {
  console.log(`🚀 Photo Booth Server running on http://localhost:${PORT}`);
  console.log(`📸 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🖼️  Gallery: http://localhost:${PORT}/gallery.html`);
});
