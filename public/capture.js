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
let cardPhotoIndex = 0; // รูปที่แสดงบนการ์ดอวยพร (default รูปที่ 1)

// Image adjustment settings (remembered on this device)
const DEFAULT_ADJUSTMENTS = {
  beauty: 0,      // 0 to 100
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0, // -50 (cool) to 50 (warm)
  highlights: 0,
  shadows: 0,
  sharpness: 0,   // -100 to 100
  filter: 'none'
};
let imageAdjustments = loadImageAdjustments();

function loadImageAdjustments() {
  try {
    const saved = JSON.parse(localStorage.getItem('imageAdjustments'));
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_ADJUSTMENTS, ...saved };
    }
  } catch (error) {
    // Ignore unreadable storage
  }
  return { ...DEFAULT_ADJUSTMENTS };
}

function saveImageAdjustments() {
  try {
    localStorage.setItem('imageAdjustments', JSON.stringify(imageAdjustments));
  } catch (error) {
    // Storage unavailable (private mode) - settings just won't be remembered
  }
}

// GPU (WebGL) preview + capture
let previewRenderer = null;
let captureRenderer = null;
let captureCanvasGL = null;
let previewDirty = true;
let lastPreviewTime = -1;

// Local backup settings
let localBackupEnabled = localStorage.getItem('localBackupEnabled') === 'true';

// Cloud upload setting (default on) - when off, photos are only printed / saved locally
let cloudUploadEnabled = localStorage.getItem('cloudUploadEnabled') !== 'false';

// Last used file number (EVENT_0001...) - counted on this device so it keeps going
// even when sets are not uploaded; synced with the server after each upload
let localPhotoCounter = 0;
let selectedBackupFolder = localStorage.getItem('selectedBackupFolder') || '';

// Try to restore directory handle from IndexedDB
let restoringHandle = false;

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

// Local backup elements
const localBackupToggle = document.getElementById('localBackupToggle');
const backupFolderSection = document.getElementById('backupFolderSection');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const selectedFolderPath = document.getElementById('selectedFolderPath');

// Initialize local backup UI
localBackupToggle.checked = localBackupEnabled;
if (localBackupEnabled) {
  backupFolderSection.style.display = 'flex';
}
if (selectedBackupFolder) {
  selectedFolderPath.textContent = selectedBackupFolder;
  selectedFolderPath.classList.add('selected');
}

// Restore directory handle from IndexedDB
async function restoreDirectoryHandle() {
  if (!('indexedDB' in window)) return;
  
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const request = store.get('backupDir');
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result) {
          window.backupDirHandle = request.result.handle;
          console.log('Restored directory handle from IndexedDB');
        }
        resolve();
      };
      request.onerror = () => resolve();
    });
  } catch (error) {
    console.error('Failed to restore directory handle:', error);
  }
}

// Save directory handle to IndexedDB
async function saveDirectoryHandle(handle) {
  if (!('indexedDB' in window)) return;
  
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.put({ id: 'backupDir', handle: handle });
    
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        console.log('Saved directory handle to IndexedDB');
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch (error) {
    console.error('Failed to save directory handle:', error);
  }
}

// Open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PhotoBoothDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles', { keyPath: 'id' });
      }
    };
  });
}

// Restore handle on page load
if (localBackupEnabled && selectedBackupFolder) {
  restoringHandle = true;
  restoreDirectoryHandle().then(() => {
    restoringHandle = false;
    if (window.backupDirHandle) {
      console.log('Directory handle restored successfully');
    } else {
      console.log('No directory handle found, user needs to select folder again');
      selectedFolderPath.textContent = 'กรุณาเลือก folder ใหม่';
      selectedFolderPath.classList.remove('selected');
    }
  });
}

// Warn when photos would be kept nowhere (no local backup, no cloud upload)
const cloudUploadToggle = document.getElementById('cloudUploadToggle');
const noStorageWarning = document.getElementById('noStorageWarning');
cloudUploadToggle.checked = cloudUploadEnabled;

function updateNoStorageWarning() {
  noStorageWarning.style.display = !localBackupEnabled && !cloudUploadEnabled ? 'block' : 'none';
}

function confirmNoStorage() {
  return confirm('จะปิดทั้ง "บันทึกลงเครื่อง" และ "อัพโหลดขึ้น cloud"\nรูปจะไม่ถูกเก็บไว้ที่ไหนเลย มีแค่ที่ปริ้นออกมา\n\nต้องการปิดหรือไม่?');
}

updateNoStorageWarning();

// Cloud upload toggle handler
cloudUploadToggle.addEventListener('change', (e) => {
  if (!e.target.checked && !localBackupEnabled && !confirmNoStorage()) {
    e.target.checked = true;
    return;
  }

  cloudUploadEnabled = e.target.checked;
  localStorage.setItem('cloudUploadEnabled', cloudUploadEnabled);
  updateNoStorageWarning();
});

// Local backup toggle handler
localBackupToggle.addEventListener('change', (e) => {
  if (!e.target.checked && !cloudUploadEnabled && !confirmNoStorage()) {
    e.target.checked = true;
    return;
  }

  localBackupEnabled = e.target.checked;
  updateNoStorageWarning();
  localStorage.setItem('localBackupEnabled', localBackupEnabled);
  
  if (localBackupEnabled) {
    backupFolderSection.style.display = 'flex';
    if (!selectedBackupFolder || !window.backupDirHandle) {
      // Auto-prompt to select folder
      setTimeout(() => selectFolderBtn.click(), 300);
    }
  } else {
    backupFolderSection.style.display = 'none';
  }
});

// Select folder handler
selectFolderBtn.addEventListener('click', async () => {
  try {
    // Use File System Access API (Chrome/Edge)
    if ('showDirectoryPicker' in window) {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      selectedBackupFolder = dirHandle.name;
      selectedFolderPath.textContent = selectedBackupFolder;
      selectedFolderPath.classList.add('selected');
      
      // Store directory handle
      localStorage.setItem('selectedBackupFolder', selectedBackupFolder);
      window.backupDirHandle = dirHandle;
      
      // Save to IndexedDB for persistence
      await saveDirectoryHandle(dirHandle);
      
      console.log('Folder selected:', selectedBackupFolder);
    } else {
      alert('เบราว์เซอร์ของคุณไม่รองรับการเลือก folder โดยตรง\nกรุณาใช้ Chrome หรือ Edge เวอร์ชันล่าสุด');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Folder selection error:', error);
      alert('ไม่สามารถเลือก folder ได้');
    }
  }
});

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

    // Continue numbering from the higher of server count and this device's count
    localPhotoCounter = Math.max(
      eventData.photoCounter || 0,
      parseInt(localStorage.getItem(`photoCounter_${eventId}`), 10) || 0
    );
    
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
    // Get last selected camera and facing mode preference
    const lastSelectedCamera = localStorage.getItem('selectedCamera');
    const lastFacingMode = localStorage.getItem('facingMode') || 'environment';
    
    // Start camera with last selected camera or facing mode (works better on mobile)
    await startCamera(lastSelectedCamera, lastFacingMode);
    
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
    
    // Set the selected camera in dropdown if we have one saved
    if (lastSelectedCamera) {
      cameraSelect.value = lastSelectedCamera;
    }
    
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Show/hide controls based on device
    const flipBtn = document.getElementById('flipCameraBtn');
    if (flipBtn) {
      // Always show flip button on mobile, or when multiple cameras detected
      if (isMobile || videoDevices.length > 1) {
        flipBtn.style.display = '';
      } else {
        flipBtn.style.display = 'none';
      }
    }
    
    // Hide camera select on mobile (use flip button instead)
    if (isMobile) {
      cameraSelect.style.display = 'none';
    }
    
    // Initialize image adjustment controls
    initImageAdjustments();
  } catch (error) {
    console.error('Camera initialization error:', error);
    alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้อง');
  }
}

// Slider key -> [slider element id, value label id]
const ADJUSTMENT_SLIDERS = {
  beauty: ['beautySlider', 'beautyValue'],
  brightness: ['brightnessSlider', 'brightnessValue'],
  contrast: ['contrastSlider', 'contrastValue'],
  temperature: ['temperatureSlider', 'temperatureValue'],
  highlights: ['highlightsSlider', 'highlightsValue'],
  shadows: ['shadowSlider', 'shadowValue'],
  saturation: ['saturationSlider', 'saturationValue'],
  sharpness: ['sharpnessSlider', 'sharpnessValue']
};
let adjustmentsInitialized = false;

// Initialize image adjustment controls
function initImageAdjustments() {
  // Called on every camera (re)start - bind controls only once
  if (adjustmentsInitialized) return;
  adjustmentsInitialized = true;

  const toggleBtn = document.getElementById('toggleAdjustmentBtn');
  const adjustmentOverlay = document.getElementById('adjustmentOverlay');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const resetBtn = document.getElementById('resetAdjustmentsBtn');

  // Toggle overlay visibility
  toggleBtn.addEventListener('click', () => {
    const isVisible = adjustmentOverlay.classList.toggle('show');
    toggleBtn.classList.toggle('active', isVisible);
  });

  // Drawer covers the toggle button, so it has its own close button
  document.getElementById('closeAdjustmentBtn').addEventListener('click', () => {
    adjustmentOverlay.classList.remove('show');
    toggleBtn.classList.remove('active');
  });

  // Sliders
  Object.entries(ADJUSTMENT_SLIDERS).forEach(([key, [sliderId, valueId]]) => {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    slider.addEventListener('input', (e) => {
      imageAdjustments[key] = parseInt(e.target.value);
      document.getElementById(valueId).textContent = e.target.value;
      applyImageAdjustments();
    });
  });

  // Filter buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      imageAdjustments.filter = btn.dataset.filter;
      syncAdjustmentControls();
      applyImageAdjustments();
    });
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    imageAdjustments = { ...DEFAULT_ADJUSTMENTS };
    syncAdjustmentControls();
    applyImageAdjustments();
  });

  // Restore remembered settings into the controls
  syncAdjustmentControls();
  initGpuPreview();
  applyImageAdjustments();
}

// Reflect imageAdjustments in sliders, labels and filter buttons
function syncAdjustmentControls() {
  Object.entries(ADJUSTMENT_SLIDERS).forEach(([key, [sliderId, valueId]]) => {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    slider.value = imageAdjustments[key];
    document.getElementById(valueId).textContent = imageAdjustments[key];
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === imageAdjustments.filter);
  });
}

// ===== GPU LIVE PREVIEW =====
// Video stays as the (invisible) source; a WebGL canvas on top shows the adjusted image
function initGpuPreview() {
  const livePreview = document.getElementById('livePreview');
  previewRenderer = createAdjustmentRenderer(livePreview);

  if (!previewRenderer) {
    console.warn('WebGL not available - using CSS/CPU image adjustments');
    return;
  }

  livePreview.style.display = 'block';
  video.classList.add('video-source-hidden');
  requestAnimationFrame(renderPreviewFrame);
}

function renderPreviewFrame() {
  requestAnimationFrame(renderPreviewFrame);

  const livePreview = document.getElementById('livePreview');

  // Skip while hidden (photo preview / other screens) or without a new camera frame
  if (!livePreview.clientHeight || document.hidden || !video.videoWidth) return;
  if (video.currentTime === lastPreviewTime && !previewDirty) return;

  // Canvas resolution follows the displayed size (capped for performance)
  const targetWidth = Math.min(1280, Math.round(livePreview.clientWidth * (window.devicePixelRatio || 1)));
  const targetHeight = Math.round(targetWidth / ADJUST_ASPECT);
  if (livePreview.width !== targetWidth || livePreview.height !== targetHeight) {
    livePreview.width = targetWidth;
    livePreview.height = targetHeight;
  }

  if (previewRenderer.render(video, video.videoWidth, video.videoHeight, imageAdjustments)) {
    lastPreviewTime = video.currentTime;
    previewDirty = false;
  }
}

// ===== SHARPNESS HELPERS =====

// Build a 3x3 kernel for a given sharpness value (-100 to 100).
// Positive values sharpen (unsharp-mask style), negative values soften (box blur).
function buildSharpnessKernel(sharpness) {
  const strength = sharpness / 100; // -1 to 1

  if (strength > 0) {
    const s = strength;
    return [
      0, -s, 0,
      -s, 1 + 4 * s, -s,
      0, -s, 0
    ];
  }

  if (strength < 0) {
    const b = -strength; // 0 to 1
    const edge = b / 4;
    const center = 1 - b;
    return [
      0, edge, 0,
      edge, center, edge,
      0, edge, 0
    ];
  }

  return [0, 0, 0, 0, 1, 0, 0, 0, 0];
}

// Lazily create (once) a hidden SVG <filter> with feConvolveMatrix so the
// live <video> preview can show sharpen/blur via CSS filter: url(#...)
// (CSS filter() has no native sharpen function, so we synthesize one).
function ensureSharpenPreviewFilter() {
  if (document.getElementById('sharpenPreviewSVG')) return;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', 'sharpenPreviewSVG');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';

  const filter = document.createElementNS(svgNS, 'filter');
  filter.setAttribute('id', 'sharpenPreviewFilterEl');
  // IMPORTANT: without this the browser convolves in linearRGB by default,
  // which gives wildly different (usually near-invisible) results compared
  // to the sRGB pixel math applyCanvasAdjustments() does on capture — that
  // mismatch is exactly why the live preview looked like it had no effect.
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feConvolveMatrix = document.createElementNS(svgNS, 'feConvolveMatrix');
  feConvolveMatrix.setAttribute('id', 'sharpenPreviewConvolve');
  feConvolveMatrix.setAttribute('order', '3');
  feConvolveMatrix.setAttribute('preserveAlpha', 'true');
  feConvolveMatrix.setAttribute('color-interpolation-filters', 'sRGB');
  feConvolveMatrix.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');

  filter.appendChild(feConvolveMatrix);
  svg.appendChild(filter);
  document.body.appendChild(svg);
}

function updateSharpenPreviewFilter(sharpness) {
  ensureSharpenPreviewFilter();
  const feConvolveMatrix = document.getElementById('sharpenPreviewConvolve');
  const kernel = buildSharpnessKernel(sharpness);
  feConvolveMatrix.setAttribute('kernelMatrix', kernel.join(' '));
}

// Apply the same kernel permanently to captured pixel data (RGBA Uint8ClampedArray).
// Returns a new Uint8ClampedArray; alpha channel is passed through unchanged.
function applySharpnessConvolution(data, width, height, sharpness) {
  if (!sharpness) return data;

  const kernel = buildSharpnessKernel(sharpness);
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      let k = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          const kval = kernel[k++];

          r += data[idx] * kval;
          g += data[idx + 1] * kval;
          b += data[idx + 2] * kval;
        }
      }

      const outIdx = (y * width + x) * 4;
      output[outIdx] = r;
      output[outIdx + 1] = g;
      output[outIdx + 2] = b;
      output[outIdx + 3] = data[outIdx + 3];
    }
  }

  return output;
}

// Apply image adjustments to video
function applyImageAdjustments() {
  saveImageAdjustments();

  // GPU preview renders adjustments itself on the next frame
  if (previewRenderer) {
    video.style.filter = '';
    previewDirty = true;
    return;
  }

  const filters = [];
  
  // Brightness: -50 to 50 -> 0.5 to 1.5
  const brightness = 1 + (imageAdjustments.brightness / 100);
  filters.push(`brightness(${brightness})`);
  
  // Contrast: -50 to 50 -> 0.5 to 1.5
  const contrast = 1 + (imageAdjustments.contrast / 100);
  filters.push(`contrast(${contrast})`);
  
  // Saturation: -100 to 100 -> 0 to 2
  const saturation = 1 + (imageAdjustments.saturation / 100);
  filters.push(`saturate(${saturation})`);
  
  // Sharpness: -100 to 100 -> synthesized via SVG feConvolveMatrix
  // (CSS has no native sharpen filter, so we build one on the fly)
  if (imageAdjustments.sharpness) {
    updateSharpenPreviewFilter(imageAdjustments.sharpness);
    filters.push('url(#sharpenPreviewFilterEl)');
  }
  
  // Apply filter preset
  switch (imageAdjustments.filter) {
    case 'bw':
      filters.push('grayscale(100%)');
      break;
    case 'sepia':
      filters.push('sepia(100%)');
      break;
    case 'vintage':
      filters.push('sepia(50%) contrast(0.9) brightness(0.9)');
      break;
    case 'cool':
      filters.push('hue-rotate(180deg) saturate(1.2)');
      break;
    case 'warm':
      filters.push('sepia(30%) saturate(1.3)');
      break;
    case 'brighten':
      filters.push('brightness(1.3) contrast(1.1) saturate(0.9)');
      break;
  }
  
  video.style.filter = filters.join(' ');
}

// Apply image adjustments to canvas (permanent)
function applyCanvasAdjustments(ctx, width, height) {
  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  let data = imageData.data;
  
  // Apply sharpness/softness first (needs original neighbor pixels,
  // so it must run before the per-pixel color loop below rewrites them).
  if (imageAdjustments.sharpness) {
    const sharpened = applySharpnessConvolution(data, width, height, imageAdjustments.sharpness);
    data.set(sharpened);
  }
  
  // Calculate adjustment factors
  const brightnessFactor = 1 + (imageAdjustments.brightness / 100);
  const contrastFactor = 1 + (imageAdjustments.contrast / 100);
  const saturationFactor = 1 + (imageAdjustments.saturation / 100);
  const shadowAdjustment = imageAdjustments.shadows / 100; // -0.5 to 0.5
  
  // Apply adjustments pixel by pixel
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Apply filter presets first
    if (imageAdjustments.filter === 'bw') {
      // Grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    } else if (imageAdjustments.filter === 'sepia') {
      // Sepia
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = tr;
      g = tg;
      b = tb;
    } else if (imageAdjustments.filter === 'vintage') {
      // Vintage (sepia + reduced contrast/brightness)
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = tr * 0.5 + r * 0.5;
      g = tg * 0.5 + g * 0.5;
      b = tb * 0.5 + b * 0.5;
      r *= 0.9;
      g *= 0.9;
      b *= 0.9;
    } else if (imageAdjustments.filter === 'warm') {
      // Warm (sepia tint + saturation boost)
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = tr * 0.3 + r * 0.7;
      g = tg * 0.3 + g * 0.7;
      b = tb * 0.3 + b * 0.7;
    } else if (imageAdjustments.filter === 'brighten') {
      // ฟิลเตอร์สำหรับผิวคล้ำให้ดูขาวขึ้น
      r *= 1.3;
      g *= 1.3;
      b *= 1.3;
      r = ((r / 255 - 0.5) * 1.1 + 0.5) * 255;
      g = ((g / 255 - 0.5) * 1.1 + 0.5) * 255;
      b = ((b / 255 - 0.5) * 1.1 + 0.5) * 255;
      const grayB = 0.299 * r + 0.587 * g + 0.114 * b;
      r = grayB + (r - grayB) * 0.9;
      g = grayB + (g - grayB) * 0.9;
      b = grayB + (b - grayB) * 0.9;
    }
    
    // Apply shadows (improved algorithm - แบ่งเป็น 3 โซน)
    if (shadowAdjustment !== 0) {
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      
      if (luminance < 85) {
        // Shadows - มีผลเต็มที่
        const factor = 1 + (shadowAdjustment * 1.5);
        r *= factor;
        g *= factor;
        b *= factor;
      } else if (luminance < 170) {
        // Midtones - มีผลปานกลาง
        const midtoneInfluence = (170 - luminance) / 85;
        const factor = 1 + (shadowAdjustment * 0.8 * midtoneInfluence);
        r *= factor;
        g *= factor;
        b *= factor;
      }
      // Highlights - ไม่มีผล
    }
    
    // Apply brightness
    r *= brightnessFactor;
    g *= brightnessFactor;
    b *= brightnessFactor;
    
    // Apply contrast
    r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;
    
    // Apply saturation
    if (saturationFactor !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;
    }
    
    // Clamp values
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  
  // Put modified image data back
  ctx.putImageData(imageData, 0, 0);
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

  // GPU capture (same shader as the live preview); CPU fallback without WebGL
  const photoData = captureWithGpu() || captureWithCpu();

  // Play shutter sound
  playBeep(1000, 100);

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

// Capture current frame with the GPU pipeline (returns null when unavailable)
function captureWithGpu() {
  if (!previewRenderer) return null;

  if (!captureCanvasGL) {
    captureCanvasGL = document.createElement('canvas');
    captureCanvasGL.width = ADJUST_CAPTURE_WIDTH;
    captureCanvasGL.height = ADJUST_CAPTURE_HEIGHT;
    captureRenderer = createAdjustmentRenderer(captureCanvasGL, { preserveDrawingBuffer: true });
  }

  if (captureRenderer && captureRenderer.render(video, video.videoWidth, video.videoHeight, imageAdjustments)) {
    return captureCanvasGL.toDataURL('image/jpeg', 0.95);
  }
  return null;
}

// Capture current frame on the CPU (fallback for devices without WebGL)
function captureWithCpu() {
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
  
  // Apply image adjustments to canvas
  applyCanvasAdjustments(context, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', 0.95);
}

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
  document.getElementById('cameraControls').style.display = '';
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
    document.getElementById('cameraControls').style.display = '';
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

    // Warn on frames that have no card frame (card will print on white)
    if (eventData.cardEnabled && !frame.cardPath) {
      const badge = document.createElement('span');
      badge.className = 'no-card-badge';
      badge.textContent = 'ไม่มีกรอบการ์ด';
      card.appendChild(badge);
    }

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

// Generate frame preview (scaled-down strip)
async function generateFramePreview(frame, canvas) {
  try {
    const images = await loadCompositeImages(stripSpec(frame, capturedPhotos));
    paintComposite(canvas.getContext('2d'), canvas.width, canvas.height, images);
  } catch (error) {
    console.error('Frame preview error:', error);
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

// ===== PRINT MODAL (card + quantity) =====
const printModal = document.getElementById('printModal');
const printCountInput = document.getElementById('printCountInput');
const confirmPrintBtn = document.getElementById('confirmPrintBtn');
let printModalMode = 'initial'; // 'initial' = first print (then upload), 'reprint' = print again only
let cardPreviewToken = 0;

// Rendered composites of the current session, reused for reprints
let renderedStrip = null;
let renderedCards = {};

// Build card photo picker (one button per captured photo)
function renderCardPhotoPicker() {
  const picker = document.getElementById('cardPhotoPicker');
  picker.innerHTML = '';

  capturedPhotos.forEach((photo, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'card-photo-option';
    option.classList.toggle('selected', index === cardPhotoIndex);
    option.innerHTML = `<img src="${photo}" alt="รูปที่ ${index + 1}"><span>รูปที่ ${index + 1}</span>`;
    option.addEventListener('click', () => selectCardPhoto(index));
    picker.appendChild(option);
  });
}

function selectCardPhoto(index) {
  if (index < 0 || index >= capturedPhotos.length) return;
  cardPhotoIndex = index;
  document.querySelectorAll('#cardPhotoPicker .card-photo-option').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
  renderCardPreview();
}

// Draw card preview for the selected frame set + selected photo
async function renderCardPreview() {
  const frame = eventData.frames.find(f => f.id === selectedFrameId);
  const token = ++cardPreviewToken;
  document.getElementById('noCardFrameNotice').style.display = frame && !frame.cardPath ? 'block' : 'none';

  try {
    const images = await loadCompositeImages(cardSpec(frame, capturedPhotos[cardPhotoIndex]));
    // Skip stale renders when the selection changed while loading
    if (token !== cardPreviewToken) return;
    const canvas = document.getElementById('cardPreviewCanvas');
    paintComposite(canvas.getContext('2d'), canvas.width, canvas.height, images);
  } catch (error) {
    console.error('Card preview error:', error);
  }
}

function getPrintCount() {
  const count = parseInt(printCountInput.value, 10);
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

// First print: fixed by event config. Reprint: admin picks what to print (card events only)
function getPrintMode() {
  if (!eventData.cardEnabled) return 'strip';
  if (printModalMode === 'initial') return 'both';
  return document.querySelector('input[name="printType"]:checked').value;
}

function isCardSectionVisible() {
  return getPrintMode() !== 'strip';
}

// Sync modal sections, labels and summary with the current mode/count
function updatePrintOptions() {
  const mode = getPrintMode();
  const showCard = isCardSectionVisible();

  document.getElementById('cardOptions').style.display = showCard ? 'block' : 'none';
  document.getElementById('cardKeyHint').style.display = showCard ? 'inline' : 'none';
  document.getElementById('printCountLabel').textContent =
    mode === 'card' ? 'จำนวน "การ์ดอวยพร"' : 'จำนวน "รูป 1 ชุด"';
  document.getElementById('printSummary').textContent = describeSheets(computeSheets(mode, getPrintCount()));

  if (showCard) {
    renderCardPreview();
  }
}

function changePrintCount(delta) {
  printCountInput.value = Math.max(1, getPrintCount() + delta);
  updatePrintOptions();
}

printCountInput.addEventListener('input', updatePrintOptions);
printCountInput.addEventListener('change', () => {
  printCountInput.value = getPrintCount();
  updatePrintOptions();
});

document.getElementById('printCountMinus').addEventListener('click', () => changePrintCount(-1));
document.getElementById('printCountPlus').addEventListener('click', () => changePrintCount(1));

document.querySelectorAll('input[name="printType"]').forEach(radio => {
  radio.addEventListener('change', updatePrintOptions);
});

// Open print modal ('initial' after frame selection, 'reprint' from success screen)
function openPrintModal(mode) {
  printModalMode = mode;
  const isReprint = mode === 'reprint';

  document.getElementById('printModalTitle').textContent = isReprint ? 'ปริ้นเพิ่ม / แก้จำนวน' : 'ตั้งค่าการปริ้น';
  document.getElementById('printBackBtn').innerHTML = isReprint
    ? 'ปิด <kbd>Esc</kbd>'
    : '← กลับไปเลือกกรอบ <kbd>Esc</kbd>';
  document.getElementById('printTypeSection').style.display = isReprint && eventData.cardEnabled ? 'block' : 'none';
  document.querySelector('input[name="printType"][value="both"]').checked = true;
  printCountInput.value = 1;

  if (eventData.cardEnabled) {
    renderCardPhotoPicker();
  }
  updatePrintOptions();

  printModal.classList.add('active');
}

function closePrintModal() {
  printModal.classList.remove('active');
}

document.getElementById('printBackBtn').addEventListener('click', closePrintModal);

// Reset card/print options for a new photo session
function resetPrintOptions() {
  cardPhotoIndex = 0;
  printCountInput.value = 1;
  renderedStrip = null;
  renderedCards = {};
  // Free decoded photos from the finished session
  clearImageCache();
}

// Back to photos
document.getElementById('backToPhotosBtn').addEventListener('click', () => {
  if (confirm('ต้องการถ่ายรูปใหม่หรือไม่? รูปที่ถ่ายไว้จะถูกลบ')) {
    // Clear all data
    capturedPhotos = [];
    currentPhotoIndex = 0;
    selectedFrameId = null;
    resetPrintOptions();

    // Reset UI
    frameSelectionScreen.style.display = 'none';
    captureScreen.style.display = 'block';
    currentPhotoSpan.textContent = '1';

    // Reset to camera view
    video.style.display = 'block';
    document.getElementById('cameraControls').style.display = '';
    document.getElementById('captureActions').style.display = 'flex';
    previewContainer.style.display = 'none';

    // Update thumbnails
    updateThumbnails();

    // Restart camera
    initCamera();
  }
});

// Next (after frame selection) -> print options modal
document.getElementById('savePhotosBtn').addEventListener('click', () => {
  if (!selectedFrameId) {
    alert('กรุณาเลือกกรอบรูป');
    return;
  }

  const frame = eventData.frames.find(f => f.id === selectedFrameId);

  // Frame set without card frame -> confirm printing the card on white
  if (eventData.cardEnabled && frame && !frame.cardPath &&
      !confirm('กรอบนี้ยังไม่มีกรอบการ์ดอวยพร\nต้องการปริ้นการ์ดเป็นพื้นขาวแทนหรือไม่?')) {
    return;
  }

  // Frame may have changed since last time - render composites again
  renderedStrip = null;
  renderedCards = {};
  openPrintModal('initial');
});

// Reprint from success screen (same photo set, no upload)
document.getElementById('reprintBtn').addEventListener('click', () => {
  openPrintModal('reprint');
});

// Render (or reuse) full-size composites for printing
async function getStripBlob(frame) {
  if (!renderedStrip) {
    renderedStrip = await renderCompositeBlob(stripSpec(frame, capturedPhotos));
  }
  return renderedStrip;
}

async function getCardBlob(frame, index) {
  if (!renderedCards[index]) {
    renderedCards[index] = await renderCompositeBlob(cardSpec(frame, capturedPhotos[index]));
  }
  return renderedCards[index];
}

// Print (and on first print: local backup + upload)
confirmPrintBtn.addEventListener('click', async () => {
  const frame = eventData.frames.find(f => f.id === selectedFrameId);
  if (!frame) {
    alert('กรุณาเลือกกรอบรูป');
    return;
  }

  const isInitial = printModalMode === 'initial';
  const mode = getPrintMode();
  const originalText = confirmPrintBtn.innerHTML;

  try {
    confirmPrintBtn.disabled = true;
    confirmPrintBtn.innerHTML = 'กำลังเตรียมพิมพ์...';

    // Render strip (2x6 inch) and/or card only when needed
    const [stripBlob, cardBlob] = await Promise.all([
      mode !== 'card' ? getStripBlob(frame) : null,
      mode !== 'strip' ? getCardBlob(frame, cardPhotoIndex) : null
    ]);

    // Each photo set takes the next file number (first print only)
    const fileNumber = isInitial ? takeNextFileNumber() : null;

    // Save to local folder if enabled (single 2x6 inch) - first print only
    if (isInitial && localBackupEnabled && window.backupDirHandle) {
      const fileName = `${eventData.filePrefix}_${String(fileNumber).padStart(4, '0')}`;
      await saveToLocalFolder(stripBlob, fileName);
    }

    // Print (4x6 inch sheets, one print job)
    printSheets(computeSheets(mode, getPrintCount()), {
      strip: stripBlob ? URL.createObjectURL(stripBlob) : null,
      card: cardBlob ? URL.createObjectURL(cardBlob) : null
    });

    closePrintModal();

    if (isInitial) {
      showSuccess();

      if (cloudUploadEnabled) {
        // Start background upload (once per photo set)
        uploadPhotosInBackground(capturedPhotos, selectedFrameId, eventData.cardEnabled ? cardPhotoIndex : null, fileNumber);
      } else {
        showUploadSkippedStatus();
      }
    }
  } catch (error) {
    console.error('Print error:', error);
    alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    confirmPrintBtn.disabled = false;
    confirmPrintBtn.innerHTML = originalText;
  }
});

// Keyboard shortcuts while the print modal is open
function handlePrintModalKey(e) {
  if (e.code === 'Escape') {
    e.preventDefault();
    closePrintModal();
    return;
  }

  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    // Ignore key repeat so holding Enter from the frame screen doesn't print right away
    if (!e.repeat && !confirmPrintBtn.disabled) {
      confirmPrintBtn.click();
    }
    return;
  }

  // Let inputs (quantity field, print type radios) handle their own keys
  if (e.target.tagName === 'INPUT') return;

  if (isCardSectionVisible()) {
    const count = capturedPhotos.length;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      const step = e.code === 'ArrowLeft' ? -1 : 1;
      selectCardPhoto((cardPhotoIndex + step + count) % count);
      return;
    }
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      selectCardPhoto(parseInt(e.key, 10) - 1);
      return;
    }
  }

  if (e.code === 'ArrowUp' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') {
    e.preventDefault();
    changePrintCount(1);
  } else if (e.code === 'ArrowDown' || e.code === 'NumpadSubtract' || e.key === '-') {
    e.preventDefault();
    changePrintCount(-1);
  }
}

// Reserve the next file number for a new photo set (remembered per event on this device)
function takeNextFileNumber() {
  localPhotoCounter++;
  saveLocalPhotoCounter();
  return localPhotoCounter;
}

function saveLocalPhotoCounter() {
  try {
    localStorage.setItem(`photoCounter_${eventId}`, localPhotoCounter);
  } catch (error) {
    // Storage unavailable - numbering continues for this page only
  }
}

// Success screen status when cloud upload is turned off
function showUploadSkippedStatus() {
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  statusIcon.textContent = '✓';
  statusIcon.style.background = 'var(--text-secondary)';
  statusText.textContent = 'ไม่ได้อัพโหลด';
  statusText.style.color = 'var(--text-primary)';
  document.getElementById('statusDescription').style.display = 'none';
  document.getElementById('statusNote').style.display = 'none';
}

// Upload photos in background
async function uploadPhotosInBackground(photos, frameId, cardPhotoIndex, fileNumber) {
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
        frameId: frameId,
        cardPhotoIndex: cardPhotoIndex,
        fileNumber: fileNumber
      })
    });

    if (response.ok) {
      console.log('Photos uploaded successfully in background');

      // Sync numbering in case another device moved the server counter ahead
      const photoSet = await response.json();
      const serverNumber = parseInt((photoSet.fileName.match(/(\d+)$/) || [])[1], 10);
      if (serverNumber > localPhotoCounter) {
        localPhotoCounter = serverNumber;
        saveLocalPhotoCounter();
      }

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

// Save to local folder
async function saveToLocalFolder(blob, fileName) {
  console.log('saveToLocalFolder called:', { 
    enabled: localBackupEnabled, 
    hasDirHandle: !!window.backupDirHandle,
    fileName 
  });
  
  if (!localBackupEnabled || !window.backupDirHandle) {
    console.log('Local backup skipped - not enabled or no folder selected');
    return;
  }
  
  try {
    console.log('Requesting permission...');
    // Request permission if needed
    const permission = await window.backupDirHandle.queryPermission({ mode: 'readwrite' });
    console.log('Current permission:', permission);
    
    if (permission !== 'granted') {
      const newPermission = await window.backupDirHandle.requestPermission({ mode: 'readwrite' });
      console.log('New permission:', newPermission);
      if (newPermission !== 'granted') {
        console.error('Permission denied for local backup');
        return;
      }
    }
    
    // Create file in selected folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fullFileName = `${fileName}_${timestamp}.jpg`;
    console.log('Creating file:', fullFileName);
    
    const fileHandle = await window.backupDirHandle.getFileHandle(fullFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    
    console.log(`✅ Saved to local folder: ${fullFileName}`);
    
    // Show success notification to user
    showToast(`บันทึกลงเครื่องสำเร็จ: ${fullFileName}`);
  } catch (error) {
    console.error('❌ Local backup error:', error);
    // Show error to user
    showToast('ไม่สามารถบันทึกลงเครื่องได้: ' + error.message, 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = message;
  
  if (type === 'error') {
    toast.style.background = '#ef4444';
  }
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
  resetPrintOptions();

  // Reset UI
  successScreen.style.display = 'none';
  captureScreen.style.display = 'block';
  currentPhotoSpan.textContent = '1';
  
  // Reset to camera view
  video.style.display = 'block';
  document.getElementById('cameraControls').style.display = '';
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
  // Print modal on top: it handles its own keys
  if (printModal.classList.contains('active')) {
    handlePrintModalKey(e);
    return;
  }

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

    // P: Reprint / fix print count
    if (e.code === 'KeyP') {
      e.preventDefault();
      document.getElementById('reprintBtn').click();
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
  Enter/S - ถัดไป (ตั้งค่าการปริ้น)
  B/Esc - กลับไปถ่ายใหม่

🖨️ หน้าต่างตั้งค่าการปริ้น:
  ←/→ หรือ 1-3 - เลือกรูปการ์ด
  ↑/↓ หรือ +/- - เพิ่ม/ลดจำนวน
  Enter - ปริ้น
  Esc - กลับ

✅ หน้าสำเร็จ:
  G - ดูแกลเลอรี่
  P - ปริ้นเพิ่ม / แก้จำนวน
  T/Space/Enter - ถ่ายรูปอีก

🌐 ทุกหน้า:
  Shift+H - แสดงความช่วยเหลือนี้
  `;
  
  alert(helpText);
}
