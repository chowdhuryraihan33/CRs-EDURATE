// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: "Positive",
      aiSummary: "Feedback recorded."
    });
  }

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  // চরম গালাগালি আটকানোর ফিল্টার
  const abusiveRegex = /(bokacoda|baler|choda|magi|madarchod|harami|khankir|চুদা|মাগির|খানকির|বাল)/i;
  if (abusiveRegex.test(allComments)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate or offensive language is not allowed.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  const prompt = `
You are a strict moderation engine for the EDURATE academic feedback system.
Evaluate the following student feedback comments:
${allComments}

STRICT POLICY:
1. BAN PERSONAL ATTACKS: Direct insults, calling the instructor "worthless", "incompetent", "fraud", "waste of time", or any derogatory labeling must be marked as toxic immediately. Feedback must evaluate teaching and conduct, not make personal character attacks.
2. BAN PROFANITY & SLURS: Any offensive language, profanity, vulgarity, or slurs (in English, Bengali script, or Banglish) is strictly prohibited.
3. BAN BANGLISH: Bengali written with English letters is strictly prohibited.
4. VALID FEEDBACK: Only constructive academic feedback (positive or critical) written politely without abusive or humiliating remarks is permitted.

OUTPUT SCHEMA (Valid JSON only):
{
  "isToxic": boolean,
  "rejectionReason": string or null,
  "sentiment": "Positive" | "Constructive" | "Negative",
  "aiSummary": string or null
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
            temperature: 0.1,
            responseMimeType: "application/json"
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      }
    );

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(200).json({
        isToxic: false,
        rejectionReason: null,
        sentiment: "Constructive",
        aiSummary: "Feedback recorded successfully."
      });
    }

    const result = JSON.parse(rawText);
    return res.status(200).json(result);
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