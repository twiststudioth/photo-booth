// Capture Page JavaScript

// Check authentication first
const authToken = localStorage.getItem('authToken');
if (!authToken) {
  alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
  window.location.href = '/admin.html';
}

let eventId = null;
let eventData = null;
let stream = null;
let capturedPhotos = [];
let currentPhotoIndex = 0;
let selectedFrameId = null;
// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const captureScreen = document.getElementById('captureScreen');
const frameSelectionScreen = document.getElementById('frameSelectionScreen');
const successScreen = document.getElementById('successScreen');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cameraSelect = document.getElementById('cameraSelect');
const captureBtn = document.getElementById('captureBtn');
const previewContainer = document.getElementById('previewContainer');
const preview = document.getElementById('preview');
const retakeBtn = document.getElementById('retakeBtn');
const nextBtn = document.getElementById('nextBtn');
const thumbnails = document.getElementById('thumbnails');
const currentPhotoSpan = document.getElementById('currentPhoto');

// Initialize
async function init() {
  // Get event ID from URL
  const params = new URLSearchParams(window.location.search);
  eventId = params.get('event');
  
  if (!eventId) {
    alert('ไม่พบข้อมูลอีเว้นท์');
    window.location.href = '/';
    return;
  }
  
  try {
    // Load event data
    const response = await fetch(`/api/events/${eventId}`);
    if (!response.ok) {
      throw new Error('Event not found');
    }
    
    eventData = await response.json();
    document.getElementById('eventTitle').textContent = eventData.name;
    
    // Initialize camera
    await initCamera();
    
    loadingScreen.style.display = 'none';
    captureScreen.style.display = 'block';
  } catch (error) {
    console.error('Initialization error:', error);
    alert('ไม่สามารถโหลดข้อมูลอีเว้นท์ได้');
    window.location.href = '/';
  }
}

// Initialize camera
async function initCamera() {
  try {
    // Get available cameras
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    // Populate camera select
    cameraSelect.innerHTML = '';
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `กล้อง ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    
    // Get last selected camera from localStorage
    const lastSelectedCamera = localStorage.getItem('selectedCamera');
    let selectedDevice = null;
    
    if (lastSelectedCamera && videoDevices.find(d => d.deviceId === lastSelectedCamera)) {
      // Use last selected camera
      selectedDevice = lastSelectedCamera;
      cameraSelect.value = lastSelectedCamera;
    } else if (videoDevices.length > 0) {
      // Use first camera
      selectedDevice = videoDevices[0].deviceId;
    }
    
    // Start camera
    if (selectedDevice) {
      await startCamera(selectedDevice);
    }
  } catch (error) {
    console.error('Camera initialization error:', error);
    alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้อง');
  }
}

// Start camera
async function startCamera(deviceId) {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Target aspect ratio for 3:2 (600x400 per photo)
    const targetAspectRatio = 3 / 2; // 1.5
    
    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: targetAspectRatio }
      }
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // Apply CSS to maintain aspect ratio
    video.style.aspectRatio = '3/2';
    video.style.objectFit = 'cover';
  } catch (error) {
    console.error('Camera start error:', error);
    alert('ไม่สามารถเปิดกล้องได้');
  }
}

// Camera select change
cameraSelect.addEventListener('change', (e) => {
  const deviceId = e.target.value;
  startCamera(deviceId);
  // Save selected camera to localStorage
  localStorage.setItem('selectedCamera', deviceId);
});

// Capture photo with countdown
captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  const countdownEl = document.getElementById('countdown');
  const countdownNumber = countdownEl.querySelector('.countdown-number');
  
  // Show countdown
  countdownEl.style.display = 'flex';
  
  // Countdown from 3 to 1
  for (let i = 3; i > 0; i--) {
    countdownNumber.textContent = i;
    countdownNumber.style.animation = 'none';
    
    // Trigger reflow to restart animation
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = 'countdownPulse 1s ease-in-out';
    
    // Play beep sound (optional)
    playBeep(i === 1 ? 800 : 600);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Take photo
  countdownEl.style.display = 'none';
  
  const context = canvas.getContext('2d');
  
  // Set canvas to 3:2 aspect ratio (600x400 for each photo)
  const targetWidth = 600;
  const targetHeight = 400;
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  // Calculate crop to maintain 3:2 aspect ratio
  const videoAspectRatio = video.videoWidth / video.videoHeight;
  const targetAspectRatio = targetWidth / targetHeight; // 3:2 = 1.5
  
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  
  if (videoAspectRatio > targetAspectRatio) {
    // Video is wider, crop sides
    sourceWidth = video.videoHeight * targetAspectRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    // Video is taller, crop top/bottom
    sourceHeight = video.videoWidth / targetAspectRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }
  
  // Draw cropped and scaled image
  context.drawImage(
    video,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, targetWidth, targetHeight
  );
  
  // Play shutter sound
  playBeep(1000, 100);
  
  const photoData = canvas.toDataURL('image/jpeg', 0.95);
  capturedPhotos[currentPhotoIndex] = photoData;
  
  // Show preview
  preview.src = photoData;
  video.style.display = 'none';
  document.getElementById('cameraControls').style.display = 'none';
  document.getElementById('captureActions').style.display = 'none';
  previewContainer.style.display = 'block';
  
  updateThumbnails();
  captureBtn.disabled = false;
});

// Play beep sound
function playBeep(frequency = 600, duration = 200) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch (error) {
    // Ignore audio errors
  }
}

// Retake photo
retakeBtn.addEventListener('click', () => {
  video.style.display = 'block';
  document.getElementById('cameraControls').style.display = 'block';
  document.getElementById('captureActions').style.display = 'flex';
  previewContainer.style.display = 'none';
});

// Next photo
nextBtn.addEventListener('click', () => {
  currentPhotoIndex++;
  
  if (currentPhotoIndex >= 3) {
    // All photos captured, show frame selection
    showFrameSelection();
  } else {
    // Continue to next photo
    currentPhotoSpan.textContent = currentPhotoIndex + 1;
    video.style.display = 'block';
    document.getElementById('cameraControls').style.display = 'block';
    document.getElementById('captureActions').style.display = 'flex';
    previewContainer.style.display = 'none';
  }
});

// Update thumbnails
function updateThumbnails() {
  thumbnails.innerHTML = '';
  
  for (let i = 0; i < 3; i++) {
    const thumb = document.createElement('img');
    thumb.className = 'thumbnail';
    
    if (capturedPhotos[i]) {
      thumb.src = capturedPhotos[i];
      thumb.classList.add('active');
    } else {
      thumb.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 67"%3E%3Crect fill="%23e2e8f0" width="100" height="67"/%3E%3Ctext x="50" y="34" text-anchor="middle" dy=".3em" fill="%2364748b" font-size="30"%3E' + (i + 1) + '%3C/text%3E%3C/svg%3E';
    }
    
    thumbnails.appendChild(thumb);
  }
}

// Show frame selection
function showFrameSelection() {
  captureScreen.style.display = 'none';
  frameSelectionScreen.style.display = 'block';
  
  // Stop camera
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  // Load frames with previews
  const framesGrid = document.getElementById('framesGridWithPreview');
  framesGrid.innerHTML = '';
  
  if (!eventData.frames || eventData.frames.length === 0) {
    framesGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1;">ไม่มีกรอบให้เลือก</p>';
    return;
  }
  
  // Generate preview for each frame
  eventData.frames.forEach((frame, index) => {
    const card = document.createElement('div');
    card.className = 'frame-preview-card';
    card.dataset.frameId = frame.id;
    
    const canvas = document.createElement('canvas');
    canvas.className = 'frame-preview-canvas';
    canvas.width = 300;
    canvas.height = 900;
    
    const label = document.createElement('div');
    label.className = 'frame-preview-label';
    label.textContent = `กรอบที่ ${index + 1}`;
    
    card.appendChild(canvas);
    card.appendChild(label);
    
    card.addEventListener('click', () => selectFrameCard(frame.id, card));
    
    framesGrid.appendChild(card);
    
    // Generate preview
    generateFramePreview(frame, canvas);
  });
  
  // Select first frame by default
  if (eventData.frames.length > 0) {
    const firstCard = framesGrid.firstChild;
    selectFrameCard(eventData.frames[0].id, firstCard);
  }
}

// Generate frame preview
async function generateFramePreview(frame, canvas) {
  const ctx = canvas.getContext('2d');
  
  // Load frame image from Cloudinary
  const frameImg = new Image();
  frameImg.crossOrigin = 'anonymous';
  frameImg.src = frame.path;
  
  await new Promise((resolve, reject) => {
    frameImg.onload = resolve;
    frameImg.onerror = reject;
  });
  
  // Draw frame
  ctx.drawImage(frameImg, 0, 0, 300, 900);
  
  // Photo dimensions: 3:2 ratio (300x200 for preview)
  const photoHeight = 200; // 3:2 ratio scaled down
  const photoWidth = 300;
  const topMargin = 150; // Scaled margin
  
  // Draw photos (already in 3:2 ratio, just scale down)
  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = new Image();
    img.src = capturedPhotos[i];
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    
    const y = topMargin + (i * photoHeight);
    
    // Draw image to fill the area (cover fit)
    ctx.drawImage(img, 0, y, photoWidth, photoHeight);
  }
}

// Select frame card
function selectFrameCard(frameId, card) {
  selectedFrameId = frameId;
  
  // Update UI
  document.querySelectorAll('.frame-preview-card').forEach(el => {
    el.classList.remove('selected');
  });
  card.classList.add('selected');
}

// Back to photos
document.getElementById('backToPhotosBtn').addEventListener('click', () => {
  if (confirm('ต้องการถ่ายรูปใหม่หรือไม่? รูปที่ถ่ายไว้จะถูกลบ')) {
    // Clear all data
    capturedPhotos = [];
    currentPhotoIndex = 0;
    selectedFrameId = null;
    
    // Reset save button
    const saveBtn = document.getElementById('savePhotosBtn');
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'บันทึกรูป';
    
    // Reset UI
    frameSelectionScreen.style.display = 'none';
    captureScreen.style.display = 'block';
    currentPhotoSpan.textContent = '1';
    
    // Reset to camera view
    video.style.display = 'block';
    document.getElementById('cameraControls').style.display = 'block';
    document.getElementById('captureActions').style.display = 'flex';
    previewContainer.style.display = 'none';
    
    // Update thumbnails
    updateThumbnails();
    
    // Restart camera
    initCamera();
  }
});

// Save photos
document.getElementById('savePhotosBtn').addEventListener('click', async () => {
  if (!selectedFrameId) {
    alert('กรุณาเลือกกรอบรูป');
    return;
  }
  
  const saveBtn = document.getElementById('savePhotosBtn');
  const originalText = saveBtn.innerHTML;
  
  try {
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'กำลังเตรียมพิมพ์...';
    
    // Generate composite locally first for immediate printing
    const frame = eventData.frames.find(f => f.id === selectedFrameId);
    if (frame) {
      const localComposite = await generateLocalComposite(capturedPhotos, frame.path);
      
      // Print immediately
      printPhoto(localComposite);
      
      // Show success and start background upload
      showSuccess();
      saveBtn.innerHTML = 'กำลังบันทึก...';
      
      // Upload in background (don't await)
      uploadPhotosInBackground(capturedPhotos, selectedFrameId);
    } else {
      throw new Error('Frame not found');
    }
  } catch (error) {
    console.error('Save error:', error);
    alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
});

// Generate composite locally for immediate printing
async function generateLocalComposite(photos, frameUrl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Print canvas size: 4x6 inch at 300 DPI = 1200x1800
    // Two composites side by side: each 600x1800
    canvas.width = 1200;
    canvas.height = 1800;
    
    const photoHeight = 400; // 3:2 ratio
    const topMargin = 300;
    
    // Load frame
    const frameImg = new Image();
    frameImg.crossOrigin = 'anonymous';
    frameImg.onload = async () => {
      // Draw first composite (left side)
      ctx.drawImage(frameImg, 0, 0, 600, 1800);
      
      // Draw photos on left side
      for (let i = 0; i < photos.length; i++) {
        const img = new Image();
        img.src = photos[i];
        
        await new Promise((resolveImg) => {
          img.onload = () => {
            const y = topMargin + (i * photoHeight);
            ctx.drawImage(img, 0, y, 600, photoHeight);
            resolveImg();
          };
        });
      }
      
      // Draw second composite (right side) - duplicate
      ctx.drawImage(frameImg, 600, 0, 600, 1800);
      
      // Draw photos on right side
      for (let i = 0; i < photos.length; i++) {
        const img = new Image();
        img.src = photos[i];
        
        await new Promise((resolveImg) => {
          img.onload = () => {
            const y = topMargin + (i * photoHeight);
            ctx.drawImage(img, 600, y, 600, photoHeight);
            resolveImg();
          };
        });
      }
      
      // Return as data URL
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    
    frameImg.onerror = reject;
    frameImg.src = frameUrl;
  });
}

// Upload photos in background
async function uploadPhotosInBackground(photos, frameId) {
  const statusText = document.getElementById('statusText');
  const statusIcon = document.getElementById('statusIcon');
  const statusDescription = document.getElementById('statusDescription');
  const statusNote = document.getElementById('statusNote');
  
  try {
    statusText.textContent = 'กำลังอัพโหลด...';
    
    const response = await fetch(`/api/events/${eventId}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        photos: photos,
        frameId: frameId
      })
    });
    
    if (response.ok) {
      console.log('Photos uploaded successfully in background');
      // แสดงสถานะสำเร็จ
      statusIcon.textContent = '✓';
      statusIcon.style.background = 'var(--success)';
      statusText.textContent = 'บันทึกสำเร็จ!';
      statusText.style.color = 'var(--text-primary)';
      statusDescription.style.display = 'block';
      statusNote.style.display = 'block';
    } else {
      console.error('Background upload failed');
      // แสดงสถานะล้มเหลว
      statusIcon.textContent = '✕';
      statusIcon.style.background = '#ef4444';
      statusText.textContent = 'อัพโหลดไม่สำเร็จ';
      statusText.style.color = '#ef4444';
      statusDescription.style.display = 'none';
      statusNote.style.display = 'none';
    }
  } catch (error) {
    console.error('Background upload error:', error);
    // แสดงสถานะล้มเหลว
    statusIcon.textContent = '✕';
    statusIcon.style.background = '#ef4444';
    statusText.textContent = 'อัพโหลดไม่สำเร็จ';
    statusText.style.color = '#ef4444';
    statusDescription.style.display = 'none';
    statusNote.style.display = 'none';
  }
}

// Show success
function showSuccess() {
  frameSelectionScreen.style.display = 'none';
  successScreen.style.display = 'block';
}

// View gallery
document.getElementById('viewGalleryBtn').addEventListener('click', () => {
  window.location.href = `/gallery.html?event=${eventId}`;
});

// Take more photos
document.getElementById('takeMoreBtn').addEventListener('click', () => {
  // Clear all data
  capturedPhotos = [];
  currentPhotoIndex = 0;
  selectedFrameId = null;
  
  // Reset save button
  const saveBtn = document.getElementById('savePhotosBtn');
  saveBtn.disabled = false;
  saveBtn.innerHTML = 'บันทึกรูป';
  
  // Reset UI
  successScreen.style.display = 'none';
  captureScreen.style.display = 'block';
  currentPhotoSpan.textContent = '1';
  
  // Reset to camera view
  video.style.display = 'block';
  document.getElementById('cameraControls').style.display = 'block';
  document.getElementById('captureActions').style.display = 'flex';
  previewContainer.style.display = 'none';
  
  // Update thumbnails
  updateThumbnails();
  
  // Restart camera
  initCamera();
});

// Initialize on load
init();
updateThumbnails();

// Print photo function
function printPhoto(compositeDataUrl) {
  // Create a hidden iframe for printing
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = 'none';
  document.body.appendChild(printFrame);
  
  // Write print content to iframe
  const printDocument = printFrame.contentWindow.document;
  printDocument.open();
  printDocument.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Print Photo</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0;
        }
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          width: 4in;
          height: 6in;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        
        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
      </style>
    </head>
    <body>
      <img src="${compositeDataUrl}" alt="Photo" id="printImg">
    </body>
    </html>
  `);
  printDocument.close();
  
  // Wait for image to load, then print
  const img = printFrame.contentWindow.document.getElementById('printImg');
  img.addEventListener('load', () => {
    setTimeout(() => {
      printFrame.contentWindow.print();
    }, 100);
  });
  
  // Remove iframe after printing
  printFrame.contentWindow.addEventListener('afterprint', () => {
    setTimeout(() => {
      document.body.removeChild(printFrame);
    }, 100);
  });
}
