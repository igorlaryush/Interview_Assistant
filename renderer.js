// --- State Management ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// --- DOM Elements ---
const startBtn = document.getElementById('startBtn');
const statusIndicator = document.getElementById('status');
const contentArea = document.getElementById('content');

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

      // 4. Send to Main Process
      const result = await window.api.processAudio(arrayBuffer);
      
      // 5. Display Result
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
    addMessage("Error", "Microphone access denied.", "error");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    // Stop all tracks to release microphone
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
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

