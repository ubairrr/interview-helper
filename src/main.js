const { app, BrowserWindow, ipcMain, globalShortcut, systemPreferences, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createClient } = require('@deepgram/sdk');
const OpenAI = require('openai');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const store = new Store();
let mainWindow;
let isStealthMode = false;
let micTranscriptionEnabled = false; // mic transcription off by default
let micConnection = null;
let systemConnection = null;
let micKeepAliveTimer;
let systemKeepAliveTimer;

// Audio processing constants
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // Int16
const CHANNELS = 1;

const openai = new OpenAI({
  apiKey: store.get('nvidiaApiKey') || process.env.NVIDIA_API_KEY,
  baseURL: store.get('visionApiUrl') || process.env.VISION_API_URL
});

function convertFloat32ToInt16(chunk) {
  const pcm16 = new Int16Array(chunk.length);
  for (let i = 0; i < chunk.length; i++) {
    let s = Math.max(-1, Math.min(1, chunk[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}

// --- LLM Question Accumulator ---
let currentQuestion = '';
let llmSender = null; // reference to event.sender for sending LLM results

async function triggerLLM(questionText) {
  if (!llmSender) return;
  try {
    console.log(`[LLM] Triggering with question: "${questionText.substring(0, 80)}..."`);
    const response = await openai.chat.completions.create({
      model: store.get('visionModel') || process.env.VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are answering a technical interview question. Rules: No filler phrases like "Great question" or "That's interesting". No unnecessary jargon. Be direct — start with the answer immediately. Explain clearly and concisely as if speaking to the interviewer. Keep the explanation short enough to say out loud in under 2 minutes. If the question asks for code or an implementation, include the complete working code inside a single \`\`\` code block after your explanation. Default to Python unless a different language is specifically requested.`
        },
        {
          role: 'user',
          content: questionText
        }
      ],
      max_tokens: 2048
    });
    const answer = response.choices[0].message.content;
    llmSender.send('llm-answer', answer);
    console.log('[LLM] Answer delivered.');
  } catch (err) {
    console.error('[LLM] Error:', err);
    if (llmSender) llmSender.send('llm-answer', `Error: ${err.message}`);
  }
}

function createDeepgramConnection(apiKey, label, event) {
  const deepgram = createClient(apiKey);
  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    encoding: 'linear16',
    sample_rate: SAMPLE_RATE,
    channels: CHANNELS,
  });

  connection.on('open', () => {
    console.log(`[Deepgram:${label}] WebSocket opened.`);
    if (label === 'mic') event.sender.send('deepgram-ready');
  });

  connection.on('Results', (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript) {
      const channel = label === 'mic' ? 'mic-transcript' : 'system-transcript';
      event.sender.send(channel, transcript);

      // For system audio: accumulate transcript and trigger LLM on speech_final
      if (label === 'system') {
        currentQuestion += ' ' + transcript;
        if (data.speech_final && currentQuestion.trim().length > 10) {
          const question = currentQuestion.trim();
          currentQuestion = '';
          triggerLLM(question);
        }
      }
    }
  });

  connection.on('error', (err) => {
    console.error(`[Deepgram:${label}] Error:`, err);
    event.sender.send('transcript-error', `Deepgram ${label} error: ${err.message}`);
  });

  connection.on('close', () => {
    console.log(`[Deepgram:${label}] WebSocket closed.`);
  });

  return connection;
}

function setupDeepgramIPC() {
  ipcMain.on('start-deepgram', (event) => {
    try {
      // Tear down existing connections
      if (micConnection) { micConnection.finish(); micConnection = null; }
      if (systemConnection) { systemConnection.finish(); systemConnection = null; }
      clearInterval(micKeepAliveTimer);
      clearInterval(systemKeepAliveTimer);

      const apiKey = store.get('deepgramApiKey') || process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        event.sender.send('transcript-error', 'Deepgram API Key is missing. Please add it in settings.');
        return;
      }

      // Create two independent connections
      llmSender = event.sender;
      currentQuestion = '';
      micConnection = createDeepgramConnection(apiKey, 'mic', event);
      systemConnection = createDeepgramConnection(apiKey, 'system', event);

      // Keep-alive pings for both
      micKeepAliveTimer = setInterval(() => {
        if (micConnection && micConnection.getReadyState() === 1) micConnection.keepAlive();
      }, 10000);
      systemKeepAliveTimer = setInterval(() => {
        if (systemConnection && systemConnection.getReadyState() === 1) systemConnection.keepAlive();
      }, 10000);

    } catch (err) {
      console.error('[Deepgram] Start Error:', err);
      event.sender.send('transcript-error', 'Failed to start Deepgram: ' + err.message);
    }
  });

  // Separate IPC listeners for each audio stream
  ipcMain.on('mic-audio-chunk', (event, chunk) => {
    if (!micTranscriptionEnabled) return; // skip when mic transcription is off
    if (micConnection && micConnection.getReadyState() === 1) {
      micConnection.send(convertFloat32ToInt16(chunk).buffer);
    }
  });

  ipcMain.on('system-audio-chunk', (event, chunk) => {
    if (systemConnection && systemConnection.getReadyState() === 1) {
      systemConnection.send(convertFloat32ToInt16(chunk).buffer);
    }
  });

  ipcMain.on('stop-deepgram', () => {
    console.log('[Deepgram] Connections stopped.');
    if (micConnection) { micConnection.finish(); micConnection = null; }
    if (systemConnection) { systemConnection.finish(); systemConnection = null; }
    clearInterval(micKeepAliveTimer);
    clearInterval(systemKeepAliveTimer);
  });
}

function applyStealthMode(win) {
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(true);
  win.setOpacity(0.95);
  win.webContents.send('mode-changed', 'stealth');
  console.log('[Mode] Stealth mode enabled');
}

function applyNormalMode(win) {
  win.setIgnoreMouseEvents(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(true);
  win.setOpacity(1);
  win.webContents.send('mode-changed', 'normal');
  console.log('[Mode] Normal mode enabled');
}

// IPC handler: get a valid desktopCapturer sourceId for system audio
ipcMain.handle('get-desktop-source-id', async () => {
  const { desktopCapturer } = require('electron');
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  console.log('[desktopCapturer] Sources found:', sources.length, sources.map(s => s.id));
  return sources[0]?.id || null;
});

// IPC handler: renderer reports system audio permission failure
ipcMain.on('request-screen-permission', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'This app needs Screen & System Audio Recording permission to capture interviewer audio separately from your microphone.',
    detail: 'Click "Open Settings" to grant the permission, then restart the app.',
    buttons: ['Open Settings', 'Continue Without System Audio'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    x: 50,
    y: 50,
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Dual protection: screen-saver level + content protection
  // screen-saver level: sits above most capture layers
  // content protection: tells macOS to exclude from screen capture entirely
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setContentProtection(true);
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options);
  });

  ipcMain.handle('get-settings', () => ({
    deepgramApiKey: store.get('deepgramApiKey'),
    nvidiaApiKey: store.get('nvidiaApiKey'),
    visionApiUrl: store.get('visionApiUrl'),
    visionModel: store.get('visionModel'),
  }));

  ipcMain.handle('set-setting', (_event, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.on('app-quit', () => app.quit());

  ipcMain.on('resize-window', (event, width, height) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const currentSize = win.getSize();
      win.setSize(width || currentSize[0], height || currentSize[1], true);
    }
  });

  setupDeepgramIPC();
}

app.dock.hide();

app.whenReady().then(() => {
  createWindow();

  const ret = globalShortcut.register('CommandOrControl+Shift+Option+M', async () => {
    console.log('Hotkey pressed! Ready for screen capture.');
    if (mainWindow) {
      mainWindow.webContents.send('hotkey-triggered', 'Capture initiated');
      try {
        const sources = await require('electron').desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 }
        });
        const primarySource = sources[0];
        if (primarySource) {
          const size = primarySource.thumbnail.getSize();
          const resized = primarySource.thumbnail.resize({ width: Math.floor(size.width / 2) });
          const imageBase64 = resized.toDataURL();

          mainWindow.webContents.send('capture-success', imageBase64);
          mainWindow.webContents.send('vision-analysis-success', 'AI is analyzing the screen... Please wait (~10s).');
          try {
            const response = await openai.chat.completions.create({
              model: store.get('visionModel') || process.env.VISION_MODEL,
              messages: [
                {
                  role: 'system',
                  content: 'You are an elite senior software engineer helping a candidate pass a technical interview. Analyze the provided screenshot. If it is a coding problem, you MUST structure your response into exactly two parts:\n1. A brief explanation of how we are going to solve the problem (the approach/algorithm).\n2. The actual complete, correct code solution.'
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Solve the problem visible on the screen following the required 2-part format. If it is not a coding problem, tell me exactly what to say next.' },
                    { type: 'image_url', image_url: { url: imageBase64 } }
                  ]
                }
              ],
              max_tokens: 300
            });
            const analysis = response.choices[0].message.content;
            mainWindow.webContents.send('vision-analysis-success', analysis);
          } catch (apiError) {
            console.error('Vision API Error:', apiError);
            mainWindow.webContents.send('vision-analysis-success', `Error connecting to Vision API: ${apiError.message}`);
          }
        }
      } catch (e) {
        console.error('Failed to capture screen:', e);
      }
    }
  });

  if (!ret) console.error('Registration failed for capture shortcut');

  const toggleRet = globalShortcut.register('CommandOrControl+Shift+Option+H', () => {
    if (!mainWindow) return;
    isStealthMode = !isStealthMode;
    if (isStealthMode) applyStealthMode(mainWindow);
    else applyNormalMode(mainWindow);
  });

  if (!toggleRet) console.error('Registration failed for mode toggle shortcut');

  const micToggleRet = globalShortcut.register('CommandOrControl+Shift+Option+T', () => {
    if (!mainWindow) return;
    micTranscriptionEnabled = !micTranscriptionEnabled;
    const status = micTranscriptionEnabled ? '🎤 Mic transcription ON' : '🔇 Mic transcription OFF';
    console.log(`[Mic] ${status}`);
    mainWindow.webContents.send('mic-toggle', micTranscriptionEnabled);
  });

  if (!micToggleRet) console.error('Registration failed for mic toggle shortcut');

  const dismissVisionRet = globalShortcut.register('CommandOrControl+Shift+Option+D', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('dismiss-vision');
    console.log('[Vision] Panel dismissed');
  });

  if (!dismissVisionRet) console.error('Registration failed for dismiss vision shortcut');

  globalShortcut.register('CommandOrControl+Shift+Option+Up', () => {
    if (mainWindow) mainWindow.webContents.send('scroll-transcript', 'up');
  });
  globalShortcut.register('CommandOrControl+Shift+Option+Down', () => {
    if (mainWindow) mainWindow.webContents.send('scroll-transcript', 'down');
  });
  globalShortcut.register('CommandOrControl+Shift+Option+Right', () => {
    if (mainWindow) mainWindow.webContents.send('change-font-size', 1);
  });
  globalShortcut.register('CommandOrControl+Shift+Option+Left', () => {
    if (mainWindow) mainWindow.webContents.send('change-font-size', -1);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (micConnection) micConnection.finish();
  if (systemConnection) systemConnection.finish();
});
