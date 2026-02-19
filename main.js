const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

// --- Configuration ---
let mainWindow;

// --- Window Creation ---
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: width - 420, // Position on the right side
    y: 100,
    frame: false,           // No borders/title bar
    transparent: true,      // Transparent background
    alwaysOnTop: true,      // Floats over everything
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Security best practice
    },
  });

  // --- CRITICAL: INVISIBILITY FEATURE ---
  // This prevents the window from being captured in Zoom/Teams/Discord screen shares.
  // It effectively makes the window "invisible" to capture software while remaining visible to you.
  mainWindow.setContentProtection(true);

  mainWindow.loadFile('index.html');

  // Optional: Open DevTools for debugging (comment out in production)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- API Handling (The Brain) ---

// 1. Handle Audio Blob from Renderer
ipcMain.handle('process-audio', async (event, audioBuffer) => {
  try {
    // Save buffer to a temporary file for Whisper (Whisper API often requires a file stream)
    const tempFilePath = path.join(app.getPath('temp'), 'recording.webm');
    fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));

    console.log('Audio received, sending to Whisper...');
    
    // 2. Call Whisper API (Speech to Text)
    const transcription = await transcribeAudio(tempFilePath);
    if (!transcription) return { error: "Transcription failed" };

    console.log('Transcription:', transcription);

    // 3. Call Claude API (Text to Advice)
    const advice = await getClaudeAdvice(transcription);
    
    return { transcription, advice };

  } catch (error) {
    console.error('Error in processing flow:', error);
    return { error: error.message };
  }
});

// --- Helper: Whisper API ---
async function transcribeAudio(filePath) {
  if (!process.env.OPENAI_API_KEY) return "Simulation: API Key missing. You said something smart.";

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('model', 'whisper-1');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    return response.data.text;
  } catch (error) {
    console.error('Whisper API Error:', error.response ? error.response.data : error.message);
    return null;
  }
}

// --- Helper: Claude API ---
async function getClaudeAdvice(userText) {
  if (!process.env.ANTHROPIC_API_KEY) return "Simulation: Here is some advice based on what you said. Keep answers concise using the STAR method.";

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: "claude-3-opus-20240229", // Or claude-3-sonnet-20240229 for speed
      max_tokens: 300,
      messages: [
        { role: "user", content: `You are an expert interview coach. The user is in a live interview. 
        Analyze this text (which is either the interviewer's question or the candidate's answer): "${userText}".
        
        If it's a question, provide 3 bullet points on how to answer it best.
        If it's an answer, suggest a quick improvement or a follow-up point.
        Keep it extremely brief and readable.` }
      ]
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    return response.data.content[0].text;
  } catch (error) {
    console.error('Claude API Error:', error.response ? error.response.data : error.message);
    return "Error getting advice.";
  }
}

