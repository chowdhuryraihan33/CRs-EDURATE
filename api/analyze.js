// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = ` ${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''} `.toLowerCase();

  // 1. Shorasori gali ar obomanonakor shobdo (Instant block)
  const explicitRegex = /\b(fuck|fucking|shit|bitch|bastard|asshole|dick|cunt|bokacoda|baler|choda|magi|madarchod|harami|khankir)\b/i;
  if (explicitRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Profanity or abusive terms are strictly prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  // 2. Chakitichyuti, bohiṣkar ba shatrubhabaponno attack (kicked out, fired, remove, etc.)
  const hostilityRegex = /\b(fired|fire him|fire her|be removed|remove him|remove her|kick out|kicked out|not be allowed|banned|incompetent|worthless|clown|scam|fraud|ber kore|bohishto|bohisker|joggotai nai|joggotai nei)\b/i;
  if (hostilityRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Demands for termination, exclusion, or personal attacks are prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  // 3. Common Banglish words (Code level catch, jate AI miss na kore)
  const banglishRegex = /\b(valo|bhalo|khub|onek|porano|porate|kintu|somossa|shomossa|ase|ache|nai|nei|bujhi|bujhe|faltu|korse|koreche|dorkar|uchit)\b/i;
  if (banglishRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Banglish is strictly prohibited. Please use standard Bengali script (বাংলা হরফ) or English.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      isToxic: true,
      rejectionReason: "API Configuration error."
    });
  }

  const feedbackText = `
Student Feedback:
Overall: "${comment || 'N/A'}"
Teaching: "${tComment || 'N/A'}"
Punctuality: "${pComment || 'N/A'}"
Behavior: "${bComment || 'N/A'}"
`.trim();

  const prompt = `
You are the evaluation moderator for the academic platform EDURATE.
Analyze the following student feedback comments:

${feedbackText}

MODERATION RULES:
1. BANGLISH: If ANY field contains Bengali written phonetically in English/Latin letters (even if polite or positive), mark "isToxic": true with reason "Banglish is prohibited. Use Bengali script or English."
2. PERSONAL ATTACKS & EXCLUSION: Hostility, demanding someone to be fired/removed/banned must have "isToxic": true.
3. CONSTRUCTIVE CRITICISM: Polite constructive critiques or positive evaluations in standard English or proper Bengali script (বাংলা হরফ) must have "isToxic": false.

OUTPUT STRICT JSON ONLY:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive" or "Constructive" or "Negative",
  "aiSummary": "1 sentence academic summary in English"
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.0,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();
    let textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      return res.status(200).json({
        isToxic: false,
        rejectionReason: null,
        sentiment: "Constructive",
        aiSummary: "Constructive feedback recorded."
      });
    }

    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(textOutput);

    return res.status(200).json({
      isToxic: Boolean(result.isToxic),
      rejectionReason: result.rejectionReason || null,
      sentiment: result.sentiment || "Constructive",
      aiSummary: result.aiSummary || "Feedback recorded successfully."
    });
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: "Constructive",
      aiSummary: "Feedback recorded successfully."
    });
  }
}