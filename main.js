const { app, BrowserWindow, ipcMain, screen, desktopCapturer, shell, safeStorage, protocol } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- Configuration ---
// These are Firebase frontend keys. It is perfectly safe to include them in the client application.
const firebaseConfig = {
    apiKey: "AIzaSyB8Ip6QN9ol0lmJ4K4afVwqkv_M6dZi9EY",
    authDomain: "interview-assistant-26e0f.firebaseapp.com",
    projectId: "interview-assistant-26e0f",
    storageBucket: "interview-assistant-26e0f.firebasestorage.app",
    messagingSenderId: "468912307735",
    appId: "1:468912307735:web:b8f8fb6738f47794262652",
    measurementId: "G-VTK2FFM61K"
};

if (!firebaseConfig.apiKey) {
    console.warn("Firebase not configured in frontend. Please set FIREBASE_API_KEY in .env");
}

// --- Configuration ---
const BACKEND_URL = "https://us-central1-interview-assistant-26e0f.cloudfunctions.net/api"; // We will update this after you deploy
let mainWindow;
let overlayWindow;
let currentScreenshotLanguage = 'Python';
let currentIdToken = null; // Store Firebase ID Token

const yaml = require('js-yaml');

let userConfig = { models: {} };
try {
    const configPath = path.join(__dirname, 'config.yaml');
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        userConfig = yaml.load(configData);
    }
} catch (e) {
    console.error("Failed to load config.yaml:", e);
}

// --- Window Creation ---
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Single Main Window
  mainWindow = new BrowserWindow({
    width: 1100, // Wide enough for sidebar + two columns
    height: 700,
    x: width - 1150, // Position on the right side
    y: 100,
    frame: false,           // No borders/title bar
    transparent: true,      // Transparent background
    alwaysOnTop: true,      // Floats over everything
    hasShadow: false,
    resizable: true,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Security best practice
    },
  });

  // Force always on top with a higher level
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  configureWindowVisibility(mainWindow);

  // Load using our custom protocol instead of file://
  mainWindow.loadURL('app://./index.html');
  
  // Inject status message after load
  mainWindow.webContents.on('did-finish-load', () => {
    updateWindowStatus(mainWindow, "Ghost Assistant");
  });
}

function configureWindowVisibility(win) {
    // If the app is packaged, always run in stealth mode. 
    // In development, fall back to INVISIBLE_MODE env var, defaulting to true.
    const isGhostMode = app.isPackaged ? true : (process.env.INVISIBLE_MODE !== 'false');
    win.setContentProtection(isGhostMode);
    try {
        if (typeof win.setDisplayAffinity === 'function') {
            win.setDisplayAffinity(isGhostMode ? 'exclude-from-capture' : 'none');
        }
    } catch (e) {}
    win.setSkipTaskbar(isGhostMode);
}

function updateWindowStatus(win, winName) {
    const isGhostMode = app.isPackaged ? true : (process.env.INVISIBLE_MODE !== 'false');
    const statusMsg = isGhostMode 
      ? "Window is INVISIBLE (Stealth Mode)." 
      : "Window is VISIBLE (Demo Mode).";
      
    win.webContents.executeJavaScript(`
      const sysMsg = document.querySelector('.message.system p');
      if(sysMsg) sysMsg.innerHTML = '${winName} initialized.<br>${statusMsg}';
    `);
}

function createOverlayWindow(dataUrl) {
    if (overlayWindow) overlayWindow.close();

    const { width, height } = screen.getPrimaryDisplay().bounds;

    overlayWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        fullscreen: true,
        enableLargerThanScreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });
    
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');

    overlayWindow.loadURL('app://./screenshot-overlay.html');
    
    overlayWindow.webContents.on('did-finish-load', () => {
        overlayWindow.webContents.send('show-overlay', dataUrl);
    });

    overlayWindow.on('closed', () => overlayWindow = null);
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  // Register a custom protocol to trick Firebase Analytics into working
  const { protocol } = require('electron');
  // Register the protocol as standard and secure BEFORE app is ready, if possible.
  // Since we're here, we just handle the basic file routing.
  protocol.registerFileProtocol('app', (request, callback) => {
    let url = request.url.substr(6); // strip app://
    // Ensure the URL is properly decoded (fixes issues with spaces/special chars)
    url = decodeURI(url);
    // Strip query parameters if any exist
    if (url.includes('?')) {
      url = url.split('?')[0];
    }
    const normalizedUrl = path.normalize(path.join(__dirname, url));
    callback({ path: normalizedUrl });
  });

  createWindow();

  // Check for updates seamlessly
  autoUpdater.checkForUpdatesAndNotify();

  // Install updates as soon as they are downloaded (silently restarts the app when closed)
  autoUpdater.on('update-downloaded', (info) => {
    // If you want it to restart immediately, uncomment the next line:
    // autoUpdater.quitAndInstall();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Secure Auth Storage ---
function getAuthFilePath() {
    return path.join(app.getPath('userData'), 'auth.json');
}

function saveCredentials(email, refreshToken) {
    if (safeStorage.isEncryptionAvailable()) {
        try {
            const encryptedToken = safeStorage.encryptString(refreshToken);
            const data = {
                email: email,
                refreshToken: encryptedToken.toString('base64')
            };
            fs.writeFileSync(getAuthFilePath(), JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save credentials:', error);
        }
    } else {
        console.warn('Encryption not available, cannot save credentials');
    }
}

function loadCredentials() {
    const authFile = getAuthFilePath();
    if (fs.existsSync(authFile) && safeStorage.isEncryptionAvailable()) {
        try {
            const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
            if (data.refreshToken) {
                const encryptedToken = Buffer.from(data.refreshToken, 'base64');
                const decryptedToken = safeStorage.decryptString(encryptedToken);
                return { email: data.email, refreshToken: decryptedToken };
            } else if (data.password) {
                // Legacy migration: clear and force re-login
                clearCredentials();
                return null;
            }
        } catch (error) {
            console.error('Failed to load credentials:', error);
            return null;
        }
    }
    return null;
}

function clearCredentials() {
    const authFile = getAuthFilePath();
    if (fs.existsSync(authFile)) {
        try {
            fs.unlinkSync(authFile);
        } catch (error) {
            console.error('Failed to clear credentials:', error);
        }
    }
}

// --- Firebase Auth IPC Handlers ---

ipcMain.handle('auth-login', async (event, email, password) => {
    if (!firebaseConfig.apiKey) return { error: "Firebase not configured" };
    try {
        const response = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
            email: email,
            password: password,
            returnSecureToken: true
        });
        
        currentIdToken = response.data.idToken;
        const refreshToken = response.data.refreshToken;
        const uid = response.data.localId;
        
        saveCredentials(email, refreshToken);
        
        const userResponse = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
            idToken: currentIdToken
        });
        
        const userData = userResponse.data.users[0];
        
        return { success: true, user: { uid: uid, email: userData.email, emailVerified: userData.emailVerified } };
    } catch (error) {
        console.error("Login error:", error?.response?.data || error.message);
        let errorMsg = error.message;
        if (error?.response?.data?.error?.message) {
            errorMsg = error.response.data.error.message;
            if (errorMsg === 'INVALID_PASSWORD' || errorMsg === 'EMAIL_NOT_FOUND' || errorMsg === 'INVALID_LOGIN_CREDENTIALS') {
                errorMsg = 'Invalid email or password.';
            } else if (errorMsg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
                errorMsg = 'Firebase: We have blocked all requests from this device due to unusual activity. Try again later. (auth/too-many-requests).';
            }
        }
        return { error: errorMsg };
    }
});

ipcMain.handle('auth-register', async (event, email, password) => {
    if (!firebaseConfig.apiKey) return { error: "Firebase not configured" };
    try {
        const response = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
            email: email,
            password: password,
            returnSecureToken: true
        });
        
        currentIdToken = response.data.idToken;
        const refreshToken = response.data.refreshToken;
        const uid = response.data.localId;
        
        saveCredentials(email, refreshToken);
        
        await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`, {
            requestType: "VERIFY_EMAIL",
            idToken: currentIdToken
        });
        
        return { success: true, user: { uid: uid, email: email, emailVerified: false } };
    } catch (error) {
        console.error("Register error:", error?.response?.data || error.message);
        let errorMsg = error.message;
        if (error?.response?.data?.error?.message) {
            errorMsg = error.response.data.error.message;
            if (errorMsg === 'EMAIL_EXISTS') errorMsg = 'Email already in use.';
        }
        return { error: errorMsg };
    }
});

ipcMain.handle('auth-logout', async (event) => {
    try {
        currentIdToken = null;
        clearCredentials();
        return { success: true };
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('auth-resend-verification', async (event) => {
    if (!currentIdToken) return { error: "Not logged in" };
    if (!firebaseConfig.apiKey) return { error: "Firebase not configured" };
    try {
        await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`, {
            requestType: "VERIFY_EMAIL",
            idToken: currentIdToken
        });
        return { success: true };
    } catch (error) {
        console.error("Resend verification error:", error?.response?.data || error.message);
        return { error: error?.response?.data?.error?.message || error.message };
    }
});

ipcMain.handle('auth-check', async (event) => {
    if (!firebaseConfig.apiKey) {
        return { authenticated: false, error: "Firebase not configured" };
    }
    
    const creds = loadCredentials();
    if (creds && creds.refreshToken) {
        try {
            const response = await axios.post(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
                grant_type: "refresh_token",
                refresh_token: creds.refreshToken
            });
            
            currentIdToken = response.data.id_token;
            const newRefreshToken = response.data.refresh_token;
            const uid = response.data.user_id;
            
            if (newRefreshToken !== creds.refreshToken) {
                saveCredentials(creds.email, newRefreshToken);
            }
            
            const userResponse = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
                idToken: currentIdToken
            });
            
            const userData = userResponse.data.users[0];
            
            return { authenticated: true, user: { uid: uid, email: userData.email, emailVerified: userData.emailVerified } };
        } catch (error) {
            console.error('Auto-login failed:', error?.response?.data || error.message);
            clearCredentials();
            return { authenticated: false };
        }
    } else {
        return { authenticated: false };
    }
});

// Refresh token periodically to ensure it doesn't expire during long sessions
setInterval(async () => {
    if (currentIdToken && firebaseConfig.apiKey) {
        const creds = loadCredentials();
        if (creds && creds.refreshToken) {
            try {
                const response = await axios.post(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
                    grant_type: "refresh_token",
                    refresh_token: creds.refreshToken
                });
                currentIdToken = response.data.id_token;
                if (response.data.refresh_token !== creds.refreshToken) {
                    saveCredentials(creds.email, response.data.refresh_token);
                }
            } catch(e) { 
                console.error("Error refreshing token:", e?.response?.data || e.message); 
            }
        }
    }
}, 10 * 60 * 1000); // Every 10 mins


// --- Window Controls ---
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.on('set-opacity', (event, value) => {
    if (mainWindow) mainWindow.setOpacity(Number(value));
});

ipcMain.on('resize-window', (event, bounds) => {
    if (mainWindow) mainWindow.setBounds(bounds);
});

// --- API Handling (The Brain) ---

// 1. Handle Audio Blob from Renderer
ipcMain.handle('process-audio', async (event, audioBuffer, modelType) => {
  try {
    // Convert Buffer to Base64
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    console.log('Audio received, sending to Cloud Backend...');

    const headers = {};
    if (currentIdToken) {
        headers['Authorization'] = `Bearer ${currentIdToken}`;
    }

    const response = await axios.post(BACKEND_URL, {
        action: 'transcribe_and_advice',
        data: audioBase64,
        model: modelType,
        systemPrompt: userConfig.systemPromptAudio,
        models: userConfig.models
    }, { headers });

    console.log('Received response from Cloud Backend:', response.data);
    return response.data; // { transcription, advice }

  } catch (error) {
    console.error('Error in processing flow:', error);
    
    // Improved error logging
    if (error.response) {
      console.error('Backend returned status:', error.response.status);
      console.error('Backend returned data:', error.response.data);
    } else if (error.request) {
      console.error('No response received from backend:', error.request);
    } else {
      console.error('Error setting up request:', error.message);
    }
    
    if (error.response && error.response.status === 403) {
        return { error: 'Daily limit reached. Upgrade to premium.', code: 403 };
    }
    
    // Return a visible error to the frontend
    return { error: `Failed to connect to backend: ${error.message}` };
  }
});

// --- Screenshot Handlers ---

ipcMain.handle('take-screenshot-full', async (event, language) => {
    return await handleScreenshot(true, language);
});

ipcMain.handle('start-selection', async (event, language) => {
    return await handleScreenshot(false, language);
});

async function handleScreenshot(isFull, language = 'Python') {
    currentScreenshotLanguage = language;

    // 1. Hide windows to avoid capturing them
    if (mainWindow) mainWindow.hide();
    
    // Allow UI to update
    await new Promise(r => setTimeout(r, 200));

    try {
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.size; 
        
        const sources = await desktopCapturer.getSources({ 
            types: ['screen'], 
            thumbnailSize: { width: width, height: height } 
        });
        
        const primarySource = sources[0]; 
        const image = primarySource.thumbnail;
        const dataUrl = image.toDataURL();

        if (isFull) {
            // Restore windows
            if (mainWindow) mainWindow.show();
            
            // Process immediately
            analyzeImage(dataUrl, currentScreenshotLanguage);
            return { success: true };
        } else {
             // Open Overlay
             createOverlayWindow(dataUrl);
             return { success: true };
        }

    } catch (e) {
        console.error(e);
        if (mainWindow) mainWindow.show();
        return { error: e.message };
    }
}

ipcMain.on('crop-complete', (event, dataUrl) => {
    if (overlayWindow) overlayWindow.close();
    if (mainWindow) mainWindow.show();
    analyzeImage(dataUrl, currentScreenshotLanguage);
});

ipcMain.on('crop-cancelled', () => {
    if (overlayWindow) overlayWindow.close();
    if (mainWindow) mainWindow.show();
});

async function analyzeImage(dataUrl, language = 'Python') {
    // Send status updates to Screenshot Window
    if (mainWindow) mainWindow.webContents.send('processing-start');

    // Remove data:image/...;base64, prefix if present
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");

    // Construct the prompt here based on config.json
    let visionPrompt = userConfig.systemPromptVision || "";
    visionPrompt = visionPrompt.replace('{{language}}', language);

    try {
        const headers = {};
        if (currentIdToken) {
            headers['Authorization'] = `Bearer ${currentIdToken}`;
        }

        const response = await axios.post(BACKEND_URL, {
            action: 'analyze_image',
            data: dataUrl, // Backend handles the full data URL
            model: language,
            systemPrompt: visionPrompt,
            models: userConfig.models
        }, { headers });

        if (mainWindow) mainWindow.webContents.send('image-result', response.data);
    } catch (err) {
        console.error(err);
        if (err.response && err.response.status === 403) {
             if (mainWindow) mainWindow.webContents.send('image-result', { error: "Insufficient Tokens. Please top up.", code: 403 });
        } else {
             if (mainWindow) mainWindow.webContents.send('image-result', { error: "Error processing image." });
        }
    } finally {
        if (mainWindow) mainWindow.webContents.send('processing-end');
    }
}

// Payment Handler
ipcMain.handle('create-payment', async (event, purchaseType = 'subscription', duration = 'monthly', price = null) => {
    try {
        const headers = {};
        if (currentIdToken) {
            headers['Authorization'] = `Bearer ${currentIdToken}`;
        }

        let finalPrice = price;
        let tokensToCredit = 0;
        if (!finalPrice) {
            if (purchaseType === 'topup') {
                finalPrice = (userConfig.paywall && userConfig.paywall.prices && userConfig.paywall.prices.topup) ? userConfig.paywall.prices.topup : '250.00';
            } else if (duration === 'yearly') {
                finalPrice = (userConfig.paywall && userConfig.paywall.prices && userConfig.paywall.prices.yearly) ? userConfig.paywall.prices.yearly : '8000.00';
            } else {
                finalPrice = (userConfig.paywall && userConfig.paywall.prices && userConfig.paywall.prices.monthly) ? userConfig.paywall.prices.monthly : '1900.00';
            }
        }
        
        if (purchaseType === 'topup') {
            tokensToCredit = (userConfig.paywall && userConfig.paywall.tokens && userConfig.paywall.tokens.topup) !== undefined ? userConfig.paywall.tokens.topup : 500000;
        } else if (duration === 'yearly') {
            tokensToCredit = (userConfig.paywall && userConfig.paywall.tokens && userConfig.paywall.tokens.yearly) !== undefined ? userConfig.paywall.tokens.yearly : 10000000;
        } else {
            tokensToCredit = (userConfig.paywall && userConfig.paywall.tokens && userConfig.paywall.tokens.monthly) !== undefined ? userConfig.paywall.tokens.monthly : 1000000;
        }

        const response = await axios.post(BACKEND_URL, {
            action: 'create_payment',
            price: finalPrice,
            purchaseType: purchaseType,
            duration: duration,
            tokensToCredit: tokensToCredit
        }, { headers });

        if (response.data && response.data.confirmationUrl) {
            shell.openExternal(response.data.confirmationUrl);
            return { success: true };
        }
        return { error: 'No confirmation URL returned' };
    } catch (error) {
        console.error("Payment error:", error);
        return { error: error.message };
    }
});

// Cancel Subscription Handler
ipcMain.handle('cancel-subscription', async (event) => {
    try {
        const headers = {};
        if (currentIdToken) {
            headers['Authorization'] = `Bearer ${currentIdToken}`;
        }

        const response = await axios.post(BACKEND_URL, {
            action: 'cancel_subscription'
        }, { headers });

        return response.data;
    } catch (error) {
        console.error("Cancel subscription error:", error);
        return { error: error.message };
    }
});

// --- User Profile & Config IPC Handlers ---

// --- Config IPC Handlers ---
ipcMain.handle('get-firebase-config', () => {
    return firebaseConfig;
});

ipcMain.handle('get-config', () => {
    return userConfig;
});

ipcMain.handle('save-config', (event, newConfig) => {
    try {
        userConfig = { ...userConfig, ...newConfig };
        const configPath = path.join(__dirname, 'config.yaml');
        fs.writeFileSync(configPath, yaml.dump(userConfig));
        return { success: true };
    } catch (e) {
        console.error("Failed to save config.yaml:", e);
        return { error: e.message };
    }
});

ipcMain.handle('get-user-profile', async (event) => {
    if (!currentIdToken) return { error: "Not authenticated" };
    
    try {
        const headers = { 'Authorization': `Bearer ${currentIdToken}` };
        const response = await axios.post(BACKEND_URL, {
            action: 'get_profile'
        }, { headers });
        return response.data;
    } catch (e) {
        return { error: e.message };
    }
});
