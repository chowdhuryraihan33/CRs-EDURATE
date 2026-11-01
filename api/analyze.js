// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ 
      isToxic: true, 
      rejectionReason: "API configuration error. Please contact administrator." 
    });
  }

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  // প্রাথমিক কুইক চেক (নির্দিষ্ট কিছু চরম গালি ফিল্টার)
  const quickSlurs = /(bokacoda|baler|choda|magi|madarchod|harami|khankir|চুদা|মাগির|খানকির|বাল)/i;
  if (quickSlurs.test(allComments)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate, offensive, or disrespectful language is not allowed.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  const prompt = `
You are an academic feedback moderation engine for EDURATE.
Analyze the following student feedback comments:
${allComments}

LANGUAGE & SAFETY POLICY:
1. ACCEPTED: Written in proper Bengali script (বাংলা হরফ) OR standard English.
2. REJECT BANGLISH: Bengali written phonetically with English letters (e.g., "kire", "valona", "porais", "bujhina", "fultu") is STRICTLY PROHIBITED.
3. REJECT TOXICITY: Any profanity, insults, abusive language, slurs, or harassment in any language is strictly forbidden.
4. VALID FEEDBACK: Constructive criticism, even if negative (e.g., "fast paced", "comes late", "hard exam"), IS VALID and must NOT be marked toxic unless it uses insults or foul words.

OUTPUT SCHEMA (Must be valid JSON):
{
  "isToxic": boolean,
  "rejectionReason": string or null (explain why rejected in English, or null if accepted),
  "sentiment": "Positive" | "Neutral" | "Negative",
  "aiSummary": string or null (short constructive takeaway in English)
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
            responseMimeType: "application/json" // নিশ্চিত করবে যে এআই নিখুঁত JSON পাঠাবে
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
      console.error("Gemini empty response structure:", JSON.stringify(data));
      // জেমিনি কিছু না পাঠালে ডিফল্ট সেফ পাস
      return res.status(200).json({
        isToxic: false,
        rejectionReason: null,
        sentiment: "Constructive",
        aiSummary: "Feedback recorded."
      });
    }

    const result = JSON.parse(rawText);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Execution Error:", error);
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: "Constructive",
      aiSummary: "Constructive feedback noted."
    });
  }
}