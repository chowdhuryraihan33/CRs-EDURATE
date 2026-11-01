// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = `${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''}`.toLowerCase();

  // ১. প্রাথমিক তাৎক্ষণিক ফিল্টার (স্পষ্ট গালি ও অবমাননাকর শব্দ)
  const forbiddenWords = [
    "fuck", "shit", "bitch", "bastard", "asshole", "dick", "cunt", 
    "clown", "scam", "fraud",
    "bokacoda", "baler", "choda", "magi", "madarchod", "harami", "khankir",
    "চুদা", "মাগির", "খানকির", "বাল", "মাদারচোদ", "হারামি", "বোকাচোদা"
  ];

  if (forbiddenWords.some(word => rawText.includes(word))) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate or abusive language is prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      isToxic: true,
      rejectionReason: "Moderation API not configured."
    });
  }

  const feedbackText = [
    comment ? `Overall: "${comment}"` : null,
    tComment ? `Teaching (${teachingRating}★): "${tComment}"` : null,
    pComment ? `Punctuality (${punctualityRating}★): "${pComment}"` : null,
    bComment ? `Behavior (${behaviorRating}★): "${bComment}"` : null,
  ].filter(Boolean).join('\n') || 'No textual feedback provided.';

  const prompt = `
You are the evaluation moderator for an academic platform called EDURATE.
Analyze the following student feedback comments:

---
${feedbackText}
---

EVALUATION RULES:
1. ACCEPT CONSTRUCTIVE CRITICISM: Pedagogical suggestions regarding teaching style, course pacing, slides, exams, or problem-solving (e.g. "more problem-solving sessions needed", "speaks too fast") are strictly VALID and MUST have "isToxic": false.
2. REJECT TOXICITY & PERSONAL ATTACKS: Insults, calling to fire/ban/remove the teacher, slurs, or derogatory remarks MUST have "isToxic": true.
3. REJECT BANGLISH: Phonetic Bengali typed using Latin/English characters (e.g. "porano bhalo na", "faltu sir") MUST have "isToxic": true with reason "Banglish is prohibited. Please use standard Bengali script or English."
4. ACCEPT SCRIPTS: Standard formal English and Bengali script (বাংলা হরফ) are both VALID.

Return ONLY a raw JSON object with this exact structure:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive" | "Constructive" | "Negative",
  "aiSummary": "Brief 1-sentence constructive takeaway in English"
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
          }
        })
      }
    );

    const data = await response.json();
    let textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      console.error("Gemini Response Missing Text:", JSON.stringify(data));
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Content verification timeout. Please retry your submission.",
        sentiment: "Negative",
        aiSummary: null
      });
    }

    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(textOutput);

    return res.status(200).json({
      isToxic: Boolean(result.isToxic),
      rejectionReason: result.rejectionReason || null,
      sentiment: result.sentiment || "Constructive",
      aiSummary: result.aiSummary || "Feedback noted for faculty review."
    });
  } catch (error) {
    console.error("Moderation Execution Error:", error);
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Verification service temporarily unavailable. Please retry.",
      sentiment: "Negative",
      aiSummary: null
    });
  }
}