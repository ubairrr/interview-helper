const { desktopCapturer } = require('electron');
const { createClient } = require('@deepgram/sdk');
// Need to load dotenv here since audio.js runs in Electron's renderer process with nodeIntegration: true
require('dotenv').config();

async function initializeAudioMixing() {
    try {
        // 1. Get the local microphone stream
        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });
        console.log("Got microphone stream.");

        // 2. Request desktop audio sources from Electron main process
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const screenSource = sources.find(s => s.name === 'Entire Screen' || s.id.startsWith('screen'));

        if (!screenSource) {
            throw new Error("Could not find a valid screen source to capture audio from");
        }

        // 3. Request system audio using the specific screen source ID and the mandatory Chromium constraint
        const systemAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screenSource.id
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screenSource.id
                }
            }
        });

        console.log("Got system audio stream.");

        // 4. Set up Web Audio API Context to mix them
        const audioContext = new AudioContext();

        const micSource = audioContext.createMediaStreamSource(micStream);
        const sysSource = audioContext.createMediaStreamSource(systemAudioStream);

        const mixedDestination = audioContext.createMediaStreamDestination();

        // Connect both sources to the destination to combine them into one
        micSource.connect(mixedDestination);
        sysSource.connect(mixedDestination);

        console.log("Audio pipeline initialized and mixed.");
        appendMessage("System", "Audio pipeline active. Ready for transcription.", false);

        // Provide the combined stream globally for Plan 2.2 consumption
        window.mixedAudioStream = mixedDestination.stream;

        // ----- Plan 5.1/7.1: Deepgram WebSocket Transcription via AudioWorklet -----
        await audioContext.audioWorklet.addModule('audio-processor.js');
        const processorNode = new AudioWorkletNode(audioContext, 'deepgram-audio-processor');

        mixedDestination.connect(processorNode);
        processorNode.connect(audioContext.destination);

        const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
        const connection = deepgram.listen.live({
            model: "nova-2",
            language: "en-US",
            smart_format: true,
            encoding: "linear16",
            sample_rate: audioContext.sampleRate,
            channels: 1
        });

        connection.on("open", () => {
            console.log("Deepgram WS connection opened.");
        });

        connection.on("Results", (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript && transcript.length > 0) {
                appendMessage("Interviewee/Host", transcript, false);
            }
        });

        connection.on("error", (err) => {
            console.error("Deepgram WS Error:", err);
            appendMessage("System", `Deepgram WS Error: ${err.message}`, false);
        });

        connection.on("close", () => {
            console.log("Deepgram WS connection closed.");
        });

        processorNode.port.onmessage = (e) => {
            const int16Buffer = e.data;
            // Send binary packet to Deepgram
            if (connection.getReadyState() === 1) { // OPEN
                connection.send(int16Buffer);
            }
        };

    } catch (err) {
        console.error("Audio mixing initialization failed:", err);
        appendMessage("System", `Error starting audio: ${err.message}`, false);
    }
}

// Start sequence when the DOM is ready
initializeAudioMixing();
