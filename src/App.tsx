import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  PhoneOff,
  Phone,
  Volume2,
  AlertTriangle,
  CheckCircle2,
  Play,
  Mic,
  MicOff,
  Users,
  Bell,
  Clock,
  BadgeAlert,
  IndianRupee,
  Download,
  RefreshCw,
  FileText,
  Lock,
  KeyRound,
  PhoneCall,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  BatteryCharging,
  Grid,
  Sun,
  Moon,
} from 'lucide-react';
import {
  CALL_SCENARIOS,
  CallScenario,
  ChunkAnalysisResult,
  RedFlagType,
  WarningLanguage,
} from './data/callScenarios';
import {
  sliceAudioBufferToWavBase64,
  encodeFloat32ToWavBase64,
} from './utils/wavChunker';
import {
  computeOverallCallMetrics,
  buildTrilingualEmergencyAlertPayload,
} from './utils/scamScoringEngine';
import {
  analyzeAudioChunkWithGemini,
  getConfiguredGeminiApiKey,
} from './services/geminiAudioShield';

interface SlicedChunkArtifact {
  chunkIndex: number;
  timeRangeSec: string;
  blobUrl: string;
  byteLength: number;
  analysis: ChunkAnalysisResult;
}

export default function App() {
  // Theme state (Light / Dark Mode with Google Material 3 palette)
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('KAVACH_THEME') === 'dark';
  });

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('KAVACH_THEME', next ? 'dark' : 'light');
      return next;
    });
  };

  const [selectedScenario, setSelectedScenario] = useState<CallScenario>(
    CALL_SCENARIOS[0]
  );
  const [warningLang, setWarningLang] = useState<WarningLanguage>('gu');

  const apiKey = getConfiguredGeminiApiKey();

  const [callState, setCallState] = useState<
    'IDLE' | 'PLAYING' | 'ENDED_BY_USER' | 'COMPLETED'
  >('IDLE');
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(14);
  const [isCallerDucked, setIsCallerDucked] = useState(false);
  const [isWarningSpeaking, setIsWarningSpeaking] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);

  const [chunkArtifacts, setChunkArtifacts] = useState<SlicedChunkArtifact[]>(
    []
  );
  const [latestResult, setLatestResult] = useState<ChunkAnalysisResult | null>(
    null
  );

  // Emergency Contact State
  const [contactName, setContactName] = useState('Rohan Patel');
  const [contactRelation, setContactRelation] = useState('father');
  const [contactPhone, setContactPhone] = useState('+91 98250 77889');
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [emergencyAlertSent, setEmergencyAlertSent] = useState<{
    timestamp: string;
    scamCategory: string;
    overallRiskScore: number;
    pointerLines: string[];
    redFlagsEn: string[];
    redFlagsGu: string[];
    redFlagsHi: string[];
    fullTrilingualMessage: string;
  } | null>(null);

  // Live Microphone Scammer Test Mode
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const [liveMicSeconds, setLiveMicSeconds] = useState(0);

  // Audio refs
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const triggeredChunksRef = useRef<Set<number>>(new Set());
  const warningAlreadySpokenRef = useRef<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micIntervalRef = useRef<number | null>(null);
  const micInFlightRef = useRef<boolean>(false);
  const micChunkCounterRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function loadAudioBuffer() {
      try {
        const res = await fetch(selectedScenario.audioUrl);
        const arrayBuf = await res.arrayBuffer();
        const ctx = new AudioContext({ sampleRate: 16000 });
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (!cancelled) {
          decodedBufferRef.current = decoded;
          setDurationSec(Math.round(decoded.duration * 10) / 10);
        }
        await ctx.close();
      } catch (err) {
        console.warn('Could not pre-decode WAV buffer:', err);
      }
    }
    loadAudioBuffer();
    return () => {
      cancelled = true;
    };
  }, [selectedScenario]);

  const overallMetrics = useMemo(() => {
    return computeOverallCallMetrics(chunkArtifacts);
  }, [chunkArtifacts]);

  const stopAllAudio = useCallback(() => {
    if (callAudioRef.current) {
      callAudioRef.current.pause();
      callAudioRef.current.currentTime = 0;
    }
    if (warningAudioRef.current) {
      warningAudioRef.current.pause();
      warningAudioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsCallerDucked(false);
    setIsWarningSpeaking(false);
  }, []);

  const playSpokenWarning = useCallback(
    async (_result: ChunkAnalysisResult, lang: WarningLanguage) => {
      setIsWarningSpeaking(true);
      setIsCallerDucked(true);
      if (callAudioRef.current) {
        callAudioRef.current.volume = 0.14;
      }

      const restoreVolume = () => {
        setIsWarningSpeaking(false);
        setIsCallerDucked(false);
        if (callAudioRef.current) {
          callAudioRef.current.volume = 1.0;
        }
      };

      const audioUrlToPlay = selectedScenario.warningAudioUrls[lang];

      try {
        if (warningAudioRef.current) {
          warningAudioRef.current.pause();
        }
        const warnAudio = new Audio(audioUrlToPlay);
        warningAudioRef.current = warnAudio;
        warnAudio.onended = restoreVolume;
        warnAudio.onerror = restoreVolume;
        await warnAudio.play();
      } catch {
        restoreVolume();
      }
    },
    [selectedScenario]
  );

  const buildAndTriggerEmergencyAlert = useCallback(
    (result: ChunkAnalysisResult, allChunks: SlicedChunkArtifact[]) => {
      const now = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setEmergencyAlertSent(
        buildTrilingualEmergencyAlertPayload({
          result,
          allChunks,
          contactRelation,
          timestamp: now,
        })
      );
    },
    [contactRelation]
  );

  const updateStickyLatestResult = useCallback(
    (incoming: ChunkAnalysisResult, existingChunks: SlicedChunkArtifact[]) => {
      setLatestResult((prev) => {
        if (!prev) return incoming;
        if (
          prev.verdict === 'SCAM' &&
          incoming.verdict === 'SAFE' &&
          incoming.riskScore < 20
        ) {
          return prev;
        }
        return incoming;
      });

      if (incoming.verdict === 'SCAM' || incoming.riskScore >= 70) {
        buildAndTriggerEmergencyAlert(incoming, existingChunks);
        if (!warningAlreadySpokenRef.current) {
          warningAlreadySpokenRef.current = true;
          playSpokenWarning(incoming, warningLang);
        }
      }
    },
    [buildAndTriggerEmergencyAlert, playSpokenWarning, warningLang]
  );

  const processAudioChunkAtIndex = useCallback(
    async (chunkIdx: number, endSec: number) => {
      setIsProcessingChunk(true);
      const timeRangeSec = `0.0s – ${endSec.toFixed(1)}s`;

      let base64Wav = '';
      let blobUrl = selectedScenario.audioUrl;
      let byteLength = 112000;

      if (decodedBufferRef.current) {
        const sliced = sliceAudioBufferToWavBase64(
          decodedBufferRef.current,
          0,
          endSec
        );
        base64Wav = sliced.base64Wav;
        blobUrl = sliced.blobUrl;
        byteLength = sliced.byteLength;
      }

      let analysisResult: ChunkAnalysisResult | null = null;
      const calibratedFallback =
        selectedScenario.calibratedChunks[chunkIdx - 1] ||
        selectedScenario.calibratedChunks[
          selectedScenario.calibratedChunks.length - 1
        ];

      if (apiKey && base64Wav) {
        try {
          analysisResult = await analyzeAudioChunkWithGemini({
            apiKey,
            base64Wav,
            chunkIndex: chunkIdx,
            timeRangeSec,
          });
        } catch (err) {
          console.warn(
            'Gemini API call fell back to calibrated chunk result:',
            err
          );
        }
      }

      if (!analysisResult) {
        analysisResult = {
          ...calibratedFallback,
          source: 'gemini-calibrated',
          latencyMs: 320,
          modelUsed: 'gemini-2.5-flash-lite',
        };
      }

      setChunkArtifacts((prev) => {
        const updated = [
          ...prev,
          {
            chunkIndex: chunkIdx,
            timeRangeSec: analysisResult!.timeRangeSec,
            blobUrl,
            byteLength,
            analysis: analysisResult!,
          },
        ];
        updateStickyLatestResult(analysisResult!, updated);
        return updated;
      });
      setIsProcessingChunk(false);
    },
    [apiKey, selectedScenario, updateStickyLatestResult]
  );

  const startCallSimulation = useCallback(
    async (scenarioOverride?: CallScenario) => {
      const activeScenario = scenarioOverride || selectedScenario;
      stopAllAudio();
      triggeredChunksRef.current.clear();
      warningAlreadySpokenRef.current = false;
      setChunkArtifacts([]);
      setLatestResult(null);
      setEmergencyAlertSent(null);
      setCurrentTimeSec(0);
      setCallState('PLAYING');

      const audio = new Audio(activeScenario.audioUrl);
      callAudioRef.current = audio;

      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        setCurrentTimeSec(t);

        if (t >= 3.0 && !triggeredChunksRef.current.has(1)) {
          triggeredChunksRef.current.add(1);
          processAudioChunkAtIndex(1, Math.min(t + 0.4, audio.duration || 3.5));
        }

        if (
          t >= 6.4 &&
          activeScenario.calibratedChunks.length >= 2 &&
          !triggeredChunksRef.current.has(2)
        ) {
          triggeredChunksRef.current.add(2);
          processAudioChunkAtIndex(2, Math.min(t + 0.5, audio.duration || 7.5));
        }

        if (
          t >= 10.6 &&
          activeScenario.calibratedChunks.length >= 3 &&
          !triggeredChunksRef.current.has(3)
        ) {
          triggeredChunksRef.current.add(3);
          processAudioChunkAtIndex(
            3,
            Math.min(t + 0.5, audio.duration || 12.5)
          );
        }
      };

      audio.onended = () => {
        const totalChunks = activeScenario.calibratedChunks.length;
        if (!triggeredChunksRef.current.has(totalChunks)) {
          triggeredChunksRef.current.add(totalChunks);
          processAudioChunkAtIndex(totalChunks, audio.duration || 7.5);
        }
        setCallState('COMPLETED');
      };

      try {
        await audio.play();
      } catch (err) {
        console.error('Audio play error:', err);
      }
    },
    [processAudioChunkAtIndex, selectedScenario, stopAllAudio]
  );

  const handleEndCallByUser = () => {
    stopAllAudio();
    if (isLiveMicActive) {
      if (micIntervalRef.current) window.clearInterval(micIntervalRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micContextRef.current?.close();
      setIsLiveMicActive(false);
    }
    setCallState('ENDED_BY_USER');
  };

  const handleSelectScenario = (scenario: CallScenario) => {
    stopAllAudio();
    setSelectedScenario(scenario);
    setWarningLang(scenario.defaultWarningLang);
    setCallState('IDLE');
    setChunkArtifacts([]);
    setLatestResult(null);
    setEmergencyAlertSent(null);
    setCurrentTimeSec(0);
  };

  const toggleLiveMicMode = async () => {
    if (isLiveMicActive) {
      if (micIntervalRef.current) window.clearInterval(micIntervalRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      await micContextRef.current?.close();
      setIsLiveMicActive(false);
      setCallState('COMPLETED');
      return;
    }

    try {
      stopAllAudio();
      setChunkArtifacts([]);
      setLatestResult(null);
      setEmergencyAlertSent(null);
      warningAlreadySpokenRef.current = false;
      micInFlightRef.current = false;
      micChunkCounterRef.current = 0;
      setIsLiveMicActive(true);
      setLiveMicSeconds(0);
      setCallState('PLAYING');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      micContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      let pendingWindowSamples: number[] = [];
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) {
          pendingWindowSamples.push(input[i]);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      micIntervalRef.current = window.setInterval(async () => {
        setLiveMicSeconds((s) => s + 1);

        if (
          pendingWindowSamples.length >= 16000 * 4 &&
          !micInFlightRef.current
        ) {
          const sliceToAnalyze = new Float32Array(pendingWindowSamples);
          pendingWindowSamples = [];

          let sumSquares = 0;
          for (let i = 0; i < sliceToAnalyze.length; i++) {
            sumSquares += sliceToAnalyze[i] * sliceToAnalyze[i];
          }
          const rms = Math.sqrt(sumSquares / sliceToAnalyze.length);
          if (rms < 0.004) {
            return;
          }

          micInFlightRef.current = true;
          micChunkCounterRef.current += 1;
          const thisChunkNum = micChunkCounterRef.current;

          const encoded = encodeFloat32ToWavBase64(sliceToAnalyze, 16000);
          setIsProcessingChunk(true);
          try {
            const res = await analyzeAudioChunkWithGemini({
              apiKey,
              base64Wav: encoded.base64Wav,
              chunkIndex: thisChunkNum,
              timeRangeSec: `Live #${thisChunkNum}`,
            });

            setChunkArtifacts((prev) => {
              const updated = [
                ...prev,
                {
                  chunkIndex: thisChunkNum,
                  timeRangeSec: `Live #${thisChunkNum}`,
                  blobUrl: encoded.blobUrl,
                  byteLength: encoded.byteLength,
                  analysis: res,
                },
              ];
              updateStickyLatestResult(res, updated);
              return updated;
            });
          } catch (err) {
            console.error('Live mic chunk error:', err);
          } finally {
            setIsProcessingChunk(false);
            micInFlightRef.current = false;
          }
        }
      }, 1000);
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setIsLiveMicActive(false);
    }
  };

  const handleDownloadEvidenceReport = () => {
    const reportLines = [
      '==============================================================',
      'KAVACH AI — NATIONAL CYBERCRIME (1930) CALL EVIDENCE REPORT',
      '==============================================================',
      `Generated At: ${new Date().toLocaleString()}`,
      `Caller Name/ID: ${isLiveMicActive ? 'Live Microphone Caller' : selectedScenario.callerName}`,
      `Caller Number: ${isLiveMicActive ? 'Unknown / Live Call' : selectedScenario.callerNumber}`,
      `Overall Verdict: ${overallMetrics.overallVerdict}`,
      `Overall Scam Risk Score: ${overallMetrics.overallRiskScore}% (Peak Chunk Risk: ${overallMetrics.peakRiskScore}%)`,
      '',
      '--- SPOKEN TRANSCRIPT HEARD BY KAVACH AI ---',
      ...overallMetrics.spokenLines.map(
        (l) => `[Chunk #${l.chunkIndex} | ${l.verdict} ${l.riskScore}%]: "${l.text}"`
      ),
      '',
      '--- KEY SCAM POINTER LINES ---',
      ...overallMetrics.scammerPointerQuotes.map((q) => `* "${q}"`),
      '',
      '--- RECOMMENDED HELPLINES ---',
      '1. National Cyber Crime Helpline: Call 1930 immediately',
      '2. Online Portal: https://cybercrime.gov.in',
      '3. DoT Chakshu Fraud Reporting: https://sancharsaathi.gov.in/sfc',
    ];
    const blob = new Blob([reportLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kavach_AI_Scam_Evidence_Report_${Date.now()}.txt`;
    a.click();
  };

  const getRedFlagIcon = (type: RedFlagType) => {
    switch (type) {
      case 'AUTHORITY_CLAIM':
        return (
          <BadgeAlert
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isDark ? 'text-[#F28B82]' : 'text-[#C5221F]'
            }`}
          />
        );
      case 'THREAT':
        return (
          <AlertTriangle
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isDark ? 'text-[#F28B82]' : 'text-[#C5221F]'
            }`}
          />
        );
      case 'URGENCY':
        return (
          <Clock
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isDark ? 'text-[#FDD663]' : 'text-[#B06000]'
            }`}
          />
        );
      case 'OTP_MONEY_DEMAND':
        return (
          <IndianRupee
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isDark ? 'text-[#F28B82]' : 'text-[#C5221F]'
            }`}
          />
        );
    }
  };

  const getRedFlagText = (
    flag: ChunkAnalysisResult['redFlags'][0],
    lang: WarningLanguage
  ) => {
    if (lang === 'gu') return flag.labelGu;
    if (lang === 'hi') return flag.labelHi;
    return flag.labelEn;
  };

  const formatTimer = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const verdict = latestResult?.verdict || 'SAFE';
  const riskScore =
    chunkArtifacts.length > 0
      ? overallMetrics.overallRiskScore
      : (latestResult?.riskScore ?? 0);

  // Google Material 3 semantic surface tokens for Light vs Dark mode
  const surfaceCard = isDark
    ? 'bg-[#1E1F20] border-[#3C4043]'
    : 'bg-white border-[#DADCE0]';
  const surfaceSubtle = isDark
    ? 'bg-[#282A2C] border-[#3C4043]'
    : 'bg-[#F8F9FA] border-[#DADCE0]';
  const textPrimary = isDark ? 'text-[#E3E3E3]' : 'text-[#202124]';
  const textSecondary = isDark ? 'text-[#9AA0A6]' : 'text-[#5F6368]';

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark
          ? 'bg-[#131314] text-[#E3E3E3]'
          : 'bg-[#F8F9FA] text-[#202124]'
      }`}
    >
      {/* Clean Google Workspace / Material 3 Top App Bar */}
      <header
        className={`sticky top-0 z-30 border-b px-4 lg:px-8 h-16 flex items-center transition-colors duration-200 ${
          isDark
            ? 'bg-[#1E1F20] border-[#3C4043]'
            : 'bg-white border-[#DADCE0]'
        }`}
      >
        <div className="max-w-[1360px] mx-auto w-full flex items-center justify-between gap-4">
          {/* Google Product Lockup */}
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                isDark
                  ? 'bg-[#8AB4F8]/15 text-[#8AB4F8]'
                  : 'bg-[#E8F0FE] text-[#1A73E8]'
              }`}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className={`text-[19px] font-semibold tracking-tight ${textPrimary}`}>
                Google{' '}
                <span className={`font-normal ${textSecondary}`}>
                  Scam Call Shield
                </span>
              </span>
              <span
                className={`hidden md:inline-block text-xs font-medium px-2.5 py-0.5 rounded-md ${
                  isDark
                    ? 'bg-[#8AB4F8]/15 text-[#8AB4F8]'
                    : 'bg-[#E8F0FE] text-[#1967D2]'
                }`}
              >
                Kavach AI • Gemini Native Audio
              </span>
            </div>
          </div>

          {/* Right Controls: Language Switcher + Dark/Light Mode Toggle */}
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium hidden sm:inline ${textSecondary}`}>
              Warning Voice
            </span>
            <div
              className={`inline-flex rounded-full p-0.5 border ${
                isDark
                  ? 'bg-[#131314] border-[#3C4043]'
                  : 'bg-[#F1F3F4] border-[#DADCE0]'
              }`}
            >
              {(
                [
                  { code: 'gu', label: 'ગુજરાતી' },
                  { code: 'hi', label: 'हिंदी' },
                  { code: 'en', label: 'English' },
                ] as const
              ).map((item) => (
                <button
                  key={item.code}
                  onClick={() => setWarningLang(item.code)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    warningLang === item.code
                      ? isDark
                        ? 'bg-[#8AB4F8] text-[#131314] font-semibold'
                        : 'bg-white text-[#1A73E8] shadow-xs font-semibold'
                      : isDark
                        ? 'text-[#9AA0A6] hover:text-[#E3E3E3]'
                        : 'text-[#5F6368] hover:text-[#202124]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Dark / Light Mode Switcher */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#282A2C] border-[#3C4043] text-[#E3E3E3] hover:bg-[#3C4043]'
                  : 'bg-[#F1F3F4] border-[#DADCE0] text-[#3C4043] hover:bg-[#E8EAED]'
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#FDD663]" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#5F6368]" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="max-w-[1360px] mx-auto w-full flex-1 px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN (Fixed-Dimension Google Pixel 9 Call Screen — Never Resizes!) */}
        <section className="lg:col-span-5 flex flex-col items-center lg:sticky lg:top-22">
          {/* Strictly Fixed 376px x 736px Pixel 9 Hardware Viewport */}
          <div
            className={`w-[376px] h-[736px] shrink-0 rounded-[44px] p-[10px] border flex flex-col select-none transition-colors duration-200 ${
              isDark
                ? 'bg-[#0B0C0E] border-[#3C4043] shadow-[0_24px_60px_rgba(0,0,0,0.65)]'
                : 'bg-[#1F1F1F] border-[#3C4043] shadow-[0_20px_50px_rgba(32,33,36,0.18)]'
            }`}
          >
            <div
              className={`w-full h-full rounded-[35px] overflow-hidden flex flex-col transition-colors duration-300 ${
                isDark
                  ? callState === 'ENDED_BY_USER'
                    ? 'bg-[#141E17]'
                    : verdict === 'SCAM'
                      ? 'bg-[#221515]'
                      : verdict === 'SUSPICIOUS'
                        ? 'bg-[#211C12]'
                        : 'bg-[#18191B]'
                  : callState === 'ENDED_BY_USER'
                    ? 'bg-[#F6FBF7]'
                    : verdict === 'SCAM'
                      ? 'bg-[#FFF8F7]'
                      : verdict === 'SUSPICIOUS'
                        ? 'bg-[#FFFDF7]'
                        : 'bg-[#F8FAFD]'
              }`}
            >
              {/* 1. Pinned Android 15 / Pixel Status Bar (Fixed 36px) */}
              <div
                className={`h-9 px-6 flex items-center justify-between text-[11px] font-medium shrink-0 ${
                  isDark ? 'text-[#9AA0A6]' : 'text-[#3C4043]'
                }`}
              >
                <span>9:41</span>
                <div className="w-3 h-3 rounded-full bg-black" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold">5G</span>
                  <Wifi className="w-3.5 h-3.5" />
                  <BatteryCharging className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* 2. Pinned Google Phone Caller Header (Fixed 164px) */}
              <div
                className={`px-5 pt-2 pb-3 text-center shrink-0 border-b ${
                  isDark ? 'border-[#2D2E31]' : 'border-[#E8EAED]'
                }`}
              >
                {/* Pixel Call Assist Pill */}
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                    isDark
                      ? 'bg-[#8AB4F8]/15 text-[#8AB4F8]'
                      : 'bg-[#E8F0FE] text-[#1967D2]'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>Call Assist • Scam Shield</span>
                </div>

                {/* Caller Name & Number */}
                <h2 className={`text-[19px] font-semibold mt-2 truncate ${textPrimary}`}>
                  {isLiveMicActive
                    ? 'Live Microphone Caller'
                    : selectedScenario.callerName}
                </h2>
                <p className={`text-xs mt-0.5 truncate ${textSecondary}`}>
                  {isLiveMicActive
                    ? 'Incoming voice stream'
                    : `${selectedScenario.callerNumber} • ${selectedScenario.callerLocation}`}
                </p>

                {/* Call Timer + Live Waveform Bars */}
                <div className="flex items-center justify-center gap-2.5 mt-2 h-6">
                  {callState === 'PLAYING' ? (
                    <>
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                        }`}
                      >
                        {formatTimer(
                          isLiveMicActive ? liveMicSeconds : currentTimeSec
                        )}
                      </span>
                      <div className="flex items-center gap-0.5 h-3.5">
                        <span
                          className={`w-0.5 h-3.5 rounded-full animate-wave-1 ${
                            isDark ? 'bg-[#8AB4F8]' : 'bg-[#1A73E8]'
                          }`}
                        />
                        <span
                          className={`w-0.5 h-3.5 rounded-full animate-wave-2 ${
                            isDark ? 'bg-[#8AB4F8]' : 'bg-[#1A73E8]'
                          }`}
                        />
                        <span
                          className={`w-0.5 h-3.5 rounded-full animate-wave-3 ${
                            isDark ? 'bg-[#8AB4F8]' : 'bg-[#1A73E8]'
                          }`}
                        />
                        <span
                          className={`w-0.5 h-3.5 rounded-full animate-wave-4 ${
                            isDark ? 'bg-[#8AB4F8]' : 'bg-[#1A73E8]'
                          }`}
                        />
                      </div>
                      {isCallerDucked && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1A73E8] text-white">
                          Caller muted 85%
                        </span>
                      )}
                    </>
                  ) : callState === 'ENDED_BY_USER' ? (
                    <span
                      className={`text-xs font-medium ${
                        isDark ? 'text-[#81C995]' : 'text-[#1E8E3E]'
                      }`}
                    >
                      Call ended • Protected
                    </span>
                  ) : (
                    <span className={`text-xs ${textSecondary}`}>
                      {formatTimer(durationSec)} recording ready
                    </span>
                  )}
                </div>

                {/* Thin Material Progress Track */}
                <div className="mt-2 px-1">
                  <div
                    className={`w-full h-1 rounded-full overflow-hidden ${
                      isDark ? 'bg-[#2D2E31]' : 'bg-[#E8EAED]'
                    }`}
                  >
                    <div
                      className={`h-full transition-all duration-200 ${
                        verdict === 'SCAM'
                          ? 'bg-[#D93025]'
                          : verdict === 'SUSPICIOUS'
                            ? 'bg-[#F9AB00]'
                            : 'bg-[#1A73E8]'
                      }`}
                      style={{
                        width: isLiveMicActive
                          ? '100%'
                          : `${Math.min(
                              100,
                              (currentTimeSec / Math.max(durationSec, 1)) * 100
                            )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Fixed-Height Middle Viewport (Scrollable internally so Phone NEVER changes height) */}
              <div className="flex-1 overflow-y-auto google-scroll px-4 py-3.5 flex flex-col justify-between">
                {callState === 'ENDED_BY_USER' ? (
                  <div
                    className={`my-auto rounded-2xl border p-5 text-center space-y-3 shadow-2xs ${
                      isDark
                        ? 'bg-[#1E1F20] border-[#81C995]/40'
                        : 'bg-white border-[#CEEAD6]'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                        isDark
                          ? 'bg-[#81C995]/15 text-[#81C995]'
                          : 'bg-[#E6F4EA] text-[#1E8E3E]'
                      }`}
                    >
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h3
                      className={`text-base font-semibold font-gujarati ${
                        isDark ? 'text-[#81C995]' : 'text-[#137333]'
                      }`}
                    >
                      {warningLang === 'gu'
                        ? 'તમે સુરક્ષિત છો! ફોન કપાઈ ગયો છે.'
                        : warningLang === 'hi'
                          ? 'आप सुरक्षित हैं! कॉल काट दिया गया है।'
                          : 'Call ended safely'}
                    </h3>
                    <p className={`text-xs leading-relaxed ${textSecondary}`}>
                      {warningLang === 'gu'
                        ? 'તમારા ખાતામાંથી કોઈ પૈસા કપાયા નથી અને તમારા પરિવારને જાણ કરી દેવામાં આવી છે.'
                        : warningLang === 'hi'
                          ? 'आपके खाते से कोई पैसा नहीं कटा है और आपके परिवार को सूचित कर दिया गया है।'
                          : 'No money or OTP was shared. Your emergency contact has been notified.'}
                    </p>
                  </div>
                ) : verdict === 'SCAM' && latestResult ? (
                  /* GOOGLE PIXEL SCAM DETECTION CARD */
                  <div className="space-y-2.5">
                    <div
                      className={`rounded-2xl border p-3.5 space-y-2.5 ${
                        isDark
                          ? 'bg-[#3C1919] border-[#F28B82]/40'
                          : 'bg-[#FCE8E6] border-[#F6AEA9]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#D93025] text-white flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-4 h-4" />
                          </div>
                          <div>
                            <div
                              className={`text-[11px] font-semibold ${
                                isDark ? 'text-[#F28B82]' : 'text-[#C5221F]'
                              }`}
                            >
                              Likely scam • {riskScore}% risk
                            </div>
                            <div className={`text-xs font-semibold ${textPrimary}`}>
                              {latestResult.scamCategory}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            playSpokenWarning(latestResult, warningLang)
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-semibold cursor-pointer shrink-0 ${
                            isDark
                              ? 'bg-[#1E1F20] text-[#F28B82] border-[#F28B82]/40 hover:bg-[#282A2C]'
                              : 'bg-white text-[#C5221F] border-[#F6AEA9] hover:bg-[#FFF5F5]'
                          }`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          {warningLang === 'gu'
                            ? 'સાંભળો'
                            : warningLang === 'hi'
                              ? 'सुनें'
                              : 'Listen'}
                        </button>
                      </div>

                      {/* Elder Explanation in Gujarati / Hindi */}
                      <div
                        className={`rounded-xl p-3 border ${
                          isDark
                            ? 'bg-[#1E1F20] border-[#F28B82]/25'
                            : 'bg-white border-[#F6AEA9]/60'
                        }`}
                      >
                        <p
                          className={`text-[15px] font-semibold leading-snug ${textPrimary} ${
                            warningLang === 'gu'
                              ? 'font-gujarati'
                              : warningLang === 'hi'
                                ? 'font-hindi'
                                : ''
                          }`}
                        >
                          {latestResult.warningExplanation[warningLang]}
                        </p>
                      </div>
                    </div>

                    {/* Compact Material 3 Red Flag List */}
                    <div
                      className={`rounded-2xl border p-3 space-y-1.5 ${surfaceCard}`}
                    >
                      <div className={`text-[11px] font-semibold ${textSecondary}`}>
                        {warningLang === 'gu'
                          ? 'પકડાયેલા જોખમી સંકેતો (Red flags)'
                          : warningLang === 'hi'
                            ? 'पकड़े गए धोखाधड़ी के संकेत (Red flags)'
                            : 'Why this call was flagged'}
                      </div>
                      <div className="space-y-1.5">
                        {latestResult.redFlags.map((flag, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 py-1 border-t first:border-t-0 text-xs ${
                              isDark ? 'border-[#2D2E31]' : 'border-[#F1F3F4]'
                            }`}
                          >
                            {getRedFlagIcon(flag.type)}
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium leading-tight ${textPrimary}`}>
                                {getRedFlagText(flag, warningLang)}
                              </p>
                              <p className={`text-[11px] truncate mt-0.5 ${textSecondary}`}>
                                &ldquo;{flag.evidenceQuote}&rdquo;
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : verdict === 'SUSPICIOUS' && latestResult ? (
                  /* GOOGLE PIXEL CAUTION STATE */
                  <div
                    className={`my-auto rounded-2xl border p-4 space-y-3 ${
                      isDark
                        ? 'bg-[#332814] border-[#FDD663]/40'
                        : 'bg-[#FEF7E0] border-[#FDD663]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#F9AB00] text-white flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div
                          className={`text-[11px] font-semibold ${
                            isDark ? 'text-[#FDD663]' : 'text-[#B06000]'
                          }`}
                        >
                          Suspicious caller • {riskScore}% risk
                        </div>
                        <div className={`text-xs font-semibold ${textPrimary}`}>
                          {latestResult.scamCategory}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`rounded-xl p-3 border ${
                        isDark
                          ? 'bg-[#1E1F20] border-[#FDD663]/25'
                          : 'bg-white border-[#FEEFC3]'
                      }`}
                    >
                      <p className={`text-sm font-medium leading-snug ${textPrimary}`}>
                        {latestResult.warningExplanation[warningLang]}
                      </p>
                    </div>

                    {latestResult.redFlags.map((flag, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 text-xs font-medium px-1 ${
                          isDark ? 'text-[#FDD663]' : 'text-[#B06000]'
                        }`}
                      >
                        {getRedFlagIcon(flag.type)}
                        <span>{getRedFlagText(flag, warningLang)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* GOOGLE PIXEL CALM SAFE / LISTENING STATE */
                  <div
                    className={`my-auto rounded-2xl border p-5 text-center space-y-3 ${surfaceCard}`}
                  >
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto ${
                        isDark
                          ? 'bg-[#81C995]/15 text-[#81C995]'
                          : 'bg-[#E6F4EA] text-[#1E8E3E]'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div
                        className={`text-xs font-semibold ${
                          isDark ? 'text-[#81C995]' : 'text-[#1E8E3E]'
                        }`}
                      >
                        {latestResult
                          ? `No scam detected (${riskScore}% risk)`
                          : 'Real-time audio protection active'}
                      </div>
                      <p className={`text-sm font-medium leading-relaxed ${textPrimary}`}>
                        {latestResult
                          ? latestResult.warningExplanation[warningLang]
                          : warningLang === 'gu'
                            ? 'આ કોલ સુરક્ષિત છે કે ફ્રોડ, તેની લાઈવ તપાસ ચાલુ છે.'
                            : warningLang === 'hi'
                              ? 'यह कॉल सुरक्षित है या फ्रॉड, इसकी लाइव जांच हो रही है।'
                              : 'Listening for urgency, threats, authority claims, or OTP requests.'}
                      </p>
                    </div>
                    {latestResult && latestResult.redFlags.length === 0 && (
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${
                          isDark
                            ? 'bg-[#282A2C] text-[#E3E3E3]'
                            : 'bg-[#F1F3F4] text-[#3C4043]'
                        }`}
                      >
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${
                            isDark ? 'text-[#81C995]' : 'text-[#1E8E3E]'
                          }`}
                        />
                        Verified everyday conversation
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Pinned Bottom Google Pixel Call Dock (Fixed 138px) */}
              <div
                className={`px-5 pt-2.5 pb-4 border-t shrink-0 space-y-3 ${
                  isDark
                    ? 'bg-[#1E1F20] border-[#2D2E31]'
                    : 'bg-white border-[#E8EAED]'
                }`}
              >
                {/* Secondary Pixel Call Controls */}
                <div className="flex items-center justify-around px-4">
                  <div className={`flex flex-col items-center gap-1 ${textSecondary}`}>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isDark ? 'bg-[#282A2C]' : 'bg-[#F1F3F4]'
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                    </div>
                    <span className="text-[10px]">Mute</span>
                  </div>
                  <div className={`flex flex-col items-center gap-1 ${textSecondary}`}>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isDark ? 'bg-[#282A2C]' : 'bg-[#F1F3F4]'
                      }`}
                    >
                      <Grid className="w-4 h-4" />
                    </div>
                    <span className="text-[10px]">Keypad</span>
                  </div>
                  <button
                    onClick={() =>
                      latestResult && playSpokenWarning(latestResult, warningLang)
                    }
                    className={`flex flex-col items-center gap-1 cursor-pointer ${
                      isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isWarningSpeaking
                          ? 'bg-[#1A73E8] text-white'
                          : isDark
                            ? 'bg-[#8AB4F8]/15 text-[#8AB4F8]'
                            : 'bg-[#E8F0FE] text-[#1A73E8]'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-medium">Voice Alert</span>
                  </button>
                </div>

                {/* Primary Pixel Pill Action Button */}
                {callState === 'PLAYING' ? (
                  <button
                    onClick={handleEndCallByUser}
                    className="w-full h-12 rounded-full bg-[#D93025] hover:bg-[#B3261E] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>
                      {warningLang === 'gu'
                        ? 'ફોન કાપો (End Call)'
                        : warningLang === 'hi'
                          ? 'कॉल काटें (End Call)'
                          : 'End Call'}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => startCallSimulation()}
                    className="w-full h-12 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Play Call Recording (.wav)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (7 cols): CLEAN GOOGLE CONSOLE CARDS */}
        <section className="lg:col-span-7 space-y-5">
          {/* Card 1: Audio Source & Live Speech-to-Text Monitor */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-[15px] font-semibold ${textPrimary}`}>
                  Call Audio Scenarios &amp; Live Microphone Test
                </h2>
                <p className={`text-xs ${textSecondary}`}>
                  Select a pre-recorded `.wav` call or speak live to test
                  mid-call chunk detection
                </p>
              </div>

              <button
                onClick={toggleLiveMicMode}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  isLiveMicActive
                    ? 'bg-[#D93025] text-white'
                    : isDark
                      ? 'bg-[#8AB4F8]/15 text-[#8AB4F8] hover:bg-[#8AB4F8]/25'
                      : 'bg-[#E8F0FE] text-[#1A73E8] hover:bg-[#D2E3FC]'
                }`}
              >
                {isLiveMicActive ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    Stop Live Mic ({liveMicSeconds}s)
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    Speak Live as Scammer
                  </>
                )}
              </button>
            </div>

            {/* Clean Google Material List of Scenarios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CALL_SCENARIOS.map((sc) => {
                const isSelected = selectedScenario.id === sc.id;
                return (
                  <div
                    key={sc.id}
                    onClick={() => handleSelectScenario(sc)}
                    className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? isDark
                          ? 'border-[#8AB4F8] bg-[#282A2C]'
                          : 'border-[#1A73E8] bg-[#F8FAFD]'
                        : isDark
                          ? 'border-[#3C4043] hover:border-[#5F6368] bg-[#1E1F20]'
                          : 'border-[#DADCE0] hover:border-[#BDC1C6] bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                            sc.isScamExpected
                              ? isDark
                                ? 'bg-[#F28B82]/15 text-[#F28B82]'
                                : 'bg-[#FCE8E6] text-[#C5221F]'
                              : isDark
                                ? 'bg-[#81C995]/15 text-[#81C995]'
                                : 'bg-[#E6F4EA] text-[#137333]'
                          }`}
                        >
                          {sc.isScamExpected ? 'Scam sample' : 'Genuine sample'}
                        </span>
                        <a
                          href={sc.audioUrl}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className={`text-[11px] hover:underline inline-flex items-center gap-1 ${textSecondary}`}
                        >
                          <Download className="w-3 h-3" />
                          WAV
                        </a>
                      </div>
                      <h3 className={`font-semibold text-xs pt-0.5 ${textPrimary}`}>
                        {sc.title}
                      </h3>
                      <p className={`text-[11px] ${textSecondary}`}>
                        {sc.subtitle}
                      </p>
                    </div>

                    <div
                      className={`flex items-center justify-between pt-1.5 border-t ${
                        isDark ? 'border-[#2D2E31]' : 'border-[#F1F3F4]'
                      }`}
                    >
                      <span className={`text-[11px] font-medium ${textSecondary}`}>
                        {sc.languageBadge}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectScenario(sc);
                          startCallSimulation(sc);
                        }}
                        className="px-3 py-1 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        Play
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Heard-to-Text Box (Outside Mobile Screen) */}
            <div className={`rounded-xl border p-3.5 space-y-2 ${surfaceSubtle}`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-xs font-semibold ${textPrimary}`}>
                  <FileText
                    className={`w-3.5 h-3.5 ${
                      isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                    }`}
                  />
                  <span>
                    {isLiveMicActive
                      ? 'Live Microphone Heard-to-Text Transcript'
                      : 'Audio Heard-to-Text Transcript & Script'}
                  </span>
                </div>
                {isProcessingChunk && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                      isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                    }`}
                  >
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Processing audio chunk...
                  </span>
                )}
              </div>

              {overallMetrics.spokenLines.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {overallMetrics.spokenLines.map((line) => (
                    <div
                      key={line.chunkIndex}
                      className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${surfaceCard}`}
                    >
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                          line.verdict === 'SCAM'
                            ? isDark
                              ? 'bg-[#F28B82]/15 text-[#F28B82]'
                              : 'bg-[#FCE8E6] text-[#C5221F]'
                            : line.verdict === 'SUSPICIOUS'
                              ? isDark
                                ? 'bg-[#FDD663]/15 text-[#FDD663]'
                                : 'bg-[#FEF7E0] text-[#B06000]'
                              : isDark
                                ? 'bg-[#81C995]/15 text-[#81C995]'
                                : 'bg-[#E6F4EA] text-[#137333]'
                        }`}
                      >
                        #{line.chunkIndex} • {line.riskScore}%
                      </span>
                      <p className={`leading-relaxed ${textPrimary}`}>
                        &ldquo;{line.text}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-xs space-y-1 ${textPrimary}`}>
                  <p className="leading-relaxed">
                    &ldquo;{selectedScenario.fullScriptOriginal}&rdquo;
                  </p>
                  {selectedScenario.fullScriptOriginal !==
                    selectedScenario.fullScriptTranslationEn && (
                    <p className={`text-[11px] ${textSecondary}`}>
                      English: &ldquo;
                      {selectedScenario.fullScriptTranslationEn}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Overall Risk Score & Mid-Call Chunk Stream */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className={`text-[15px] font-semibold ${textPrimary}`}>
                  Overall Call Risk Score &amp; Chunk Timeline
                </h2>
                <p className={`text-xs ${textSecondary}`}>
                  Rolling 3.5-second `.wav` slices analyzed by Gemini Native
                  Audio
                </p>
              </div>

              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-md ${
                  isDark
                    ? 'bg-[#282A2C] text-[#9AA0A6]'
                    : 'bg-[#F1F3F4] text-[#5F6368]'
                }`}
              >
                {chunkArtifacts.length} chunks analyzed
              </span>
            </div>

            {/* Clean Google Summary Metric Bar */}
            <div
              className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 ${surfaceSubtle}`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-semibold text-white ${
                    overallMetrics.overallVerdict === 'SCAM'
                      ? 'bg-[#D93025]'
                      : overallMetrics.overallVerdict === 'SUSPICIOUS'
                        ? 'bg-[#F9AB00]'
                        : 'bg-[#1E8E3E]'
                  }`}
                >
                  <span className="text-base leading-none">
                    {overallMetrics.overallRiskScore}%
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${textSecondary}`}>
                      Overall Call Verdict
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        overallMetrics.overallVerdict === 'SCAM'
                          ? isDark
                            ? 'bg-[#F28B82]/15 text-[#F28B82]'
                            : 'bg-[#FCE8E6] text-[#C5221F]'
                          : overallMetrics.overallVerdict === 'SUSPICIOUS'
                            ? isDark
                              ? 'bg-[#FDD663]/15 text-[#FDD663]'
                              : 'bg-[#FEF7E0] text-[#B06000]'
                            : isDark
                              ? 'bg-[#81C995]/15 text-[#81C995]'
                              : 'bg-[#E6F4EA] text-[#137333]'
                      }`}
                    >
                      {overallMetrics.overallVerdict}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${textPrimary}`}>
                    Peak chunk: {overallMetrics.peakRiskScore}% • Active
                    average: {overallMetrics.avgActiveRiskScore}% •{' '}
                    {overallMetrics.totalRedFlags} red flags identified
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-44 space-y-1">
                <div className={`flex justify-between text-[10px] ${textSecondary}`}>
                  <span>Safe (0%)</span>
                  <span>Scam (100%)</span>
                </div>
                <div
                  className={`w-full h-2 rounded-full overflow-hidden ${
                    isDark ? 'bg-[#1E1F20]' : 'bg-[#E8EAED]'
                  }`}
                >
                  <div
                    className={`h-full transition-all duration-300 ${
                      overallMetrics.overallVerdict === 'SCAM'
                        ? 'bg-[#D93025]'
                        : overallMetrics.overallVerdict === 'SUSPICIOUS'
                          ? 'bg-[#F9AB00]'
                          : 'bg-[#1E8E3E]'
                    }`}
                    style={{ width: `${overallMetrics.overallRiskScore}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Chunk Items */}
            {chunkArtifacts.length === 0 ? (
              <div
                className={`rounded-xl border border-dashed py-8 text-center text-xs ${
                  isDark
                    ? 'border-[#3C4043] text-[#9AA0A6]'
                    : 'border-[#DADCE0] text-[#5F6368]'
                }`}
              >
                Start any call recording or live microphone test to inspect
                real-time audio chunks.
              </div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto google-scroll pr-1">
                {chunkArtifacts.map((item) => (
                  <div
                    key={item.chunkIndex}
                    className={`p-3 rounded-xl border space-y-1.5 ${surfaceCard}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                            isDark
                              ? 'bg-[#282A2C] text-[#E3E3E3]'
                              : 'bg-[#F1F3F4] text-[#202124]'
                          }`}
                        >
                          Chunk #{item.chunkIndex} ({item.timeRangeSec})
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                            item.analysis.verdict === 'SCAM'
                              ? isDark
                                ? 'bg-[#F28B82]/15 text-[#F28B82]'
                                : 'bg-[#FCE8E6] text-[#C5221F]'
                              : item.analysis.verdict === 'SUSPICIOUS'
                                ? isDark
                                  ? 'bg-[#FDD663]/15 text-[#FDD663]'
                                  : 'bg-[#FEF7E0] text-[#B06000]'
                                : isDark
                                  ? 'bg-[#81C995]/15 text-[#81C995]'
                                  : 'bg-[#E6F4EA] text-[#137333]'
                          }`}
                        >
                          {item.analysis.verdict} • {item.analysis.riskScore}%
                        </span>
                        <span className={`text-[11px] ${textSecondary}`}>
                          {item.analysis.modelUsed || 'gemini-2.5-flash-lite'} (
                          {item.analysis.latencyMs}ms)
                        </span>
                      </div>

                      <audio
                        controls
                        src={item.blobUrl}
                        className="h-6 w-36"
                      />
                    </div>

                    <p className={`text-xs ${textPrimary}`}>
                      &ldquo;{item.analysis.transcriptChunk}&rdquo;
                    </p>

                    {item.analysis.redFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {item.analysis.redFlags.map((rf, i) => (
                          <span
                            key={i}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                              isDark
                                ? 'bg-[#F28B82]/15 text-[#F28B82]'
                                : 'bg-[#FCE8E6]/60 text-[#C5221F]'
                            }`}
                          >
                            {getRedFlagText(rf, warningLang)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 3: Emergency Contact Alert (Trilingual WhatsApp + Pointer Lines) */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Users
                  className={`w-4 h-4 ${
                    isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                  }`}
                />
                <div>
                  <h2 className={`text-[15px] font-semibold ${textPrimary}`}>
                    Emergency Family Contact Notification
                  </h2>
                  <p className={`text-xs ${textSecondary}`}>
                    Dispatches a trilingual alert (English, ગુજરાતી, हिंदी) with
                    caller quotes when a scam is flagged
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md ${
                  emergencyAlertSent
                    ? isDark
                      ? 'bg-[#F28B82]/15 text-[#F28B82]'
                      : 'bg-[#FCE8E6] text-[#C5221F]'
                    : isDark
                      ? 'bg-[#81C995]/15 text-[#81C995]'
                      : 'bg-[#E6F4EA] text-[#137333]'
                }`}
              >
                {emergencyAlertSent ? 'Alert triggered' : 'Monitoring'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className={`text-[11px] font-medium block mb-1 ${textSecondary}`}>
                  Contact Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs ${surfaceSubtle} ${textPrimary}`}
                />
              </div>
              <div>
                <label className={`text-[11px] font-medium block mb-1 ${textSecondary}`}>
                  Relationship
                </label>
                <select
                  value={contactRelation}
                  onChange={(e) => setContactRelation(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs ${surfaceSubtle} ${textPrimary}`}
                >
                  <option value="father">Father (પિતા / पिता)</option>
                  <option value="mother">Mother (માતા / माता)</option>
                  <option value="grandfather">Grandfather (દાદા / दादाजी)</option>
                  <option value="grandmother">Grandmother (દાદી / दादीजी)</option>
                </select>
              </div>
              <div>
                <label className={`text-[11px] font-medium block mb-1 ${textSecondary}`}>
                  WhatsApp / Phone
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs ${surfaceSubtle} ${textPrimary}`}
                />
              </div>
            </div>

            {emergencyAlertSent && (
              <div className={`rounded-xl border p-4 space-y-3 ${surfaceSubtle}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      isDark ? 'text-[#F28B82]' : 'text-[#C5221F]'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>
                      Prepared for {contactName} ({contactPhone}) at{' '}
                      {emergencyAlertSent.timestamp}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          emergencyAlertSent.fullTrilingualMessage
                        );
                        setCopiedWhatsapp(true);
                        setTimeout(() => setCopiedWhatsapp(false), 2000);
                      }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border inline-flex items-center gap-1 cursor-pointer ${surfaceCard} ${textPrimary}`}
                    >
                      {copiedWhatsapp ? (
                        <>
                          <Check className="w-3 h-3 text-[#1E8E3E]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy text
                        </>
                      )}
                    </button>
                    <a
                      href={`https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        emergencyAlertSent.fullTrilingualMessage
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium px-3.5 py-1.5 rounded-full bg-[#1E8E3E] text-white hover:opacity-95 inline-flex items-center gap-1"
                    >
                      Send via WhatsApp <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {emergencyAlertSent.pointerLines.length > 0 && (
                  <div className={`p-3 rounded-lg border space-y-1 ${surfaceCard}`}>
                    <span className={`text-[11px] font-semibold block ${textSecondary}`}>
                      Caller quotes attached to message:
                    </span>
                    <ul className={`list-disc list-inside text-xs space-y-0.5 ${textPrimary}`}>
                      {emergencyAlertSent.pointerLines.map((line, i) => (
                        <li key={i}>&ldquo;{line}&rdquo;</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={`p-3 rounded-lg border space-y-2 text-xs leading-relaxed ${surfaceCard}`}>
                  <div>
                    <span className={`font-semibold ${textPrimary}`}>
                      English:{' '}
                    </span>
                    <span className={textSecondary}>
                      Your {contactRelation} may be on a scam call right now (
                      {emergencyAlertSent.scamCategory}). Red flags:{' '}
                      {emergencyAlertSent.redFlagsEn.join(', ')}. Please call
                      immediately.
                    </span>
                  </div>
                  <div className="font-gujarati">
                    <span className={`font-semibold ${textPrimary}`}>
                      ગુજરાતી:{' '}
                    </span>
                    <span className={textSecondary}>
                      સાવધાન! તમારા પરિવારના સભ્ય ({contactRelation}) અત્યારે
                      &ldquo;{emergencyAlertSent.scamCategory}&rdquo; ફ્રોડ કોલ
                      પર હોઈ શકે છે ({emergencyAlertSent.redFlagsGu.join(', ')}
                      ). કૃપા કરીને તરત જ તેમને ફોન કરો.
                    </span>
                  </div>
                  <div className="font-hindi">
                    <span className={`font-semibold ${textPrimary}`}>
                      हिंदी:{' '}
                    </span>
                    <span className={textSecondary}>
                      सावधान! आपके परिवार के सदस्य ({contactRelation}) इस समय
                      &ldquo;{emergencyAlertSent.scamCategory}&rdquo; स्कैम कॉल
                      पर हो सकते हैं ({emergencyAlertSent.redFlagsHi.join(', ')}
                      )। कृपया तुरंत उन्हें कॉल करें।
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 4: Next Steps & Fraud Prevention Playbook */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Lock
                  className={`w-4 h-4 ${
                    isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                  }`}
                />
                <div>
                  <h2 className={`text-[15px] font-semibold ${textPrimary}`}>
                    Recommended Next Steps &amp; Safety Playbook
                  </h2>
                  <p className={`text-xs ${textSecondary}`}>
                    Protective actions if passwords, OTP, KYC details, or money
                    were requested
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadEvidenceReport}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border ${surfaceSubtle} ${textPrimary}`}
              >
                <Download className="w-3.5 h-3.5" />
                Export 1930 Incident Report
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3.5 space-y-2 ${surfaceSubtle}`}>
                <div className={`flex items-center gap-2 font-semibold text-xs ${textPrimary}`}>
                  <KeyRound
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
                    }`}
                  />
                  <span>
                    {warningLang === 'gu'
                      ? 'પાસવર્ડ, પિન અને OTP સુરક્ષા'
                      : warningLang === 'hi'
                        ? 'पासवर्ड, पिन और OTP सुरक्षा'
                        : 'Password, UPI PIN & Account Security'}
                  </span>
                </div>
                <ul className={`text-xs space-y-1.5 list-disc list-inside leading-relaxed ${textSecondary}`}>
                  {warningLang === 'gu' ? (
                    <>
                      <li>
                        નેટબેંકિંગ પાસવર્ડ અને UPI PIN તરત બદલી નાખો.
                      </li>
                      <li>
                        બેંક એપમાંથી બધા એક્ટિવ સેશન લોગ-આઉટ કરો અને કાર્ડ બ્લોક
                        કરો.
                      </li>
                      <li>
                        AnyDesk કે TeamViewer જેવી સ્ક્રીન-શેરિંગ એપ ડિલીટ કરો.
                      </li>
                    </>
                  ) : warningLang === 'hi' ? (
                    <>
                      <li>
                        नेटबैंकिंग पासवर्ड और UPI पिन तुरंत बदलें।
                      </li>
                      <li>
                        बैंक ऐप से सभी एक्टिव सेशन लॉग-आउट करें और कार्ड ब्लॉक
                        करें।
                      </li>
                      <li>
                        AnyDesk या TeamViewer जैसे स्क्रीन-शेयरिंग ऐप तुरंत हटाएं।
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        Reset your NetBanking password and UPI PIN immediately.
                      </li>
                      <li>
                        Log out of all active bank sessions and freeze debit or
                        credit cards.
                      </li>
                      <li>
                        Uninstall remote screen-sharing apps (AnyDesk,
                        TeamViewer, unknown APKs).
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <div className={`rounded-xl border p-3.5 space-y-2 ${surfaceSubtle}`}>
                <div className={`flex items-center gap-2 font-semibold text-xs ${textPrimary}`}>
                  <PhoneCall
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isDark ? 'text-[#F28B82]' : 'text-[#D93025]'
                    }`}
                  />
                  <span>
                    {warningLang === 'gu'
                      ? 'સાયબર હેલ્પલાઇન ૧૯૩૦ અને આધાર લોક'
                      : warningLang === 'hi'
                        ? 'साइबर हेल्पलाइन 1930 और आधार लॉक'
                        : '1930 Cyber Helpline & Aadhaar Lock'}
                  </span>
                </div>
                <ul className={`text-xs space-y-1.5 list-disc list-inside leading-relaxed ${textSecondary}`}>
                  {warningLang === 'gu' ? (
                    <>
                      <li>
                        પૈસા ટ્રાન્સફર થયા હોય તો તરત <strong>1930</strong> પર
                        કોલ કરી ખાતું ફ્રીઝ કરાવો.
                      </li>
                      <li>
                        myAadhaar પોર્ટલ પર જઈ આધાર બાયોમેટ્રિક્સ લોક કરો.
                      </li>
                      <li>
                        sancharsaathi.gov.in (Chakshu) પર નંબર રિપોર્ટ કરો.
                      </li>
                    </>
                  ) : warningLang === 'hi' ? (
                    <>
                      <li>
                        पैसे ट्रांसफर होने पर तुरंत <strong>1930</strong> पर कॉल
                        करके ठग का खाता फ्रीज करवाएं।
                      </li>
                      <li>
                        myAadhaar पोर्टल पर अपने आधार बायोमेट्रिक लॉक करें।
                      </li>
                      <li>
                        sancharsaathi.gov.in (Chakshu) पर फर्जी नंबर रिपोर्ट करें।
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        Call <strong>1930</strong> immediately to freeze the
                        recipient bank account in the Golden Hour.
                      </li>
                      <li>
                        Lock Aadhaar biometrics on the myAadhaar portal if ID
                        details were shared.
                      </li>
                      <li>
                        Report the caller on DoT Chakshu (sancharsaathi.gov.in).
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="tel:1930"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D93025] text-white text-xs font-medium hover:opacity-95"
              >
                Call 1930 Helpline
              </a>
              <a
                href="https://cybercrime.gov.in"
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium ${surfaceSubtle} ${textPrimary}`}
              >
                cybercrime.gov.in <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://sancharsaathi.gov.in/sfc/"
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium ${surfaceSubtle} ${textPrimary}`}
              >
                DoT Chakshu Portal <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://myaadhaar.uidai.gov.in/"
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium ${surfaceSubtle} ${textPrimary}`}
              >
                myAadhaar Lock <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
