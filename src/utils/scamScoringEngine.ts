import type { ChunkAnalysisResult } from '../data/callScenarios';

export interface ChunkLike {
  chunkIndex: number;
  analysis: ChunkAnalysisResult;
}

export interface OverallCallMetrics {
  overallRiskScore: number;
  peakRiskScore: number;
  avgActiveRiskScore: number;
  overallVerdict: 'SAFE' | 'SUSPICIOUS' | 'SCAM';
  totalRedFlags: number;
  spokenLines: Array<{
    chunkIndex: number;
    text: string;
    verdict: 'SAFE' | 'SUSPICIOUS' | 'SCAM';
    riskScore: number;
  }>;
  scammerPointerQuotes: string[];
}

/**
 * Computes the overall call risk score, peak chunk score, active chunk average,
 * filtered spoken transcript lines (skipping silent "..." chunks), and scammer pointer quotes.
 */
export function computeOverallCallMetrics(
  chunkArtifacts: Array<{ chunkIndex: number; analysis: ChunkAnalysisResult }>
): OverallCallMetrics {
  if (chunkArtifacts.length === 0) {
    return {
      overallRiskScore: 0,
      peakRiskScore: 0,
      avgActiveRiskScore: 0,
      overallVerdict: 'SAFE',
      totalRedFlags: 0,
      spokenLines: [],
      scammerPointerQuotes: [],
    };
  }

  const meaningfulChunks = chunkArtifacts.filter((c) => {
    const t = c.analysis.transcriptChunk.trim();
    return t.length > 2 && t !== '...' && t !== '…';
  });

  const sourceList =
    meaningfulChunks.length > 0 ? meaningfulChunks : chunkArtifacts;

  const peakRiskScore = Math.max(
    ...sourceList.map((c) => c.analysis.riskScore)
  );
  const avgActiveRiskScore = Math.round(
    sourceList.reduce((acc, c) => acc + c.analysis.riskScore, 0) /
      sourceList.length
  );

  const overallRiskScore =
    peakRiskScore >= 70
      ? Math.min(99, Math.round(peakRiskScore * 0.8 + avgActiveRiskScore * 0.2))
      : peakRiskScore >= 35
        ? Math.round(peakRiskScore * 0.7 + avgActiveRiskScore * 0.3)
        : avgActiveRiskScore;

  const overallVerdict: 'SAFE' | 'SUSPICIOUS' | 'SCAM' =
    peakRiskScore >= 70 ||
    chunkArtifacts.some((c) => c.analysis.verdict === 'SCAM')
      ? 'SCAM'
      : peakRiskScore >= 35 ||
          chunkArtifacts.some((c) => c.analysis.verdict === 'SUSPICIOUS')
        ? 'SUSPICIOUS'
        : 'SAFE';

  const uniqueFlags = new Set<string>();
  const pointerSet = new Set<string>();

  chunkArtifacts.forEach((c) => {
    c.analysis.redFlags.forEach((rf) => {
      uniqueFlags.add(rf.labelEn);
      if (rf.evidenceQuote && rf.evidenceQuote.trim().length > 2) {
        pointerSet.add(rf.evidenceQuote.trim());
      }
    });
    if (
      (c.analysis.verdict === 'SCAM' || c.analysis.verdict === 'SUSPICIOUS') &&
      c.analysis.transcriptChunk.trim().length > 3
    ) {
      pointerSet.add(c.analysis.transcriptChunk.trim());
    }
  });

  const spokenLines = meaningfulChunks.map((c) => ({
    chunkIndex: c.chunkIndex,
    text: c.analysis.transcriptChunk.trim(),
    verdict: c.analysis.verdict,
    riskScore: c.analysis.riskScore,
  }));

  return {
    overallRiskScore,
    peakRiskScore,
    avgActiveRiskScore,
    overallVerdict,
    totalRedFlags: uniqueFlags.size,
    spokenLines,
    scammerPointerQuotes: Array.from(pointerSet).slice(0, 5),
  };
}

/**
 * Builds the trilingual (English + Gujarati + Hindi) emergency family contact WhatsApp alert
 * with exact pointer lines spoken by the scammer.
 */
export function buildTrilingualEmergencyAlertPayload(params: {
  result: ChunkAnalysisResult;
  allChunks: Array<{ analysis: ChunkAnalysisResult }>;
  contactRelation: string;
  timestamp: string;
}) {
  const { result, allChunks, contactRelation, timestamp } = params;
  const pointerQuotes: string[] = [];
  const redFlagsEn: string[] = [];
  const redFlagsGu: string[] = [];
  const redFlagsHi: string[] = [];

  const combined = [...allChunks.map((c) => c.analysis), result];
  combined.forEach((res) => {
    if (
      (res.verdict === 'SCAM' || res.verdict === 'SUSPICIOUS') &&
      res.transcriptChunk &&
      res.transcriptChunk.trim().length > 3 &&
      !pointerQuotes.includes(res.transcriptChunk.trim())
    ) {
      pointerQuotes.push(res.transcriptChunk.trim());
    }
    res.redFlags.forEach((f) => {
      if (f.evidenceQuote && !pointerQuotes.includes(f.evidenceQuote.trim())) {
        pointerQuotes.push(f.evidenceQuote.trim());
      }
      if (!redFlagsEn.includes(f.labelEn)) redFlagsEn.push(f.labelEn);
      if (!redFlagsGu.includes(f.labelGu)) redFlagsGu.push(f.labelGu);
      if (!redFlagsHi.includes(f.labelHi)) redFlagsHi.push(f.labelHi);
    });
  });

  const topPointers = pointerQuotes.slice(0, 4);
  const pointerBulletText =
    topPointers.length > 0
      ? topPointers.map((line) => `• "${line}"`).join('\n')
      : `• "${result.transcriptChunk}"`;

  const isFemale =
    contactRelation === 'mother' || contactRelation === 'grandmother';
  const pronounObj = isFemale ? 'her' : 'him';
  const pronounSubj = isFemale ? 'she' : 'he';

  const fullTrilingualMessage = [
    `*GOOGLE KAVACH AI — SCAM CALL ALERT*`,
    `Time: ${timestamp} | Overall Risk: *${result.riskScore}%*`,
    `Detected Pattern: *${result.scamCategory}*`,
    ``,
    `*ENGLISH:*`,
    `Your ${contactRelation} may be on a scam call right now (${redFlagsEn.join(', ') || 'Scam indicators'}). Please call ${pronounObj} immediately so ${pronounSubj} hangs up.`,
    ``,
    `*ગુજરાતી (GUJARATI):*`,
    `સાવધાન! તમારા પરિવારના સભ્ય (${contactRelation}) અત્યારે "${result.scamCategory}" ફ્રોડ કોલ પર હોઈ શકે છે (${redFlagsGu.join(', ') || 'સાયબર ફ્રોડ'}). કૃપા કરીને તરત જ તેમને ફોન કરો અને પૈસા કે OTP આપતા અટકાવો.`,
    ``,
    `*हिंदी (HINDI):*`,
    `सावधान! आपके परिवार के सदस्य (${contactRelation}) इस समय "${result.scamCategory}" स्कैम कॉल पर हो सकते हैं (${redFlagsHi.join(', ') || 'साइबर फ्रॉड'})। कृपया तुरंत उन्हें कॉल करें और पैसे या OTP देने से रोकें।`,
    ``,
    `*POINTER LINES SPOKEN BY CALLER:*`,
    pointerBulletText,
  ].join('\n');

  return {
    timestamp,
    scamCategory: result.scamCategory,
    overallRiskScore: result.riskScore,
    pointerLines: topPointers,
    redFlagsEn,
    redFlagsGu,
    redFlagsHi,
    fullTrilingualMessage,
  };
}
