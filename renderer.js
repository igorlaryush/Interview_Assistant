// --- State Management ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// --- DOM Elements ---
const startBtn = document.getElementById('startBtn');
const statusIndicator = document.getElementById('status');
const contentArea = document.getElementById('content');
const modelSelect = document.getElementById('modelSelect');

// --- Event Listeners ---
startBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

// --- Recording Logic ---
async function startRecording() {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      // 1. Convert chunks to a single Blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // 2. Convert Blob to ArrayBuffer (to send via IPC)
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // 3. UI Update: Show loading
      addMessage("System", "Analyzing audio...", "system");

      // 4. Get selected model
      const useGroq = modelSelect.value === 'groq';

      // 5. Send to Main Process
      const result = await window.api.processAudio(arrayBuffer, useGroq);
      
      // 6. Display Result
      if (result.error) {
        addMessage("Error", result.error, "error");
      } else {
        if (result.transcription) addMessage("You/Interviewer", result.transcription, "transcript");
        if (result.advice) addMessage("Claude", result.advice, "advice");
      }
    };

    mediaRecorder.start();
    isRecording = true;
    updateUI(true);

  } catch (err) {
    console.error("Error accessing microphone:", err);
    // Fallback to simulation mode when microphone is denied
    simulateRecording();
  }
}

// Simulation mode for testing without microphone
function simulateRecording() {
  isRecording = true;
  updateUI(true);
  addMessage("System", "Demo mode: Simulating audio recording...", "system");
}

async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    // Stop all tracks to release microphone
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  } else {
    // Simulation mode - create fake audio processing
    addMessage("System", "Analyzing audio...", "system");
    
    const useGroq = modelSelect.value === 'groq';
    // Create minimal audio buffer for simulation
    const fakeAudioBuffer = new ArrayBuffer(1024);
    
    const result = await window.api.processAudio(fakeAudioBuffer, useGroq);
    
    if (result.error) {
      addMessage("Error", result.error, "error");
    } else {
      if (result.transcription) addMessage("You/Interviewer", result.transcription, "transcript");
      if (result.advice) addMessage("Claude", result.advice, "advice");
    }
  }
  isRecording = false;
  updateUI(false);
}

// --- UI Helpers ---
function updateUI(recording) {
  if (recording) {
    startBtn.textContent = "Stop & Analyze";
    startBtn.classList.add('recording');
    statusIndicator.textContent = "Listening...";
    statusIndicator.style.color = "#ff4444";
  } else {
    startBtn.textContent = "Start Listening";
    startBtn.classList.remove('recording');
    statusIndicator.textContent = "Ready";
    statusIndicator.style.color = "#00ff88";
  }
}

function addMessage(sender, text, type) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;
  
  // Fade-in animation logic is in CSS
  msgDiv.innerHTML = `<strong>${sender}:</strong> <p>${text.replace(/\n/g, '<br>')}</p>`;
  
  contentArea.appendChild(msgDiv);
  
  // Auto-scroll to bottom
  contentArea.scrollTop = contentArea.scrollHeight;
}

