// Gallery Page JavaScript

let currentEventId = null;
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
const photoLoading = document.getElementById('photoLoading');

// Check if admin
const authToken = localStorage.getItem('authToken');
isAdmin = !!authToken;

if (isAdmin) {
  deleteSetBtn.style.display = 'inline-flex';
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
    
    // Get event name
    const eventResponse = await fetch(`/api/events/${currentEventId}`);
    const event = await eventResponse.json();
    
    allPhotoSets = photos.map(p => ({ ...p, eventName: event.name }));
    
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

// Download current photo (รวม download GIF)
document.getElementById('downloadCurrentBtn').addEventListener('click', async () => {
  const photos = getPhotoArray();
  const currentPhotoData = photos[currentPhotoIndex];
  
  // ถ้าเป็นรูปที่ 5 (slideshow) ให้ดาวน์โหลดเป็น GIF
  if (currentPhotoData === 'slideshow') {
    await downloadGIF();
  } else if (currentPhotoIndex === 0 && currentPhotoSet.composite) {
    // Download composite
    const fullQualityUrl = optimizeCloudinaryUrl(currentPhotoData, 'full');
    await downloadPhoto(fullQualityUrl, `${currentPhotoSet.fileName}_composite`);
  } else {
    // Download individual photo
    const fullQualityUrl = optimizeCloudinaryUrl(currentPhotoData, 'full');
    await downloadPhoto(fullQualityUrl, `${currentPhotoSet.fileName}_${currentPhotoIndex}`);
  }
});

// Download GIF (สร้าง on-demand)
async function downloadGIF() {
  try {
    const downloadBtn = document.getElementById('downloadCurrentBtn');
    const originalText = downloadBtn.textContent;
    
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'กำลังสร้าง GIF...';
    }
    
    // Request GIF from server
    const response = await fetch(`/api/photos/${currentPhotoSet.id}/gif`);
    
    if (!response.ok) {
      throw new Error('Failed to generate GIF');
    }
    
    const blob = await response.blob();
    
    // Download GIF
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${currentPhotoSet.fileName}.gif`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalText;
    }
  } catch (error) {
    console.error('GIF download failed:', error);
    alert('สร้าง GIF ไม่สำเร็จ กรุณาลองอีกครั้ง');
    
    const downloadBtn = document.getElementById('downloadCurrentBtn');
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'ดาวน์โหลดรูปนี้';
    }
  }
}

// Detect if device is iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Detect if device is mobile
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Download photo helper - optimized for mobile
async function downloadPhoto(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    // For mobile devices, try to save to gallery/camera roll
    if (isMobile()) {
      // Check if Web Share API with files is supported (Android, some iOS)
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename + '.png', { type: blob.type })] })) {
        const file = new File([blob], filename + '.png', { type: blob.type });
        try {
          await navigator.share({
            files: [file],
            title: 'บันทึกรูปภาพ',
            text: 'บันทึกรูปนี้ลงในครังรูป'
          });
          return;
        } catch (shareError) {
          console.log('Share cancelled or failed:', shareError);
          // Fall through to download method
        }
      }
      
      // For iOS - open in new tab so user can long-press to save
      if (isIOS()) {
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');
        if (newWindow) {
          // Show instruction
          setTimeout(() => {
            alert('กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ" เพื่อเก็บลงครังรูป');
          }, 500);
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      }
    }
    
    // Fallback: Standard download for desktop and unsupported mobile browsers
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('Download failed:', error);
    alert('ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

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
document.querySelectorAll('.close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    photoViewerModal.classList.remove('active');
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
