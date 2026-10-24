import { GoogleGenAI, Type } from '@google/genai';
import { ChunkAnalysisResult } from '../data/callScenarios';

const SYSTEM_INSTRUCTION = `You are "Kavach AI" (Google Scam Call Shield), a real-time Indian phone call safety assistant protecting elders and first-time smartphone users from phone fraud.
You are listening to a live rolling audio chunk (.wav) of an ongoing phone call in Gujarati, Hindi, or English.

Your task:
1. Transcribe what was spoken in this audio chunk accurately in its native script (Gujarati, Hindi/Devanagari, or English).
2. Evaluate whether the caller is attempting a scam—specifically watching for the 4 core Indian scam red flags:
   - AUTHORITY_CLAIM: Claiming to be Police, Mumbai Cyber Cell, CBI, Customs, RBI, Bank KYC team, or Telecom authority.
   - THREAT: Threatening "Digital Arrest", parcel containing drugs/illegal items, Aadhaar misuse, immediate account block, or arrest warrant.
   - URGENCY: Telling the victim not to disconnect the call ("ફોન કાપશો નહીં" / "कॉल मत काटिए"), demanding action "right now", isolating the elder.
   - OTP_MONEY_DEMAND: Asking to transfer money (e.g. ₹50,000) to close a case or asking to share an SMS OTP / PIN.
3. Do NOT cry wolf on genuine everyday calls! For example, food delivery (Swiggy/Zomato), local dairy/grocery parcels (Amul milk/curd parcel at gate), or normal family calls must be marked SAFE (riskScore < 15) with zero redFlags, even if they mention words like "parcel" or "order".
4. Provide warm, elder-friendly explanations in simple colloquial Gujarati (gu), simple Hindi (hi), and simple English (en) that directly name the red flags heard and tell the elder what to do.`;

/**
 * Reads the Gemini API Key from `.env` (`VITE_GEMINI_API_KEY`).
 * Also checks localStorage fallback if the user previously entered a key in the browser.
 */
export function getConfiguredGeminiApiKey(): string {
  const envKey = (
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_GEMINI_API_KEY || ''
  ).trim();

  if (envKey && envKey !== 'YOUR_GEMINI_API_KEY_HERE') {
    return envKey;
  }

  const stored = (localStorage.getItem('KAVACH_GEMINI_API_KEY') || '').trim();
  if (stored && stored !== 'YOUR_GEMINI_API_KEY_HERE') {
    return stored;
  }

  return '';
}

// Cache the resolved working free-tier Gemini model so we don't hit 404s
let cachedWorkingModel: string | null = null;
const blacklistedModels = new Set<string>(['gemini-2.5-flash']);

const PREFERRED_FREE_FLASH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
];

/**
 * Dynamically queries Google AI Studio `/v1beta/models` for the user's API key
 * to find active free-tier Flash models supporting `generateContent`.
 */
async function getCandidateModelsForKey(apiKey: string): Promise<string[]> {
  const envModel = (
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_GEMINI_MODEL || ''
  ).trim();

  if (envModel && !blacklistedModels.has(envModel)) {
    return [envModel, ...PREFERRED_FREE_FLASH_MODELS];
  }

  if (cachedWorkingModel && !blacklistedModels.has(cachedWorkingModel)) {
    return [
      cachedWorkingModel,
      ...PREFERRED_FREE_FLASH_MODELS.filter((m) => m !== cachedWorkingModel),
    ];
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      const available = (data.models || [])
        .filter((m) =>
          m.supportedGenerationMethods?.includes('generateContent')
        )
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(
          (name) =>
            !blacklistedModels.has(name) &&
            !name.includes('tts') &&
            !name.includes('image') &&
            !name.includes('thinking')
        );

      const prioritized: string[] = [];
      for (const pref of PREFERRED_FREE_FLASH_MODELS) {
        if (available.includes(pref)) {
          prioritized.push(pref);
        }
      }
      for (const avail of available) {
        if (avail.includes('flash') && !prioritized.includes(avail)) {
          prioritized.push(avail);
        }
      }
      if (prioritized.length > 0) {
        cachedWorkingModel = prioritized[0];
        return prioritized;
      }
    }
  } catch {
    // Ignore discovery network errors and use preferred fallback list
  }

  return PREFERRED_FREE_FLASH_MODELS.filter((m) => !blacklistedModels.has(m));
}

export async function analyzeAudioChunkWithGemini(params: {
  apiKey: string;
  base64Wav: string;
  chunkIndex: number;
  timeRangeSec: string;
}): Promise<ChunkAnalysisResult> {
  const startTime = performance.now();
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const candidates = await getCandidateModelsForKey(params.apiKey);

  let lastError: unknown = null;

  for (const modelName of candidates) {
    if (blacklistedModels.has(modelName)) continue;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: params.base64Wav,
                },
              },
              {
                text: `Analyze this ongoing phone call audio chunk (${params.timeRangeSec}, Chunk #${params.chunkIndex}). Transcribe what you hear, detect if it is SAFE, SUSPICIOUS, or SCAM, identify exact red flags, and generate simple Gujarati, Hindi, and English explanations for an elderly user.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcriptChunk: {
                type: Type.STRING,
                description:
                  'Accurate transcription of the audio in its spoken script.',
              },
              detectedLanguage: {
                type: Type.STRING,
                description:
                  'Detected language e.g. Gujarati (gu-IN), Hindi (hi-IN), or English (en-IN)',
              },
              verdict: {
                type: Type.STRING,
                enum: ['SAFE', 'SUSPICIOUS', 'SCAM'],
              },
              riskScore: {
                type: Type.INTEGER,
                description:
                  '0 to 100 risk score. >=70 triggers immediate mid-call voice warning.',
              },
              scamCategory: {
                type: Type.STRING,
                description:
                  'Short category label e.g. Digital Arrest Scam, Fake Bank KYC, or Genuine Delivery Call',
              },
              redFlags: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      enum: [
                        'AUTHORITY_CLAIM',
                        'THREAT',
                        'URGENCY',
                        'OTP_MONEY_DEMAND',
                      ],
                    },
                    labelGu: { type: Type.STRING },
                    labelHi: { type: Type.STRING },
                    labelEn: { type: Type.STRING },
                    evidenceQuote: { type: Type.STRING },
                  },
                  required: [
                    'type',
                    'labelGu',
                    'labelHi',
                    'labelEn',
                    'evidenceQuote',
                  ],
                },
              },
              warningExplanation: {
                type: Type.OBJECT,
                properties: {
                  gu: {
                    type: Type.STRING,
                    description:
                      'Simple, reassuring Gujarati explanation for an elder explaining why this call is a scam or safe.',
                  },
                  hi: {
                    type: Type.STRING,
                    description:
                      'Simple, reassuring Hindi explanation for an elder explaining why this call is a scam or safe.',
                  },
                  en: {
                    type: Type.STRING,
                    description: 'Simple English explanation.',
                  },
                },
                required: ['gu', 'hi', 'en'],
              },
            },
            required: [
              'transcriptChunk',
              'detectedLanguage',
              'verdict',
              'riskScore',
              'scamCategory',
              'redFlags',
              'warningExplanation',
            ],
          },
        },
      });

      cachedWorkingModel = modelName;
      const latencyMs = Math.round(performance.now() - startTime);
      const parsed = JSON.parse(response.text || '{}');

      return {
        chunkIndex: params.chunkIndex,
        timeRangeSec: params.timeRangeSec,
        transcriptChunk: parsed.transcriptChunk || '',
        detectedLanguage: parsed.detectedLanguage || 'Detected Audio',
        verdict: parsed.verdict || 'SAFE',
        riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : 0,
        scamCategory: parsed.scamCategory || 'Call Analysis',
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
        warningExplanation: parsed.warningExplanation || {
          gu: 'કોલની તપાસ ચાલુ છે...',
          hi: 'कॉल की जांच चल रही रही है...',
          en: 'Analyzing call...',
        },
        latencyMs,
        source: 'gemini-live-audio',
        modelUsed: modelName,
      };
    } catch (err) {
      lastError = err;
      const errMsg = String(err);
      if (errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
        blacklistedModels.add(modelName);
      }
      // Try next free Flash candidate model automatically
    }
  }

  throw lastError || new Error('No available free Gemini Flash model responded');
}
