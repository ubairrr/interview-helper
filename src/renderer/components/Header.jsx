import React from 'react';

export default function Header({ onSettingsToggle, mode = 'stealth' }) {
    const isNormal = mode === 'normal';

    const handleMouseEnter = () => {
        window.electron.setIgnoreMouseEvents(false);
    };
    const handleMouseLeave = () => {
        if (!isNormal) {
            window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
    };

    return (
        <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                WebkitAppRegion: 'drag',
                background: isNormal ? 'rgba(30, 30, 50, 0.98)' : 'rgba(0, 0, 0, 0.6)',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '11px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                userSelect: 'none',
                borderBottom: isNormal
                    ? '1px solid rgba(99,102,241,0.4)'
                    : '1px solid rgba(255,255,255,0.1)',
            }}
        >
            {/* Status dot */}
            <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: isNormal ? '#f59e0b' : '#22c55e',
                boxShadow: isNormal ? '0 0 6px #f59e0b88' : '0 0 6px #22c55e88',
                display: 'inline-block',
                transition: 'background 0.3s ease',
            }} />

            {/* Title */}
            <span style={{ flex: 1 }}>Interview AI</span>

            {/* Mode badge */}
            <span style={{
                WebkitAppRegion: 'no-drag',
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                padding: '2px 6px',
                borderRadius: 3,
                background: isNormal ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)',
                color: isNormal ? '#fbbf24' : '#4ade80',
                border: `1px solid ${isNormal ? '#f59e0b44' : '#22c55e44'}`,
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
            }}>
                {isNormal ? '● NORMAL' : '◌ STEALTH'}
            </span>

            {/* Settings + Close buttons — only in normal mode */}
            {isNormal && (
                <>
                    <button
                        onClick={onSettingsToggle}
                        style={{
                            WebkitAppRegion: 'no-drag',
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.45)',
                            cursor: 'pointer',
                            fontSize: 13,
                            lineHeight: 1,
                            padding: '2px 4px',
                        }}
                        title="Settings"
                    >
                        ⚙
                    </button>

                    <button
                        onClick={() => window.electron.closeApp()}
                        style={{
                            WebkitAppRegion: 'no-drag',
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,90,90,0.6)',
                            cursor: 'pointer',
                            fontSize: 15,
                            lineHeight: 1,
                            padding: '2px 4px',
                            fontWeight: 700,
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ff3333'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,90,90,0.6)'}
                        title="Quit app"
                    >
                        ✕
                    </button>
                </>
            )}
        </div>
    );
}
