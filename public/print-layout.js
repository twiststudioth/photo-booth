// Shared compositing + print layout helpers (used by capture.js and gallery.js)

// Strip size: 2x6 inch at 600 DPI = 2400x7200
// Each photo is 2200x1467 (3:2 ratio), centered with equal top/bottom margins
const STRIP_WIDTH = 2400;
const STRIP_HEIGHT = 7200;
const SLOT_WIDTH = 2200;
const SLOT_HEIGHT = 1467;
const SLOT_SIDE_MARGIN = 100;
const SLOT_SPACING = 67;
const SLOT_TOP_MARGIN = (STRIP_HEIGHT - (SLOT_HEIGHT * 3 + SLOT_SPACING * 2)) / 2;

// Cache image loads so previews/prints reuse already-decoded frames and photos
const imageCache = new Map();

function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error('Failed to load image'));
      };
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

// Drop cached images (call when a photo session ends so captured photos can be freed)
function clearImageCache() {
  imageCache.clear();
}

// Spec for "รูป 1 ชุด" (3 photos in the strip frame)
function stripSpec(frame, photos) {
  return {
    photos,
    frameUrl: frame.path,
    overlayUrl: frame.overlayPath || null
  };
}

// Spec for "รูปการ์ดอวยพร" (1 photo in slot 1, white background when the frame has no card)
function cardSpec(frame, photo) {
  const hasCard = !!(frame && frame.cardPath);
  return {
    photos: [photo],
    frameUrl: hasCard ? frame.cardPath : null,
    overlayUrl: hasCard ? (frame.cardOverlayPath || null) : null
  };
}

// Load every image a composite needs (overlay failures are ignored, like before)
async function loadCompositeImages(spec) {
  const [frameImg, overlayImg, photoImgs] = await Promise.all([
    spec.frameUrl ? loadImage(spec.frameUrl) : null,
    spec.overlayUrl ? loadImage(spec.overlayUrl).catch(() => null) : null,
    Promise.all(spec.photos.map(loadImage))
  ]);
  return { frameImg, overlayImg, photoImgs };
}

// Paint loaded images: frame background -> photos -> overlay
function paintComposite(ctx, width, height, images) {
  const scale = width / STRIP_WIDTH;
  ctx.clearRect(0, 0, width, height);

  if (images.frameImg) {
    ctx.drawImage(images.frameImg, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  images.photoImgs.forEach((img, i) => {
    const y = SLOT_TOP_MARGIN + i * (SLOT_HEIGHT + SLOT_SPACING);
    ctx.drawImage(img, SLOT_SIDE_MARGIN * scale, y * scale, SLOT_WIDTH * scale, SLOT_HEIGHT * scale);
  });

  if (images.overlayImg) {
    ctx.drawImage(images.overlayImg, 0, 0, width, height);
  }
}

// Render a full-size (2400x7200) composite and return it as a JPEG blob
async function renderCompositeBlob(spec) {
  const images = await loadCompositeImages(spec);
  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;
  paintComposite(canvas.getContext('2d'), STRIP_WIDTH, STRIP_HEIGHT, images);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to encode composite'))), 'image/jpeg', 0.95);
  });
}

// Arrange strips/cards onto 4x6" sheets (2 slots each) using as few sheets as possible.
// mode 'strip': N strips, empty slot -> strip
// mode 'card' : N cards,  empty slot -> card
// mode 'both' : N strips + 1 card, empty slot -> card
function computeSheets(mode, count) {
  const main = mode === 'card' ? 'card' : 'strip';
  const filler = mode === 'strip' ? 'strip' : 'card';
  const slots = Array(count).fill(main);
  if (mode === 'both') slots.push('card');
  if (slots.length % 2) slots.push(filler);

  const sheets = [];
  for (let i = 0; i < slots.length; i += 2) {
    sheets.push([slots[i], slots[i + 1]]);
  }
  return sheets;
}

// Short Thai summary, e.g. "ใช้กระดาษ 2 แผ่น (รูป 1 ชุด 3 รูป + การ์ดอวยพร 1 ใบ)"
function describeSheets(sheets) {
  const slots = sheets.flat();
  const strips = slots.filter(s => s === 'strip').length;
  const cards = slots.length - strips;
  const parts = [];
  if (strips) parts.push(`รูป 1 ชุด ${strips} รูป`);
  if (cards) parts.push(`การ์ดอวยพร ${cards} ใบ`);
  return `ใช้กระดาษ ${sheets.length} แผ่น (${parts.join(' + ')})`;
}

// Print all sheets as one print job (one 4x6" page per sheet).
// urls: { strip, card } image URLs; blob: URLs are revoked after printing.
function printSheets(sheets, urls) {
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = 'none';
  document.body.appendChild(printFrame);

  const pages = sheets.map(sheet => `
    <div class="sheet">
      <img src="${urls[sheet[0]]}" alt="">
      <img src="${urls[sheet[1]]}" alt="">
    </div>
  `).join('');

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

        .sheet {
          width: 4in;
          height: 6in;
          display: flex;
          overflow: hidden;
          break-after: page;
          page-break-after: always;
        }

        .sheet:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .sheet img {
          width: 2in;
          height: 6in;
          display: block;
        }
      </style>
    </head>
    <body>${pages}</body>
    </html>
  `);
  printDocument.close();

  const cleanup = () => {
    setTimeout(() => {
      printFrame.remove();
      Object.values(urls).forEach(url => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    }, 100);
  };
  printFrame.contentWindow.addEventListener('afterprint', cleanup);

  // Wait for every image on every page, then print
  const imgs = Array.from(printDocument.images);
  Promise.all(imgs.map(img => (img.complete ? null : new Promise(res => {
    img.onload = res;
    img.onerror = res;
  })))).then(() => {
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 100);
  });
}
