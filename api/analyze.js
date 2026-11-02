// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { comment, tComment, pComment, bComment, teachingRating, punctualityRating, behaviorRating } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // Calculate average rating and set dynamic fallback sentiment & actions
  const avgStars = (Number(teachingRating || 3) + Number(punctualityRating || 3) + Number(behaviorRating || 3)) / 3;

  let fallbackSentiment = "Constructive";
  let fallbackSummary = "The student provided detailed, constructive observations regarding the course pace and interaction.";
  let fallbackActionItems = [
    "Maintain structured syllabus pacing and clear conceptual demonstrations.",
    "Ensure board handwriting size and projector contrast are suitable for back-benchers.",
    "Allocate a 5-10 minute buffer at the end of lectures for open student Q&A."
  ];

  if (avgStars >= 4.0) {
    fallbackSentiment = "Positive";
    fallbackSummary = "The student expressed strong satisfaction with the lecture delivery, clarity, and overall engagement.";
    fallbackActionItems = [
      "Sustain current interactive lecture engagement methods and clear real-world examples.",
      "Consider sharing supplementary enrichment material for highly engaged students.",
      "Maintain active student-teacher dialogue throughout subsequent modules."
    ];
  } else if (avgStars <= 2.2) {
    fallbackSentiment = "Critical";
    fallbackSummary = "The student noted notable operational friction, specifically addressing pacing, punctuality, or content absorption.";
    fallbackActionItems = [
      "Ensure class sessions commence strictly on schedule to prevent rushing concluding topics.",
      "Review core concept delivery speed to ensure foundational understanding before progressing.",
      "Integrate regular comprehension checks throughout the lecture period."
    ];
  }

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
    "চাকরিচ্যুতি", "বহিষ্কার", "বের করে দেওয়া", "পড়ানোর যোগ্যতা নেই", "চাকরি থেকে",
    "অযোগ্য", "কোনো যোগ্যতা নাই", "দূর করে দেওয়া হোক", "গায়ে হাত", "বেয়াদব"
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
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

    // If Google experiences high demand or errors, gracefully fall back based on star score
    if (data.error || !data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.warn("Gemini busy or returned error, applying rating-based smart fallback");
      return res.status(200).json({
        isToxic: false,
        rejectionReason: null,
        sentiment: fallbackSentiment,
        aiSummary: fallbackSummary,
        actionItems: fallbackActionItems
      });
    }

    let textOutput = data.candidates[0].content.parts[0].text;
    textOutput = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let result;
    try {
      result = JSON.parse(textOutput);
    } catch (e) {
      result = {};
    }

    // Flag and reject toxic content immediately
    if (result.isToxic) {
      return res.status(200).json({
        isToxic: true,
        rejectionReason: result.rejectionReason || "Feedback contains abusive or inappropriate remarks."
      });
    }

    // Pass and return dynamic AI synthesis
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: result.sentiment || fallbackSentiment,
      aiSummary: result.aiSummary || fallbackSummary,
      actionItems: (Array.isArray(result.actionItems) && result.actionItems.length > 0) ? result.actionItems : fallbackActionItems
    });

  } catch (error) {
    // Network failures or timeouts safely fall back using actual student star ratings
    return res.status(200).json({
      isToxic: false,
      rejectionReason: null,
      sentiment: fallbackSentiment,
      aiSummary: fallbackSummary,
      actionItems: fallbackActionItems
    });
  }
}