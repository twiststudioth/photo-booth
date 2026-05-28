import { v2 as cloudinary } from 'cloudinary';

// Cloudinary paths for storing JSON data
const CLOUDINARY_FOLDER = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
const EVENTS_FILE = `${CLOUDINARY_FOLDER}/data/events.json`;
const PHOTOS_FILE = `${CLOUDINARY_FOLDER}/data/photos.json`;

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

function getCacheKey(publicId) {
  return publicId;
}

function getFromCache(publicId) {
  const key = getCacheKey(publicId);
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  return null;
}

function setCache(publicId, data) {
  const key = getCacheKey(publicId);
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function invalidateCache(publicId) {
  const key = getCacheKey(publicId);
  cache.delete(key);
}

// Helper functions for Cloudinary storage
async function readFromCloudinary(publicId) {
  // Check cache first
  const cached = getFromCache(publicId);
  if (cached !== null) {
    console.log(`Cache hit for ${publicId}`);
    return cached;
  }
  
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'raw' });
    const response = await fetch(result.secure_url);
    const data = await response.json();
    
    // Store in cache
    setCache(publicId, data);
    
    return data;
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.error && error.error.http_code === 404) {
      const emptyData = [];
      setCache(publicId, emptyData);
      return emptyData;
    }
    
    // Handle rate limit error
    if (error.error && error.error.http_code === 420) {
      console.error('Rate limit exceeded. Using cached data if available.');
      // Return cached data even if expired, or empty array
      const key = getCacheKey(publicId);
      const cached = cache.get(key);
      return cached ? cached.data : [];
    }
    
    console.error('Error reading from Cloudinary:', error);
    return [];
  }
}

async function writeToCloudinary(publicId, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonString);
    const base64Data = `data:application/json;base64,${buffer.toString('base64')}`;
    
    await cloudinary.uploader.upload(base64Data, {
      public_id: publicId,
      resource_type: 'raw',
      overwrite: true
    });
    
    // Update cache after successful write
    setCache(publicId, data);
  } catch (error) {
    console.error('Error writing to Cloudinary:', error);
    throw error;
  }
}

// Helper functions for events
export async function getAllEvents() {
  try {
    return await readFromCloudinary(EVENTS_FILE);
  } catch (error) {
    console.error('Error getting events:', error);
    return [];
  }
}

export async function getEventById(id) {
  try {
    const events = await getAllEvents();
    return events.find(e => e.id === id) || null;
  } catch (error) {
    console.error('Error getting event:', error);
    return null;
  }
}

export async function createEvent(event) {
  try {
    const events = await getAllEvents();
    events.push(event);
    await writeToCloudinary(EVENTS_FILE, events);
    return event;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

export async function updateEvent(id, updates) {
  try {
    const events = await getAllEvents();
    const index = events.findIndex(e => e.id === id);
    
    if (index === -1) {
      return null;
    }
    
    events[index] = { ...events[index], ...updates, id };
    await writeToCloudinary(EVENTS_FILE, events);
    return events[index];
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

export async function deleteEvent(id) {
  try {
    const events = await getAllEvents();
    const filtered = events.filter(e => e.id !== id);
    await writeToCloudinary(EVENTS_FILE, filtered);
    return true;
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

// Helper functions for photos
export async function getAllPhotos() {
  try {
    return await readFromCloudinary(PHOTOS_FILE);
  } catch (error) {
    console.error('Error getting photos:', error);
    return [];
  }
}

export async function getPhotosByEventId(eventId) {
  try {
    const photos = await getAllPhotos();
    return photos.filter(p => p.eventId === eventId);
  } catch (error) {
    console.error('Error getting photos by event:', error);
    return [];
  }
}

export async function createPhoto(photo) {
  try {
    const photos = await getAllPhotos();
    photos.push(photo);
    await writeToCloudinary(PHOTOS_FILE, photos);
    return photo;
  } catch (error) {
    console.error('Error creating photo:', error);
    throw error;
  }
}

export async function deletePhoto(id) {
  try {
    const photos = await getAllPhotos();
    const filtered = photos.filter(p => p.id !== id);
    await writeToCloudinary(PHOTOS_FILE, filtered);
    return true;
  } catch (error) {
    console.error('Error deleting photo:', error);
    throw error;
  }
}

export async function getPhotoById(id) {
  try {
    const photos = await getAllPhotos();
    return photos.find(p => p.id === id) || null;
  } catch (error) {
    console.error('Error getting photo:', error);
    return null;
  }
}




