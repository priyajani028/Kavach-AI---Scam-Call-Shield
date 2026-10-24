export type WarningLanguage = 'gu' | 'hi' | 'en';

export type RedFlagType =
  | 'AUTHORITY_CLAIM'
  | 'THREAT'
  | 'URGENCY'
  | 'OTP_MONEY_DEMAND';

export interface RedFlagItem {
  type: RedFlagType;
  labelGu: string;
  labelHi: string;
  labelEn: string;
  evidenceQuote: string;
}

export interface ChunkAnalysisResult {
  chunkIndex: number;
  timeRangeSec: string;
  transcriptChunk: string;
  detectedLanguage: string;
  verdict: 'SAFE' | 'SUSPICIOUS' | 'SCAM';
  riskScore: number;
  scamCategory: string;
  redFlags: RedFlagItem[];
  warningExplanation: {
    gu: string;
    hi: string;
    en: string;
  };
  latencyMs?: number;
  source?: 'gemini-live-audio' | 'gemini-calibrated';
  modelUsed?: string;
}

export interface CallScenario {
  id: string;
  title: string;
  subtitle: string;
  languageBadge: string;
  defaultWarningLang: WarningLanguage;
  callerName: string;
  callerNumber: string;
  callerLocation: string;
  isScamExpected: boolean;
  audioUrl: string;
  warningAudioUrls: {
    gu: string;
    hi: string;
    en: string;
  };
  fullScriptOriginal: string;
  fullScriptTranslationEn: string;
  calibratedChunks: ChunkAnalysisResult[];
}

export const CALL_SCENARIOS: CallScenario[] = [
  {
    id: 'gu_scam_digital_arrest',
    title: 'ગુજરાતી (Scam): Digital Arrest & Cyber Cell',
    subtitle: 'Mumbai Police Cyber Cell • Parcel Drugs + ₹50,000 Demand',
    languageBadge: 'ગુજરાતી • Gujarati',
    defaultWarningLang: 'gu',
    callerName: 'Unknown Caller (Cyber Cell?)',
    callerNumber: '+91 98920 41829',
    callerLocation: 'Mumbai, Maharashtra (Spoofed)',
    isScamExpected: true,
    audioUrl: '/audio/gu_scam_digital_arrest.wav',
    warningAudioUrls: {
      gu: '/audio/warning_gu.wav',
      hi: '/audio/warning_hi.wav',
      en: '/audio/warning_en.wav',
    },
    fullScriptOriginal:
      'નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું. તમારા આધાર નંબર પર મોકલેલા પાર્સલમાં ડ્રગ્સ મળ્યા છે. તમે ડિજિટલ અરેસ્ટમાં છો, ફોન કાપશો નહીં. કેસ બંધ કરવા માટે અત્યારે જ ₹50,000 ટ્રાન્સફર કરો.',
    fullScriptTranslationEn:
      'Hello, I am speaking from Mumbai Police Cyber Cell. Drugs have been found in a parcel sent using your Aadhaar number. You are under Digital Arrest, do not disconnect the phone. Transfer ₹50,000 right now to close the case.',
    calibratedChunks: [
      {
        chunkIndex: 1,
        timeRangeSec: '0.0s – 3.5s',
        transcriptChunk: 'નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું...',
        detectedLanguage: 'Gujarati (gu-IN)',
        verdict: 'SUSPICIOUS',
        riskScore: 48,
        scamCategory: 'Unverified Police / Authority Claim',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'મુંબઈ પોલીસ સાયબર સેલ હોવાનો દાવો',
            labelHi: 'मुंबई पुलिस साइबर सेल होने का दावा',
            labelEn: 'Claims to be Mumbai Police Cyber Cell',
            evidenceQuote: 'હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું',
          },
        ],
        warningExplanation: {
          gu: 'ધ્યાન રાખો: કોલ કરનાર પોતાને મુંબઈ સાયબર પોલીસ ગણાવે છે. અસલી પોલીસ સામાન્ય કોલ પર તપાસ કરતી નથી.',
          hi: 'सावधान रहें: कॉल करने वाला खुद को मुंबई साइबर पुलिस बता रहा है। असली पुलिस ऐसे सामान्य कॉल नहीं करती।',
          en: 'Caution: Caller claims to be Mumbai Cyber Police. Real police do not conduct investigations over regular phone calls.',
        },
      },
      {
        chunkIndex: 2,
        timeRangeSec: '0.0s – 7.5s',
        transcriptChunk:
          'નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું. તમારા આધાર નંબર પર મોકલેલા પાર્સલમાં ડ્રગ્સ મળ્યા છે. તમે ડિજિટલ અરેસ્ટમાં છો, ફોન કાપશો નહીં...',
        detectedLanguage: 'Gujarati (gu-IN)',
        verdict: 'SCAM',
        riskScore: 94,
        scamCategory: 'Digital Arrest & Fake Courier Scam',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'મુંબઈ પોલીસ સાયબર સેલ હોવાનો ખોટો દાવો',
            labelHi: 'मुंबई पुलिस साइबर सेल का झूठा दावा',
            labelEn: 'Fake claim of being Mumbai Police Cyber Cell',
            evidenceQuote: 'મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું',
          },
          {
            type: 'THREAT',
            labelGu: 'આધાર પાર્સલમાં ડ્રગ્સ અને "ડિજિટલ અરેસ્ટ" ની ધમકી',
            labelHi: 'आधार पार्सल में ड्रग्स और "डिजिटल अरेस्ट" की धमकी',
            labelEn: 'Threatens drugs in Aadhaar parcel & "Digital Arrest"',
            evidenceQuote: 'પાર્સલમાં ડ્રગ્સ મળ્યા છે. તમે ડિજિટલ અરેસ્ટમાં છો',
          },
          {
            type: 'URGENCY',
            labelGu: 'ફોન ન કાપવા માટે દબાણ (એકાંતમાં રાખવાનો પ્રયાસ)',
            labelHi: 'कॉल न काटने का दबाव (आपको अकेला रखने की साजिश)',
            labelEn: 'Coerces you not to disconnect the call',
            evidenceQuote: 'ફોન કાપશો નહીં',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન બાપુ! આ ૧૦૦% નકલી પોલીસ કોલ છે. ભારતના કાયદામાં "ડિજિટલ અરેસ્ટ" જેવું કંઈ હોતું જ નથી. ગભરાશો નહીં, તરત જ ફોન કાપી નાખો!',
          hi: 'सावधान! यह १००% नकली पुलिस कॉल है। भारत के कानून में "डिजिटल अरेस्ट" जैसा कुछ नहीं होता। घबराएं नहीं, तुरंत फोन काट दें!',
          en: 'WARNING! This is a 100% fake police scam. There is NO such thing as "Digital Arrest" in Indian law. Do not panic—hang up immediately!',
        },
      },
      {
        chunkIndex: 3,
        timeRangeSec: '0.0s – 12.5s',
        transcriptChunk:
          'નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું. તમારા આધાર નંબર પર મોકલેલા પાર્સલમાં ડ્રગ્સ મળ્યા છે. તમે ડિજિટલ અરેસ્ટમાં છો, ફોન કાપશો નહીં. કેસ બંધ કરવા માટે અત્યારે જ ₹50,000 ટ્રાન્સફર કરો.',
        detectedLanguage: 'Gujarati (gu-IN)',
        verdict: 'SCAM',
        riskScore: 99,
        scamCategory: 'Digital Arrest Extortion (₹50,000 Demand)',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'મુંબઈ પોલીસ સાયબર સેલ હોવાનો ખોટો દાવો',
            labelHi: 'मुंबई पुलिस साइबर सेल का झूठा दावा',
            labelEn: 'Impersonating Mumbai Police Cyber Cell',
            evidenceQuote: 'મુંબઈ પોલીસ સાયબર સેલ',
          },
          {
            type: 'THREAT',
            labelGu: '"ડિજિટલ અરેસ્ટ" અને ડ્રગ્સ કેસની ખોટી ધમકી',
            labelHi: '"डिजिटल अरेस्ट" और ड्रग्स केस की झूठी धमकी',
            labelEn: 'Fake "Digital Arrest" & narcotics parcel threat',
            evidenceQuote: 'તમે ડિજિટલ અરેસ્ટમાં છો',
          },
          {
            type: 'URGENCY',
            labelGu: 'ફોન ચાલુ રાખવા અને તરત પૈસા મોકલવા દબાણ',
            labelHi: 'कॉल चालू रखने और तुरंत पैसे भेजने का दबाव',
            labelEn: 'High urgency ("Right now / Do not cut call")',
            evidenceQuote: 'ફોન કાપશો નહીં... અત્યારે જ',
          },
          {
            type: 'OTP_MONEY_DEMAND',
            labelGu: 'કેસ બંધ કરવા ₹50,000 ટ્રાન્સફર કરવાની માંગ',
            labelHi: 'केस बंद करने के लिए ₹50,000 ट्रांसफर की मांग',
            labelEn: 'Demands ₹50,000 money transfer to close case',
            evidenceQuote: 'કેસ બંધ કરવા માટે અત્યારે જ ₹50,000 ટ્રાન્સફર કરો',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન બાપુ! આ સાયબર ઠગ છે. પોલીસ ક્યારેય કેસ બંધ કરવા ₹50,000 માંગતી નથી અને "ડિજિટલ અરેસ્ટ" ખોટું છે. એક રૂપિયો પણ મોકલશો નહીં, તરત ફોન કાપો!',
          hi: 'सावधान! यह साइबर ठग है। पुलिस कभी केस बंद करने के लिए ₹50,000 नहीं मांगती और "डिजिटल अरेस्ट" फर्जी है। एक रुपया भी न भेजें, तुरंत फोन काटें!',
          en: 'DANGER! Police never ask for ₹50,000 to close a case, and "Digital Arrest" is fake. Send zero money and disconnect right now!',
        },
      },
    ],
  },
  {
    id: 'hi_scam_digital_arrest',
    title: 'हिंदी (Scam): Digital Arrest & Cyber Cell',
    subtitle: 'Mumbai Police Cyber Cell • Aadhaar Parcel Drugs + ₹50,000',
    languageBadge: 'हिंदी • Hindi',
    defaultWarningLang: 'hi',
    callerName: 'Unknown Caller (Cyber Police?)',
    callerNumber: '+91 91672 88310',
    callerLocation: 'New Delhi / Mumbai (Spoofed)',
    isScamExpected: true,
    audioUrl: '/audio/hi_scam_digital_arrest.wav',
    warningAudioUrls: {
      gu: '/audio/warning_gu.wav',
      hi: '/audio/warning_hi.wav',
      en: '/audio/warning_en.wav',
    },
    fullScriptOriginal:
      'नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ। आपके आधार नंबर से भेजे गए पार्सल में ड्रग्स मिले हैं। आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए। केस बंद करने के लिए अभी ₹50,000 ट्रांसफर कीजिए।',
    fullScriptTranslationEn:
      'Hello, I am speaking from Mumbai Police Cyber Cell. Drugs were found in a parcel sent with your Aadhaar number. You are under Digital Arrest, do not cut the call. Transfer ₹50,000 right now to close the case.',
    calibratedChunks: [
      {
        chunkIndex: 1,
        timeRangeSec: '0.0s – 3.5s',
        transcriptChunk: 'नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ...',
        detectedLanguage: 'Hindi (hi-IN)',
        verdict: 'SUSPICIOUS',
        riskScore: 46,
        scamCategory: 'Unverified Police Authority Claim',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'મુંબઈ પોલીસ સાયબર સેલ હોવાનો દાવો',
            labelHi: 'मुंबई पुलिस साइबर सेल से बोलने का दावा',
            labelEn: 'Claims to be calling from Mumbai Police Cyber Cell',
            evidenceQuote: 'मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ',
          },
        ],
        warningExplanation: {
          gu: 'ધ્યાન રાખો: કોલ કરનાર પોતાને મુંબઈ પોલીસ ગણાવે છે. સતર્ક રહો.',
          hi: 'सतर्क रहें: कॉल करने वाला खुद को मुंबई पुलिस साइबर सेल बता रहा है। असली पुलिस फोन पर डराती नहीं है।',
          en: 'Be cautious: Caller claims to be Mumbai Police Cyber Cell.',
        },
      },
      {
        chunkIndex: 2,
        timeRangeSec: '0.0s – 7.5s',
        transcriptChunk:
          'नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ। आपके आधार नंबर से भेजे गए पार्सल में ड्रग्स मिले हैं। आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए...',
        detectedLanguage: 'Hindi (hi-IN)',
        verdict: 'SCAM',
        riskScore: 95,
        scamCategory: 'Digital Arrest & Narcotics Parcel Scam',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'મુંબઈ પોલીસ સાયબર સેલનો ખોટો દાવો',
            labelHi: 'मुंबई पुलिस साइबर सेल का फर्जी दावा',
            labelEn: 'Fake Mumbai Police Cyber Cell claim',
            evidenceQuote: 'मुंबई पुलिस साइबर सेल से बोल रहा हूँ',
          },
          {
            type: 'THREAT',
            labelGu: 'પાર્સલમાં ડ્રગ્સ અને "ડિજિટલ અરેસ્ટ" ની ધમકી',
            labelHi: 'पार्सल में ड्रग्स और "डिजिटल अरेस्ट" की धमकी',
            labelEn: 'Threatens drugs in parcel & "Digital Arrest"',
            evidenceQuote: 'पार्सल में ड्रग्स मिले हैं। आप डिजिटल अरेस्ट में हैं',
          },
          {
            type: 'URGENCY',
            labelGu: 'કોલ ન કાપવા માટે દબાણ',
            labelHi: '"कॉल मत काटिए" — डराकर लाइन पर रखने की चाल',
            labelEn: 'Pressures victim not to disconnect call',
            evidenceQuote: 'कॉल मत काटिए',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન! આ નકલી પોલીસ કોલ છે. "ડિજિટલ અરેસ્ટ" જેવો કોઈ કાયદો નથી. તરત જ ફોન કાપી નાખો!',
          hi: 'सावधान! यह १००% फर्जी पुलिस कॉल है। कानून में "डिजिटल अरेस्ट" जैसा कुछ नहीं होता। बिल्कुल न डरें, तुरंत फोन काट दें!',
          en: 'SCAM ALERT! This is a fake police call. "Digital Arrest" does not exist in law. Hang up immediately!',
        },
      },
      {
        chunkIndex: 3,
        timeRangeSec: '0.0s – 12.0s',
        transcriptChunk:
          'नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ। आपके आधार नंबर से भेजे गए पार्सल में ड्रग्स मिले हैं। आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए। केस बंद करने के लिए अभी ₹50,000 ट्रांसफर कीजिए।',
        detectedLanguage: 'Hindi (hi-IN)',
        verdict: 'SCAM',
        riskScore: 99,
        scamCategory: 'Digital Arrest Extortion (₹50,000 Demand)',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'નકલી સાયબર પોલીસ અધિકારી',
            labelHi: 'नकली साइबर पुलिस अधिकारी',
            labelEn: 'Fake Cyber Police officer',
            evidenceQuote: 'मुंबई पुलिस साइबर सेल',
          },
          {
            type: 'THREAT',
            labelGu: 'ડ્રગ્સ પાર્સલ અને ડિજિટલ અરેસ્ટની ધમકી',
            labelHi: 'ड्रग्स पार्सल और डिजिटल अरेस्ट की झूठी धमकी',
            labelEn: 'Fake narcotics parcel & Digital Arrest threat',
            evidenceQuote: 'आप डिजिटल अरेस्ट में हैं',
          },
          {
            type: 'URGENCY',
            labelGu: 'ફોન ન કાપવા અને તરત પૈસા આપવા દબાણ',
            labelHi: 'कॉल न काटने और तुरंत पैसे भेजने का दबाव',
            labelEn: 'High-pressure urgency ("Right now")',
            evidenceQuote: 'कॉल मत काटिए... अभी',
          },
          {
            type: 'OTP_MONEY_DEMAND',
            labelGu: 'કેસ બંધ કરવા ₹50,000 ની માંગણી',
            labelHi: 'केस बंद करने के नाम पर ₹50,000 की मांग',
            labelEn: 'Demands ₹50,000 transfer to settle case',
            evidenceQuote: 'अभी ₹50,000 ट्रांसफर कीजिए',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન! પોલીસ ક્યારેય ફોન પર ₹50,000 માંગતી નથી. આ સાયબર ઠગ છે. તરત જ ફોન કાપી નાખો!',
          hi: 'सावधान! असली पुलिस कभी केस बंद करने के लिए ₹50,000 नहीं मांगती। यह साइबर ठग है। एक पैसा भी मत भेजिए और तुरंत कॉल काटिए!',
          en: 'SCAM ALERT! Real police never demand ₹50,000 to close a case. Do not transfer money—hang up now!',
        },
      },
    ],
  },
  {
    id: 'en_scam_bank_kyc',
    title: 'English (Scam): Fake Bank KYC & OTP',
    subtitle: 'Bank KYC Team • Account Block Threat + OTP Request',
    languageBadge: 'English → ગુજરાતી / हिंदी Warning',
    defaultWarningLang: 'gu',
    callerName: 'Bank KYC Department (Unverified)',
    callerNumber: '+91 80451 99201',
    callerLocation: 'Unknown Telemarketing Line',
    isScamExpected: true,
    audioUrl: '/audio/en_scam_bank_kyc.wav',
    warningAudioUrls: {
      gu: '/audio/warning_gu.wav',
      hi: '/audio/warning_hi.wav',
      en: '/audio/warning_en.wav',
    },
    fullScriptOriginal:
      "Hello, this is your bank's KYC team. Your account will be blocked today because your KYC has expired. To keep it active, please share the OTP we just sent to your phone.",
    fullScriptTranslationEn:
      "Hello, this is your bank's KYC team. Your account will be blocked today because your KYC has expired. To keep it active, please share the OTP we just sent to your phone.",
    calibratedChunks: [
      {
        chunkIndex: 1,
        timeRangeSec: '0.0s – 3.5s',
        transcriptChunk: "Hello, this is your bank's KYC team...",
        detectedLanguage: 'English (en-IN)',
        verdict: 'SUSPICIOUS',
        riskScore: 42,
        scamCategory: 'Unverified Bank KYC Call',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'બેંકના KYC વિભાગમાંથી હોવાનો દાવો',
            labelHi: 'बैंक की KYC टीम से होने का दावा',
            labelEn: "Claims to be from your bank's KYC team",
            evidenceQuote: "this is your bank's KYC team",
          },
        ],
        warningExplanation: {
          gu: 'ધ્યાન રાખો: કોલ કરનાર બેંક KYC ટીમમાંથી હોવાનું કહે છે. બેંક ફોન પર KYC કરતી નથી.',
          hi: 'ध्यान दें: कॉल करने वाला बैंक KYC टीम से होने का दावा कर रहा है।',
          en: 'Caution: Caller claims to be from Bank KYC team. Banks do not complete KYC over incoming calls.',
        },
      },
      {
        chunkIndex: 2,
        timeRangeSec: '0.0s – 8.5s',
        transcriptChunk:
          "Hello, this is your bank's KYC team. Your account will be blocked today because your KYC has expired. To keep it active, please share the OTP we just sent to your phone.",
        detectedLanguage: 'English (en-IN)',
        verdict: 'SCAM',
        riskScore: 97,
        scamCategory: 'Fake Bank KYC & OTP Theft Scam',
        redFlags: [
          {
            type: 'AUTHORITY_CLAIM',
            labelGu: 'બેંક KYC અધિકારી હોવાનો ખોટો દાવો',
            labelHi: 'बैंक KYC अधिकारी होने का झूठा दावा',
            labelEn: 'Impersonates Bank KYC officer',
            evidenceQuote: "this is your bank's KYC team",
          },
          {
            type: 'THREAT',
            labelGu: 'આજે જ બેંક ખાતું બંધ થઈ જશે તેવી ધમકી',
            labelHi: 'आज ही बैंक खाता ब्लॉक होने की धमकी',
            labelEn: 'Threatens that bank account will be blocked today',
            evidenceQuote: 'Your account will be blocked today',
          },
          {
            type: 'URGENCY',
            labelGu: 'ખાતું ચાલુ રાખવા તાત્કાલિક પગલાં લેવાનું દબાણ',
            labelHi: 'खाता चालू रखने के लिए तुरंत कार्रवाई का दबाव',
            labelEn: 'Creates panic that KYC expired today',
            evidenceQuote: 'blocked today because your KYC has expired',
          },
          {
            type: 'OTP_MONEY_DEMAND',
            labelGu: 'ફોન પર આવેલો ગુપ્ત OTP માંગે છે (ખાતું ખાલી કરવા)',
            labelHi: 'फोन पर आया गुप्त OTP मांग रहा है (पैसे चुराने के लिए)',
            labelEn: 'Asks you to share your secret SMS OTP',
            evidenceQuote: 'please share the OTP we just sent to your phone',
          },
        ],
        warningExplanation: {
          gu: 'સાવધાન! આ નકલી બેંક KYC કોલ છે. કોઈપણ બેંક ક્યારેય ફોન પર OTP માંગતી નથી. જો તમે OTP આપશો તો ખાતામાંથી બધા પૈસા ચોરાઈ જશે! તરત ફોન કાપો.',
          hi: 'सावधान! यह फर्जी बैंक KYC कॉल है। कोई भी बैंक कभी फोन पर OTP नहीं मांगता। OTP बताने पर आपके खाते से सारे पैसे कट जाएंगे! तुरंत फोन काटें।',
          en: 'SCAM WARNING! No real bank ever asks for your OTP over a call. Sharing the OTP will drain your bank account. Hang up now!',
        },
      },
    ],
  },
  {
    id: 'en_genuine_swiggy',
    title: 'English (Genuine): Swiggy Delivery Partner',
    subtitle: 'Safe Everyday Call • Asking Which Society Gate to Come To',
    languageBadge: 'Genuine Call • Safe Control Test',
    defaultWarningLang: 'gu',
    callerName: 'Swiggy Delivery Partner',
    callerNumber: '+91 79410 55219',
    callerLocation: 'Ahmedabad, Gujarat',
    isScamExpected: false,
    audioUrl: '/audio/en_genuine_swiggy.wav',
    warningAudioUrls: {
      gu: '/audio/warning_gu.wav',
      hi: '/audio/warning_hi.wav',
      en: '/audio/warning_en.wav',
    },
    fullScriptOriginal:
      "Hi, this is the delivery partner from Swiggy. I'm outside your building with your order. Which gate should I come to?",
    fullScriptTranslationEn:
      "Hi, this is the delivery partner from Swiggy. I'm outside your building with your order. Which gate should I come to?",
    calibratedChunks: [
      {
        chunkIndex: 1,
        timeRangeSec: '0.0s – 3.5s',
        transcriptChunk:
          "Hi, this is the delivery partner from Swiggy. I'm outside your building...",
        detectedLanguage: 'English (en-IN)',
        verdict: 'SAFE',
        riskScore: 6,
        scamCategory: 'Genuine Food Delivery Call',
        redFlags: [],
        warningExplanation: {
          gu: 'આ કોલ સુરક્ષિત લાગે છે. સ્વિગી ડિલિવરી પાર્ટનર તમારા ઓર્ડર વિશે વાત કરી રહ્યા છે.',
          hi: 'यह कॉल सुरक्षित है। स्विगी डिलीवरी पार्टनर आपके ऑर्डर के बारे में पूछ रहे हैं।',
          en: 'This call looks safe. The Swiggy delivery partner is outside with your order.',
        },
      },
      {
        chunkIndex: 2,
        timeRangeSec: '0.0s – 7.1s',
        transcriptChunk:
          "Hi, this is the delivery partner from Swiggy. I'm outside your building with your order. Which gate should I come to?",
        detectedLanguage: 'English (en-IN)',
        verdict: 'SAFE',
        riskScore: 4,
        scamCategory: 'Genuine Delivery Call (No Red Flags)',
        redFlags: [],
        warningExplanation: {
          gu: 'સુરક્ષિત કોલ: આ સામાન્ય સ્વિગી ડિલિવરી કોલ છે. તેમાં કોઈ ધમકી, પૈસા કે OTP ની માંગણી નથી.',
          hi: 'सुरक्षित कॉल: यह सामान्य स्विगी डिलीवरी कॉल है। इसमें कोई धमकी, पैसे या OTP की मांग नहीं है।',
          en: 'Safe Call Verified: Standard delivery coordination. No threats, urgency, money, or OTP requested.',
        },
      },
    ],
  },
  {
    id: 'gu_genuine_dairy',
    title: 'ગુજરાતી (Genuine): Amul Dairy Local Shop',
    subtitle: 'Safe Gujarati Call • Milk & Curd Parcel at Society Gate',
    languageBadge: 'ગુજરાતી Genuine • Safe Control',
    defaultWarningLang: 'gu',
    callerName: 'Amul Parlour (Rameshbhai)',
    callerNumber: '+91 98250 11402',
    callerLocation: 'Navrangpura, Ahmedabad',
    isScamExpected: false,
    audioUrl: '/audio/gu_genuine_dairy.wav',
    warningAudioUrls: {
      gu: '/audio/warning_gu.wav',
      hi: '/audio/warning_hi.wav',
      en: '/audio/warning_en.wav',
    },
    fullScriptOriginal:
      'નમસ્તે કાકા, હું અમૂલ ડેરીની દુકાનથી બોલું છું. તમારું દૂધ અને દહીંનું પાર્સલ નીચે સોસાયટીના ગેટ પર મૂક્યું છે, તમે લઈ જજો.',
    fullScriptTranslationEn:
      'Hello Uncle, I am speaking from the Amul Dairy shop. Your milk and curd parcel has been kept downstairs at the society gate, please pick it up.',
    calibratedChunks: [
      {
        chunkIndex: 1,
        timeRangeSec: '0.0s – 4.0s',
        transcriptChunk: 'નમસ્તે કાકા, હું અમૂલ ડેરીની દુકાનથી બોલું છું...',
        detectedLanguage: 'Gujarati (gu-IN)',
        verdict: 'SAFE',
        riskScore: 5,
        scamCategory: 'Genuine Local Shop Call',
        redFlags: [],
        warningExplanation: {
          gu: 'સુરક્ષિત કોલ: અમૂલ ડેરીની દુકાનમાંથી સામાન્ય વાતચીત છે.',
          hi: 'सुरक्षित कॉल: अमूल डेयरी दुकान से सामान्य बातचीत है।',
          en: 'Safe call from local Amul Dairy shop.',
        },
      },
      {
        chunkIndex: 2,
        timeRangeSec: '0.0s – 8.5s',
        transcriptChunk:
          'નમસ્તે કાકા, હું અમૂલ ડેરીની દુકાનથી બોલું છું. તમારું દૂધ અને દહીંનું પાર્સલ નીચે સોસાયટીના ગેટ પર મૂક્યું છે, તમે લઈ જજો.',
        detectedLanguage: 'Gujarati (gu-IN)',
        verdict: 'SAFE',
        riskScore: 3,
        scamCategory: 'Genuine Local Delivery (No Red Flags)',
        redFlags: [],
        warningExplanation: {
          gu: 'સુરક્ષિત કોલ: આ અમૂલ ડેરીનો સાચો કોલ છે (માત્ર દૂધ-દહીંના પાર્સલની જાણકારી આપી છે, કોઈ OTP કે પૈસા માંગ્યા નથી).',
          hi: 'सुरक्षित कॉल: यह अमूल डेयरी का सामान्य कॉल है, कोई धोखाधड़ी या पैसे की मांग नहीं है।',
          en: 'Safe Call Verified: Genuine milk/curd delivery update in Gujarati. Notice that even though the word "parcel" was used, Kavach AI did not false-alarm!',
        },
      },
    ],
  },
];
