import { callClaude, safeJsonParse } from "../lib/agents/_shared.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10kb",
    },
  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SYSTEM_PROMPT = `You are generating a phishing awareness exercise for a UK reader. Produce exactly 5 emails: 3 phishing attempts and 2 legitimate ones, in randomised order. Phishing emails should use realistic 2026 UK tactics: HMRC tax refund scams, parcel delivery (Royal Mail, DPD, Evri), bank security alerts, AI voice-clone callbacks, energy bill rebates, NHS appointment scams. Legitimate emails should look genuinely similar to be properly tricky — a real Amazon order confirmation, a real bank statement notification, a real NHS reminder. Make sender domains realistic. For phishing, the domain should be subtly wrong (royal-maiI.co with a capital I instead of L, hmrc-refunds.uk instead of hmrc.gov.uk, etc.). Body 3-5 sentences each, realistic tone. Output ONLY valid JSON in this exact shape:
{
  "emails": [
    {
      "id": 1,
      "from_name": "string",
      "from_address": "string",
      "subject": "string",
      "body": "string",
      "is_phishing": boolean,
      "explanation": "string — one or two plain-English sentences. For phishing: name the specific tell. For legit: name what makes it trustworthy."
    },
    ... 5 total
  ]
}
NEVER use jargon. Never write 'sophisticated' or 'social engineering'. Use 'tricks', 'pressure', 'pretending'. The explanation is read by a non-technical person.`;

const FALLBACK_EMAILS = {
  emails: [
    {
      id: 1,
      from_name: "HM Revenue & Customs",
      from_address: "refunds@hmrc-gov.uk",
      subject: "Your tax refund of £847.50 is ready",
      body: "After reviewing your tax returns, we have calculated that you are owed a refund of £847.50. Please verify your bank details within 48 hours to process this payment. Click the link below to claim your refund now.",
      is_phishing: true,
      explanation: "HMRC never contacts you about refunds by email. The address is wrong — it should be @hmrc.gov.uk, not @hmrc-gov.uk."
    },
    {
      id: 2,
      from_name: "Amazon",
      from_address: "order-confirmation@amazon.co.uk",
      subject: "Your Amazon order #112-4587291-3928471 has dispatched",
      body: "Your order has been dispatched and is on its way. You can track your package in the Amazon app or on our website. The estimated delivery date is tomorrow between 8am and 6pm. Thank you for shopping with us.",
      is_phishing: false,
      explanation: "A real Amazon dispatch email. The address is correct, there's no pressure to act, and it doesn't ask for personal details."
    },
    {
      id: 3,
      from_name: "Royal Mail",
      from_address: "tracking@royal-mail.co",
      subject: "We attempted to deliver your package",
      body: "We attempted to deliver your package but no one was home. There is a parcel waiting for you at your local depot. To rearrange delivery, please confirm your address and pay a small redelivery fee of £2.99.",
      is_phishing: true,
      explanation: "Royal Mail doesn't ask for redelivery fees by email. The domain is wrong — it's royal-mail.co, not royalmail.com."
    },
    {
      id: 4,
      from_name: "Barclays",
      from_address: "alerts@barclays.co.uk",
      subject: "New device logged into your online banking",
      body: "A new device has logged into your Barclays account from an iPhone 15 in London. If this wasn't you, please log into your banking app immediately to secure your account. No action is needed if this was you.",
      is_phishing: false,
      explanation: "A real security alert from Barclays. It doesn't ask you to click a link or give personal details — it tells you to use your app."
    },
    {
      id: 5,
      from_name: "NHS Digital",
      from_address: "appointments@nhs-notifications.uk",
      subject: "Your NHS appointment needs confirmation",
      body: "Your upcoming GP appointment on 15th May needs to be confirmed. Please log in to verify your details and confirm your attendance. Failure to confirm may result in your appointment being cancelled.",
      is_phishing: true,
      explanation: "The NHS doesn't send appointment confirmations by email with threats. The domain nhs-notifications.uk is not official NHS."
    }
  ]
};

async function generateEmails() {
  try {
    const result = await callClaude(
      SYSTEM_PROMPT,
      "Generate 5 phishing detection emails.",
      2000
    );

    const parsed = safeJsonParse(result);
    
    if (parsed && parsed.emails && Array.isArray(parsed.emails) && parsed.emails.length === 5) {
      return parsed;
    }

    throw new Error("Invalid response format");
  } catch (e) {
    console.warn("Email generation failed, trying once more:", e.message);
    
    try {
      const result = await callClaude(
        SYSTEM_PROMPT,
        "Generate 5 phishing detection emails.",
        2000
      );

      const parsed = safeJsonParse(result);
      
      if (parsed && parsed.emails && Array.isArray(parsed.emails) && parsed.emails.length === 5) {
        return parsed;
      }
    } catch (e2) {
      console.error("Email generation retry failed:", e2.message);
    }

    return FALLBACK_EMAILS;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const emails = await generateEmails();
    
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json(emails);
  } catch (error) {
    console.error("Error in sim-phishing:", error.message);
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: "Failed to generate emails" });
  }
}