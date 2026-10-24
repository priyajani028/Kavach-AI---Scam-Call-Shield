/**
 * Encodes a slice of an AudioBuffer (from startSec to endSec)
 * into a 16-bit PCM mono WAV base64 string suitable for Gemini Native Audio Understanding.
 */
export function sliceAudioBufferToWavBase64(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number
): { base64Wav: string; blobUrl: string; byteLength: number } {
  const sampleRate = audioBuffer.sampleRate;
  const clampedStart = Math.max(0, startSec);
  const clampedEnd = Math.min(audioBuffer.duration, endSec);
  const startSample = Math.floor(clampedStart * sampleRate);
  const endSample = Math.max(startSample + 1, Math.floor(clampedEnd * sampleRate));
  const numSamples = endSample - startSample;

  const channelData = audioBuffer.getChannelData(0).subarray(startSample, endSample);
  return encodeFloat32ToWavBase64(channelData, sampleRate);
}

/**
 * Encodes raw Float32 PCM samples into a 16-bit mono WAV file (Base64 + Blob URL).
 */
export function encodeFloat32ToWavBase64(
  samples: Float32Array,
  sampleRate: number
): { base64Wav: string; blobUrl: string; byteLength: number } {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit samples
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  const base64Wav = btoa(binary);
  const blob = new Blob([buffer], { type: 'audio/wav' });
  const blobUrl = URL.createObjectURL(blob);

  return {
    base64Wav,
    blobUrl,
    byteLength: buffer.byteLength,
  };
}

/**
 * Wraps raw 24kHz 16-bit signed little-endian PCM bytes returned by Gemini TTS
 * into a playable WAV Blob URL.
 */
export function pcm16Base64ToWavUrl(base64Pcm: string, sampleRate = 24000): string {
  const binary = atob(base64Pcm);
  const pcmBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    pcmBytes[i] = binary.charCodeAt(i);
  }

  const wavBuffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(wavBuffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  new Uint8Array(wavBuffer, 44).set(pcmBytes);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
