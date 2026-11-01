// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = ` ${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''} `.toLowerCase();

  // ১. সরাসরি গালি ও অশ্লীল শব্দ (ইনস্ট্যান্ট ব্লক)
  const explicitRegex = /\b(fuck|fucking|shit|bitch|bastard|asshole|dick|cunt|bokacoda|baler|choda|magi|madarchod|harami|khankir)\b/i;
  if (explicitRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Profanity or abusive terms are strictly prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  // ২. শত্রুভাবাপন্ন, বরখাস্তের দাবি বা চাকরিচ্যুতি সংক্রান্ত আক্রমণ (Deterministic Hostility Guard)
  const hostilityRegex = /\b(fired|fire him|fire her|be removed|kick out|not be allowed|banned|incompetent|worthless|clown|scam|fraud|বের করে|বহিষ্কার|পড়ানোর যোগ্যতা নেই|যোগ্যতা নাই)\b/i;
  if (hostilityRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Demands for termination, exclusion, or personal attacks on competence are not permitted.",
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

  // ৩. এআই-এর জন্য স্পষ্ট নির্দেশিকা (বাংলিশ এবং কনটেক্সট যাচাইয়ের জন্য)
  const prompt = `
You are the evaluation moderator for the academic platform EDURATE.
Analyze the following student feedback comments:

${feedbackText}

MODERATION RULES:
1. BANGLISH: If the feedback contains phonetic Bengali written in English letters (e.g. "bhalo na", "faltu sir", "kichu bujhi na"), mark "isToxic": true with reason "Banglish is prohibited. Use Bengali script or English."
2. PERSONAL ATTACKS: Any targeted personal hostility must have "isToxic": true.
3. CONSTRUCTIVE CRITICISM: Pedagogical feedback on lectures, pacing, exams, slides, or labs written in standard English or formal Bengali script (বাংলা হরফ) must have "isToxic": false.

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
        aiSummary: "Constructive pedagogical feedback recorded."
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