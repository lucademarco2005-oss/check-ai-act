#!/usr/bin/env node
// Verifica dal vivo, automatica: apre il sito con Chrome, chiude il banner cookie,
// trova e apre la chat, legge il primo messaggio del bot, giudica l'avviso AI e
// salva screenshot datati (desktop e mobile 375px).
//
// Uso: node verifica.js dominio.it [altro.it ...]   oppure   node verifica.js --lista file.txt
// Output: risultati/<dominio>/esito.json + screenshot. Riepilogo su stdout (JSON lines).
//
// Sostituisce la verifica a mano: è la stessa sequenza che farebbe una persona.

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "risultati");
const CONCORRENZA = 3;
const TIMEOUT_PAGINA = 25000;

// Firme dei vendor nell'HTML o negli script caricati.
const VENDOR = [
  ["Intercom", /intercomcdn|intercom\.io|intercom-frame/i],
  ["Zendesk", /zdassets\.com|zopim|zendesk/i],
  ["Tidio", /tidio\.co|tidiochat/i],
  ["Crisp", /crisp\.chat/i],
  ["HubSpot", /hs-scripts\.com|hubspot.*conversations|usemessages\.com/i],
  ["Drift", /driftt\.com|drift\.com/i],
  ["LiveChat", /livechatinc\.com|livechat\.com/i],
  ["tawk.to", /tawk\.to/i],
  ["Freshchat", /freshchat|freshworks/i],
  ["Userlike", /userlike/i],
  ["Customerly", /customerly/i],
  ["Chatbase", /chatbase\.co/i],
  ["Voiceflow", /voiceflow\.com/i],
  ["Botpress", /botpress/i],
  ["Landbot", /landbot\.io/i],
  ["Dialogflow", /dialogflow|df-messenger/i],
  ["iAdvize", /iadvize/i],
  ["Smartsupp", /smartsupp/i],
  ["JivoChat", /jivosite|jivochat/i],
  ["Olark", /olark\.com/i],
  ["Kommunicate", /kommunicate/i],
  ["Aimage", /aimage/i],
  ["indigo.ai", /indigo\.ai|indigoai/i],
  ["Userbot", /userbot\.ai/i],
  ["Crafter.ai", /crafter\.ai/i],
  ["Heres", /heres\.ai/i],
  ["Salesforce Embedded", /embeddedservice|salesforce-chat/i],
  ["Genesys", /genesys\.com|purecloud/i],
  ["Cognigy", /cognigy/i],
  ["Smooch/Sunshine", /smooch\.io/i],
];

// Avviso forte: dice che è un'AI / sistema automatico.
const FORTE = [
  /intelligenza\s+artificiale/i, /\bI\.?A\.?\b(?!\w)/, /\bAI\b/, /artificial\s+intelligence/i,
  /assistente\s+(virtuale\s+)?(ai|ia|automatic[oa]|digitale\s+automatic[oa])/i,
  /sono\s+un\s+(bot|chatbot|assistente\s+automatico|sistema\s+automatico)/i,
  /\bchat\s*bot\b/i, /\bchatbot\b/i, /sistema\s+automatico/i, /risposte?\s+generat[ae]/i,
  /automated\s+assistant|virtual\s+agent|powered\s+by\s+(ai|openai|gpt)\b/i, /bot\s+automatico/i,
  /non\s+sono\s+una\s+persona|non\s+sono\s+un\s+operatore/i,
];
// Avviso debole: lascia intendere, ma non dice che è un'AI.
const DEBOLE = [/assistente\s+virtuale/i, /assistente\s+digitale/i, /\bassistente\b/i, /\bassistant\b/i, /\bhelper\b/i];
// Falsi positivi: la parola "ai" italiana (preposizione) è esclusa dalle regex sopra grazie a \bAI\b case-sensitive.

const VENDOR_BOT = new Set(["Aimage", "indigo.ai", "Userbot", "Crafter.ai", "Heres", "Chatbase", "Voiceflow", "Botpress", "Landbot", "Dialogflow", "Kommunicate", "Cognigy", "ManyChat"]);
const TESTI_ACCETTA = /accetta tutt|accetta e chiudi|accetto|accept all|allow all|consenti tutt|ok, accetto|^accetta$|^accept$|^ok$/i;
const SELETTORI_ACCETTA = ["#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept", "#onetrust-accept-btn-handler", ".iubenda-cs-accept-btn", "#didomi-notice-agree-button", "button[data-testid='uc-accept-all-button']", ".cmplz-accept", "#cookiescript_accept", ".cky-btn-accept", "#rcc-confirm-button", ".cc-allow", "[data-cookiefirst-action='accept']", "#axeptio_btn_acceptAll", "button#acceptAll"];
const TESTI_RIFIUTA = /rifiut|solo (i )?(cookie )?(tecnici|necessari)|continua senza|chiudi|decline|reject|necessary only|only necessary|non accett/i;
const TESTI_CHAT = /chat|chatta|parla con noi|scrivici|assistenza|aiuto|help|support|contattaci|assistente|messaggio|domanda/i;

function vendorDa(html) {
  return VENDOR.filter(([, re]) => re.test(html)).map(([n]) => n);
}

const UMANO = /operator|operatore|agente|consulent[ei] (sono|è) (offline|online)|lun-?ven|orari|offline|lascia un messaggio|ti risponderemo|scelta reparto|entra in chat|compila|nome e cognome|inserisci (la tua|il tuo)|siamo (online|offline)|team di supporto|un nostro|nostri (operatori|consulenti)|live chat|parla con un|ti ricontatteremo/i;
const BOT_LIKE = /ciao|benvenut|salve|buongiorno|hello|\bhi\b|come posso|posso aiutart|scrivi|chiedimi|fai una domanda|domanda|cosa (vuoi|cerchi)|in cosa/i;
const PROMO = /sconto|coupon|codice (sconto|promo)|entra a far parte|vantaggi ti aspettano|iscriviti|registrati|spedizione gratuita|black friday|risparmi fino/i;
const NON_CHAT = /cookie|preferenze relative alla privacy|menu di accessibilit|accessibility|contrasto|dimensione (del )?testo|newsletter/i;

function giudica(testo) {
  const t = (testo || "").replace(/\s+/g, " ").trim();
  if (!t) return { esito: "nessun_messaggio", prova: "" };
  const f = FORTE.find(re => re.test(t));
  if (f) return { esito: "in_regola", prova: t.match(f)[0] };
  const d = DEBOLE.find(re => re.test(t));
  if (NON_CHAT.test(t) && !d && !/\bchat\b/i.test(t)) return { esito: "pannello_non_chat", prova: t.match(NON_CHAT)[0] };
  if (PROMO.test(t) && !d && !UMANO.test(t) && !/\bchat\b/i.test(t)) return { esito: "pannello_non_chat", prova: t.match(PROMO)[0] };
  if (UMANO.test(t)) return { esito: "chat_umana_o_modulo", prova: t.match(UMANO)[0] };
  if (d) return { esito: "al_limite", prova: t.match(d)[0] };
  if (BOT_LIKE.test(t)) return { esito: "scoperto", prova: "" };
  return { esito: "da_verificare", prova: "" };
}

const SELETTORI_RIFIUTA = [
  "#CybotCookiebotDialogBodyButtonDecline", "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
  "#onetrust-reject-all-handler", ".iubenda-cs-reject-btn", "#didomi-notice-disagree-button",
  "button[data-testid='uc-deny-all-button']", ".cmplz-deny", "#cookiescript_reject", ".cky-btn-reject",
  "#rcc-decline-button", ".cc-deny", "[data-cookiefirst-action='reject']", "#axeptio_btn_dismiss",
  "button#rejectAll", ".qc-cmp2-summary-buttons button[mode='secondary']",
];
async function chiudiCookie(page) {
  const fine = Date.now() + 8000;
  while (Date.now() < fine) {
    for (const sel of SELETTORI_RIFIUTA) {
      const l = page.locator(sel).first();
      if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); return "rifiutato: " + sel; }
    }
    const ruolo = page.getByRole("button", { name: TESTI_RIFIUTA }).first();
    if (await ruolo.isVisible().catch(() => false)) {
      const txt = (await ruolo.innerText().catch(() => "")).trim().slice(0, 60);
      await ruolo.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); return "rifiutato: " + txt;
    }
    const link = page.getByRole("link", { name: TESTI_RIFIUTA }).first();
    if (await link.isVisible().catch(() => false)) {
      const txt = (await link.innerText().catch(() => "")).trim().slice(0, 60);
      await link.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); return "rifiutato: " + txt;
    }
    // Banner presente ma senza rifiuto esplicito: prova a chiuderlo.
    const chiudi = page.getByRole("button", { name: /^(chiudi|close|x|✕|×)$/i }).first();
    if (await chiudi.isVisible().catch(() => false)) { await chiudi.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500); return "chiuso senza accettare"; }
    await page.waitForTimeout(700);
  }
  await page.keyboard.press("Escape").catch(() => {});
  return "nessun banner o nessun bottone di rifiuto";
}

// Raccoglie il testo visibile di tutti i frame (anche cross-origin).
async function testoFrames(page) {
  const out = [];
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => document.body ? document.body.innerText : "", { timeout: 3000 });
      if (t) out.push(t);
    } catch {}
  }
  return out.join("\n");
}

// Trova il lanciatore della chat: elementi fissi vicino ai bordi in basso, o con testo/aria da chat, o frame noti.
async function trovaLanciatore(page) {
  const candidati = [];
  for (const frame of page.frames()) {
    try {
      const trovati = await frame.evaluate((reChat) => {
        const re = new RegExp(reChat, "i");
        const vw = window.innerWidth, vh = window.innerHeight;
        const res = [];
        const els = document.querySelectorAll("button, a, div, span, iframe, [role=button]");
        let i = 0;
        for (const el of els) {
          if (i++ > 20000) break;
          // Filtro rapido: solo elementi fissi o con un nome da chat.
          const nome = ((el.id || "") + " " + (el.className && el.className.toString ? el.className.toString() : "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || ""));
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" && !re.test(nome) && el.tagName !== "IFRAME") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 24 || r.width > 420 || r.height > 420) continue;
          if (r.bottom > vh + 5 || r.right > vw + 5 || r.top < 0) continue;
          if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
          const testo = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + (el.id || "") + " " + (el.className && el.className.toString ? el.className.toString() : "")).slice(0, 200);
          const fissoBasso = (cs.position === "fixed" || (el.closest && el.closest("[style*='position: fixed'], [style*='position:fixed']"))) && r.bottom > vh - 160;
          const bordo = r.bottom > vh - 160 && (r.left < 200 || r.right > vw - 200);
          const sembraChat = re.test(testo);
          const isIframe = el.tagName === "IFRAME";
          let punteggio = 0;
          if (fissoBasso) punteggio += 3;
          if (bordo) punteggio += 2;
          if (sembraChat) punteggio += 3;
          if (isIframe && (fissoBasso || bordo)) punteggio += 2;
          if (/cookie|consent|privacy|whatsapp|wa\.me|spoki|telegram|messenger|scroll|back-to-top|torna su|newsletter|iscriviti|accessib|a11y|userway|accessiway|reviews|recensioni|trustpilot|feedaty/i.test(testo)) punteggio -= 5;
          if (punteggio >= 5) {
            el.setAttribute("data-verifica-cand", String(res.length));
            res.push({ punteggio, testo: testo.replace(/\s+/g, " ").trim().slice(0, 80), x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName });
          }
        }
        return res;
      }, TESTI_CHAT.source);
      for (const c of trovati) candidati.push({ ...c, frame });
    } catch (e) { if (process.env.DEBUG) console.error('trovaLanciatore:', frame.url().slice(0,60), String(e.message||e).slice(0,160)); }
  }
  candidati.sort((a, b) => b.punteggio - a.punteggio);
  if (process.env.DEBUG) console.error('candidati:', JSON.stringify(candidati.slice(0,5).map(c => ({p:c.punteggio,t:c.testo,tag:c.tag}))));
  return candidati;
}

async function marcaVisibili(page) {
  for (const f of page.frames()) {
    try { await f.evaluate(() => { for (const el of document.querySelectorAll("iframe, div, section, aside")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) el.setAttribute("data-verifica-prima", "1"); } }); } catch {}
  }
}

// Dopo il clic: il pannello chat è un elemento grande, fisso, visibile ora e non prima.
async function testoPannello(page) {
  const pannelli = [];
  for (const f of page.frames()) {
    try {
      const res = await f.evaluate(() => {
        const vw = innerWidth, vh = innerHeight, out = [];
        for (const el of document.querySelectorAll("iframe, div, section, aside")) {
          if (el.hasAttribute("data-verifica-prima")) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 240 || r.height < 260 || r.width > vw + 2 || r.height > vh + 2) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
          const fisso = cs.position === "fixed" || cs.position === "absolute";
          if (!fisso && !(el.tagName === "IFRAME")) continue;
          out.push({ tag: el.tagName, area: r.width * r.height, testo: el.tagName === "IFRAME" ? "" : (el.innerText || "").trim(), idx: out.length });
          el.setAttribute("data-verifica-pannello", String(out.length - 1));
        }
        return out;
      });
      for (const r of res) pannelli.push({ ...r, frame: f });
    } catch {}
  }
  pannelli.sort((a, b) => b.area - a.area);
  for (const p of pannelli.slice(0, 3)) {
    let testo = p.testo;
    if (p.tag === "IFRAME") {
      try { const h = await p.frame.$(`iframe[data-verifica-pannello="${p.idx}"]`); const cf = h && await h.contentFrame(); if (cf) testo = await cf.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); } catch {}
    }
    if (testo && testo.trim().length > 10) return testo;
  }
  return "";
}

async function apriChat(page) {
  let cand = [];
  const fine = Date.now() + 10000; // i widget caricano in ritardo: attendi fino a 10 s
  while (Date.now() < fine) {
    cand = await trovaLanciatore(page);
    if (cand.length) break;
    await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 200).catch(() => {});
    await page.waitForTimeout(1500);
  }
  for (const c of cand.slice(0, 4)) {
    try {
      await marcaVisibili(page);
      const el = await c.frame.$(`[data-verifica-cand="${cand.indexOf(c)}"]`);
      if (el) await el.click({ timeout: 3000, force: true });
      else await page.mouse.click(c.x, c.y);
      await page.waitForTimeout(4500);
      const testo = await testoPannello(page);
      if (testo && giudica(testo).esito === "pannello_non_chat") { await page.keyboard.press("Escape").catch(() => {}); continue; }
      return { aperto: true, lanciatore: `${c.tag} «${c.testo}» (punteggio ${c.punteggio})`, testo };
    } catch {}
  }
  return { aperto: false, lanciatore: cand.length ? `candidati non cliccabili: ${cand.slice(0, 3).map(c => c.testo).join(" | ")}` : "nessun lanciatore trovato", testo: "" };
}

function diffTesto(prima, dopo) {
  const a = new Set(prima.split("\n").map(s => s.trim()).filter(Boolean));
  return dopo.split("\n").map(s => s.trim()).filter(s => s && !a.has(s)).join("\n");
}

async function verificaViewport(browser, url, vp, cartella, nome) {
  const ctx = await browser.newContext({
    viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: vp.isMobile ? 2 : 1,
    locale: "it-IT", userAgent: vp.ua, ignoreHTTPSErrors: true,
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();
  const esito = { viewport: nome, url_finale: null, cookie: null, vendor: [], chat_aperta: false, lanciatore: null, primo_messaggio: "", giudizio: null, prova: "", screenshot: null, errore: null };
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_PAGINA });
    esito.url_finale = page.url();
    await page.waitForTimeout(5000); // tempo ai tag manager di caricare i widget
    const html = await page.content().catch(() => "");
    const scripts = (await page.evaluate(() => [...document.scripts].map(s => s.src).join("\n")).catch(() => "")) || "";
    esito.vendor = vendorDa(html + "\n" + scripts);
    esito.cookie = await chiudiCookie(page);
    let prima = await testoFrames(page);
    let ap = await apriChat(page);
    if (!ap.aperto && esito.vendor.length) {
      // Seconda passata: il widget può essere bloccato dal consenso. Ricarica e accetta, come un visitatore.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_PAGINA }).catch(() => {});
      await page.waitForTimeout(4000);
      let acc = false;
      for (const sel of SELETTORI_ACCETTA) { const l = page.locator(sel).first(); if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 2000 }).catch(() => {}); acc = true; break; } }
      if (!acc) { const b = page.getByRole("button", { name: TESTI_ACCETTA }).first(); if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); acc = true; } }
      if (acc) {
        esito.cookie = (esito.cookie || "") + " · seconda passata: cookie accettati";
        await page.waitForTimeout(6000);
        prima = await testoFrames(page);
        ap = await apriChat(page);
      }
    }
    esito.chat_aperta = ap.aperto; esito.lanciatore = ap.lanciatore;
    if (ap.aperto) {
      let nuovo = ap.testo || "";
      if (!nuovo.trim()) { const dopo = await testoFrames(page); nuovo = diffTesto(prima, dopo); }
      esito.primo_messaggio = nuovo.replace(/\s+/g, " ").trim().slice(0, 600);
    }
    const g = giudica(esito.primo_messaggio);
    if (g.esito === "chat_umana_o_modulo" && esito.vendor.some(v => VENDOR_BOT.has(v))) { g.esito = "scoperto"; g.prova = "fornitore di chatbot AI: " + esito.vendor.filter(v => VENDOR_BOT.has(v)).join(", "); }
    if (g.esito === "da_verificare" && esito.vendor.some(v => VENDOR_BOT.has(v)) && esito.primo_messaggio.length > 20) { g.esito = "scoperto"; g.prova = "fornitore di chatbot AI: " + esito.vendor.filter(v => VENDOR_BOT.has(v)).join(", "); }
    esito.giudizio = ap.aperto ? g.esito : (esito.vendor.length ? "vendor_senza_widget" : "chat_non_trovata");
    esito.prova = g.prova;
    const file = path.join(cartella, `${nome}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    esito.screenshot = path.relative(OUT, file);
  } catch (e) {
    esito.errore = (e && e.message || String(e)).split("\n")[0].slice(0, 160);
    esito.giudizio = "errore";
  } finally {
    await ctx.close().catch(() => {});
  }
  return esito;
}

async function verificaSito(browser, dominio) {
  const url = /^https?:\/\//i.test(dominio) ? dominio : "https://" + dominio;
  const host = url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const cartella = path.join(OUT, host);
  fs.mkdirSync(cartella, { recursive: true });
  const quando = new Date().toISOString();
  const desktop = await verificaViewport(browser, url, { viewport: { width: 1280, height: 800 }, isMobile: false, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }, cartella, "desktop");
  const mobile = await verificaViewport(browser, url, { viewport: { width: 375, height: 812 }, isMobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }, cartella, "mobile");
  // Verdetto complessivo: il peggiore tra i due viewport in cui la chat si è aperta.
  const ordine = { scoperto: 0, al_limite: 1, in_regola: 2, chat_umana_o_modulo: 3, da_verificare: 4, nessun_messaggio: 5, pannello_non_chat: 6, vendor_senza_widget: 7, chat_non_trovata: 8, errore: 9 };
  // Conta solo i viewport in cui la chat si è aperta e ha dato un testo; il peggiore vince.
  const conTesto = [desktop, mobile].filter(v => v.chat_aperta && v.primo_messaggio);
  const verdetto = conTesto.length ? conTesto.map(v => v.giudizio).sort((a, b) => ordine[a] - ordine[b])[0] : [desktop.giudizio, mobile.giudizio].sort((a, b) => ordine[a] - ordine[b])[0];
  const esito = { dominio: host, url, quando, verdetto, vendor: [...new Set([...desktop.vendor, ...mobile.vendor])], desktop, mobile };
  fs.writeFileSync(path.join(cartella, "esito.json"), JSON.stringify(esito, null, 2));
  return esito;
}

async function main() {
  let args = process.argv.slice(2);
  if (args[0] === "--lista") args = fs.readFileSync(args[1], "utf8").split(/\s+/).filter(Boolean);
  if (!args.length) { console.error("Uso: node verifica.js dominio.it [...] | --lista file.txt"); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  const coda = [...args]; const risultati = [];
  async function worker() {
    while (coda.length) {
      const d = coda.shift();
      try {
        const e = await verificaSito(browser, d);
        risultati.push(e);
        console.log(JSON.stringify({ dominio: e.dominio, verdetto: e.verdetto, vendor: e.vendor, primo_messaggio: (e.desktop.primo_messaggio || e.mobile.primo_messaggio || "").slice(0, 160), lanciatore: e.desktop.lanciatore }));
      } catch (err) {
        console.log(JSON.stringify({ dominio: d, verdetto: "errore", errore: String(err.message || err).slice(0, 120) }));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENZA, args.length) }, worker));
  await browser.close();
  fs.writeFileSync(path.join(OUT, `riepilogo-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(risultati, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
