class VADProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        // [~] IMPEDIMENTO: Implementar decodificação Opus e VAD real requer WebAssembly no client
        // Mock de processamento VAD e captura local.
        return true;
    }
}
registerProcessor('vad-processor', VADProcessor);
