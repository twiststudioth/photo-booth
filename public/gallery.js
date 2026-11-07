// Gallery Page JavaScript

let currentEventId = null;
let currentEvent = null;
let allPhotoSets = [];
let currentPhotoSet = null;
let currentPhotoIndex = 0;
let isAdmin = false;

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const galleryContent = document.getElementById('galleryContent');
const photoSets = document.getElementById('photoSets');
const emptyState = document.getElementById('emptyState');
const photoViewerModal = document.getElementById('photoViewerModal');
const currentPhoto = document.getElementById('currentPhoto');
const photoIndex = document.getElementById('photoIndex');
const deleteSetBtn = document.getElementById('deleteSetBtn');
const printPhotoBtn = document.getElementById('printPhotoBtn');
const photoLoading = document.getElementById('photoLoading');

// Check if admin
const authToken = localStorage.getItem('authToken');
isAdmin = !!authToken;

if (isAdmin) {
  deleteSetBtn.style.display = 'inline-flex';
  printPhotoBtn.style.display = 'inline-flex';
}

// Initialize
async function init() {
  const params = new URLSearchParams(window.location.search);
  currentEventId = params.get('event');
  
  if (!currentEventId) {
    alert('ไม่พบข้อมูลอีเว้นท์');
    window.location.href = '/';
    return;
  }
  
  await loadEventInfo();
  await loadPhotos();
  
  loadingScreen.style.display = 'none';
  galleryContent.style.display = 'block';
}

// Load event info
async function loadEventInfo() {
  try {
    const response = await fetch(`/api/events/${currentEventId}`);
    if (!response.ok) {
      throw new Error('Event not found');
    }
    
    const event = await response.json();
    currentEvent = event;
    document.getElementById('eventName').textContent = event.name;
    document.title = `${event.name} - แกลเลอรี่`;
  } catch (error) {
    console.error('Failed to load event info:', error);
  }
}

// Load events for filter (removed)
// Event filter change (removed)

// Load photos
async function loadPhotos() {
  try {
    if (!currentEventId) {
      emptyState.style.display = 'block';
      return;
    }
    
    // Load photos from current event only
    const photosResponse = await fetch(`/api/events/${currentEventId}/photos`);
    const photos = await photosResponse.json();

    // Event already loaded by loadEventInfo() - no need to fetch it again
    const eventName = currentEvent ? currentEvent.name : '';
    allPhotoSets = photos.map(p => ({ ...p, eventName }));
    
    displayPhotos();
  } catch (error) {
    console.error('Failed to load photos:', error);
    emptyState.style.display = 'block';
  }
}

// Display photos
function displayPhotos() {
  photoSets.innerHTML = '';
  
  if (allPhotoSets.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Sort by date (newest first)
  allPhotoSets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  allPhotoSets.forEach(photoSet => {
    const card = document.createElement('div');
    card.className = 'photo-set-card';
    
    // Format date
    const date = new Date(photoSet.createdAt);
    const dateStr = date.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit'
    });
    const timeStr = date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Optimize Cloudinary image URL for thumbnail
    const thumbnailUrl = optimizeCloudinaryUrl(photoSet.composite || photoSet.photos[0], 'thumbnail');
    
    card.innerHTML = `
      <img src="${thumbnailUrl}" alt="${photoSet.fileName}" class="photo-set-thumbnail" loading="lazy" width="180" height="210">
      <div class="photo-set-info">
        <h3 title="${photoSet.fileName}">${photoSet.fileName}</h3>
        <p title="${photoSet.eventName}">${photoSet.eventName}</p>
        <p>${dateStr} ${timeStr}</p>
      </div>
    `;
    card.addEventListener('click', () => openPhotoViewer(photoSet));
    photoSets.appendChild(card);
  });
}

// Optimize Cloudinary URL with transformations
function optimizeCloudinaryUrl(url, type = 'thumbnail') {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  // Define transformations based on type
  const transformations = {
    thumbnail: 'w_200,h_240,c_fill,f_auto,q_auto:eco',
    small: 'w_300,f_auto,q_auto:eco',
    preview: 'w_800,f_auto,q_auto:good',
    full: 'f_auto,q_auto:best' // ดาวน์โหลดขนาดเต็ม 2400x1600 ไม่ resize
  };
  
  const transform = transformations[type] || transformations.thumbnail;
  
  // Insert transformation into URL
  return url.replace('/upload/', `/upload/${transform}/`);
}

// Open photo viewer
function openPhotoViewer(photoSet) {
  currentPhotoSet = photoSet;
  currentPhotoIndex = 0;
  
  // Show modal first
  photoViewerModal.classList.add('active');
  
  // Then load photo
  updatePhotoDisplay();
}

// Update photo display
function updatePhotoDisplay() {
  if (!currentPhotoSet) return;
  clearPendingSave(); // ไฟล์ที่รอกดบันทึกเป็นของรูปก่อนหน้า
  
  // Build photo array: composite, photo1, photo2, photo3, slideshow (แทน gif)
  const photos = [];
  
  if (currentPhotoSet.composite) {
    photos.push({ src: currentPhotoSet.composite, label: 'รูปพร้อมกรอบ', type: 'composite' });
  }
  
  currentPhotoSet.photos.forEach((photo, index) => {
    photos.push({ src: photo, label: `รูปที่ ${index + 1}`, type: 'photo' });
  });
  
  // เพิ่มรูปที่ 5 เป็น "GIF Animation" (จริงๆ คือ slideshow)
  photos.push({ src: null, label: 'GIF Animation', type: 'slideshow' });
  
  // Display current photo with optimization
  const currentPhotoData = photos[currentPhotoIndex];
  
  // ถ้าเป็นรูปที่ 5 (slideshow) ให้เริ่ม slideshow อัตโนมัติ
  if (currentPhotoData.type === 'slideshow') {
    // แสดงรูปแรก (ข้าม composite)
    const firstPhotoIndex = currentPhotoSet.composite ? 1 : 0;
    const firstPhoto = photos[firstPhotoIndex];
    
    showPhotoLoading();
    const optimizedUrl = optimizeCloudinaryUrl(firstPhoto.src, 'preview');
    
    const img = new Image();
    img.onload = () => {
      currentPhoto.src = optimizedUrl;
      currentPhoto.style.display = 'block';
      hidePhotoLoading();
      
      // เริ่ม slideshow อัตโนมัติ
      if (!isSlideshowMode) {
        startSlideshow();
      }
    };
    img.onerror = () => {
      currentPhoto.src = firstPhoto.src;
      currentPhoto.style.display = 'block';
      hidePhotoLoading();
      
      if (!isSlideshowMode) {
        startSlideshow();
      }
    };
    img.src = optimizedUrl;
  } else {
    // รูปปกติ
    showPhotoLoading();
    const optimizedUrl = optimizeCloudinaryUrl(currentPhotoData.src, 'preview');
    
    // Preload image
    const img = new Image();
    img.onload = () => {
      currentPhoto.src = optimizedUrl;
      currentPhoto.style.display = 'block';
      hidePhotoLoading();
    };
    img.onerror = () => {
      // If optimized fails, try original
      currentPhoto.src = currentPhotoData.src;
      currentPhoto.style.display = 'block';
      hidePhotoLoading();
    };
    img.src = optimizedUrl;
    
    // หยุด slideshow ถ้ากำลังเล่นอยู่
    if (isSlideshowMode) {
      stopSlideshow();
    }
  }
  
  photoIndex.textContent = `${currentPhotoIndex + 1} / ${photos.length} - ${currentPhotoData.label}`;
  
  // Update navigation buttons
  document.querySelector('.prev-btn').disabled = currentPhotoIndex === 0;
  document.querySelector('.next-btn').disabled = currentPhotoIndex === photos.length - 1;
}

// Show photo loading indicator
function showPhotoLoading() {
  if (photoLoading) {
    photoLoading.classList.remove('hidden');
  }
  if (currentPhoto) {
    currentPhoto.style.display = 'none';
  }
}

// Hide photo loading indicator
function hidePhotoLoading() {
  if (photoLoading) {
    photoLoading.classList.add('hidden');
  }
}

// Navigation
document.querySelector('.prev-btn').addEventListener('click', () => {
  if (currentPhotoIndex > 0) {
    currentPhotoIndex--;
    updatePhotoDisplay();
  }
});

document.querySelector('.next-btn').addEventListener('click', () => {
  const photos = getPhotoArray();
  if (currentPhotoIndex < photos.length - 1) {
    currentPhotoIndex++;
    updatePhotoDisplay();
  }
});

// Swipe left/right on touch screens to change photo (disabled buttons ignore click())
let touchStartX = null;
const photoViewerEl = document.querySelector('.photo-viewer');
photoViewerEl.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
photoViewerEl.addEventListener('touchend', (e) => {
  if (touchStartX === null) return;
  const deltaX = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(deltaX) < 50) return;
  document.querySelector(deltaX < 0 ? '.next-btn' : '.prev-btn').click();
});

// Get photo array
function getPhotoArray() {
  const photos = [];
  if (currentPhotoSet.composite) photos.push(currentPhotoSet.composite);
  photos.push(...currentPhotoSet.photos);
  // เพิ่มรูปที่ 5 เป็น slideshow placeholder
  photos.push('slideshow');
  return photos;
}

// Slideshow state
let slideshowInterval = null;
let isSlideshowMode = false;

// Start slideshow (วนรูป 3 รูปอัตโนมัติ)
function startSlideshow() {
  if (slideshowInterval) return; // Already running
  
  // Build photo array
  const photos = [];
  if (currentPhotoSet.composite) {
    photos.push({ src: currentPhotoSet.composite, label: 'รูปพร้อมกรอบ', type: 'composite' });
  }
  currentPhotoSet.photos.forEach((photo, index) => {
    photos.push({ src: photo, label: `รูปที่ ${index + 1}`, type: 'photo' });
  });
  
  // เริ่มจากรูปแรก (ข้ามรูป composite)
  const startIndex = currentPhotoSet.composite ? 1 : 0;
  let slideshowIndex = startIndex;
  
  // แสดงรูปแรก
  const firstPhoto = photos[slideshowIndex];
  const optimizedUrl = optimizeCloudinaryUrl(firstPhoto.src, 'preview');
  currentPhoto.src = optimizedUrl;
  
  // วนรูปทุก 800ms (เหมือน GIF)
  slideshowInterval = setInterval(() => {
    slideshowIndex++;
    
    // วนกลับไปรูปแรก (ข้ามรูป composite)
    if (slideshowIndex >= photos.length) {
      slideshowIndex = startIndex;
    }
    
    const photo = photos[slideshowIndex];
    const optimizedUrl = optimizeCloudinaryUrl(photo.src, 'preview');
    currentPhoto.src = optimizedUrl;
  }, 800);
  
  isSlideshowMode = true;
}

// Stop slideshow
function stopSlideshow() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
  
  isSlideshowMode = false;
}

// ===== DOWNLOAD / SAVE TO ALBUM =====
// มือถือ: เปิด share sheet ให้กด "บันทึกรูปภาพ" -> เข้าอัลบั้ม (รวม GIF เคลื่อนไหว)
// คอม: ดาวน์โหลดเข้าโฟลเดอร์ Downloads ตามปกติ
const DOWNLOAD_LABEL = 'ดาวน์โหลดรูปนี้';
const SAVE_TO_ALBUM_LABEL = 'บันทึกลงอัลบั้ม';
// ไฟล์ที่โหลดเสร็จแล้วแต่ยังเปิด share sheet ไม่ได้ (iOS หมดสิทธิ์จากการกดเพราะรอนาน) -> รอกดอีกครั้ง
let pendingSaveFile = null;

function getDownloadBtn() {
  return document.getElementById('downloadCurrentBtn');
}

function clearPendingSave() {
  if (!pendingSaveFile) return;
  pendingSaveFile = null;
  const btn = getDownloadBtn();
  btn.textContent = DOWNLOAD_LABEL;
}

document.getElementById('downloadCurrentBtn').addEventListener('click', async () => {
  const btn = getDownloadBtn();

  // กดครั้งที่สอง: ไฟล์พร้อมแล้ว เปิด share sheet ได้ทันที
  if (pendingSaveFile) {
    const file = pendingSaveFile;
    clearPendingSave();
    await saveFile(file);
    return;
  }

  const photos = getPhotoArray();
  const currentPhotoData = photos[currentPhotoIndex];
  const isGif = currentPhotoData === 'slideshow';

  let baseName;
  if (isGif) baseName = currentPhotoSet.fileName;
  else if (currentPhotoIndex === 0 && currentPhotoSet.composite) baseName = `${currentPhotoSet.fileName}_composite`;
  else baseName = `${currentPhotoSet.fileName}_${currentPhotoIndex}`;

  // จำไว้ว่ากดจากรูปไหน ถ้าผู้ใช้เปลี่ยนรูประหว่างรอ จะไม่ค้างปุ่ม "บันทึกลงอัลบั้ม" ผิดรูป
  const requestedSet = currentPhotoSet;
  const requestedIndex = currentPhotoIndex;

  btn.disabled = true;
  btn.textContent = isGif ? 'กำลังสร้าง GIF...' : 'กำลังเตรียมรูป...';

  let file;
  try {
    const url = isGif
      ? `/api/photos/${currentPhotoSet.id}/gif` // สร้าง on-demand
      : optimizeCloudinaryUrl(currentPhotoData, 'full');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const type = isGif ? 'image/gif' : (blob.type || 'image/jpeg');
    file = new File([blob], `${baseName}.${extensionForType(type)}`, { type });
  } catch (error) {
    console.error('Download failed:', error);
    alert(isGif ? 'สร้าง GIF ไม่สำเร็จ กรุณาลองอีกครั้ง' : 'ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง');
    btn.disabled = false;
    btn.textContent = DOWNLOAD_LABEL;
    return;
  }

  btn.disabled = false;
  btn.textContent = DOWNLOAD_LABEL;

  const stillSamePhoto = requestedSet === currentPhotoSet && requestedIndex === currentPhotoIndex
    && photoViewerModal.classList.contains('active');
  const result = await saveFile(file);
  if (result === 'needs-tap' && stillSamePhoto) {
    pendingSaveFile = file;
    btn.textContent = SAVE_TO_ALBUM_LABEL;
  }
});

function extensionForType(type) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
  return map[type] || 'jpg';
}

// Detect if device is iOS (รวม iPad ที่แสดงตัวเป็น Mac)
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Detect if device is mobile
function isMobile() {
  return isIOS() || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// คืนค่า 'done' | 'needs-tap' (ต้องให้ผู้ใช้กดอีกครั้งเพื่อเปิด share sheet)
async function saveFile(file) {
  if (isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'done';
    } catch (error) {
      if (error.name === 'AbortError') return 'done'; // ผู้ใช้ปิด share sheet เอง
      if (error.name === 'NotAllowedError') return 'needs-tap'; // หมดสิทธิ์จากการกด (รอโหลดนาน)
      console.warn('Share failed, falling back to download:', error);
    }
  }

  // iOS รุ่นเก่าที่แชร์ไฟล์ไม่ได้: เปิดรูปในแท็บใหม่ให้กดค้างแล้ว "บันทึกรูปภาพ"
  if (isIOS()) {
    const blobUrl = URL.createObjectURL(file);
    if (window.open(blobUrl, '_blank')) {
      setTimeout(() => alert('กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ" เพื่อเก็บลงอัลบั้ม'), 500);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return 'done';
  }

  // คอม / Android ที่แชร์ไม่ได้: ดาวน์โหลดตามปกติ
  const blobUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return 'done';
}

// ===== PRINT (admin only) =====
// จัดหน้ากระดาษ 4x6 นิ้วบนเครื่อง (ไม่ต้องให้ server สร้างไฟล์ปริ้น)
const printOptionsModal = document.getElementById('printOptionsModal');
const printTypeSection = document.getElementById('printTypeSection');
const printCardSection = document.getElementById('printCardSection');
const galleryPrintCount = document.getElementById('galleryPrintCount');
const confirmPrintBtn = document.getElementById('confirmPrintBtn');
let printCardPhotoIndex = 0;
let printCardPreviewToken = 0;

// Card printing is available when the event has cards, or the set was taken with a card
function photoSetHasCard(photoSet) {
  return !!(currentEvent && currentEvent.cardEnabled) || Number.isInteger(photoSet.cardPhotoIndex);
}

function getPhotoSetFrame(photoSet) {
  return (currentEvent && currentEvent.frames || []).find(f => f.id === photoSet.frameId) || null;
}

function getGalleryPrintType() {
  if (!photoSetHasCard(currentPhotoSet)) return 'strip';
  return document.querySelector('input[name="printType"]:checked').value;
}

function getGalleryPrintCount() {
  const count = parseInt(galleryPrintCount.value, 10);
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

function updateGalleryPrintOptions() {
  const type = getGalleryPrintType();
  const showCard = type !== 'strip';
  
  printCardSection.style.display = showCard ? 'block' : 'none';
  document.getElementById('galleryPrintCountLabel').textContent =
    type === 'card' ? 'จำนวน "การ์ดอวยพร"' : 'จำนวน "รูป 1 ชุด"';
  document.getElementById('galleryPrintSummary').textContent =
    describeSheets(computeSheets(type, getGalleryPrintCount()));
  
  if (showCard) {
    renderPrintCardPreview();
  }
}

// Build card photo picker for the current set
function renderPrintCardPicker() {
  const picker = document.getElementById('printCardPhotoPicker');
  picker.innerHTML = '';
  
  currentPhotoSet.photos.forEach((photo, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'card-photo-option';
    option.classList.toggle('selected', index === printCardPhotoIndex);
    option.innerHTML = `<img src="${optimizeCloudinaryUrl(photo, 'small')}" alt="รูปที่ ${index + 1}"><span>รูปที่ ${index + 1}</span>`;
    option.addEventListener('click', () => {
      printCardPhotoIndex = index;
      picker.querySelectorAll('.card-photo-option').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
      });
      renderPrintCardPreview();
    });
    picker.appendChild(option);
  });
}

// Draw card preview (uses preview-size photo to keep it light)
async function renderPrintCardPreview() {
  const frame = getPhotoSetFrame(currentPhotoSet);
  const token = ++printCardPreviewToken;
  document.getElementById('printNoCardNotice').style.display = frame && frame.cardPath ? 'none' : 'block';
  
  try {
    const photo = optimizeCloudinaryUrl(currentPhotoSet.photos[printCardPhotoIndex], 'preview');
    const images = await loadCompositeImages(cardSpec(frame, photo));
    // Skip stale renders when the selection changed while loading
    if (token !== printCardPreviewToken) return;
    const canvas = document.getElementById('printCardPreview');
    paintComposite(canvas.getContext('2d'), canvas.width, canvas.height, images);
  } catch (error) {
    console.error('Card preview error:', error);
  }
}

// Strip image for printing: stored composite, or render locally if it is missing
async function getStripPrintUrl(photoSet, frame) {
  if (photoSet.composite) {
    return photoSet.composite;
  }
  if (!frame) {
    throw new Error('ไม่พบรูป composite สำหรับปริ้น');
  }
  return URL.createObjectURL(await renderCompositeBlob(stripSpec(frame, photoSet.photos)));
}

function closePrintOptions() {
  printOptionsModal.classList.remove('active');
  // Free decoded full-size images
  clearImageCache();
}

// Open print options
printPhotoBtn.addEventListener('click', () => {
  if (!currentPhotoSet) return;
  
  const hasCard = photoSetHasCard(currentPhotoSet);
  printTypeSection.style.display = hasCard ? 'block' : 'none';
  document.querySelector('input[name="printType"][value="both"]').checked = true;
  galleryPrintCount.value = 1;
  printCardPhotoIndex = Number.isInteger(currentPhotoSet.cardPhotoIndex) ? currentPhotoSet.cardPhotoIndex : 0;
  
  if (hasCard) {
    renderPrintCardPicker();
  }
  updateGalleryPrintOptions();
  
  printOptionsModal.classList.add('active');
});

document.querySelectorAll('input[name="printType"]').forEach(radio => {
  radio.addEventListener('change', updateGalleryPrintOptions);
});

galleryPrintCount.addEventListener('input', updateGalleryPrintOptions);
galleryPrintCount.addEventListener('change', () => {
  galleryPrintCount.value = getGalleryPrintCount();
  updateGalleryPrintOptions();
});

document.getElementById('galleryPrintMinus').addEventListener('click', () => {
  galleryPrintCount.value = Math.max(1, getGalleryPrintCount() - 1);
  updateGalleryPrintOptions();
});

document.getElementById('galleryPrintPlus').addEventListener('click', () => {
  galleryPrintCount.value = getGalleryPrintCount() + 1;
  updateGalleryPrintOptions();
});

document.getElementById('cancelPrintBtn').addEventListener('click', closePrintOptions);

// Confirm print
confirmPrintBtn.addEventListener('click', async () => {
  const type = getGalleryPrintType();
  const frame = getPhotoSetFrame(currentPhotoSet);
  const originalText = confirmPrintBtn.textContent;
  
  try {
    confirmPrintBtn.disabled = true;
    confirmPrintBtn.textContent = 'กำลังเตรียมรูป...';
    
    const [stripUrl, cardBlob] = await Promise.all([
      type !== 'card' ? getStripPrintUrl(currentPhotoSet, frame) : null,
      type !== 'strip' ? renderCompositeBlob(cardSpec(frame, currentPhotoSet.photos[printCardPhotoIndex])) : null
    ]);
    
    printSheets(computeSheets(type, getGalleryPrintCount()), {
      strip: stripUrl,
      card: cardBlob ? URL.createObjectURL(cardBlob) : null
    });
    
    closePrintOptions();
  } catch (error) {
    console.error('Print file generation failed:', error);
    alert(`สร้างไฟล์ปริ้นไม่สำเร็จ: ${error.message}`);
  } finally {
    confirmPrintBtn.disabled = false;
    confirmPrintBtn.textContent = originalText;
  }
});

// Delete photo set (admin only)
deleteSetBtn.addEventListener('click', async () => {
  if (!confirm('ต้องการลบชุดรูปนี้หรือไม่?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/photos/${currentPhotoSet.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      photoViewerModal.classList.remove('active');
      await loadPhotos();
    } else {
      alert('ลบรูปไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
});

// Close modal
document.querySelectorAll('#photoViewerModal .close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    photoViewerModal.classList.remove('active');
    clearPendingSave();
    // Stop slideshow
    stopSlideshow();
    // Reset photo display
    if (currentPhoto) {
      currentPhoto.style.display = 'none';
      currentPhoto.src = '';
    }
    hidePhotoLoading();
  });
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!photoViewerModal.classList.contains('active')) return;

  // Print options open on top: only Escape (close it) applies
  if (printOptionsModal.classList.contains('active')) {
    if (e.key === 'Escape') closePrintOptions();
    return;
  }

  if (e.key === 'ArrowLeft') {
    const prevBtn = document.querySelector('.prev-btn');
    if (!prevBtn.disabled) {
      prevBtn.click();
    }
  } else if (e.key === 'ArrowRight') {
    const nextBtn = document.querySelector('.next-btn');
    if (!nextBtn.disabled) {
      nextBtn.click();
    }
  } else if (e.key === 'Escape') {
    photoViewerModal.classList.remove('active');
    clearPendingSave();
    // Stop slideshow
    stopSlideshow();
    // Reset photo display
    if (currentPhoto) {
      currentPhoto.style.display = 'none';
      currentPhoto.src = '';
    }
    hidePhotoLoading();
  }
});

// Initialize on load
init();
