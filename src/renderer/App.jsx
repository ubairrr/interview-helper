import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import TranscriptLog from './components/TranscriptLog.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

export default function App() {
    const [messages, setMessages] = useState([
        { sender: 'System', text: 'Interview AI ready. Press ⌘⇧⌥H to toggle stealth/normal mode. Press ⌘⇧⌥M to analyze screen.', isAI: false, id: Date.now() }
    ]);
    const [showSettings, setShowSettings] = useState(false);
    const [mode, setMode] = useState('stealth');
    const [fontSize, setFontSize] = useState(12);
    const transcriptRef = useRef(null);

    const addMessage = (sender, text, isAI, image = null) => {
        setMessages(prev => [...prev, { sender, text, isAI, image, id: Date.now() + Math.random() }]);
    };

    const resizeToFitContent = () => {
        setTimeout(() => {
            if (transcriptRef.current) {
                const contentH = transcriptRef.current.scrollHeight + 60;
                const maxHeight = window.screen?.availHeight ? (window.screen.availHeight - 100) : 800;
                const newHeight = Math.max(400, Math.min(contentH, maxHeight));
                window.electron.resizeWindow(600, newHeight);
            }
        }, 100);
    };

    const openSettings = () => {
        window.electron.setIgnoreMouseEvents(false);
        setShowSettings(true);
    };

    const closeSettings = () => {
        setShowSettings(false);
        if (mode === 'stealth') {
            window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
    };

    useEffect(() => {
        window.appendMessage = addMessage;

        window.electron.on('hotkey-triggered', () => {
            addMessage('System', '📸 Capturing screen...', false);
        });
        window.electron.on('capture-success', (imageBase64) => {
            addMessage('System', 'Screenshot captured:', false, imageBase64);
            resizeToFitContent();
        });

        window.electron.on('mode-changed', (newMode) => {
            setMode(newMode);
            if (newMode === 'stealth') setShowSettings(false);
            addMessage('System',
                newMode === 'stealth'
                    ? '🥷 Stealth mode — transparent & click-through.'
                    : '👁 Normal mode — fully visible & interactive.',
                false
            );
        });
        window.electron.on('deepgram-ready', () => {
            addMessage('System', '🎙 Deepgram connected — listening for speech...', false);
        });
        window.electron.on('mic-transcript', (text) => {
            addMessage('You', text, false);
        });
        window.electron.on('system-transcript', (text) => {
            addMessage('Interviewer', text, false);
        });
        window.electron.on('transcript-error', (msg) => {
            addMessage('System', `⚠️ ${msg}`, false);
        });
        window.electron.on('mic-toggle', (enabled) => {
            addMessage('System', enabled ? '🎤 Mic transcription ON' : '🔇 Mic transcription OFF', false);
        });
        window.electron.on('dismiss-vision', () => {
            resizeToFitContent();
        });
        window.electron.on('scroll-transcript', (direction) => {
            if (transcriptRef.current) {
                transcriptRef.current.scrollBy({ top: direction === 'up' ? -150 : 150, behavior: 'smooth' });
            }
        });
        window.electron.on('change-font-size', (delta) => {
            setFontSize(prev => Math.max(8, Math.min(20, prev + delta)));
        });
        window.electron.on('llm-answer', (answer) => {
            addMessage('AI', answer, true);
            resizeToFitContent();
        });

        return () => {
            ['hotkey-triggered', 'capture-success', 'mode-changed', 'deepgram-ready',
                'mic-transcript', 'system-transcript', 'transcript-error',
                'llm-answer', 'mic-toggle', 'dismiss-vision', 'scroll-transcript', 'change-font-size'
            ].forEach(ch => window.electron.removeAllListeners(ch));
        };
    }, []);



    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: mode === 'normal' ? 'rgba(15, 15, 25, 0.97)' : 'transparent',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            position: 'relative',
            outline: mode === 'normal' ? '1px solid rgba(99,102,241,0.5)' : 'none',
            borderRadius: mode === 'normal' ? 8 : 0,
            overflow: 'hidden',
            transition: 'background 0.3s ease',
        }}>
            <Header onSettingsToggle={openSettings} mode={mode} />
            {showSettings && <SettingsPanel onClose={closeSettings} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <TranscriptLog ref={transcriptRef} messages={messages} fontSize={fontSize} />
            </div>
        </div>
    );
}
