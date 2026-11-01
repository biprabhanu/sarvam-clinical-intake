import type { Lang } from "./types";

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: "od-IN", native: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "hi-IN", native: "हिन्दी", english: "Hindi" },
  { code: "mr-IN", native: "मराठी", english: "Marathi" },
];

export const langName = (c: string) => LANGS.find((l) => l.code === c)?.english ?? c;

export const QUESTIONS: { en: string; text: Record<Lang, string> }[] = [
  {
    en: "What is the main problem you're facing today?",
    text: { "od-IN": "ଆଜି ଆପଣଙ୍କର ମୁଖ୍ୟ ସମସ୍ୟା କ'ଣ?", "hi-IN": "आज आपकी मुख्य समस्या क्या है?", "mr-IN": "आज तुमची मुख्य समस्या काय आहे?" },
  },
  {
    en: "Since when have you had this problem?",
    text: { "od-IN": "ଏହି ସମସ୍ୟା କେବେଠାରୁ ହେଉଛି?", "hi-IN": "यह समस्या कब से है?", "mr-IN": "ही समस्या कधीपासून आहे?" },
  },
  {
    en: "Do you have any other symptoms?",
    text: { "od-IN": "ଆପଣଙ୍କର ଆଉ କିଛି ଲକ୍ଷଣ ଅଛି କି?", "hi-IN": "क्या आपको कोई और लक्षण हैं?", "mr-IN": "तुम्हाला इतर काही लक्षणे आहेत का?" },
  },
  {
    en: "Have you taken any medicines for this? Which ones?",
    text: {
      "od-IN": "ଏଥିପାଇଁ ଆପଣ କୌଣସି ଔଷଧ ଖାଇଛନ୍ତି କି? କେଉଁ ଔଷଧ?",
      "hi-IN": "क्या आपने इसके लिए कोई दवा ली है? कौन सी?",
      "mr-IN": "तुम्ही यासाठी काही औषध घेतले आहे का? कोणते?",
    },
  },
  {
    en: "Do you have any long-term illness, allergies, or regular medicines?",
    text: {
      "od-IN": "ଆପଣଙ୍କର କୌଣସି ପୁରୁଣା ରୋଗ, ଆଲର୍ଜି କିମ୍ବା ନିୟମିତ ଔଷଧ ଅଛି କି?",
      "hi-IN": "क्या आपको कोई पुरानी बीमारी, एलर्जी या नियमित दवा है?",
      "mr-IN": "तुम्हाला कोणता जुनाट आजार, ॲलर्जी किंवा नियमित औषधे आहेत का?",
    },
  },
];

export const UI: Record<Lang, { consent: string; thanks: string; speak: string }> = {
  "od-IN": {
    consent: "ମୁଁ ମୋ ଡାକ୍ତରଙ୍କ ପାଇଁ ମୋ ସ୍ୱର ରେକର୍ଡ କରିବାକୁ ସହମତ।",
    thanks: "ଧନ୍ୟବାଦ। ଦୟାକରି ଆପଣଙ୍କ ଟୋକନ୍ ଡକାଯିବା ପର୍ଯ୍ୟନ୍ତ ଅପେକ୍ଷା କରନ୍ତୁ।",
    speak: "ମାଇକ୍ ଦବାଇ କୁହନ୍ତୁ",
  },
  "hi-IN": {
    consent: "मैं अपने डॉक्टर के लिए अपनी आवाज़ रिकॉर्ड किए जाने के लिए सहमत हूँ।",
    thanks: "धन्यवाद। कृपया अपना टोकन बुलाए जाने तक प्रतीक्षा करें।",
    speak: "माइक दबाकर बोलिए",
  },
  "mr-IN": {
    consent: "माझ्या डॉक्टरांसाठी माझा आवाज रेकॉर्ड करण्यास मी संमती देतो/देते.",
    thanks: "धन्यवाद. कृपया तुमचा टोकन बोलावला जाईपर्यंत थांबा.",
    speak: "माइक दाबून बोला",
  },
};
