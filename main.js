const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
// Polyfill for File in Node < 20 (Required for OpenAI SDK)
const { File } = require('node:buffer');
if (!globalThis.File) {
  globalThis.File = File;
}

const axios = require('axios');
const FormData = require('form-data');
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

// --- Configuration ---
let mainWindow;
const USE_GROQ = true; // Set to true to use Groq, false to use OpenAI
const GROQ_MODEL = "llama-3.3-70b-versatile"; 
const OPENAI_MODEL = "gpt-4o"; // Options: "gpt-4o", "gpt-3.5-turbo"

// --- Network Configuration ---
const proxyUrl = process.env.HTTPS_PROXY;
const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

console.log('Using Proxy:', proxyUrl || 'None');

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : "",
  httpAgent: httpAgent
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "",
  httpAgent: httpAgent,
  baseURL: process.env.OPENAI_BASE_URL || undefined
});

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
ipcMain.handle('process-audio', async (event, audioBuffer, useGroq) => {
  try {
    // Save buffer to a temporary file for Whisper (Whisper API often requires a file stream)
    const tempFilePath = path.join(app.getPath('temp'), 'recording.webm');
    fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));

    console.log('Audio received, sending to Whisper...');
    
    // 2. Call Transcription API (Groq or OpenAI Whisper)
    let transcription;
    if (useGroq) {
        transcription = await transcribeAudioGroq(tempFilePath);
    } else {
        transcription = await transcribeAudioOpenAI(tempFilePath);
    }

    if (!transcription) return { error: "Transcription failed" };

    console.log('Transcription:', transcription);

    // 3. Call AI for Advice (Groq or OpenAI)
    let advice;
    if (useGroq) {
       advice = await getGroqAdvice(transcription);
    } else {
       advice = await getOpenAIAdvice(transcription);
    }
    
    return { transcription, advice };

  } catch (error) {
    console.error('Error in processing flow:', error);
    return { error: error.message };
  }
});

// --- Helper: OpenAI Whisper API ---
async function transcribeAudioOpenAI(filePath) {
  if (!process.env.OPENAI_API_KEY) return "Simulation: OpenAI API Key missing.";

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
    });

    return transcription.text;
  } catch (error) {
    console.error('OpenAI Whisper API Error:', error);
    if (error.code === 'ECONNRESET') {
        return "Network Error (ECONNRESET): Please check your internet connection.";
    }
    return null;
  }
}

// --- Helper: Groq Whisper API (Fastest) ---
async function transcribeAudioGroq(filePath) {
    if (!process.env.GROQ_API_KEY) return "Simulation: Groq API Key missing.";
  
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3-turbo", // or whisper-large-v3
        temperature: 0,
        response_format: "verbose_json",
      });
  
      return transcription.text;
    } catch (error) {
      console.error('Groq Whisper API Error:', error);
      return null;
    }
  }

// --- Helper: Groq API (Ultra-Fast) ---
async function getGroqAdvice(userText) {
    if (!process.env.GROQ_API_KEY) return "Simulation (Groq): Here is fast advice. Set your GROQ_API_KEY.";
  
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are an expert interview coach. Provide extremely brief, actionable advice (bullet points) for the user who is in a live interview. Focus on 'how to answer' or 'what to improve'."
          },
          {
            role: "user",
            content: `Analyze this text: "${userText}"`
          }
        ],
        model: GROQ_MODEL,
        temperature: 0.6,
        max_tokens: 300,
      });
  
      return completion.choices[0]?.message?.content || "No advice generated.";
    } catch (error) {
      console.error('Groq API Error:', error);
      return "Error getting advice from Groq.";
    }
  }

// --- Helper: OpenAI API ---
async function getOpenAIAdvice(userText) {
  if (!process.env.OPENAI_API_KEY) return "Simulation: Here is some advice based on what you said. Keep answers concise using the STAR method.";

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are an expert interview coach. Provide extremely brief, actionable advice (bullet points) for the user who is in a live interview. Focus on 'how to answer' or 'what to improve'." },
        { role: "user", content: `Analyze this text: "${userText}"` }
      ],
      model: OPENAI_MODEL,
      max_tokens: 300,
      temperature: 0.6
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return "Error getting advice.";
  }
}
