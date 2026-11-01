// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = `${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''}`.toLowerCase();

  // 1. Instant regex block (Gali, slurs, explicit personal insults)
  const forbiddenWords = [
    "fuck", "shit", "bitch", "bastard", "asshole", "dick", "cunt", 
    "worthless", "incompetent", "clown", "scam", "fraud",
    "bokacoda", "baler", "choda", "magi", "madarchod", "harami", "khankir",
    "চুদা", "মাগির", "খানকির", "বাল", "মাদারচোদ", "হারামি", "বোকাচোদা"
  ];

  if (forbiddenWords.some(word => rawText.includes(word))) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate, abusive, or offensive language is strictly prohibited.",
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

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  const prompt = `
You are the primary moderation and quality guardrail for EDURATE, a university faculty feedback platform.
Analyze the following student submission:
${allComments}

TASK:
Classify if this submission violates academic moderation standards.

VIOLATION CRITERIA (Any violation means "isToxic": true):
1. PERSONAL ATTACKS & EXCLUSION: Any comment saying the instructor should be fired, banned, removed, not allowed to teach, or insults their character/intelligence.
2. BANGLISH: Writing Bengali phonetically using English/Latin alphabet (e.g. "khub bhalo", "porate pare na", "faltu sir").
3. VULGARITY & SLURS: Any offensive language, cursing, or hostility.

ALLOWED CRITERIA:
1. Constructive praise OR constructive criticism written in standard, formal English.
2. Constructive praise OR constructive criticism written in proper Bengali script (বাংলা হরফ).

OUTPUT FORMAT:
Respond with valid JSON only. Do not add markdown or backticks.
{
  "isToxic": true or false,
  "rejectionReason": "Specific short rejection reason in English, or null if allowed",
  "sentiment": "Positive" or "Constructive" or "Negative",
  "aiSummary": "1-2 sentence academic constructive summary, or null if toxic"
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
        isToxic: true,
        rejectionReason: "Review verification failed. Please ensure feedback is purely constructive.",
        sentiment: "Negative",
        aiSummary: null
      });
    }

    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(textOutput);

    // If AI fails to decide or gives invalid response, fail-safe to block
    if (typeof result.isToxic !== 'boolean') {
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Feedback does not meet formatting guidelines.",
        sentiment: "Negative",
        aiSummary: null
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Verification check failed. Please submit a valid academic evaluation.",
      sentiment: "Negative",
      aiSummary: null
    });
  }
}