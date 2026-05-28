// Admin Panel JavaScript

let authToken = localStorage.getItem('authToken') || '';
let currentEvent = null;

// SHA256 hash function
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const createEventBtn = document.getElementById('createEventBtn');
const eventsList = document.getElementById('eventsList');

// Modals
const createEventModal = document.getElementById('createEventModal');
const eventDetailModal = document.getElementById('eventDetailModal');
const createEventForm = document.getElementById('createEventForm');

// Check auth on load
if (authToken) {
  showAdminPanel();
} else {
  loginScreen.style.display = 'block';
}

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  // Hash password with SHA256 before sending
  const hashedPassword = await sha256(password);
  
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: hashedPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      showAdminPanel();
    } else {
      loginError.textContent = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
    }
  } catch (error) {
    loginError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('authToken');
  authToken = null;
  adminPanel.style.display = 'none';
  loginScreen.style.display = 'block';
});

// Show admin panel
async function showAdminPanel() {
  loginScreen.style.display = 'none';
  adminPanel.style.display = 'block';
  await loadEvents();
}

// Load events
async function loadEvents() {
  try {
    const response = await fetch('/api/events');
    const events = await response.json();
    
    eventsList.innerHTML = '';
    
    if (events.length === 0) {
      eventsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">ยังไม่มีอีเว้นท์</p>';
      return;
    }
    
    events.forEach(event => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `
        <h3>${event.name}</h3>
        <p>Prefix: ${event.filePrefix}</p>
        <p>รูปทั้งหมด: ${event.photoCounter || 0} ชุด</p>
        <p>กรอบ: ${event.frames?.length || 0} กรอบ</p>
        <p>${new Date(event.createdAt).toLocaleDateString('th-TH')}</p>
        <div class="event-card-actions">
          <button class="btn-icon btn-capture" data-event-id="${event.id}" title="เปิดหน้าถ่ายรูป">
            📸
          </button>
          <button class="btn-icon btn-gallery" data-event-id="${event.id}" title="เปิดแกลเลอรี่">
            🖼️
          </button>
        </div>
      `;
      card.addEventListener('click', () => showEventDetail(event.id));
      eventsList.appendChild(card);
    });
    
    // Add event listeners for capture and gallery buttons
    document.querySelectorAll('.btn-capture').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCapture(btn.dataset.eventId);
      });
    });
    
    document.querySelectorAll('.btn-gallery').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGallery(btn.dataset.eventId);
      });
    });
  } catch (error) {
    console.error('Failed to load events:', error);
  }
}

// Create event modal
createEventBtn.addEventListener('click', () => {
  createEventModal.classList.add('active');
});

// Close modals
document.querySelectorAll('.close-btn, .cancel-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.target.closest('.modal').classList.remove('active');
  });
});

// Create event form
createEventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const eventData = {
    name: document.getElementById('eventName').value,
    filePrefix: document.getElementById('filePrefix').value,
    uploadFolder: document.getElementById('uploadFolder').value || 'default'
  };
  
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(eventData)
    });
    
    if (response.ok) {
      createEventModal.classList.remove('active');
      createEventForm.reset();
      await loadEvents();
    } else {
      alert('สร้างอีเว้นท์ไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
});

// Show event detail
async function showEventDetail(eventId) {
  try {
    const response = await fetch(`/api/events/${eventId}`);
    const event = await response.json();
    currentEvent = event;
    
    document.getElementById('eventDetailTitle').textContent = event.name;
    
    // Event info
    document.getElementById('eventInfo').innerHTML = `
      <p><strong>Prefix:</strong> ${event.filePrefix}</p>
      <p><strong>โฟลเดอร์:</strong> ${event.uploadFolder}</p>
      <p><strong>จำนวนรูป:</strong> ${event.photoCounter || 0} ชุด</p>
      <p><strong>สร้างเมื่อ:</strong> ${new Date(event.createdAt).toLocaleDateString('th-TH')}</p>
    `;

    // Links
    const captureUrl = `${window.location.origin}/capture.html?event=${event.id}`;
    const galleryUrl = `${window.location.origin}/gallery.html?event=${event.id}`;
    const latestUrl = `${window.location.origin}/latest.html?event=${event.id}`;
    
    document.getElementById('captureLink').value = captureUrl;
    document.getElementById('galleryLink').value = galleryUrl;
    document.getElementById('latestLink').value = latestUrl;
    
    // Frames
    const framesList = document.getElementById('framesList');
    framesList.innerHTML = '';
    if (event.frames && event.frames.length > 0) {
      event.frames.forEach(frame => {
        const frameDiv = document.createElement('div');
        frameDiv.className = 'frame-item';
        
        // Add overlay badge if frame has overlay
        const overlayBadge = frame.overlayPath ? '<span class="overlay-badge" title="มี Overlay">🎭</span>' : '';
        
        frameDiv.innerHTML = `
          <img src="${frame.path}" alt="${frame.name}">
          ${overlayBadge}
          <div class="frame-item-actions">
            <button class="frame-edit-btn" data-event-id="${event.id}" data-frame-id="${frame.id}" title="แก้ไขกรอบ">
              ✏️
            </button>
            <button class="frame-delete-btn" data-event-id="${event.id}" data-frame-id="${frame.id}" title="ลบกรอบ">
              🗑️
            </button>
          </div>
        `;
        framesList.appendChild(frameDiv);
      });
    } else {
      framesList.innerHTML = '<p style="color: var(--text-secondary);">ยังไม่มีกรอบ</p>';
    }
    
    // Add event listeners for frame buttons
    document.querySelectorAll('.frame-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editFrame(btn.dataset.eventId, btn.dataset.frameId);
      });
    });
    
    document.querySelectorAll('.frame-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteFrame(btn.dataset.eventId, btn.dataset.frameId);
      });
    });
    
    eventDetailModal.classList.add('active');
  } catch (error) {
    console.error('Failed to load event detail:', error);
  }
}

// Upload frame
document.getElementById('uploadFrameBtn').addEventListener('click', () => {
  document.getElementById('frameUpload').click();
});

document.getElementById('frameUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const response = await fetch(`/api/events/${currentEvent.id}/frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          frameData: event.target.result,
          frameName: file.name
        })
      });
      
      if (response.ok) {
        await showEventDetail(currentEvent.id);
      } else {
        alert('อัพโหลดกรอบไม่สำเร็จ');
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด');
    }
  };
  reader.readAsDataURL(file);
});

// Copy links
document.getElementById('copyCaptureLink').addEventListener('click', () => {
  const input = document.getElementById('captureLink');
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast('คัดลอกลิงก์ถ่ายรูปแล้ว');
});

document.getElementById('copyGalleryLink').addEventListener('click', () => {
  const input = document.getElementById('galleryLink');
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast('คัดลอกลิงก์ดูรูปแล้ว');
});

document.getElementById('copyLatestLink').addEventListener('click', () => {
  const input = document.getElementById('latestLink');
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast('คัดลอกลิงก์หน้าแสดงรูปล่าสุดแล้ว');
});

document.getElementById('openLatestLink').addEventListener('click', () => {
  const url = document.getElementById('latestLink').value;
  window.open(url, '_blank');
});

// Toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 2000);
}

// Delete event
document.getElementById('deleteEventBtn').addEventListener('click', async () => {
  if (!confirm('ต้องการลบอีเว้นท์นี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/events/${currentEvent.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      eventDetailModal.classList.remove('active');
      await loadEvents();
    } else {
      alert('ลบอีเว้นท์ไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
});

// Delete photo set
async function deletePhotoSet(photoId) {
  try {
    const response = await fetch(`/api/photos/${photoId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      // Reload photos if needed
      showToast('ลบรูปสำเร็จ');
    } else {
      alert('ลบรูปไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
}


// Open capture page
function openCapture(eventId) {
  window.open(`/capture.html?event=${eventId}&token=${authToken}`, '_blank');
}

// Open gallery page
function openGallery(eventId) {
  window.open(`/gallery.html?event=${eventId}`, '_blank');
}


// Delete frame
async function deleteFrame(eventId, frameId) {
  if (!confirm('ต้องการลบกรอบนี้หรือไม่?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/events/${eventId}/frames/${frameId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      await showEventDetail(eventId);
      showToast('ลบกรอบสำเร็จ');
    } else {
      alert('ลบกรอบไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
}




// ===== FRAME EDITOR =====
const frameEditorModal = document.getElementById('frameEditorModal');
const frameCanvas = document.getElementById('frameCanvas');
const ctx = frameCanvas.getContext('2d');

let textElements = [];
let overlayElements = [];
let selectedTextIndex = -1;
let bgImage = null;
let isTransparent = false;
let showPhotoAreas = true;
let editingFrameId = null;

// Photo areas configuration with margins
// Canvas: 2400x7200 (scaled to 600x1800 for editor)
// Each photo: 2200x1467 (centered with 100px side margins, 67px spacing between photos)
// Scaled down 4x for editor: 550x367 per photo, 25px side margins, 17px spacing
const photoWidth = 550;   // 2200 / 4
const photoHeight = 367;  // 1467 / 4
const sideMargin = 25;    // 100 / 4 (centered)
const photoSpacing = 17;  // 67 / 4 (rounded)

// Calculate total photos height and center vertically
const totalPhotosHeight = (photoHeight * 3) + (photoSpacing * 2);
const topMargin = (1800 - totalPhotosHeight) / 2;  // Equal top and bottom margins

const photoAreas = [
  { x: sideMargin, y: topMargin, width: photoWidth, height: photoHeight },
  { x: sideMargin, y: topMargin + photoHeight + photoSpacing, width: photoWidth, height: photoHeight },
  { x: sideMargin, y: topMargin + (photoHeight * 2) + (photoSpacing * 2), width: photoWidth, height: photoHeight }
];

// Open frame editor
document.getElementById('createFrameBtn').addEventListener('click', () => {
  editingFrameId = null;
  frameEditorModal.classList.add('active');
  document.getElementById('frameEditorModal').querySelector('h2').textContent = 'สร้างกรอบรูป';
  initCanvas();
});

// Edit existing frame
async function editFrame(eventId, frameId) {
  try {
    const response = await fetch(`/api/events/${eventId}`);
    const event = await response.json();
    const frame = event.frames.find(f => f.id === frameId);
    
    if (!frame) {
      alert('ไม่พบกรอบที่ต้องการแก้ไข');
      return;
    }
    
    editingFrameId = frameId;
    frameEditorModal.classList.add('active');
    document.getElementById('frameEditorModal').querySelector('h2').textContent = 'แก้ไขกรอบรูป';
    
    // Load frame image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      bgImage = img;
      initCanvas();
      redrawCanvas();
    };
    img.src = frame.path;
  } catch (error) {
    console.error('Failed to load frame:', error);
    alert('โหลดกรอบไม่สำเร็จ');
  }
}

// Initialize canvas
function initCanvas() {
  if (!bgImage) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
  }
  if (!editingFrameId) {
    textElements = [];
    overlayElements = [];
    bgImage = null;
    isTransparent = false;
  }
  selectedTextIndex = -1;
  showPhotoAreas = true;
  document.getElementById('showPhotoAreas').checked = true;
  updateTextList();
  updateOverlayList();
  redrawCanvas();
}

// Background color
document.getElementById('bgColor').addEventListener('change', (e) => {
  isTransparent = false;
  redrawCanvas();
});

// Transparent background
document.getElementById('bgTransparent').addEventListener('click', () => {
  isTransparent = true;
  redrawCanvas();
});

// Show/hide photo areas
document.getElementById('showPhotoAreas').addEventListener('change', (e) => {
  showPhotoAreas = e.target.checked;
  redrawCanvas();
});

// Background image upload
document.getElementById('uploadBgImageBtn').addEventListener('click', () => {
  document.getElementById('bgImageUpload').click();
});

document.getElementById('bgImageUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      redrawCanvas();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('clearBgImageBtn').addEventListener('click', () => {
  bgImage = null;
  redrawCanvas();
});

// Overlay image upload
document.getElementById('uploadOverlayBtn').addEventListener('click', () => {
  document.getElementById('overlayImageUpload').click();
});

document.getElementById('overlayImageUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Calculate aspect ratio
      const aspectRatio = img.width / img.height;
      const canvasAspectRatio = frameCanvas.width / frameCanvas.height; // 600/1800 = 1/3
      
      let overlayWidth, overlayHeight;
      
      // If image aspect ratio matches canvas (full frame overlay)
      if (Math.abs(aspectRatio - canvasAspectRatio) < 0.1) {
        // Use full canvas size
        overlayWidth = frameCanvas.width;
        overlayHeight = frameCanvas.height;
      } else {
        // Default size for logos/small overlays
        overlayWidth = 200;
        overlayHeight = 200 / aspectRatio;
      }
      
      const overlayElement = {
        image: img,
        x: frameCanvas.width / 2,
        y: frameCanvas.height / 2,
        width: overlayWidth,
        height: overlayHeight,
        name: file.name
      };
      overlayElements.push(overlayElement);
      updateOverlayList();
      redrawCanvas();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Update overlay list
function updateOverlayList() {
  const overlayList = document.getElementById('overlayList');
  overlayList.innerHTML = '';
  
  if (overlayElements.length === 0) {
    overlayList.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px; margin-top: 8px;">ยังไม่มี overlay</p>';
    return;
  }
  
  overlayElements.forEach((overlay, index) => {
    const item = document.createElement('div');
    item.className = 'overlay-list-item';
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-secondary); border-radius: 4px; margin-top: 8px;';
    
    const overlayInfo = document.createElement('div');
    overlayInfo.style.cssText = 'flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    overlayInfo.textContent = overlay.name;
    
    const overlayActions = document.createElement('div');
    overlayActions.style.cssText = 'display: flex; gap: 4px;';
    
    const btnResize = document.createElement('button');
    btnResize.className = 'btn-icon-small';
    btnResize.textContent = '🔍';
    btnResize.title = 'ปรับขนาด';
    btnResize.onclick = () => resizeOverlay(index);
    
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-icon-small';
    btnDelete.textContent = '🗑️';
    btnDelete.title = 'ลบ';
    btnDelete.onclick = () => deleteOverlay(index);
    
    overlayActions.appendChild(btnResize);
    overlayActions.appendChild(btnDelete);
    
    item.appendChild(overlayInfo);
    item.appendChild(overlayActions);
    overlayList.appendChild(item);
  });
}

// Resize overlay
function resizeOverlay(index) {
  const overlay = overlayElements[index];
  const aspectRatio = overlay.image.width / overlay.image.height;
  
  const options = [
    { label: 'เต็มกรอบ (600x1800)', width: 600, height: 1800 },
    { label: 'ใหญ่ (400px)', width: 400, height: 400 / aspectRatio },
    { label: 'กลาง (200px)', width: 200, height: 200 / aspectRatio },
    { label: 'เล็ก (100px)', width: 100, height: 100 / aspectRatio },
    { label: 'กำหนดเอง', width: null, height: null }
  ];
  
  let message = 'เลือกขนาด:\n';
  options.forEach((opt, i) => {
    message += `${i + 1}. ${opt.label}\n`;
  });
  
  const choice = prompt(message, '1');
  if (!choice) return;
  
  const selectedIndex = parseInt(choice) - 1;
  if (selectedIndex >= 0 && selectedIndex < options.length) {
    if (options[selectedIndex].width === null) {
      // Custom size
      const newSize = prompt('ใส่ความกว้าง (px):', overlay.width);
      if (newSize && !isNaN(newSize)) {
        const size = parseInt(newSize);
        overlayElements[index].width = size;
        overlayElements[index].height = size / aspectRatio;
      }
    } else {
      // Preset size
      overlayElements[index].width = options[selectedIndex].width;
      overlayElements[index].height = options[selectedIndex].height;
    }
    redrawCanvas();
  }
}

// Delete overlay
function deleteOverlay(index) {
  overlayElements.splice(index, 1);
  updateOverlayList();
  redrawCanvas();
}

// Font size slider
document.getElementById('fontSize').addEventListener('input', (e) => {
  document.getElementById('fontSizeValue').textContent = e.target.value + 'px';
});

// Add text
document.getElementById('addTextBtn').addEventListener('click', () => {
  const text = document.getElementById('textInput').value.trim();
  if (!text) {
    alert('กรุณาพิมพ์ข้อความ');
    return;
  }
  
  const textElement = {
    text: text,
    x: frameCanvas.width / 2,
    y: 150 + (textElements.length * 80),  // เริ่มที่ 150px (ในพื้นที่บน 300px)
    color: document.getElementById('textColor').value,
    size: parseInt(document.getElementById('fontSize').value),
    font: document.getElementById('fontFamily').value,
    bold: document.getElementById('textBold').checked,
    italic: document.getElementById('textItalic').checked
  };
  
  textElements.push(textElement);
  document.getElementById('textInput').value = '';
  updateTextList();
  redrawCanvas();
});

// Update text list
function updateTextList() {
  const textList = document.getElementById('textList');
  textList.innerHTML = '';
  
  if (textElements.length === 0) {
    textList.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px;">ยังไม่มีข้อความ</p>';
    return;
  }
  
  textElements.forEach((textEl, index) => {
    const item = document.createElement('div');
    item.className = 'text-list-item';
    
    const textPreview = document.createElement('div');
    textPreview.className = 'text-preview';
    textPreview.style.color = textEl.color;
    textPreview.textContent = textEl.text;
    
    const textActions = document.createElement('div');
    textActions.className = 'text-actions';
    
    const btnUp = document.createElement('button');
    btnUp.className = 'btn-icon-small';
    btnUp.textContent = '↑';
    btnUp.title = 'เลื่อนขึ้น';
    btnUp.dataset.index = index;
    btnUp.dataset.action = 'up';
    
    const btnDown = document.createElement('button');
    btnDown.className = 'btn-icon-small';
    btnDown.textContent = '↓';
    btnDown.title = 'เลื่อนลง';
    btnDown.dataset.index = index;
    btnDown.dataset.action = 'down';
    
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-icon-small';
    btnDelete.textContent = '🗑️';
    btnDelete.title = 'ลบ';
    btnDelete.dataset.index = index;
    btnDelete.dataset.action = 'delete';
    
    textActions.appendChild(btnUp);
    textActions.appendChild(btnDown);
    textActions.appendChild(btnDelete);
    
    item.appendChild(textPreview);
    item.appendChild(textActions);
    textList.appendChild(item);
  });
  
  // Add event listeners to all buttons
  document.querySelectorAll('#textList .btn-icon-small').forEach(btn => {
    btn.addEventListener('click', handleTextAction);
  });
}

// Handle text actions
function handleTextAction(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  const action = e.currentTarget.dataset.action;
  
  if (action === 'up') {
    moveTextUp(index);
  } else if (action === 'down') {
    moveTextDown(index);
  } else if (action === 'delete') {
    deleteText(index);
  }
}

// Move text up
function moveTextUp(index) {
  if (index > 0) {
    [textElements[index], textElements[index - 1]] = [textElements[index - 1], textElements[index]];
    updateTextList();
    redrawCanvas();
  }
}

// Move text down
function moveTextDown(index) {
  if (index < textElements.length - 1) {
    [textElements[index], textElements[index + 1]] = [textElements[index + 1], textElements[index]];
    updateTextList();
    redrawCanvas();
  }
}

// Delete text
function deleteText(index) {
  textElements.splice(index, 1);
  updateTextList();
  redrawCanvas();
}

// Redraw canvas
function redrawCanvas() {
  // Clear canvas
  ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  
  // Background
  if (isTransparent) {
    // Draw checkerboard pattern for transparency
    const squareSize = 20;
    for (let y = 0; y < frameCanvas.height; y += squareSize) {
      for (let x = 0; x < frameCanvas.width; x += squareSize) {
        ctx.fillStyle = ((x / squareSize + y / squareSize) % 2 === 0) ? '#cccccc' : '#ffffff';
        ctx.fillRect(x, y, squareSize, squareSize);
      }
    }
  } else {
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
  }
  
  // Background image
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, frameCanvas.width, frameCanvas.height);
  }
  
  // Draw photo areas (if enabled)
  if (showPhotoAreas) {
    photoAreas.forEach((area, index) => {
      // Semi-transparent pink overlay
      ctx.fillStyle = 'rgba(255, 182, 193, 0.3)';
      ctx.fillRect(area.x, area.y, area.width, area.height);
      
      // Border
      ctx.strokeStyle = '#ff69b4';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(area.x, area.y, area.width, area.height);
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#ff1493';
      ctx.font = 'bold 40px Pridi';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`รูปที่ ${index + 1}`, area.x + area.width / 2, area.y + area.height / 2);
    });
  }
  
  // Draw overlay elements
  overlayElements.forEach((overlay) => {
    ctx.drawImage(overlay.image, overlay.x - overlay.width / 2, overlay.y - overlay.height / 2, overlay.width, overlay.height);
  });
  
  // Draw text elements
  textElements.forEach((textEl) => {
    ctx.fillStyle = textEl.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let fontStyle = '';
    if (textEl.italic) fontStyle += 'italic ';
    if (textEl.bold) fontStyle += 'bold ';
    
    ctx.font = `${fontStyle}${textEl.size}px ${textEl.font}`;
    ctx.fillText(textEl.text, textEl.x, textEl.y);
  });
}

// Clear canvas
document.getElementById('clearCanvasBtn').addEventListener('click', () => {
  if (confirm('ต้องการล้างทั้งหมดหรือไม่?')) {
    initCanvas();
  }
});

// Save frame
document.getElementById('saveFrameBtn').addEventListener('click', async () => {
  if (!currentEvent) {
    alert('กรุณาเลือกอีเว้นท์ก่อน');
    return;
  }
  
  // Create final canvas WITHOUT photo areas overlay and WITHOUT overlay elements
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = frameCanvas.width;
  finalCanvas.height = frameCanvas.height;
  const finalCtx = finalCanvas.getContext('2d');
  
  // Background
  if (!isTransparent) {
    finalCtx.fillStyle = document.getElementById('bgColor').value;
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
  }
  
  // Background image
  if (bgImage) {
    finalCtx.drawImage(bgImage, 0, 0, finalCanvas.width, finalCanvas.height);
  }
  
  // Draw text elements (NO photo areas, NO overlays in base frame)
  textElements.forEach((textEl) => {
    finalCtx.fillStyle = textEl.color;
    finalCtx.textAlign = 'center';
    finalCtx.textBaseline = 'middle';
    
    let fontStyle = '';
    if (textEl.italic) fontStyle += 'italic ';
    if (textEl.bold) fontStyle += 'bold ';
    
    finalCtx.font = `${fontStyle}${textEl.size}px ${textEl.font}`;
    finalCtx.fillText(textEl.text, textEl.x, textEl.y);
  });
  
  // Convert base frame to data URL
  const frameData = finalCanvas.toDataURL('image/png');
  
  // Create overlay canvas (if overlays exist)
  let overlayData = null;
  if (overlayElements.length > 0) {
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = frameCanvas.width;
    overlayCanvas.height = frameCanvas.height;
    const overlayCtx = overlayCanvas.getContext('2d');
    
    // Draw overlay elements on transparent background
    overlayElements.forEach((overlay) => {
      overlayCtx.drawImage(overlay.image, overlay.x - overlay.width / 2, overlay.y - overlay.height / 2, overlay.width, overlay.height);
    });
    
    overlayData = overlayCanvas.toDataURL('image/png');
  }
  
  const frameName = `custom_frame_${Date.now()}.png`;
  
  try {
    let response;
    if (editingFrameId) {
      // Update existing frame
      response = await fetch(`/api/events/${currentEvent.id}/frames/${editingFrameId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          frameData: frameData,
          overlayData: overlayData,
          frameName: frameName
        })
      });
    } else {
      // Create new frame
      response = await fetch(`/api/events/${currentEvent.id}/frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          frameData: frameData,
          overlayData: overlayData,
          frameName: frameName
        })
      });
    }
    
    if (response.ok) {
      frameEditorModal.classList.remove('active');
      editingFrameId = null;
      await showEventDetail(currentEvent.id);
      showToast('บันทึกกรอบสำเร็จ');
    } else {
      alert('บันทึกกรอบไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
});

// Canvas drag for text and overlays
let isDragging = false;
let dragIndex = -1;
let dragType = null; // 'text' or 'overlay'

frameCanvas.addEventListener('mousedown', (e) => {
  const rect = frameCanvas.getBoundingClientRect();
  const scaleX = frameCanvas.width / rect.width;
  const scaleY = frameCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  // Check if clicked on overlay (check overlays first, they're on top)
  for (let i = overlayElements.length - 1; i >= 0; i--) {
    const overlay = overlayElements[i];
    const left = overlay.x - overlay.width / 2;
    const top = overlay.y - overlay.height / 2;
    
    if (x >= left && x <= left + overlay.width &&
        y >= top && y <= top + overlay.height) {
      isDragging = true;
      dragIndex = i;
      dragType = 'overlay';
      frameCanvas.style.cursor = 'move';
      return;
    }
  }
  
  // Check if clicked on text
  for (let i = textElements.length - 1; i >= 0; i--) {
    const textEl = textElements[i];
    ctx.font = `${textEl.bold ? 'bold ' : ''}${textEl.italic ? 'italic ' : ''}${textEl.size}px ${textEl.font}`;
    const metrics = ctx.measureText(textEl.text);
    const textWidth = metrics.width;
    const textHeight = textEl.size;
    
    if (x >= textEl.x - textWidth / 2 && x <= textEl.x + textWidth / 2 &&
        y >= textEl.y - textHeight / 2 && y <= textEl.y + textHeight / 2) {
      isDragging = true;
      dragIndex = i;
      dragType = 'text';
      frameCanvas.style.cursor = 'move';
      return;
    }
  }
});

frameCanvas.addEventListener('mousemove', (e) => {
  if (!isDragging || dragIndex === -1) return;
  
  const rect = frameCanvas.getBoundingClientRect();
  const scaleX = frameCanvas.width / rect.width;
  const scaleY = frameCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  if (dragType === 'text') {
    textElements[dragIndex].x = x;
    textElements[dragIndex].y = y;
  } else if (dragType === 'overlay') {
    overlayElements[dragIndex].x = x;
    overlayElements[dragIndex].y = y;
  }
  redrawCanvas();
});

frameCanvas.addEventListener('mouseup', () => {
  isDragging = false;
  dragIndex = -1;
  dragType = null;
  frameCanvas.style.cursor = 'default';
});

frameCanvas.addEventListener('mouseleave', () => {
  isDragging = false;
  dragIndex = -1;
  dragType = null;
  frameCanvas.style.cursor = 'default';
});
