// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  // ১. প্রাথমিক ফিল্টার: ইংরেজি ও বাংলা সাধারণ অশ্লীল/অপমানজনক শব্দ
  const badWordsRegex = /\b(fuck|shit|bitch|bastard|asshole|dick|cunt|worthless|incompetent|clown|scam|fraud|bokacoda|baler|choda|magi|madarchod|harami|khankir|চুদা|মাগির|খানকির|বাল)\b/i;
  if (badWordsRegex.test(allComments)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate, abusive, or offensive remarks are strictly prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  if (!apiKey) {
    return res.status(500).json({ 
      isToxic: true, 
      rejectionReason: "API configuration error. Please contact administrator." 
    });
  }

  const prompt = `
You are a strict academic moderation engine for EDURATE.
Analyze the following student feedback comments:
${allComments}

STRICT POLICY:
1. BAN OFFENSIVE LANGUAGE: Any profanity, insults, derogatory labels, or personal hostility must be marked as toxic.
2. BAN BANGLISH: Bengali written phonetically using Latin/English letters is prohibited.
3. ACCEPTED SCRIPTS: Only constructive feedback in formal Bengali script (বাংলা হরফ) OR standard English is allowed.

OUTPUT SCHEMA (Return ONLY valid JSON):
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

    // যদি কোনো টেক্সট না পাওয়া যায়, তবে সেটিকে কখনোই পাস করা হবে না
    if (!rawText) {
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Content verification failed. Please review your comment for policy compliance.",
        sentiment: "Negative",
        aiSummary: null
      });
    }

    const result = JSON.parse(rawText);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Error:", error);
    // এরর হলেও নিরাপদ থাকতে সাবমিট ব্লক থাকবে
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Moderation check failed. Please ensure the comment complies with guidelines and retry.",
      sentiment: "Negative",
      aiSummary: null
    });
  }
}