const HIBP_UNAUTH_URL = "https://haveibeenpwned.com/unifiedsearch/";
const HIBP_API_URL = "https://haveibeenpwned.com/api/v3/breachedaccount/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEMO_BREACHES = [
  {
    Name: "LinkedIn",
    BreachDate: "2021-04-08",
    DataClasses: ["Email addresses", "Phone numbers", "Job titles"],
    Description: "A dataset containing LinkedIn user data was shared on a dark web forum.",
  },
  {
    Name: "Canva",
    BreachDate: "2019-05-24",
    DataClasses: ["Email addresses", "Usernames", "Passwords"],
    Description: "Graphic design platform Canva suffered a breach exposing user credentials.",
  },
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1kb",
    },
  },
};

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const apiKey = process.env.HIBP_API_KEY;
  const useAuth = !!apiKey;

  let hibpResponse;
  try {
    const fetchUrl = useAuth
      ? `${HIBP_API_URL}${encodeURIComponent(email)}`
      : `${HIBP_UNAUTH_URL}${encodeURIComponent(email)}`;

    const headers = {
      "Content-Type": "application/json",
    };

    if (useAuth) {
      headers["hibp-api-key"] = apiKey;
    }

    hibpResponse = await fetch(fetchUrl, {
      method: "GET",
      headers,
    });
  } catch (e) {
    console.error("HIBP fetch error:", e);
    return res.status(502).json({
      breached: false,
      breaches: [],
      demo: true,
      error: "Service unavailable. Showing demo data.",
    });
  }

  let breached = false;
  let breaches = [];

  if (hibpResponse.ok) {
    try {
      const data = await hibpResponse.json();
      breaches = data.breaches || [];
      breached = breaches.length > 0;
    } catch (e) {
      console.warn("Failed to parse HIBP response:", e);
    }
  } else if (hibpResponse.status === 404) {
    breached = false;
    breaches = [];
  } else if (hibpResponse.status === 401 || hibpResponse.status === 403) {
    console.warn("HIBP auth required or failed, falling back to demo:", hibpResponse.status);
  } else {
    console.warn("HIBP returned:", hibpResponse.status);
  }

  let isDemo = false;
  if (breaches.length === 0 && !useAuth) {
    isDemo = true;
    breaches = DEMO_BREACHES;
    breached = true;
  }

  const cleanBreaches = breaches.map((b) => ({
    name: b.Name,
    date: b.BreachDate,
    exposed_data: b.DataClasses,
  }));

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json({
    breached,
    breaches: cleanBreaches,
    demo: isDemo,
  });
}