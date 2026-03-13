import React, { useState, useEffect } from 'react';

const FIELDS = [
    { key: 'deepgramApiKey', label: 'Deepgram API Key', placeholder: 'dg_...' },
    { key: 'nvidiaApiKey', label: 'NVIDIA API Key', placeholder: 'nvapi-...' },
    { key: 'visionApiUrl', label: 'Vision API URL', placeholder: 'https://integrate.api.nvidia.com/v1' },
    { key: 'visionModel', label: 'Vision Model', placeholder: 'meta/llama-3.2-90b-vision-instruct' },
];

export default function SettingsPanel({ onClose }) {
    const [settings, setSettings] = useState({});
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        window.electron.getSettings().then(setSettings);
    }, []);

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        for (const [key, value] of Object.entries(settings)) {
            await window.electron.setSetting(key, value);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(10,10,20,0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column',
            padding: '16px', gap: '12px', zIndex: 100,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>⚙ Settings</span>
                <button onClick={onClose} style={btnStyle('#ffffff20', '#ffffff')}>✕</button>
            </div>

            {FIELDS.map(({ key, label, placeholder }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{label}</span>
                    <input
                        type={key.toLowerCase().includes('key') ? 'password' : 'text'}
                        value={settings[key] || ''}
                        placeholder={placeholder}
                        onChange={e => handleChange(key, e.target.value)}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 4, padding: '5px 8px',
                            color: 'white', fontSize: 12, outline: 'none',
                            fontFamily: 'monospace',
                        }}
                    />
                </label>
            ))}

            <button
                onClick={handleSave}
                style={btnStyle(saved ? '#22c55e40' : '#6366f140', saved ? '#22c55e' : '#818cf8')}
            >
                {saved ? '✓ Saved!' : 'Save Settings'}
            </button>
        </div>
    );
}

function btnStyle(bg, color) {
    return {
        background: bg, border: `1px solid ${color}40`,
        borderRadius: 4, padding: '6px 12px',
        color, fontSize: 11, cursor: 'pointer',
    };
}
