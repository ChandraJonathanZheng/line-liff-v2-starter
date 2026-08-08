export async function getLineIdentity(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const clientId = process.env.LINE_CHANNEL_ID || process.env.LIFF_ID?.split("-")[0];
  if (!token || !clientId) throw new Error("Missing LINE authentication.");

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: token, client_id: clientId }),
  });
  if (!response.ok) throw new Error("Your LINE session could not be verified.");

  const identity = await response.json();
  if (!identity.sub) throw new Error("LINE account identifier is missing.");
  return identity;
}
