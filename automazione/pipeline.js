#!/usr/bin/env node
// Pipeline di contatto, senza persone: lista di domini -> verifica dal vivo -> per chi è scoperto,
// mail con screenshot allegato -> invio via Resend (solo con --invia) -> registro in pipeline.csv.
//
// Uso:
//   node pipeline.js --lista domini.txt                 (verifica + bozze mail, nessun invio)
//   node pipeline.js --lista domini.txt --invia         (invia davvero; serve RESEND_API_KEY e MITTENTE)
//   node pipeline.js --lista domini.txt --contatti contatti.csv   (csv: dominio,email,nome,azienda)
//
// Variabili: RESEND_API_KEY, MITTENTE (es. "Check AI Act <audit@tuodominio.it>"), LINK_ORDINE (pagina/Stripe),
//            RISPONDI_A (reply-to). Senza contatti.csv la mail va a info@<dominio>.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function arg(n, d) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; }
const lista = arg("--lista"); const invia = process.argv.includes("--invia");
if (!lista) { console.error("Uso: node pipeline.js --lista domini.txt [--contatti contatti.csv] [--invia]"); process.exit(1); }
const contattiFile = arg("--contatti");
const LINK = process.env.LINK_ORDINE || "https://lucademarco2005-oss.github.io/check-ai-act/";
const MITTENTE = process.env.MITTENTE || "onboarding@resend.dev";
const RISPONDI_A = process.env.RISPONDI_A || "";
const OUT = path.join(__dirname, "risultati");
const BOZZE = path.join(__dirname, "bozze"); fs.mkdirSync(BOZZE, { recursive: true });
const CSV = path.join(__dirname, "pipeline.csv");

const contatti = {};
if (contattiFile) for (const l of fs.readFileSync(contattiFile, "utf8").split("\n").slice(1)) {
  const [dominio, email, nome, azienda] = l.split(",").map(x => (x || "").trim());
  if (dominio) contatti[dominio.replace(/^www\./, "")] = { email, nome, azienda };
}

// 1. Verifica dal vivo (riusa i risultati del giorno se esistono).
const domini = fs.readFileSync(lista, "utf8").split(/\s+/).filter(Boolean).map(d => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""));
const daFare = domini.filter(d => { const f = path.join(OUT, d, "esito.json"); return !(fs.existsSync(f) && JSON.parse(fs.readFileSync(f, "utf8")).quando.slice(0, 10) === new Date().toISOString().slice(0, 10)); });
if (daFare.length) {
  const r = spawnSync("node", [path.join(__dirname, "verifica.js"), ...daFare], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) console.error("verifica.js ha restituito", r.status);
}

// 2. Bozze mail per chi è scoperto o al limite.
function mailPer(e, c) {
  const azienda = c.azienda || e.dominio;
  const nome = c.nome ? `Buongiorno ${c.nome},` : "Buongiorno,";
  const cosa = e.verdetto === "al_limite"
    ? `si presenta come «${e.desktop.prova || e.mobile.prova}», ma non dice che risponde un'intelligenza artificiale`
    : `nel primo messaggio non c'è scritto che risponde un'intelligenza artificiale`;
  const oggetto = `la chat di ${azienda} non dice che è un'AI`;
  const daTelefono = e.mobile.chat_aperta && e.mobile.primo_messaggio;
  const testo = `${nome}

ho aperto ${e.dominio}${daTelefono ? " da telefono" : ""} e ho scritto alla vostra chat: ${cosa}. Lo screenshot datato è in allegato.

Dal 2 agosto 2026 l'avviso è obbligatorio (AI Act, art. 50). Dal 23 ottobre l'ACN può ispezionare, ordinare l'adeguamento e pubblicare il nome dell'azienda; le multe arrivano al 3% del fatturato. Ma il problema più vicino è un cliente che se ne accorge e lo scrive in una recensione.

La correzione è una riga di testo nel primo messaggio. Il fascicolo di verifica con i rilievi, le prove e i testi già scritti da incollare nel widget si ordina qui e arriva in automatico: ${LINK}

Se la chat è già stata sistemata, mi basta una riga e aggiorno la verifica.

Check AI Act`;
  return { oggetto, testo };
}

const righe = []; let inviate = 0;
(async () => {
for (const d of domini) {
  const f = path.join(OUT, d, "esito.json");
  if (!fs.existsSync(f)) { righe.push([d, "", "errore", "", "", ""]); continue; }
  const e = JSON.parse(fs.readFileSync(f, "utf8"));
  const c = contatti[d] || {};
  const destinatario = c.email || `info@${d}`;
  const daContattare = ["scoperto", "al_limite", "nessun_messaggio"].includes(e.verdetto);
  let stato = daContattare ? "bozza" : "no_contatto";
  if (daContattare) {
    const m = mailPer(e, c);
    // Allega lo screenshot del viewport in cui la chat si è aperta e ha dato un testo (telefono se possibile).
    const shot = [e.mobile, e.desktop].filter(v => v.chat_aperta && v.primo_messaggio).concat([e.desktop, e.mobile]).map(v => v.screenshot && path.join(OUT, v.screenshot)).find(p => p && fs.existsSync(p));
    const bozza = { dominio: d, a: destinatario, oggetto: m.oggetto, testo: m.testo, allegato: shot || null, verdetto: e.verdetto, quando: new Date().toISOString() };
    fs.writeFileSync(path.join(BOZZE, `${d}.json`), JSON.stringify(bozza, null, 2));
    fs.writeFileSync(path.join(BOZZE, `${d}.txt`), `A: ${destinatario}\nOggetto: ${m.oggetto}\nAllegato: ${shot || "-"}\n\n${m.testo}\n`);
    if (invia) {
      stato = (await inviaResend(bozza)) ? "inviata" : "invio_fallito";
      if (stato === "inviata") inviate++;
    }
  }
  righe.push([d, destinatario, e.verdetto, e.vendor.join(" "), stato, new Date().toISOString()]);
}

async function inviaResend(b) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error("RESEND_API_KEY mancante: nessun invio"); return false; }
  const body = { from: MITTENTE, to: [b.a], subject: b.oggetto, text: b.testo };
  if (RISPONDI_A) body.reply_to = RISPONDI_A;
  if (b.allegato) body.attachments = [{ filename: path.basename(b.allegato), content: fs.readFileSync(b.allegato).toString("base64") }];
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) console.error("Resend", b.a, "→", r.status, (await r.text()).slice(0, 160));
    return r.ok;
  } catch (e) { console.error("Resend", b.a, "→", e.message); return false; }
}

const intestazione = "dominio,destinatario,verdetto,vendor,stato,quando\n";
if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, intestazione);
fs.appendFileSync(CSV, righe.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
const conteggi = righe.reduce((a, r) => { a[r[2]] = (a[r[2]] || 0) + 1; return a; }, {});
console.log(JSON.stringify({ domini: domini.length, verdetti: conteggi, bozze: righe.filter(r => r[4] !== "no_contatto" && r[4] !== "errore").length, inviate, registro: CSV }));
})();
