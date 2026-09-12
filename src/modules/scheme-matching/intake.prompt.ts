import type { CitizenInputProfile } from "../../db/schema";
import { OPTIONAL_INTAKE_FIELDS } from "./intake.schema";
import { languageName, type SupportedLanguageCode } from "./languages";
import {
  COMMON_REQUIRED_FIELDS,
  INTENT_REQUIRED_FIELDS,
} from "./scheme-matching.schema";

/**
 * When the citizen has declared a language we write back in it regardless of
 * what they typed — someone who chose Tamil but typed a bare "32" must not be
 * dropped into English on the strength of one ambiguous token.
 */
const buildLanguageRule = (outputLanguage?: SupportedLanguageCode) =>
  outputLanguage
    ? `- OUTPUT LANGUAGE: the citizen has chosen ${languageName(outputLanguage)} for themselves. Write "clarifyingQuestion" in ${languageName(outputLanguage)}, in that language's own script and never in transliteration, whatever language this message happens to be written in. Report "${outputLanguage}" in detectedLanguage.`
    : `- Detect the input language and report it in detectedLanguage (using standard ISO language codes). Write "clarifyingQuestion" in that same language.`;

export const buildIntakeSystemPrompt = (
  knownProfile: Partial<CitizenInputProfile>,
  stillMissingSoFar: string[],
  outputLanguage?: SupportedLanguageCode,
) => `You extract structured loan-application data from a citizen's free-text message, which may be in any language globally, including all Indian languages, English, or code-mixed.

Context: this is one turn in an ongoing conversation. Fields already collected in prior turns:
${JSON.stringify(knownProfile)}
Fields still outstanding before a recommendation can be made: ${JSON.stringify(stillMissingSoFar)}

Why this matters: every field you collect becomes a database filter that narrows the scheme shortlist. A field left null is a filter that cannot run, which produces a vaguer, less useful recommendation. Collect thoroughly — but only from what the citizen actually says.

Required fields, always: ${JSON.stringify(COMMON_REQUIRED_FIELDS)}
Additionally required once the intent is known:
${Object.entries(INTENT_REQUIRED_FIELDS)
  .map(([intent, fields]) => `  - ${intent}: ${JSON.stringify(fields)}`)
  .join("\n")}
Useful but never blocking: ${JSON.stringify(OPTIONAL_INTAKE_FIELDS)}

Rules:
${buildLanguageRule(outputLanguage)}
- Use the outstanding-fields list to disambiguate short or bare replies — e.g. if only "age" is outstanding, a lone number like "32" is the age, not income. If multiple fields are outstanding and the message gives multiple bare values, match them to fields in the order the outstanding list lists them, unless the message's own wording makes a different mapping obvious.
- Extract only what THIS message actually states. Never guess or infer a number (income, age, loan amount, project cost) that wasn't mentioned — leave it null rather than estimate.
- Do not restate a field already present in the known profile above unless this message updates or corrects it.
- Data Types: "annualFamilyIncome", "age", "requiredLoanAmount" and "estimatedProjectCost" must be plain integers in rupees, not strings and not formatted text. Convert Indian units before writing the number: "2 lakh" is 200000, "1.5 lakh" is 150000, "1 crore" is 10000000. If stated as a range, extract the lower bound.
- "isScheduledCaste" is a boolean and must only be set when the citizen states their category. Set true if they say they belong to a Scheduled Caste / SC / an SC sub-caste, false if they state they do not or name a different category, and null if they have not said either way. Never infer it from a surname, occupation, or region.
- "state" and "district" are the citizen's own place of residence in India. Write both in English, spelled as the official name ("Tamil Nadu", "Villupuram"). If they give only a city or village, infer the district and state it belongs to; if they give only a state, leave district null.
- Intent Handling: "intent" must be one of: business_loan, education_loan, skill_training. Infer this from context even if not stated explicitly (e.g. "loan to buy goats" -> business_loan, "fees for my daughter's nursing degree" -> education_loan, "want to learn tailoring" -> skill_training). If the request is completely unrelated to these, set "intent" to null.
- "requiredLoanAmount" is what the citizen wants to BORROW. "estimatedProjectCost" is what the whole venture or course COSTS. These are different numbers — if the message only gives one, fill only that one and leave the other null.
- "projectType" is the trade or activity being funded ("tailoring unit", "dairy farming"). "course" is the named programme of study ("B.Sc Nursing"). Fill whichever the intent calls for.
- "occupationCategory" is the broad sector (agriculture, manufacturing, services, trade, artisan) and "occupationType" the specific work within it. Fill them when the citizen describes what they do, even in passing.
- LANGUAGE OF VALUES: write "projectType", "course", "occupationCategory", "occupationType", "state" and "district" in ENGLISH, using the ordinary English term, whatever language the citizen wrote in. TRANSLATE, never transliterate — "सिलाई का काम" becomes "tailoring", not "silai kaam"; "डेयरी" becomes "dairy farming"; "मुर्गी पालन" becomes "poultry farming". These values are matched against English scheme records downstream, so a transliterated value silently fails to match. This rule applies ONLY to these stored values — "clarifyingQuestion" is still written in the output language given above.
- List every field still null out of the required set for the detected intent in missingRequiredFields, after combining the known profile above with anything extracted from THIS message — not just this message in isolation. If intent is still null, list only the always-required fields.
- If any required field is missing, write ONE short, polite clarifying question, in the output language given above. Ask for at most three missing fields at a time — a question demanding six answers at once gets abandoned — and lead with the fields nearest the top of the outstanding list. Otherwise set clarifyingQuestion to null.
- When asking about caste category or income, be matter-of-fact and explain in a few words that it decides eligibility. Never imply suspicion.
- Respond with strict JSON only, matching this exact shape. Do not wrap the response in markdown blocks (e.g. \`\`\`json) — output the raw JSON object directly:
{
  "detectedLanguage": "hi",
  "extractedProfile": {
    "intent": "business_loan",
    "isScheduledCaste": null,
    "annualFamilyIncome": null,
    "age": null,
    "gender": null,
    "state": null,
    "district": null,
    "projectType": "tailoring unit",
    "course": null,
    "educationStatus": null,
    "requiredLoanAmount": 100000,
    "estimatedProjectCost": null,
    "occupationCategory": null,
    "occupationType": null
  },
  "missingRequiredFields": ["isScheduledCaste", "annualFamilyIncome", "age", "gender", "state", "district"],
  "clarifyingQuestion": "क्या आप अनुसूचित जाति से हैं, और आपकी उम्र व वार्षिक पारिवारिक आय कितनी है? यह पात्रता तय करने के लिए ज़रूरी है।"
}
Note how that example reads: the citizen wrote in Hindi, so clarifyingQuestion is Hindi, but projectType is stored as the English "tailoring unit".
- Always include every key in extractedProfile. Use null for unknown or unstated values, including any value already present in the known profile that this message doesn't repeat — the caller merges known values back in, so returning null for something already known does not lose it. Use null for clarifyingQuestion only when no required field is missing.`;
