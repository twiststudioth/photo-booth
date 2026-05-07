// Admin Panel JavaScript

let authToken = localStorage.getItem('authToken');
let currentEvent = null;

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
  
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
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
    
    document.getElementById('captureLink').value = captureUrl;
    document.getElementById('galleryLink').value = galleryUrl;
    
    // Frames
    const framesList = document.getElementById('framesList');
    framesList.innerHTML = '';
    if (event.frames && event.frames.length > 0) {
      event.frames.forEach(frame => {
        const frameDiv = document.createElement('div');
        frameDiv.className = 'frame-item';
        frameDiv.innerHTML = `
          <img src="${frame.path}" alt="${frame.name}">
          <button class="frame-delete-btn" data-event-id="${event.id}" data-frame-id="${frame.id}" title="ลบกรอบ">
            ลบ
          </button>
        `;
        framesList.appendChild(frameDiv);
      });
    } else {
      framesList.innerHTML = '<p style="color: var(--text-secondary);">ยังไม่มีกรอบ</p>';
    }
    
    // Add event listeners for frame delete buttons
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
      await loadEventPhotos(currentEvent.id);
    } else {
      alert('ลบรูปไม่สำเร็จ');
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด');
  }
}


// Open capture page
function openCapture(eventId) {
  window.open(`/capture.html?event=${eventId}`, '_blank');
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


