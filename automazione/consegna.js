#!/usr/bin/env node
// Consegna automatica di un audit ordinato: verifica -> fascicolo -> mail al cliente con PDF allegato.
// Uso: node consegna.js --dominio sito.it --email cliente@azienda.it [--azienda "Nome"] [--invia]
// Variabili: RESEND_API_KEY, MITTENTE, RISPONDI_A. Senza --invia il PDF viene solo generato.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function arg(n, d) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; }
const dominio = (arg("--dominio") || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
const email = arg("--email"); const azienda = arg("--azienda", dominio); const invia = process.argv.includes("--invia");
if (!dominio || !email) { console.error("Uso: node consegna.js --dominio sito.it --email cliente@azienda.it [--azienda Nome] [--invia]"); process.exit(1); }

let r = spawnSync("node", [path.join(__dirname, "verifica.js"), dominio], { stdio: ["ignore", "inherit", "inherit"] });
if (r.status !== 0) { console.error("verifica fallita"); process.exit(1); }
r = spawnSync("node", [path.join(__dirname, "fascicolo.js"), dominio, "--azienda", azienda], { encoding: "utf8" });
if (r.status !== 0) { console.error("fascicolo fallito", r.stderr); process.exit(1); }
const info = JSON.parse(r.stdout.trim().split("\n").pop());
const esito = JSON.parse(fs.readFileSync(path.join(__dirname, "risultati", dominio, "esito.json"), "utf8"));

const esiti = { in_regola: "in regola sul primo contatto", scoperto: "scoperto: la chat non dichiara di essere un'AI", al_limite: "al limite: etichetta generica, non basta", nessun_messaggio: "da completare: la chat non mostra un primo messaggio", chat_umana_o_modulo: "chat con operatori o modulo di contatto: art. 50 non applicabile se rispondono persone", da_verificare: "da completare: testo iniziale non classificabile", pannello_non_chat: "da completare: il pannello aperto non era la chat", vendor_senza_widget: "da completare: il widget non si è attivato in automatico", chat_non_trovata: "da completare: nessuna chat trovata in home", errore: "errore tecnico, verifica ripetuta a mano" };
const testo = `Buongiorno,

in allegato il fascicolo di verifica di trasparenza AI Act per ${azienda} (${dominio}), eseguito il ${new Date(esito.quando).toLocaleDateString("it-IT")}.

Esito: ${esiti[esito.verdetto] || esito.verdetto}.
Rilievi: ${info.rilievi}. I testi di avviso da incollare nel widget sono nella sezione 6 del fascicolo.

Quando la chat è stata corretta, rispondete a questa mail con una riga: il ricontrollo automatico produce la nuova versione del fascicolo con esito aggiornato. Un ricontrollo è comunque previsto alle scadenze del 2 dicembre 2026 e del 2 febbraio 2027.

Check AI Act
Questa è una verifica tecnica di conformità, non un parere legale.`;

if (!invia) { console.log(JSON.stringify({ ...info, email, inviato: false })); process.exit(0); }
const key = process.env.RESEND_API_KEY; if (!key) { console.error("RESEND_API_KEY mancante"); process.exit(1); }
const body = { from: process.env.MITTENTE || "onboarding@resend.dev", to: [email], subject: `Fascicolo di verifica AI Act · ${azienda}`, text: testo, attachments: [{ filename: path.basename(info.pdf || info.html), content: fs.readFileSync(info.pdf || info.html).toString("base64") }] };
if (process.env.RISPONDI_A) body.reply_to = process.env.RISPONDI_A;
fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async r => { const t = await r.text(); console.log(JSON.stringify({ ...info, email, inviato: r.ok, http: r.status, risposta: r.ok ? undefined : t.slice(0, 200) })); process.exit(r.ok ? 0 : 1); })
  .catch(e => { console.error("invio fallito:", e.message); process.exit(1); });
