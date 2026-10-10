#!/usr/bin/env node
// Scansione di primo passaggio per l'audit trasparenza AI Act.
// Uso: node scansiona.js https://www.esempio.it [altro-sito ...]
// Niente dipendenze. Legge l'HTML della home e della pagina privacy, cerca
// widget di chat noti e frasi di avviso "sei con un'AI". Stampa un report Markdown.
// Limite: i widget caricati dopo il click non si vedono qui; l'audit li prova dal vivo.

const WIDGET = [
  ["Intercom", /intercom(cdn|\.io|Settings)/i],
  ["Zendesk / Zopim", /zdassets\.com|zopim|zendesk/i],
  ["Tidio", /tidio\.co|tidiochat/i],
  ["Crisp", /client\.crisp\.chat|crisp\.chat/i],
  ["HubSpot chat", /js(-eu1)?\.hs-scripts\.com|hubspot.*conversations|hs-banner/i],
  ["Drift", /js\.driftt\.com|drift\.com/i],
  ["LiveChat", /livechatinc\.com|livechat\.com/i],
  ["tawk.to", /tawk\.to/i],
  ["Freshchat", /freshchat|wchat\.freshchat\.com|freshworks/i],
  ["Userlike", /userlike/i],
  ["Customerly", /customerly/i],
  ["Chatbase", /chatbase\.co/i],
  ["Voiceflow", /voiceflow\.com/i],
  ["Botpress", /botpress/i],
  ["Landbot", /landbot\.io/i],
  ["ManyChat", /manychat/i],
  ["Dialogflow", /dialogflow|df-messenger/i],
  ["iAdvize", /iadvize/i],
  ["Smartsupp", /smartsupp/i],
  ["JivoChat", /jivosite|jivochat/i],
  ["Olark", /olark\.com/i],
  ["Kommunicate", /kommunicate/i],
  ["Cognigy", /cognigy/i],
  ["Chatling / Botsonic / altri builder", /chatling\.ai|botsonic|writesonic.*bot/i],
  ["Widget generico", /chat-widget|chatbot|chat_widget|livechat|assistente-virtuale/i],
];

const AVVISI = [
  /assistente\s+virtuale/i,
  /intelligenza\s+artificiale/i,
  /\bchatbot\b/i,
  /assistente\s+(ai|digitale|automatico)/i,
  /stai\s+(parlando|chattando)\s+con\s+un/i,
  /generat[oa]\s+(da|con)\s+(l')?(ai|intelligenza)/i,
  /\b(AI|IA)\b[^.]{0,40}(assistente|risponde|automatic)/,  // maiuscole: evita la preposizione "ai"
  /powered\s+by\s+(ai|openai|gpt|claude|gemini)/i,
];

async function prendi(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; check-ai-act/1.0)", "accept-language": "it-IT,it;q=0.9" },
    });
    const html = await r.text();
    return { stato: r.status, url: r.url, html };
  } catch (e) {
    return { stato: 0, url, html: "", errore: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

function soloTesto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function linkPrivacy(html, base) {
  const m = [...html.matchAll(/href=["']([^"']*(privacy|informativa)[^"']*)["']/gi)].map(x => x[1]);
  const host = new URL(base).hostname.replace(/^www\./, "");
  for (const h of m) {
    try {
      const u = new URL(h, base);
      if (u.hostname.replace(/^www\./, "") === host && !/cdn|consent|cookiebot|iubenda\.com\/privacy-policy\/\d/i.test(u.href)) return u.href;
    } catch {}
  }
  for (const h of m) { try { return new URL(h, base).href; } catch {} }
  return null;
}

function trova(regexes, testo) {
  const hit = [];
  for (const re of regexes) {
    const m = testo.match(re);
    if (m) hit.push(m[0].slice(0, 80));
  }
  return hit;
}

async function analizza(sito) {
  const url = /^https?:\/\//i.test(sito) ? sito : "https://" + sito;
  const home = await prendi(url);
  const righe = [`## ${url}`, ""];
  if (!home.html) {
    righe.push(`Pagina non raggiungibile (${home.errore || "stato " + home.stato}).`, "");
    return righe.join("\n");
  }
  const widget = WIDGET.filter(([, re]) => re.test(home.html)).map(([n]) => n);
  const tagManager = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}|cdn\.segment\.com|tealium/i.test(home.html);
  const testoHome = soloTesto(home.html);
  const avvisiHome = trova(AVVISI, testoHome);
  const avvisiScript = trova(AVVISI, home.html).filter(a => !avvisiHome.includes(a));

  const priv = linkPrivacy(home.html, home.url);
  let avvisiPriv = [], privStato = "nessun link trovato";
  if (priv) {
    const p = await prendi(priv);
    privStato = p.html ? `${priv}` : `${priv} (non raggiungibile)`;
    if (p.html) avvisiPriv = trova(AVVISI, soloTesto(p.html));
  }

  righe.push(`**Widget di chat rilevati nell'HTML:** ${widget.length ? widget.join(", ") : (tagManager ? "nessuno, ma c'è un tag manager: il bot può arrivare da lì (verificare dal vivo)" : "nessuno (il bot può caricarsi dopo, da verificare dal vivo)")}`);
  righe.push(`**Avvisi "sei con un'AI" nel testo visibile della home:** ${avvisiHome.length ? avvisiHome.map(a => `«${a}»`).join("; ") : "nessuno"}`);
  if (avvisiScript.length) righe.push(`**Riferimenti all'AI solo nel codice (non visibili all'utente):** ${avvisiScript.map(a => `«${a}»`).join("; ")}`);
  righe.push(`**Informativa privacy:** ${privStato}`);
  righe.push(`**L'informativa parla di AI o chatbot:** ${avvisiPriv.length ? "sì (" + avvisiPriv.map(a => `«${a}»`).join("; ") + ")" : "no"}`);
  righe.push("");

  const esiti = [];
  if (widget.length && !avvisiHome.length) esiti.push("C'è un widget di chat ma nella pagina non compare nessun avviso che si tratti di un'AI: punto da provare dal vivo con priorità (art. 50 par. 1).");
  if (widget.length && avvisiHome.length) esiti.push("Widget presente e avviso nel testo: controllare che l'avviso compaia dentro la chat al primo messaggio, anche da telefono.");
  if (!widget.length) esiti.push("Nessun widget noto nell'HTML iniziale: aprire il sito in un browser e cercare la chat, poi verificare il centralino telefonico.");
  if (priv && !avvisiPriv.length) esiti.push("L'informativa privacy non menziona AI o chatbot: da aggiornare se il bot tratta dati dei clienti.");
  if (!priv) esiti.push("Nessun link all'informativa privacy trovato in home: da verificare.");
  righe.push("**Cosa fare nell'audit:**", ...esiti.map(e => `- ${e}`), "");
  return righe.join("\n");
}

const siti = process.argv.slice(2);
if (!siti.length) {
  console.error("Uso: node scansiona.js https://www.esempio.it [altro-sito ...]");
  process.exit(1);
}
console.log(`# Scansione trasparenza AI Act · ${new Date().toISOString().slice(0, 10)}\n`);
for (const s of siti) console.log(await analizza(s));
