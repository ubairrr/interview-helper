class DeepgramAudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const inputData = input[0];
            // Send the raw Float32Array to the main process.
            // main.js will handle the Int16 conversion to avoid double-processing.
            this.port.postMessage(inputData);
        }

        // Return true to keep the processor alive
        return true;
    }
}

registerProcessor('deepgram-audio-processor', DeepgramAudioProcessor);
