// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // সব কমেন্টকে ছোট হাতের অক্ষরে রূপান্তর
  const rawText = `${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''}`.toLowerCase();

  // হার্ডকোডেড ব্লক লিস্ট (সরাসরি ধরা পড়বে)
  const forbiddenWords = [
    "fuck", "shit", "bitch", "bastard", "asshole", "dick", "cunt", 
    "worthless", "incompetent", "clown", "scam", "fraud",
    "bokacoda", "baler", "choda", "magi", "madarchod", "harami", "khankir",
    "চুদা", "মাগির", "খানকির", "বাল", "মাদারচোদ", "হারামি", "বোকাচোদা"
  ];

  const matchedWord = forbiddenWords.find(word => rawText.includes(word));
  if (matchedWord) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Profanity, slurs, or abusive language are strictly prohibited.",
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

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  const prompt = `
You are an academic feedback moderation engine for EDURATE.
Analyze the following student feedback comments:
${allComments}

STRICT SAFETY & MODERATION POLICY:
1. ZERO TOLERANCE FOR TOXICITY/INSULTS: Any swear words, vulgarity, sexual words, insults, or derogatory labels (e.g. calling the teacher worthless, fraud, clown, stupid) MUST be marked with "isToxic": true.
2. BAN BANGLISH: Phonetic Bengali written using English letters (e.g., "kire", "valona", "porais", "bujhina") MUST be marked with "isToxic": true.
3. ACCEPTED LANGUAGES: Only formal, respectful feedback in proper Bengali script (বাংলা হরফ) OR standard English is permitted. Constructive criticism about course pacing or exams is allowed only if polite and respectful.

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
            temperature: 0.0,
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
    const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawOutput) {
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Content verification failed. Please review your review according to community guidelines.",
        sentiment: "Negative",
        aiSummary: null
      });
    }

    const result = JSON.parse(rawOutput);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Moderation engine unavailable. Please review your comment and try again.",
      sentiment: "Negative",
      aiSummary: null
    });
  }
}