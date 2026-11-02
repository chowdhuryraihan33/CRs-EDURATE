// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const rawText = ` ${comment || ''} ${tComment || ''} ${pComment || ''} ${bComment || ''} `.toLowerCase();

  // 1. Shorasori Gali & Obomanonakor Shobdo (Instant Block - Bangla, English & Slang)
  const explicitRegex = /\b(fuck|fucking|shit|bitch|bastard|asshole|dick|cunt|bokacoda|baler|choda|magi|madarchod|harami|khankir|khanki|gandu|suta|chod|chodna| চুদা | মাগির | খানকির | বাল | মাদারচোদ | হারামি | বোকাচোদা | শুয়োরের )\b/i;
  if (explicitRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Gali ba obomanonakor bhasha bebohar kora shompurno nishiddho.",
      sentiment: "Negative",
      aiSummary: null,
      actionItems: []
    });
  }

  // 2. Personal Attack, Insult & Dismissal/Fire korar Dabi (English & Bangla)
  const hostilePatterns = [
    "fired", "fire him", "fire her", "kicked out", "kick out", "be removed",
    "not be allowed", "incompetent", "worthless", "clown", "fraud", "scam",
    "চাকরিচ্যুতি", "বহিষ্কার", "বের করে দেওয়া", "পড়ানোর যোগ্যতা নেই", "চাকরি থেকে",
    "অযোগ্য", "কোনো যোগ্যতা নাই", "দূর করে দেওয়া হোক", "গায়ে হাত", "বেয়াদব"
  ];

  if (hostilePatterns.some(pattern => rawText.includes(pattern))) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Academic Policy Violation: Personal attack, insult ba teacher-ke fire/remove korar dabi kora jabe na.",
      sentiment: "Negative",
      aiSummary: null,
      actionItems: []
    });
  }

  // 3. Common Banglish Words Filter (Deterministic Catch)
  const banglishRegex = /\b(valo|bhalo|khub|onek|porano|porate|kintu|somossa|shomossa|ase|ache|nai|nei|bujhi|bujhe|faltu|korse|koreche|dorkar|uchit|sir er|sir ke|clas e|kisu)\b/i;
  if (banglishRegex.test(rawText)) {
    return res.status(200).json({
      isToxic: true,
      rejectionReason: "Banglish is strictly prohibited. Shudhu standard Bengali script (বাংলা হরফ) ba English bebohar korun.",
      sentiment: "Negative",
      aiSummary: null,
      actionItems: []
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      isToxic: true,
      rejectionReason: "API Configuration error."
    });
  }

  const feedbackText = `
Overall Feedback: "${comment || 'None'}"
Teaching Feedback (${teachingRating || 'N/A'}★): "${tComment || 'None'}"
Punctuality Feedback (${punctualityRating || 'N/A'}★): "${pComment || 'None'}"
Behavior Feedback (${behaviorRating || 'N/A'}★): "${bComment || 'None'}"
`.trim();

  // 4. Strict AI Verification (Banglish, Insult & Context Balance)
  const prompt = `
You are the primary moderation engine for EDURATE, a university faculty feedback platform.
Analyze the following student feedback comments:

${feedbackText}

STRICT MODERATION DIRECTIVES:

[BLOCK THESE - Set "isToxic": true]
1. BANGLISH: Writing Bengali words phonetically using English/Latin alphabet (e.g., "khub valo", "sir er class", "porano bhalo na", "onek hard"). Even if polite or positive, BANGLISH IS NEVER ALLOWED.
2. INSULTS & PERSONAL ATTACKS: Disrespectful behavior remarks, insults to intelligence or personality, mocking, or hostile disrespect.
3. REMOVAL/FIRING DEMANDS: Asking to fire, terminate, ban, dismiss, or kick out the instructor.
4. PROFANITY & SLURS: Any vulgarity or slang.

[ALLOW THESE - Set "isToxic": false]
1. CONSTRUCTIVE CRITICISM: Respectfully pointing out mistakes, syllabus pacing, asking for clear board writing, requesting more problem-solving/lab explanations, or exams being tough, written in PROPER BENGALI SCRIPT (বাংলা হরফ) OR STANDARD ENGLISH.
2. GENUINE PRAISE: Polite appreciation written in proper Bengali script or standard English.

OUTPUT STRICT RAW JSON ONLY:
{
  "isToxic": false,
  "rejectionReason": null,
  "sentiment": "Positive" | "Constructive" | "Negative",
  "aiSummary": "A concise 1-sentence diagnostic summary stating exact areas of concern (e.g. teaching pace, punctuality, or attitude) and what needs improvement.",
  "actionItems": [
    "Specific pedagogical action item 1",
    "Specific pedagogical action item 2",
    "Specific pedagogical action item 3"
  ]
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    
    // ১. গুগল কোনো এরর দিলে তা সরাসরি ব্রাউজারে টোস্ট মেসেজ আকারে পাঠানো
    if (data.error) {
      console.error("Gemini Error:", data.error);
      return res.status(200).json({
        isToxic: true,
        rejectionReason: `Gemini API Error: ${data.error.message || JSON.stringify(data.error)}`
      });
    }

    let textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    // ২. কোনো আউটপুট না এলে গুগলের কাঁচা মেসেজ দেখানো
    if (!textOutput) {
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "Gemini No Output: " + JSON.stringify(data).substring(0, 150)
      });
    }

    // ৩. কোড ব্লক ব্যাকটিক ও স্পেস ক্লিন করা
    textOutput = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let result;
    try {
      result = JSON.parse(textOutput);
    } catch (parseErr) {
      console.error("JSON Parse Error:", parseErr, "Raw output:", textOutput);
      return res.status(200).json({
        isToxic: true,
        rejectionReason: "JSON Parse Error on Gemini Output: " + textOutput.substring(0, 120)
      });
    }

    // ৪. সফল ডায়নামিক রেজাল্ট পাঠানো
    return res.status(200).json({
      isToxic: Boolean(result.isToxic),
      rejectionReason: result.rejectionReason || null,
      sentiment: result.sentiment || "Constructive",
      aiSummary: result.aiSummary || "Actionable pedagogical feedback noted.",
      actionItems: (Array.isArray(result.actionItems) && result.actionItems.length > 0) ? result.actionItems : [
        "Maintain structured syllabus pacing and clear conceptual demonstrations.",
        "Ensure board handwriting size and projector contrast are suitable for back-benchers.",
        "Allocate a 5-10 minute buffer at the end of lectures for open student Q&A."
      ]
    });
  } catch (error) {
    console.error("Moderation Error:", error);
    return res.status(200).json({
      isToxic: true,
      rejectionReason: `Server Catch Error: ${error.message || error}`
    });
  }
}