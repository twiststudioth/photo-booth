// Capture Page JavaScript

// Get auth token from URL parameter or localStorage
const urlParams = new URLSearchParams(window.location.search);
const authToken = urlParams.get('token') || localStorage.getItem('authToken');

// Check authentication
if (!authToken) {
  alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
  window.location.href = '/admin.html';
}

// Store token in localStorage for future use
if (authToken && !localStorage.getItem('authToken')) {
  localStorage.setItem('authToken', authToken);
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
    // Get last facing mode preference
    const lastFacingMode = localStorage.getItem('facingMode') || 'environment';
    
    // Start camera with facing mode (works better on mobile)
    await startCamera(null, lastFacingMode);
    
    // Get available cameras after starting
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
    
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Show/hide controls based on device
    const flipBtn = document.getElementById('flipCameraBtn');
    if (flipBtn) {
      // Always show flip button on mobile, or when multiple cameras detected
      if (isMobile || videoDevices.length > 1) {
        flipBtn.style.display = 'block';
      } else {
        flipBtn.style.display = 'none';
      }
    }
    
    // Hide camera select on mobile (use flip button instead)
    if (isMobile) {
      cameraSelect.style.display = 'none';
    }
  } catch (error) {
    console.error('Camera initialization error:', error);
    alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้อง');
  }
}

// Start camera
async function startCamera(deviceId, facingMode = 'environment') {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Target aspect ratio for 3:2 (600x400 per photo)
    const targetAspectRatio = 3 / 2; // 1.5
    
    // Build constraints with mobile support
    const constraints = {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: targetAspectRatio }
      }
    };
    
    // Prioritize deviceId if provided, otherwise use facingMode for mobile
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else {
      constraints.video.facingMode = { ideal: facingMode };
    }
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // Apply CSS to maintain aspect ratio
    video.style.aspectRatio = '3/2';
    video.style.objectFit = 'cover';
    
    // Store current facing mode
    localStorage.setItem('facingMode', facingMode);
    
    console.log('Camera started with facingMode:', facingMode);
  } catch (error) {
    console.error('Camera start error:', error);
    alert('ไม่สามารถเปิดกล้องได้');
  }
}

// Camera select change
cameraSelect.addEventListener('change', (e) => {
  const deviceId = e.target.value;
  startCamera(deviceId, null);
  // Save selected camera to localStorage
  localStorage.setItem('selectedCamera', deviceId);
});

// Flip camera button (for mobile)
const flipCameraBtn = document.getElementById('flipCameraBtn');
if (flipCameraBtn) {
  flipCameraBtn.addEventListener('click', async () => {
    const currentFacingMode = localStorage.getItem('facingMode') || 'user';
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
      await startCamera(null, newFacingMode);
    } catch (error) {
      console.error('Failed to flip camera:', error);
      alert('ไม่สามารถสลับกล้องได้');
    }
  });
}

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
  
  // Set canvas to 3:2 aspect ratio (2400x1600 for each photo)
  const targetWidth = 2400;
  const targetHeight = 1600;
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
  
  // Load overlay image (if exists)
  let overlayImg = null;
  if (frame.overlayPath) {
    overlayImg = new Image();
    overlayImg.crossOrigin = 'anonymous';
    overlayImg.src = frame.overlayPath;
    
    await new Promise((resolve) => {
      overlayImg.onload = resolve;
      overlayImg.onerror = () => resolve(); // Continue even if overlay fails
    });
  }
  
  // Photo dimensions scaled down 8x
  const photoWidth = 275;  // 2200 / 8
  const photoHeight = 183; // 1467 / 8 (rounded)
  const sideMargin = 13;   // 100 / 8 (rounded, centered)
  const photoSpacing = 8;  // 67 / 8 (rounded)
  
  // Calculate total photos height and center vertically
  const totalPhotosHeight = (photoHeight * 3) + (photoSpacing * 2);
  const topMargin = (900 - totalPhotosHeight) / 2;  // Equal top and bottom margins
  
  // Clear canvas first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // LAYER 1: Draw frame as background
  ctx.drawImage(frameImg, 0, 0, 300, 900);
  
  // LAYER 2: Draw photos (ALWAYS VISIBLE)
  ctx.save();
  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = new Image();
    img.src = capturedPhotos[i];
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    
    const y = topMargin + (i * (photoHeight + photoSpacing));
    ctx.drawImage(img, sideMargin, y, photoWidth, photoHeight);
  }
  ctx.restore();
  
  // LAYER 3: Draw overlay on top (if exists)
  if (overlayImg) {
    ctx.drawImage(overlayImg, 0, 0, 300, 900);
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
      const localComposite = await generateLocalComposite(capturedPhotos, frame.path, frame.overlayPath);
      
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
async function generateLocalComposite(photos, frameUrl, overlayUrl) {
  return new Promise(async (resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Print canvas size: 4x6 inch at 600 DPI = 4800x7200
    // Two composites side by side: each 2400x7200
    canvas.width = 4800;
    canvas.height = 7200;
    
    const photoWidth = 2200;  // Centered with 100px margins on each side
    const photoHeight = 1467; // 3:2 ratio
    const sideMargin = 100;   // Center horizontally
    const photoSpacing = 67;  // Reduced spacing between photos
    
    // Calculate total photos height and center vertically
    const totalPhotosHeight = (photoHeight * 3) + (photoSpacing * 2);
    const topMargin = (7200 - totalPhotosHeight) / 2;  // Equal top and bottom margins
    
    // Load frame
    const frameImg = new Image();
    frameImg.crossOrigin = 'anonymous';
    
    // Load overlay (if exists)
    let overlayImg = null;
    if (overlayUrl) {
      overlayImg = new Image();
      overlayImg.crossOrigin = 'anonymous';
      overlayImg.src = overlayUrl;
      await new Promise((res) => {
        overlayImg.onload = res;
        overlayImg.onerror = () => res(); // Continue even if overlay fails
      });
    }
    frameImg.onload = async () => {
      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // === LEFT SIDE ===
      // LAYER 1: Draw frame as background
      ctx.drawImage(frameImg, 0, 0, 2400, 7200);
      
      // LAYER 2: Draw photos (ALWAYS VISIBLE)
      ctx.save();
      for (let i = 0; i < photos.length; i++) {
        const img = new Image();
        img.src = photos[i];
        
        await new Promise((resolveImg) => {
          img.onload = () => {
            const y = topMargin + (i * (photoHeight + photoSpacing));
            ctx.drawImage(img, sideMargin, y, photoWidth, photoHeight);
            resolveImg();
          };
        });
      }
      ctx.restore();
      
      // LAYER 3: Draw overlay (if exists) - left side
      if (overlayImg) {
        ctx.drawImage(overlayImg, 0, 0, 2400, 7200);
      }
      
      // === RIGHT SIDE ===
      // LAYER 1: Draw frame as background
      ctx.drawImage(frameImg, 2400, 0, 2400, 7200);
      
      // LAYER 2: Draw photos (ALWAYS VISIBLE)
      ctx.save();
      for (let i = 0; i < photos.length; i++) {
        const img = new Image();
        img.src = photos[i];
        
        await new Promise((resolveImg) => {
          img.onload = () => {
            const y = topMargin + (i * (photoHeight + photoSpacing));
            ctx.drawImage(img, 2400 + sideMargin, y, photoWidth, photoHeight);
            resolveImg();
          };
        });
      }
      ctx.restore();
      
      // LAYER 3: Draw overlay (if exists) - right side
      if (overlayImg) {
        ctx.drawImage(overlayImg, 2400, 0, 2400, 7200);
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

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }
  
  // Get current screen
  const isCaptureScreen = captureScreen.style.display !== 'none';
  const isFrameScreen = frameSelectionScreen.style.display !== 'none';
  const isSuccessScreen = successScreen.style.display !== 'none';
  
  // === CAPTURE SCREEN ===
  if (isCaptureScreen) {
    // Space or Enter: Capture photo (if camera is visible)
    if ((e.code === 'Space' || e.code === 'Enter') && video.style.display !== 'none') {
      e.preventDefault();
      if (!captureBtn.disabled) {
        captureBtn.click();
      }
    }
    
    // R: Retake photo (if preview is visible)
    if (e.code === 'KeyR' && previewContainer.style.display !== 'none') {
      e.preventDefault();
      retakeBtn.click();
    }
    
    // N or Enter: Next photo (if preview is visible)
    if ((e.code === 'KeyN' || e.code === 'Enter') && previewContainer.style.display !== 'none') {
      e.preventDefault();
      nextBtn.click();
    }
    
    // C: Switch camera (if camera select is visible)
    if (e.code === 'KeyC' && cameraSelect.style.display !== 'none') {
      e.preventDefault();
      const options = cameraSelect.options;
      const currentIndex = cameraSelect.selectedIndex;
      const nextIndex = (currentIndex + 1) % options.length;
      cameraSelect.selectedIndex = nextIndex;
      cameraSelect.dispatchEvent(new Event('change'));
    }
    
    // F: Flip camera (mobile)
    if (e.code === 'KeyF') {
      e.preventDefault();
      const flipBtn = document.getElementById('flipCameraBtn');
      if (flipBtn && flipBtn.style.display !== 'none') {
        flipBtn.click();
      }
    }
  }
  
  // === FRAME SELECTION SCREEN ===
  if (isFrameScreen) {
    // Arrow keys: Navigate frames
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      e.preventDefault();
      navigateFrames(-1);
    }
    
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
      e.preventDefault();
      navigateFrames(1);
    }
    
    // Enter or S: Save photos
    if (e.code === 'Enter' || e.code === 'KeyS') {
      e.preventDefault();
      const saveBtn = document.getElementById('savePhotosBtn');
      if (!saveBtn.disabled) {
        saveBtn.click();
      }
    }
    
    // B or Escape: Back to photos
    if (e.code === 'KeyB' || e.code === 'Escape') {
      e.preventDefault();
      document.getElementById('backToPhotosBtn').click();
    }
    
    // Number keys 1-9: Select frame directly
    if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
      const num = parseInt(e.code.replace('Digit', '').replace('Numpad', ''));
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        selectFrameByIndex(num - 1);
      }
    }
  }
  
  // === SUCCESS SCREEN ===
  if (isSuccessScreen) {
    // G: View gallery
    if (e.code === 'KeyG') {
      e.preventDefault();
      document.getElementById('viewGalleryBtn').click();
    }
    
    // T or Space or Enter: Take more photos
    if (e.code === 'KeyT' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      document.getElementById('takeMoreBtn').click();
    }
  }
  
  // === GLOBAL SHORTCUTS ===
  // H: Show help (all screens)
  if (e.code === 'KeyH' && e.shiftKey) {
    e.preventDefault();
    showKeyboardHelp();
  }
});

// Navigate frames with arrow keys
function navigateFrames(direction) {
  const cards = Array.from(document.querySelectorAll('.frame-preview-card'));
  const currentIndex = cards.findIndex(card => card.classList.contains('selected'));
  
  if (cards.length === 0) return;
  
  let newIndex = currentIndex + direction;
  
  // Wrap around
  if (newIndex < 0) newIndex = cards.length - 1;
  if (newIndex >= cards.length) newIndex = 0;
  
  const newCard = cards[newIndex];
  const frameId = newCard.dataset.frameId;
  selectFrameCard(frameId, newCard);
  
  // Scroll into view
  newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Select frame by index
function selectFrameByIndex(index) {
  const cards = Array.from(document.querySelectorAll('.frame-preview-card'));
  
  if (index >= 0 && index < cards.length) {
    const card = cards[index];
    const frameId = card.dataset.frameId;
    selectFrameCard(frameId, card);
    
    // Scroll into view
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Show keyboard shortcuts help
function showKeyboardHelp() {
  const helpText = `
🎹 คีย์บอร์ดช็อตคัต

📸 หน้าถ่ายรูป:
  Space/Enter - ถ่ายรูป
  R - ถ่ายใหม่
  N/Enter - ถัดไป
  C - สลับกล้อง
  F - พลิกกล้อง

🖼️ หน้าเลือกกรอบ:
  ←/→ หรือ ↑/↓ - เลือกกรอบ
  1-9 - เลือกกรอบโดยตรง
  Enter/S - บันทึกรูป
  B/Esc - กลับไปถ่ายใหม่

✅ หน้าสำเร็จ:
  G - ดูแกลเลอรี่
  T/Space/Enter - ถ่ายรูปอีก

🌐 ทุกหน้า:
  Shift+H - แสดงความช่วยเหลือนี้
  `;
  
  alert(helpText);
}

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
