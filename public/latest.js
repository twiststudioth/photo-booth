// Latest Photo Display - Admin Only

// Check authentication
const authToken = localStorage.getItem('authToken');
if (!authToken) {
  alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
  window.location.href = '/admin.html';
}

let currentEventId = null;
let lastPhotoId = null;
let eventSource = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let qrcodeLibraryLoaded = false;

// DOM Elements
const loadingLatest = document.getElementById('loadingLatest');
const noPhotoMessage = document.getElementById('noPhotoMessage');
const latestContent = document.getElementById('latestContent');
const latestPhoto = document.getElementById('latestPhoto');
const latestFileName = document.getElementById('latestFileName');
const latestTime = document.getElementById('latestTime');
const qrDisplay = document.getElementById('qrDisplay');

// Wait for QRCode library to load
function waitForQRCode() {
  return new Promise((resolve) => {
    if (typeof QRCode !== 'undefined') {
      qrcodeLibraryLoaded = true;
      resolve();
      return;
    }

    const checkInterval = setInterval(() => {
      if (typeof QRCode !== 'undefined') {
        qrcodeLibraryLoaded = true;
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.error('QRCode library failed to load');
      resolve(); // Continue anyway
    }, 10000);
  });
}

// Initialize
async function init() {
  const params = new URLSearchParams(window.location.search);
  currentEventId = params.get('event');

  if (!currentEventId) {
    alert('ไม่พบข้อมูลอีเว้นท์');
    window.location.href = '/admin.html';
    return;
  }

  // Wait for QRCode library
  await waitForQRCode();

  // Load initial photo
  await loadInitialPhoto();

  // Start SSE connection
  connectSSE();
}

// Load initial photo
async function loadInitialPhoto() {
  try {
    const response = await fetch(`/api/events/${currentEventId}/photos/latest`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.status === 404) {
      // No photos yet
      loadingLatest.style.display = 'none';
      noPhotoMessage.style.display = 'block';
      latestContent.style.display = 'none';
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to load photo');
    }

    const photoSet = await response.json();
    displayPhoto(photoSet);

  } catch (error) {
    console.error('❌ Failed to load initial photo:', error);
    loadingLatest.style.display = 'none';
    noPhotoMessage.style.display = 'block';
  }
}

// Connect to SSE
function connectSSE() {
  // Close existing connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const url = `/api/events/${currentEventId}/photos/stream?token=${encodeURIComponent(authToken)}`;
  console.log('🔌 Connecting to SSE:', url);

  try {
    eventSource = new EventSource(url);

    eventSource.onopen = function(e) {
      console.log('✅ SSE Connected');
      reconnectAttempts = 0; // Reset on successful connection
    };

    // Listen for default messages
    eventSource.onmessage = function(e) {
      console.log('📨 SSE Default Message:', e.data);
      handlePhotoData(e.data);
    };

    // Listen for named 'photo' events
    eventSource.addEventListener('photo', function(e) {
      console.log('📨 SSE Photo Event:', e.data);
      handlePhotoData(e.data);
    });

    eventSource.onerror = function(e) {
      console.error('❌ SSE Error:', e);
      console.log('ReadyState:', eventSource.readyState);
      
      eventSource.close();
      
      // Reconnect with exponential backoff
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(connectSSE, delay);
      } else {
        console.error('❌ Max reconnect attempts reached');
      }
    };

  } catch (error) {
    console.error('❌ Failed to create EventSource:', error);
  }
}

// Handle photo data from SSE
function handlePhotoData(data) {
  try {
    const photoSet = JSON.parse(data);
    
    if (photoSet && photoSet.id && photoSet.id !== lastPhotoId) {
      console.log('🆕 New photo:', photoSet.id);
      displayPhoto(photoSet);
    } else {
      console.log('⏭️ Same photo, skipping:', photoSet?.id);
    }
  } catch (err) {
    console.error('❌ Parse error:', err);
  }
}

// Display photo
function displayPhoto(photoSet) {
  console.log('📸 Displaying photo:', photoSet.id);
  lastPhotoId = photoSet.id;

  // Show content
  loadingLatest.style.display = 'none';
  noPhotoMessage.style.display = 'none';
  latestContent.style.display = 'flex';

  // Display photo (composite or first photo)
  const photoUrl = photoSet.composite || photoSet.photos[0];
  latestPhoto.src = photoUrl;

  // Display info
  latestFileName.textContent = photoSet.fileName;

  const date = new Date(photoSet.createdAt);
  const timeStr = date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  latestTime.textContent = timeStr;

  // Generate QR Code
  generateQRCode(photoSet.id);
}

// Generate QR Code
async function generateQRCode(photoId) {
  if (!qrcodeLibraryLoaded) {
    console.error('QRCode library not loaded');
    qrDisplay.innerHTML = '<p style="color: white;">กำลังโหลด QR Code...</p>';
    return;
  }

  const photoUrl = `${window.location.origin}/view.html?id=${photoId}`;

  qrDisplay.innerHTML = '';

  try {
    // Create a container div for the QR code
    const qrContainer = document.createElement('div');
    qrContainer.style.display = 'inline-block';
    qrContainer.style.padding = '10px';
    qrContainer.style.backgroundColor = 'white';
    qrContainer.style.borderRadius = '8px';
    qrDisplay.appendChild(qrContainer);

    // Generate QR code using qrcodejs
    new QRCode(qrContainer, {
      text: photoUrl,
      width: 280,
      height: 280,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch (error) {
    console.error('QR Code generation error:', error);
    qrDisplay.innerHTML = '<p style="color: red;">ไม่สามารถสร้าง QR Code ได้</p>';
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});

// Initialize on load
window.addEventListener('load', init);
