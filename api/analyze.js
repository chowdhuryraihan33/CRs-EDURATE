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

  // প্রাথমিক দ্রুত যাচাই (বাংলিশ ও আপত্তিকর শব্দ ব্লক করতে)
  const quickRegex = /(bokacoda|baler|bujhina|porais|fultu|khub bhalo|valona|kire|choda|magi|madarchod|sala|harami|khankir)/i;
  if (quickRegex.test(allComments)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Banglish detected: Please rewrite your review using standard English or formal Bengali script (বাংলা হরফ).",
      sentiment: "Negative",
      aiSummary: null
    });
  }

  const prompt = `
You are a strict moderation engine for the EDURATE academic feedback system.
Evaluate the following student feedback comments:
${allComments}

STRICT MODERATION & LANGUAGE POLICY:
1. BANGLISH RESTRICTION: Banglish (Bengali words written phonetically using English letters, e.g., "kire", "valona", "porais", "bujhina", "baler", "fultu") is STRICTLY PROHIBITED.
2. PERMITTED LANGUAGES: All written feedback MUST be submitted either purely in proper Bengali script (বাংলা বর্ণমালা) OR standard professional English.
3. ZERO TOLERANCE FOR TOXICITY: Any profanity, insults, abusive remarks, or harassment must be blocked immediately.

OUTPUT FORMAT (Provide ONLY valid raw JSON without markdown):
If Banglish is detected:
{"isToxic": true, "rejectionReason": "Banglish detected: Please rewrite your review using standard English or formal Bengali script (বাংলা হরফ).", "sentiment": "Negative", "aiSummary": null}

If abusive/toxic language is detected:
{"isToxic": true, "rejectionReason": "Academic Policy Violation: Inappropriate or offensive language is not allowed.", "sentiment": "Negative", "aiSummary": null}

If compliant and clean:
{"isToxic": false, "rejectionReason": null, "sentiment": "Positive", "aiSummary": "A concise constructive pedagogical takeaway in English."}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.0 },
          // সেফটি ফিল্টারের কারণে জেমিনি যেন রেসপন্স ফাঁকা না করে
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
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    if (!text) {
      // যদি এআই থেকে কোনো কারণে ফাঁকা রেসপন্স আসে
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Content could not be verified. Please ensure proper English or Bengali script is used."
      });
    }

    const result = JSON.parse(text);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Verification failed. Please review your feedback and try again."
    });
  }
}