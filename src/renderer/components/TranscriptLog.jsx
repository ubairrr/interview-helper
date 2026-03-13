import React, { useRef, useEffect, forwardRef } from 'react';

const TranscriptLog = forwardRef(function TranscriptLog({ messages, fontSize = 12 }, ref) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const renderText = (text) => {
        // Split on ``` code blocks
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, i) => {
            if (part.startsWith('```') && part.endsWith('```')) {
                // Strip the ``` delimiters and optional language tag
                const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
                return (
                    <pre key={i} style={{
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        margin: '6px 0',
                        fontFamily: 'Menlo, Monaco, Consolas, monospace',
                        fontSize: fontSize - 1,
                        lineHeight: '1.6',
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                        color: '#a5f3fc',
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}>{code}</pre>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <div ref={ref} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
        }}>
            {messages.map(msg => (
                <div key={msg.id} style={{
                    background: msg.isAI
                        ? 'rgba(99,102,241,0.25)'
                        : msg.sender === 'System'
                            ? 'rgba(255,255,255,0.05)'
                            : 'rgba(255,255,255,0.12)',
                    borderLeft: msg.isAI ? '2px solid #818cf8' : '2px solid transparent',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    color: msg.isAI ? '#e0e7ff' : 'rgba(255,255,255,0.75)',
                    fontSize: fontSize,
                    lineHeight: '1.5',
                    textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
                }}>
                    {msg.sender !== 'System' && (
                        <span style={{ fontSize: '10px', opacity: 0.5, display: 'block', marginBottom: 2 }}>
                            {msg.sender}
                        </span>
                    )}
                    {msg.isAI ? renderText(msg.text) : msg.text}
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
});

export default TranscriptLog;
