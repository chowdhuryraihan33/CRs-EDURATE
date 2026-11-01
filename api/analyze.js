// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = `${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''}`.toLowerCase();

  // হার্ডকোডেড চরম আপত্তিকর শব্দের তালিকা
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
      rejectionReason: "Academic Policy Violation: Profanity, insults, or abusive language are strictly prohibited.",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  if (!apiKey) {
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: "Positive",
      aiSummary: "Valid academic feedback submitted."
    });
  }

  const allComments = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating}★): "${bComment || 'None'}"
`.trim();

  const prompt = `
You are an academic feedback moderator for EDURATE.
Analyze the following student feedback comments:
${allComments}

RULES:
1. Bengali script (বাংলা হরফ) and standard English are ACCEPTED and encouraged. Both positive remarks and constructive negative criticisms are VALID.
2. Banglish (Bengali words written in English letters, e.g., "bhalo", "porano") is strictly PROHIBITED ("isToxic": true).
3. Profanity, abusive terms, and personal insults are strictly PROHIBITED ("isToxic": true).

Return ONLY a JSON object:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive" or "Constructive" or "Negative",
  "aiSummary": "1-2 sentence academic summary in English"
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
      // যদি এআই কোনো কারণে খালি রেসপন্স দেয়, কিন্তু কোনো হার্ডকোডেড গালি নেই, তবে বৈধ বাংলা কমেন্টকে আটকে না রেখে পাস করিয়ে দেবে
      return res.status(200).json({
        isToxic: false,
        rejectionReason: null,
        sentiment: "Positive",
        aiSummary: "Constructive feedback recorded."
      });
    }

    // ক্লিনআপ করে JSON পার্স করা
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(textOutput);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Parsing Error:", error);
    // ফলব্যাক: যদি পার্সিং ফেইল করে, মন্তব্যটি পাস করিয়ে দেবে কারণ এটি কোনো গালি নয় (গালি আগেই রেজেক্সে ধরা পড়েছে)
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: "Positive",
      aiSummary: "Feedback recorded successfully."
    });
  }
}