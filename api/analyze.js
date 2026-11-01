// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = ` ${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''} `.toLowerCase();

  // রেজেক্স দিয়ে নির্দিষ্ট শব্দ চেক (যাতে বিবরণ বা অন্য শব্দের ভেতর থেকে ভুল না ধরে)
  const explicitRegex = /\b(fuck|shit|bitch|bastard|asshole|dick|cunt|scam|fraud|bokacoda|baler|choda|magi|madarchod|harami|khankir)\b/i;
  if (explicitRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Inappropriate or abusive language is strictly prohibited.",
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

  const prompt = `
You are the evaluation moderator for an academic platform called EDURATE.
Analyze the following student feedback comments:

${feedbackText}

MODERATION CRITERIA:
1. ACCEPT VALID FEEDBACK: Polite constructive feedback, positive reviews, or academic critiques (e.g. asking for more problem-solving sessions, pacing issues, lecture improvements) written in formal Bengali script (বাংলা হরফ) OR standard English are 100% VALID. Mark "isToxic": false.
2. REJECT HOSTILITY & ATTACKS: Direct insults, demanding to fire/remove/ban the instructor, calling them names, or extreme hostility must be marked "isToxic": true.
3. REJECT BANGLISH: Bengali written phonetically using English/Latin alphabet must be marked "isToxic": true with rejectionReason "Banglish is prohibited. Use Bengali script or English."

OUTPUT MUST BE VALID JSON ONLY:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive" or "Constructive" or "Negative",
  "aiSummary": "1 sentence academic takeaway in English"
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
      // যদি এআই ব্যর্থ হয়, সাধারণ একাডেমিক মন্তব্য যেন বাতিল না হয়ে যায়
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