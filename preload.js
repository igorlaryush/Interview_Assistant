const { contextBridge, ipcRenderer } = require('electron');

// We expose a secure API to the renderer process.
// The renderer cannot access Node.js directly, only these functions.

contextBridge.exposeInMainWorld('api', {
  // Send audio buffer to main process
  processAudio: (buffer) => ipcRenderer.invoke('process-audio', buffer),
  
  // Notification helper
  onProcessingStart: (callback) => ipcRenderer.on('processing-start', callback),
  onProcessingEnd: (callback) => ipcRenderer.on('processing-end', callback)
});

