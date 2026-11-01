// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  const prompt = `
You are a strict moderation and quality assurance engine for the EDURATE academic feedback system.
Evaluate the following student feedback comments:
${allComments}

STRICT MODERATION & LANGUAGE POLICY:
1. BANGLISH RESTRICTION: Banglish (Bengali words written phonetically using the Latin/English alphabet, e.g., "kire", "valona", "porais", "bujhina", "baler", "fultu", "khub bhalo") is STRICTLY PROHIBITED.
2. PERMITTED LANGUAGES: All written feedback MUST be submitted either purely in proper Bengali script (বাংলা বর্ণমালা) OR standard professional English.
3. ZERO TOLERANCE FOR TOXICITY: Any profanity, insults, abusive remarks, personal attacks, slurs, or harassment in any language or transliteration must be blocked immediately.
4. MEANINGFUL NOTIFICATIONS: All output text, rejection explanations, and summaries MUST be written in clear, concise, actionable English.

OUTPUT FORMAT (Provide ONLY valid raw JSON without any markdown formatting or backticks):

If Banglish is detected:
{
  "isToxic": true,
  "rejectionReason": "Banglish detected: Please rewrite your review using standard English or formal Bengali script (বাংলা হরফ).",
  "sentiment": "Negative",
  "aiSummary": null
}

If abusive/toxic/inappropriate language is detected:
{
  "isToxic": true,
  "rejectionReason": "Academic Policy Violation: Inappropriate, offensive, or disrespectful language is not allowed. Please keep feedback constructive.",
  "sentiment": "Negative",
  "aiSummary": null
}

If compliant, constructive, and properly written:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive",
  "aiSummary": "A concise 1-2 sentence constructive pedagogical takeaway in English."
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
          generationConfig: { temperature: 0.0 }
        })
      }
    );

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(text);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(500).json({
      isToxic: true,
      rejectionReason: "Moderation system temporarily unavailable. Please retry in a few moments."
    });
  }
}