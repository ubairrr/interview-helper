import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function VisionPanel({ captureImage, visionText }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !visionText) return;

        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                // Get the total required height
                const desiredHeight = entry.target.scrollHeight;

                // Add an offset for header/margins (approx 120px) and cap it at screen height
                const totalWindowHeight = Math.min(desiredHeight + 200, window.screen.availHeight - 100);

                window.electron.resizeWindow(null, totalWindowHeight);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [visionText]);

    return (
        <div
            ref={containerRef}
            style={{
                background: 'rgba(10, 15, 25, 0.95)',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                // Removed maxHeight / overflowY so it can dictate its full size to the window
            }}
        >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {captureImage && (
                    <img
                        src={captureImage}
                        alt="Screen capture"
                        style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)' }}
                    />
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Vision Analysis Result
                </span>
            </div>

            {visionText && (
                <div style={{
                    color: '#e2e8f0',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <Markdown
                        components={{
                            code(props) {
                                const { children, className, node, ...rest } = props;
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                    <SyntaxHighlighter
                                        {...rest}
                                        PreTag="div"
                                        children={String(children).replace(/\n$/, '')}
                                        language={match[1]}
                                        style={vscDarkPlus}
                                        customStyle={{
                                            margin: '8px 0',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            background: '#0d1117'
                                        }}
                                    />
                                ) : (
                                    <code {...rest} className={className} style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        padding: '2px 4px',
                                        borderRadius: '4px',
                                        fontSize: '0.9em',
                                        color: '#38bdf8'
                                    }}>
                                        {children}
                                    </code>
                                )
                            },
                            h1: ({ node, ...props }) => <h1 style={{ fontSize: '1.2em', margin: '8px 0', color: '#fff' }} {...props} />,
                            h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.1em', margin: '8px 0', color: '#cbd5e1' }} {...props} />,
                            h3: ({ node, ...props }) => <h3 style={{ fontSize: '1em', margin: '6px 0', color: '#94a3b8' }} {...props} />,
                            p: ({ node, ...props }) => <p style={{ margin: '6px 0' }} {...props} />,
                            ul: ({ node, ...props }) => <ul style={{ paddingLeft: '20px', margin: '6px 0' }} {...props} />,
                            ol: ({ node, ...props }) => <ol style={{ paddingLeft: '20px', margin: '6px 0' }} {...props} />,
                        }}
                    >
                        {visionText}
                    </Markdown>
                </div>
            )}
        </div>
    );
}
