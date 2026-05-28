// View Photo Page - For users scanning QR code

let photoSet = null;
let currentPhotoIndex = 0;

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const photoContent = document.getElementById('photoContent');
const errorScreen = document.getElementById('errorScreen');
const currentPhoto = document.getElementById('currentPhoto');
const photoIndex = document.getElementById('photoIndex');
const photoFileName = document.getElementById('photoFileName');
const photoLoading = document.getElementById('photoLoading');

// Initialize
async function init() {
  const params = new URLSearchParams(window.location.search);
  const photoId = params.get('id');
  
  if (!photoId) {
    showError();
    return;
  }
  
  try {
    // Load photo set data
    const response = await fetch(`/api/photos/${photoId}`);
    
    if (!response.ok) {
      throw new Error('Photo not found');
    }
    
    photoSet = await response.json();
    
    // Display photo set
    photoFileName.textContent = photoSet.fileName;
    document.title = `${photoSet.fileName} - Photo Booth`;
    
    loadingScreen.style.display = 'none';
    photoContent.style.display = 'block';
    
    // Display first photo
    updatePhotoDisplay();
  } catch (error) {
    console.error('Failed to load photo:', error);
    showError();
  }
}

// Show error screen
function showError() {
  loadingScreen.style.display = 'none';
  errorScreen.style.display = 'block';
}

// Update photo display
function updatePhotoDisplay() {
  if (!photoSet) return;
  
  // Build photo array: composite, photo1, photo2, photo3, gif
  const photos = [];
  
  if (photoSet.composite) {
    photos.push({ src: photoSet.composite, label: 'รูปพร้อมกรอบ' });
  }
  
  photoSet.photos.forEach((photo, index) => {
    photos.push({ src: photo, label: `รูปที่ ${index + 1}` });
  });
  
  if (photoSet.gif) {
    photos.push({ src: photoSet.gif, label: 'GIF Animation' });
  }
  
  // Show loading indicator
  showPhotoLoading();
  
  // Display current photo with optimization
  const currentPhotoData = photos[currentPhotoIndex];
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
  
  photoIndex.textContent = `${currentPhotoIndex + 1} / ${photos.length} - ${currentPhotoData.label}`;
  
  // Update navigation buttons
  document.getElementById('prevBtn').disabled = currentPhotoIndex === 0;
  document.getElementById('nextBtn').disabled = currentPhotoIndex === photos.length - 1;
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
    full: 'f_auto,q_auto:best'
  };
  
  const transform = transformations[type] || transformations.thumbnail;
  
  // Insert transformation into URL
  return url.replace('/upload/', `/upload/${transform}/`);
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

// Get photo array
function getPhotoArray() {
  const photos = [];
  if (photoSet.composite) photos.push(photoSet.composite);
  photos.push(...photoSet.photos);
  if (photoSet.gif) photos.push(photoSet.gif);
  return photos;
}

// Navigation
document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentPhotoIndex > 0) {
    currentPhotoIndex--;
    updatePhotoDisplay();
  }
});

document.getElementById('nextBtn').addEventListener('click', () => {
  const photos = getPhotoArray();
  if (currentPhotoIndex < photos.length - 1) {
    currentPhotoIndex++;
    updatePhotoDisplay();
  }
});

// Download current photo
document.getElementById('downloadCurrentBtn').addEventListener('click', async () => {
  const photos = getPhotoArray();
  const photoUrl = photos[currentPhotoIndex];
  const fullQualityUrl = optimizeCloudinaryUrl(photoUrl, 'full');
  await downloadPhoto(fullQualityUrl, `${photoSet.fileName}_${currentPhotoIndex + 1}`);
});

// Detect if device is iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Detect if device is mobile
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Download photo helper
async function downloadPhoto(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    // For mobile devices, try to save to gallery/camera roll
    if (isMobile()) {
      // Check if Web Share API with files is supported
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename + '.png', { type: blob.type })] })) {
        const file = new File([blob], filename + '.png', { type: blob.type });
        try {
          await navigator.share({
            files: [file],
            title: 'บันทึกรูปภาพ',
            text: 'บันทึกรูปนี้ลงในคลังรูป'
          });
          return;
        } catch (shareError) {
          console.log('Share cancelled or failed:', shareError);
        }
      }
      
      // For iOS - open in new tab
      if (isIOS()) {
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');
        if (newWindow) {
          setTimeout(() => {
            alert('กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ" เพื่อเก็บลงคลังรูป');
          }, 500);
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      }
    }
    
    // Fallback: Standard download
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

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    const prevBtn = document.getElementById('prevBtn');
    if (!prevBtn.disabled) {
      prevBtn.click();
    }
  } else if (e.key === 'ArrowRight') {
    const nextBtn = document.getElementById('nextBtn');
    if (!nextBtn.disabled) {
      nextBtn.click();
    }
  }
});

// Initialize on load
init();
