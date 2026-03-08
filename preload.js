const { contextBridge, ipcRenderer } = require('electron');

// We expose a secure API to the renderer process.
// The renderer cannot access Node.js directly, only these functions.

contextBridge.exposeInMainWorld('api', {
  // Send audio buffer to main process
  processAudio: (buffer, modelType) => ipcRenderer.invoke('process-audio', buffer, modelType),
  
  // Notification helper
  onProcessingStart: (callback) => ipcRenderer.on('processing-start', (event, ...args) => callback(...args)),
  onProcessingEnd: (callback) => ipcRenderer.on('processing-end', (event, ...args) => callback(...args)),

  // Screenshot Tools
  takeScreenshotFull: (language) => ipcRenderer.invoke('take-screenshot-full', language),
  startSelection: (language) => ipcRenderer.invoke('start-selection', language),
  
  // Overlay communication
  onShowOverlay: (callback) => ipcRenderer.on('show-overlay', (event, dataUrl) => callback(dataUrl)),
  sendCrop: (dataUrl) => ipcRenderer.send('crop-complete', dataUrl),
  cancelCrop: () => ipcRenderer.send('crop-cancelled'),
  
  // Results
  onImageResult: (callback) => ipcRenderer.on('image-result', (event, result) => callback(result)),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  setOpacity: (value) => ipcRenderer.send('set-opacity', value),
  resizeWindow: (bounds) => ipcRenderer.send('resize-window', bounds),
  
  // Auth
  login: (email, password) => ipcRenderer.invoke('auth-login', email, password),
  register: (email, password) => ipcRenderer.invoke('auth-register', email, password),
  logout: () => ipcRenderer.invoke('auth-logout'),
  checkAuth: () => ipcRenderer.invoke('auth-check'),
  resendVerification: () => ipcRenderer.invoke('auth-resend-verification'),
        
  // Payment
  createPayment: (type, duration, price) => ipcRenderer.invoke('create-payment', type, duration, price),
  cancelSubscription: () => ipcRenderer.invoke('cancel-subscription'),
  
  // Config
  getFirebaseConfig: () => ipcRenderer.invoke('get-firebase-config'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Profile
  getUserProfile: () => ipcRenderer.invoke('get-user-profile')
});
