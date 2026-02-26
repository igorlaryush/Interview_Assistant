# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Ghost Interview Assistant — an Electron desktop app that records audio, transcribes it via Whisper (Groq or OpenAI), and returns real-time interview coaching advice via LLM. Single-service, no database.

### Running the app

```
npm start          # launches the Electron GUI (requires a display, e.g. DISPLAY=:1)
```

The app runs in **simulation mode** when API keys are absent, returning placeholder strings instead of calling external APIs. This is useful for UI and pipeline testing without secrets.

### Building distributable

```
npm run build      # runs electron-builder (produces platform-specific installers)
```

### Environment variables (`.env` file)

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | One of Groq/OpenAI | Groq cloud API for fast Whisper transcription + Llama chat |
| `OPENAI_API_KEY` | One of Groq/OpenAI | OpenAI API for Whisper transcription + GPT chat |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible base URL |
| `HTTPS_PROXY` | No | Proxy for outbound HTTPS requests |

### Cloud VM caveats

- **No lint/test/format scripts** are configured in `package.json`. Only `start` and `build` exist.
- **D-Bus and GPU errors** in Electron console output (e.g. `Failed to connect to the bus`, `Exiting GPU process`) are expected in the container environment and do not affect app functionality.
- **Microphone access** is unavailable in the headless VM; the app's `startRecording()` will throw, but the full IPC pipeline (renderer → main → API simulation) can still be exercised by sending a fake audio buffer through the `process-audio` IPC handler.
