// Cloudflare Worker: riceve il webhook Stripe "checkout.session.completed" e avvia l'audit su GitHub.
// Il cliente paga con un Payment Link di Stripe che ha due campi personalizzati: "sito" e "azienda";
// l'email la fornisce Stripe. Nessuna persona nel mezzo.
//
// Variabili (wrangler secret put): STRIPE_WEBHOOK_SECRET, GITHUB_TOKEN (fine-grained, scope "contents: write" + "actions"),
// GITHUB_REPO (es. "lucademarco2005-oss/check-ai-act").

async function verificaFirma(corpo, firma, segreto) {
  const parti = Object.fromEntries(firma.split(",").map(p => p.split("=")));
  const t = parti.t, v1 = parti.v1;
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${corpo}`));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0 && Math.abs(Date.now() / 1000 - Number(t)) < 300;
}

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("ok", { status: 200 });
    const corpo = await req.text();
    const firma = req.headers.get("stripe-signature") || "";
    if (!(await verificaFirma(corpo, firma, env.STRIPE_WEBHOOK_SECRET))) return new Response("firma non valida", { status: 400 });
    const ev = JSON.parse(corpo);
    if (ev.type !== "checkout.session.completed") return new Response("ignorato", { status: 200 });
    const s = ev.data.object;
    const campi = Object.fromEntries((s.custom_fields || []).map(f => [f.key, (f.text && f.text.value) || ""]));
    const email = (s.customer_details && s.customer_details.email) || s.customer_email;
    const dominio = (campi.sito || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (!email || !dominio) return new Response("mancano email o sito", { status: 200 });
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "check-ai-act", "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "audit", client_payload: { dominio, email, azienda: campi.azienda || dominio, ordine: s.id } }),
    });
    return new Response(r.ok ? "audit avviato" : "errore GitHub " + r.status, { status: r.ok ? 200 : 500 });
  },
};
