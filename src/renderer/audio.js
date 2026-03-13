export async function initializeAudioPipelines() {
    try {
        // --- Microphone Stream (standard mic only) ---
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('[Audio] Mic stream ready. Tracks:', micStream.getAudioTracks().length);

        // --- System Audio Stream (via desktopCapturer source ID) ---
        let systemAudioStream = null;
        try {
            const sourceId = await window.electron.getDesktopSourceId();
            if (sourceId) {
                const desktopStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId
                        }
                    },
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId
                        }
                    }
                });
                const audioTracks = desktopStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    systemAudioStream = new MediaStream(audioTracks);
                    console.log('[Audio] System audio stream isolated.');
                }
                desktopStream.getVideoTracks().forEach(t => t.stop());
            }
        } catch (err) {
            console.warn('[Audio] System audio capture failed:', err.message);
            if (err.message.includes('Permission denied')) {
                window.electron.requestScreenPermission();
            }
        }

        const audioContext = new AudioContext({ sampleRate: 16000 });
        await audioContext.audioWorklet.addModule('/audio-processor.js');

        // --- Mic Pipeline ---
        const micSource = audioContext.createMediaStreamSource(micStream);
        const micProcessor = new AudioWorkletNode(audioContext, 'deepgram-audio-processor');
        micSource.connect(micProcessor);
        micProcessor.port.onmessage = (e) => window.electron.sendMicAudioChunk(e.data);

        // --- System Audio Pipeline ---
        if (systemAudioStream) {
            const sysSource = audioContext.createMediaStreamSource(systemAudioStream);
            const sysProcessor = new AudioWorkletNode(audioContext, 'deepgram-audio-processor');
            sysSource.connect(sysProcessor);
            sysProcessor.port.onmessage = (e) => window.electron.sendSystemAudioChunk(e.data);
            console.log('[Audio] Dual pipelines ready.');
        } else {
            console.warn('[Audio] No system audio — mic only.');
        }

        window.appendMessage?.('System', 'Audio pipelines active. Starting transcription...', false);
        window.electron.startDeepgram();

    } catch (err) {
        console.error('[Audio] Init failed:', err);
        window.appendMessage?.('System', `Error starting audio: ${err.message}`, false);
    }
}

initializeAudioPipelines();
