/**
 * Handles audio input (microphone) and output (speaker) for the Gemini Live API.
 */
export class AudioStreamer {
  private recordingContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private isRecording = false;
  private onAudioData: (data: string) => void;

  constructor(onAudioData: (data: string) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    if (this.isRecording) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Your browser does not support microphone access. Please use a modern browser like Chrome.");
    }

    // Initialize Recording Context (16kHz for Gemini)
    if (!this.recordingContext) {
      this.recordingContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    
    if (this.recordingContext.state === "suspended") {
      await this.recordingContext.resume();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      if (this.recordingContext.state === "suspended") {
        await this.recordingContext.resume();
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        throw new Error("Microphone permission denied. Please allow microphone access in Zoya's settings.");
      }
      throw err;
    }

    if (!this.recordingContext) return;

    this.source = this.recordingContext.createMediaStreamSource(this.stream);
    this.analyzer = this.recordingContext.createAnalyser();
    this.analyzer.fftSize = 512;
    this.analyzer.smoothingTimeConstant = 0.4;

    // Filter to clean up microphone input
    const micFilter = this.recordingContext.createBiquadFilter();
    micFilter.type = "lowpass";
    micFilter.frequency.value = 7500; // Voice rarely goes above this for 16kHz sampling

    this.processor = this.recordingContext.createScriptProcessor(4096, 1, 1);

    this.source.connect(micFilter);
    micFilter.connect(this.analyzer);
    micFilter.connect(this.processor);
    this.processor.connect(this.recordingContext.destination);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.floatToPcm16(inputData);
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.onAudioData(base64);
    };

    this.isRecording = true;

    // Initialize Playback Context (24kHz for Gemini Output)
    if (!this.playbackContext) {
      this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
      this.initPlaybackChain();
    } else if (this.playbackContext.state === "suspended") {
      await this.playbackContext.resume();
    }
  }

  stop() {
    this.isRecording = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    // Suspend instead of close to allow quick restart
    this.recordingContext?.suspend();
    this.playbackContext?.suspend();
  }

  getVolume() {
    if (!this.analyzer) return 0;
    const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
    this.analyzer.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    return average / 255;
  }

  private floatToPcm16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Plays back 24kHz PCM16 audio chunks with high-quality AI-like effects.
   */
  private nextStartTime = 0;
  private reverbNode: ConvolverNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private enhancerFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  private initPlaybackChain() {
    if (!this.playbackContext) return;

    // 1. Low-pass to smooth out digital artifacts
    this.lowPassFilter = this.playbackContext.createBiquadFilter();
    this.lowPassFilter.type = "lowpass";
    this.lowPassFilter.frequency.value = 11000;

    // 2. Presence Enhancer (AI clarity)
    this.enhancerFilter = this.playbackContext.createBiquadFilter();
    this.enhancerFilter.type = "peaking";
    this.enhancerFilter.frequency.value = 3500;
    this.enhancerFilter.Q.value = 1.2;
    this.enhancerFilter.gain.value = 4;

    // 3. Main Compressor for radio-like density
    this.compressorNode = this.playbackContext.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-20, this.playbackContext.currentTime);
    this.compressorNode.knee.setValueAtTime(12, this.playbackContext.currentTime);
    this.compressorNode.ratio.setValueAtTime(4, this.playbackContext.currentTime);
    this.compressorNode.attack.setValueAtTime(0.005, this.playbackContext.currentTime);
    this.compressorNode.release.setValueAtTime(0.2, this.playbackContext.currentTime);

    // 4. Soft Limiter to prevent any popping
    this.limiterNode = this.playbackContext.createDynamicsCompressor();
    this.limiterNode.threshold.setValueAtTime(-1, this.playbackContext.currentTime);
    this.limiterNode.knee.setValueAtTime(0, this.playbackContext.currentTime);
    this.limiterNode.ratio.setValueAtTime(20, this.playbackContext.currentTime);
    this.limiterNode.attack.setValueAtTime(0.001, this.playbackContext.currentTime);
    this.limiterNode.release.setValueAtTime(0.1, this.playbackContext.currentTime);

    // 5. Reverb for space
    this.reverbNode = this.playbackContext.createConvolver();
    this.reverbNode.buffer = this.createImpulseResponse(0.8, 3.5); // Slightly tighter reverb

    // 6. Gains for mixing
    this.dryGain = this.playbackContext.createGain();
    this.wetGain = this.playbackContext.createGain();
    
    this.dryGain.gain.value = 1.0;
    this.wetGain.gain.value = 0.12; // Very subtle space

    // Chain: 
    // source -> lowPass -> enhancer -> compressor -> dryGain -> limiter -> destination
    //                                              -> reverb -> wetGain -> limiter -> destination
    
    this.lowPassFilter.connect(this.enhancerFilter);
    this.enhancerFilter.connect(this.compressorNode);
    
    this.compressorNode.connect(this.dryGain);
    this.dryGain.connect(this.limiterNode);
    
    this.compressorNode.connect(this.reverbNode);
    this.reverbNode.connect(this.wetGain);
    this.wetGain.connect(this.limiterNode);
    
    this.limiterNode.connect(this.playbackContext.destination);
  }

  private createImpulseResponse(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.playbackContext!.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.playbackContext!.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const envelope = Math.pow(1 - n, decay);
      // Stereo de-correlation
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  playChunk(base64Data: string) {
    if (!this.playbackContext) {
      this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
      this.initPlaybackChain();
    }

    if (this.playbackContext.state === "suspended") {
      this.playbackContext.resume();
    }

    const binary = window.atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.playbackContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    
    if (this.lowPassFilter) {
      source.connect(this.lowPassFilter);
    } else {
      source.connect(this.playbackContext.destination);
    }

    const startTime = Math.max(this.nextStartTime, this.playbackContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  stopPlayback() {
    this.playbackContext?.suspend();
    this.nextStartTime = 0;
  }
}
