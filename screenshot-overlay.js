const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let startX, startY, isDrawing = false;
let screenImage = new Image();

// Resize canvas to full screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Receive the screenshot data from Main
window.api.onShowOverlay((dataUrl) => {
  screenImage.onload = () => {
    drawOverlay();
  };
  screenImage.src = dataUrl;
});

function drawOverlay(selection = null) {
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw the full screenshot dim
  ctx.globalAlpha = 1.0;
  ctx.drawImage(screenImage, 0, 0, canvas.width, canvas.height);
  
  // 2. Add a semi-transparent black overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. If there is a selection, clear the black overlay there (to highlight it)
  // and draw the image again cleanly
  if (selection) {
    const { x, y, w, h } = selection;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(screenImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
}

canvas.addEventListener('mousedown', (e) => {
  startX = e.clientX;
  startY = e.clientY;
  isDrawing = true;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const w = currentX - startX;
  const h = currentY - startY;
  
  drawOverlay({ x: startX, y: startY, w, h });
});

canvas.addEventListener('mouseup', async (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  
  const endX = e.clientX;
  const endY = e.clientY;
  
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  
  if (width < 10 || height < 10) {
      // Too small, ignore or cancel
      drawOverlay(); // Reset
      return;
  }

  // Create a temporary canvas to crop the image
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = width;
  cropCanvas.height = height;
  const cropCtx = cropCanvas.getContext('2d');

  // We need to map the screen coordinates to the image coordinates
  // Assuming the image covers the canvas (fullscreen)
  // Since we drew screenImage at 0,0,width,height:
  // The scale might be different if devicePixelRatio > 1?
  // Electron's desktopCapturer returns image at screen size usually.
  
  cropCtx.drawImage(screenImage, x, y, width, height, 0, 0, width, height);
  
  const croppedDataUrl = cropCanvas.toDataURL('image/png');
  
  // Send back to main
  window.api.sendCrop(croppedDataUrl);
});

// Escape to cancel
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.cancelCrop();
  }
});
