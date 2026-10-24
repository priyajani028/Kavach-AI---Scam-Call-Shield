import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeFloat32ToWavBase64,
  sliceAudioBufferToWavBase64,
  pcm16Base64ToWavUrl,
} from '../src/utils/wavChunker.ts';
import { CALL_SCENARIOS } from '../src/data/callScenarios.ts';
import {
  computeOverallCallMetrics,
  buildTrilingualEmergencyAlertPayload,
} from '../src/utils/scamScoringEngine.ts';
import {
  getConfiguredGeminiApiKey,
  analyzeAudioChunkWithGemini,
} from '../src/services/geminiAudioShield.ts';

describe('1. WAV Audio Chunk Slicer & Encoder (wavChunker.ts)', () => {
  it('encodes Float32 PCM samples into a valid 16-bit mono RIFF WAVE file', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.5, -1.5]);
    const encoded = encodeFloat32ToWavBase64(samples, 16000);

    assert.equal(encoded.byteLength, 44 + samples.length * 2);
    assert.ok(encoded.base64Wav.length > 0);
    assert.ok(encoded.blobUrl.startsWith('blob:'));

    const rawBytes = Buffer.from(encoded.base64Wav, 'base64');
    assert.equal(rawBytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(rawBytes.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.equal(rawBytes.subarray(12, 16).toString('ascii'), 'fmt ');
    assert.equal(rawBytes.subarray(36, 40).toString('ascii'), 'data');
    assert.equal(rawBytes.readUInt32LE(24), 16000);
  });

  it('slices an AudioBuffer time window [startSec, endSec] into a WAV chunk', () => {
    const fakeSamples = new Float32Array(16000 * 10);
    for (let i = 0; i < fakeSamples.length; i++) {
      fakeSamples[i] = Math.sin(i / 20) * 0.4;
    }

    const mockAudioBuffer = {
      sampleRate: 16000,
      duration: 10,
      getChannelData: (_channel: number) => fakeSamples,
    } as unknown as AudioBuffer;

    const chunk = sliceAudioBufferToWavBase64(mockAudioBuffer, 0, 3.5);
    assert.equal(chunk.byteLength, 44 + 56000 * 2);

    const clampedChunk = sliceAudioBufferToWavBase64(mockAudioBuffer, -2, 25);
    assert.equal(clampedChunk.byteLength, 44 + 16000 * 10 * 2);
  });

  it('wraps raw 24kHz PCM16 base64 from Gemini TTS into a playable WAV Blob URL', () => {
    const dummyPcm = Buffer.alloc(480, 0).toString('base64');
    const url = pcm16Base64ToWavUrl(dummyPcm, 24000);
    assert.ok(url.startsWith('blob:'));
  });
});

describe('2. Pre-Recorded Call Scenarios & Mid-Call Progression (callScenarios.ts)', () => {
  it('contains all 5 Gujarati, Hindi, and English scam & genuine call scenarios', () => {
    assert.equal(CALL_SCENARIOS.length, 5);
    const ids = CALL_SCENARIOS.map((s) => s.id);
    assert.deepEqual(ids, [
      'gu_scam_digital_arrest',
      'hi_scam_digital_arrest',
      'en_scam_bank_kyc',
      'en_genuine_swiggy',
      'gu_genuine_dairy',
    ]);
  });

  it('flags scam scenarios mid-call (Chunk #2 >= 90% risk) with trilingual warnings', () => {
    const scamScenarios = CALL_SCENARIOS.filter((s) => s.isScamExpected);
    assert.equal(scamScenarios.length, 3);

    for (const sc of scamScenarios) {
      assert.ok(sc.calibratedChunks.length >= 2);
      const chunk1 = sc.calibratedChunks[0];
      const chunk2 = sc.calibratedChunks[1];

      assert.equal(chunk1.verdict, 'SUSPICIOUS');
      assert.equal(chunk2.verdict, 'SCAM');
      assert.ok(chunk2.riskScore >= 90);
      assert.ok(chunk2.redFlags.length >= 3);
      assert.ok(chunk2.warningExplanation.gu.length > 10);
      assert.ok(chunk2.warningExplanation.hi.length > 10);
      assert.ok(chunk2.warningExplanation.en.length > 10);
    }
  });

  it('does NOT cry wolf on genuine Swiggy or Gujarati Amul Dairy parcel calls', () => {
    const genuineScenarios = CALL_SCENARIOS.filter((s) => !s.isScamExpected);
    assert.equal(genuineScenarios.length, 2);

    for (const sc of genuineScenarios) {
      for (const ch of sc.calibratedChunks) {
        assert.equal(ch.verdict, 'SAFE');
        assert.ok(ch.riskScore < 15);
        assert.equal(ch.redFlags.length, 0);
      }
    }
  });
});

describe('3. Overall Call Risk Scoring & Trilingual WhatsApp Alert Engine (scamScoringEngine.ts)', () => {
  it('returns SAFE 0% metrics when no chunks have been processed yet', () => {
    const emptyMetrics = computeOverallCallMetrics([]);
    assert.equal(emptyMetrics.overallRiskScore, 0);
    assert.equal(emptyMetrics.overallVerdict, 'SAFE');
    assert.equal(emptyMetrics.spokenLines.length, 0);
  });

  it('computes weighted overall call risk score and filters out silent ("...") live mic chunks', () => {
    const guChunks = CALL_SCENARIOS[0].calibratedChunks;
    const silentChunk = {
      ...guChunks[0],
      chunkIndex: 4,
      transcriptChunk: '...',
      verdict: 'SAFE' as const,
      riskScore: 0,
      redFlags: [],
    };

    const metrics = computeOverallCallMetrics([
      { chunkIndex: 1, analysis: guChunks[0] },
      { chunkIndex: 2, analysis: guChunks[1] },
      { chunkIndex: 3, analysis: guChunks[2] },
      { chunkIndex: 4, analysis: silentChunk },
    ]);

    assert.equal(metrics.overallVerdict, 'SCAM');
    assert.equal(metrics.peakRiskScore, 99);
    assert.ok(metrics.overallRiskScore >= 90);
    assert.equal(metrics.spokenLines.length, 3);
    assert.ok(metrics.scammerPointerQuotes.length >= 2);
  });

  it('computes SUSPICIOUS overall verdict when max risk is between 35% and 69%', () => {
    const chunk1 = CALL_SCENARIOS[0].calibratedChunks[0];
    const metrics = computeOverallCallMetrics([
      { chunkIndex: 1, analysis: chunk1 },
    ]);
    assert.equal(metrics.overallVerdict, 'SUSPICIOUS');
    assert.equal(metrics.overallRiskScore, 48);
  });

  it('computes SAFE overall verdict for genuine delivery calls', () => {
    const swiggyChunks = CALL_SCENARIOS[3].calibratedChunks;
    const metrics = computeOverallCallMetrics(
      swiggyChunks.map((c, idx) => ({ chunkIndex: idx + 1, analysis: c }))
    );
    assert.equal(metrics.overallVerdict, 'SAFE');
    assert.ok(metrics.overallRiskScore < 10);
    assert.equal(metrics.totalRedFlags, 0);
  });

  it('builds a complete trilingual (English + Gujarati + Hindi) WhatsApp alert with caller pointer quotes', () => {
    const guChunks = CALL_SCENARIOS[0].calibratedChunks;
    const alertFather = buildTrilingualEmergencyAlertPayload({
      result: guChunks[2],
      allChunks: [{ analysis: guChunks[0] }, { analysis: guChunks[1] }],
      contactRelation: 'father',
      timestamp: '19:40:00',
    });

    assert.ok(alertFather.fullTrilingualMessage.includes('*ENGLISH:*'));
    assert.ok(alertFather.fullTrilingualMessage.includes('*ગુજરાતી (GUJARATI):*'));
    assert.ok(alertFather.fullTrilingualMessage.includes('*हिंदी (HINDI):*'));
    assert.ok(
      alertFather.fullTrilingualMessage.includes('*POINTER LINES SPOKEN BY CALLER:*')
    );
    assert.ok(alertFather.fullTrilingualMessage.includes('call him immediately'));
    assert.ok(alertFather.pointerLines.length > 0);

    const alertMother = buildTrilingualEmergencyAlertPayload({
      result: guChunks[2],
      allChunks: [],
      contactRelation: 'mother',
      timestamp: '19:40:00',
    });
    assert.ok(alertMother.fullTrilingualMessage.includes('call her immediately'));
  });
});

describe('4. Environment Configuration & Free-Tier Gemini Model Discovery (geminiAudioShield.ts)', () => {
  it('safely returns empty string when placeholder key is set and reads valid key', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => 'YOUR_GEMINI_API_KEY_HERE',
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    assert.equal(getConfiguredGeminiApiKey(), '');

    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => 'AIzaSyTestKey12345',
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    assert.equal(getConfiguredGeminiApiKey(), 'AIzaSyTestKey12345');
  });

  it('auto-discovers free Flash models, skips 404 endpoints, and parses Gemini structured JSON output', async () => {
    const originalFetch = globalThis.fetch;
    let generateAttempts = 0;

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      // 1. Model list endpoint
      if (url.includes('/v1beta/models?key=')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-2.5-flash', // blacklisted
                supportedGenerationMethods: ['generateContent'],
              },
              {
                name: 'models/gemini-3-flash-preview', // first candidate (simulate 404 to test fallback)
                supportedGenerationMethods: ['generateContent'],
              },
              {
                name: 'models/gemini-2.5-flash-lite', // second candidate (succeeds!)
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. generateContent endpoint
      generateAttempts += 1;
      if (url.includes('gemini-3-flash-preview')) {
        return new Response(
          JSON.stringify({
            error: { code: 404, message: 'NOT_FOUND', status: 'NOT_FOUND' },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const mockGeminiPayload = {
        transcriptChunk: 'Your bank KYC has expired. Share OTP immediately.',
        detectedLanguage: 'English (en-IN)',
        verdict: 'SCAM',
        riskScore: 95,
        scamCategory: 'Fake Bank KYC Scam',
        redFlags: [
          {
            type: 'OTP_MONEY_DEMAND',
            labelGu: 'OTP ની માંગણી',
            labelHi: 'OTP की मांग',
            labelEn: 'Asks for secret OTP',
            evidenceQuote: 'Share OTP immediately',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન! બેંક ક્યારેય OTP માંગતી નથી.',
          hi: 'सावधान! बैंक कभी OTP नहीं मांगता।',
          en: 'Warning! Banks never ask for OTP.',
        },
      };

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockGeminiPayload) }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    try {
      const res = await analyzeAudioChunkWithGemini({
        apiKey: 'AIzaSyMockKey',
        base64Wav: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
        chunkIndex: 2,
        timeRangeSec: '0.0s – 7.5s',
      });

      assert.ok(generateAttempts >= 1);
      assert.equal(res.verdict, 'SCAM');
      assert.equal(res.riskScore, 95);
      assert.equal(res.source, 'gemini-live-audio');
      assert.equal(res.redFlags.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
