const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Mouse event passthrough toggle (for drag header)
    setIgnoreMouseEvents: (ignore, options) => {
        ipcRenderer.send('set-ignore-mouse-events', ignore, options);
    },

    // Subscribe to events from main process
    on: (channel, callback) => {
        const allowed = [
            'hotkey-triggered',
            'capture-success',
            'vision-analysis-success',
            'mode-changed',
            'mic-transcript',
            'system-transcript',
            'transcript-error',
            'deepgram-ready',
            'llm-answer',
            'mic-toggle',
            'dismiss-vision',
            'scroll-transcript',
            'change-font-size',
        ];
        if (allowed.includes(channel)) {
            ipcRenderer.on(channel, (_event, ...args) => callback(...args));
        }
    },

    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    // Settings (persistent via electron-store)
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

    // App lifecycle
    closeApp: () => ipcRenderer.send('app-quit'),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),

    // Deepgram audio pipeline (SDK lives in main/Node.js context)
    startDeepgram: () => ipcRenderer.send('start-deepgram'),
    stopDeepgram: () => ipcRenderer.send('stop-deepgram'),
    sendMicAudioChunk: (chunk) => ipcRenderer.send('mic-audio-chunk', chunk),
    sendSystemAudioChunk: (chunk) => ipcRenderer.send('system-audio-chunk', chunk),

    // Desktop capturer (for system audio source ID)
    getDesktopSourceId: () => ipcRenderer.invoke('get-desktop-source-id'),

    // Request screen recording permission (macOS)
    requestScreenPermission: () => ipcRenderer.send('request-screen-permission'),
});
