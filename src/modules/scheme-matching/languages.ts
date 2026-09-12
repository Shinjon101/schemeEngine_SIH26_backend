/**
 * Languages the citizen-facing portal offers.
 *
 * Mirrors the frontend's `lib/languages.ts`. The two are separate deployables
 * with no shared package, so the list is duplicated rather than imported —
 * keep them in step when adding a language.
 */
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
  as: "Assamese",
} as const;

export type SupportedLanguageCode = keyof typeof LANGUAGE_NAMES;

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES) as [
  SupportedLanguageCode,
  ...SupportedLanguageCode[],
];

export const DEFAULT_LANGUAGE_CODE: SupportedLanguageCode = "en";

export const isSupportedLanguage = (
  value: string,
): value is SupportedLanguageCode => value in LANGUAGE_NAMES;

export const languageName = (code: SupportedLanguageCode): string =>
  LANGUAGE_NAMES[code];

/**
 * Shown when the ranking engine finds no eligible scheme. Unlike the
 * clarifying questions, this string is ours rather than the model's, so it
 * has to be translated here or the citizen drops out of their own language
 * at the least encouraging moment in the conversation.
 */
export const NO_MATCH_MESSAGE: Record<SupportedLanguageCode, string> = {
  en: "We couldn't find a scheme matching your profile right now. A representative may follow up.",
  hi: "फ़िलहाल आपकी प्रोफ़ाइल से मेल खाती कोई योजना नहीं मिली। कोई प्रतिनिधि जल्द संपर्क करेगा।",
  bn: "এই মুহূর্তে আপনার প্রোফাইলের সঙ্গে মেলে এমন কোনো প্রকল্প পাওয়া যায়নি। একজন প্রতিনিধি শীঘ্রই যোগাযোগ করবেন।",
  mr: "सध्या तुमच्या प्रोफाइलशी जुळणारी कोणतीही योजना सापडली नाही. एक प्रतिनिधी लवकरच संपर्क साधेल.",
  ta: "தற்போது உங்கள் விவரங்களுக்குப் பொருந்தும் திட்டம் எதுவும் கிடைக்கவில்லை. ஒரு பிரதிநிதி விரைவில் தொடர்பு கொள்வார்.",
  te: "ప్రస్తుతం మీ ప్రొఫైల్‌కు సరిపోయే పథకం ఏదీ కనుగొనబడలేదు. ఒక ప్రతినిధి త్వరలో సంప్రదిస్తారు.",
  gu: "અત્યારે તમારી પ્રોફાઇલ સાથે મેળ ખાતી કોઈ યોજના મળી નથી. એક પ્રતિનિધિ ટૂંક સમયમાં સંપર્ક કરશે.",
  kn: "ಸದ್ಯಕ್ಕೆ ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ಗೆ ಹೊಂದುವ ಯಾವುದೇ ಯೋಜನೆ ಸಿಗಲಿಲ್ಲ. ಪ್ರತಿನಿಧಿಯೊಬ್ಬರು ಶೀಘ್ರದಲ್ಲೇ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.",
  ml: "നിലവിൽ നിങ്ങളുടെ പ്രൊഫൈലുമായി യോജിക്കുന്ന പദ്ധതികളൊന്നും കണ്ടെത്താനായില്ല. ഒരു പ്രതിനിധി ഉടൻ ബന്ധപ്പെടും.",
  pa: "ਇਸ ਵੇਲੇ ਤੁਹਾਡੀ ਪ੍ਰੋਫਾਈਲ ਨਾਲ ਮੇਲ ਖਾਂਦੀ ਕੋਈ ਯੋਜਨਾ ਨਹੀਂ ਮਿਲੀ। ਇੱਕ ਪ੍ਰਤੀਨਿਧੀ ਜਲਦੀ ਸੰਪਰਕ ਕਰੇਗਾ।",
  ur: "اس وقت آپ کے پروفائل سے مماثل کوئی اسکیم نہیں مل سکی۔ ایک نمائندہ جلد رابطہ کرے گا۔",
  or: "ବର୍ତ୍ତମାନ ଆପଣଙ୍କ ପ୍ରୋଫାଇଲ ସହିତ ମେଳ ଖାଉଥିବା କୌଣସି ଯୋଜନା ମିଳିଲା ନାହିଁ। ଜଣେ ପ୍ରତିନିଧି ଶୀଘ୍ର ଯୋଗାଯୋଗ କରିବେ।",
  as: "এই মুহূৰ্তত আপোনাৰ প্ৰ'ফাইলৰ সৈতে মিল থকা কোনো আঁচনি পোৱা নগ'ল। এজন প্ৰতিনিধিয়ে সোনকালে যোগাযোগ কৰিব।",
};
