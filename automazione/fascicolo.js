#!/usr/bin/env node
// Genera il fascicolo di verifica (HTML + PDF) da risultati/<dominio>/esito.json.
// Uso: node fascicolo.js dominio.it [--azienda "Nome S.r.l."] [--verificatore "Nome"]
// Output: risultati/<dominio>/fascicolo-<dominio>-<data>.html e .pdf
// Nessun intervento umano: rilievi, priorità, correzioni e testi di avviso derivano dall'esito.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");

function arg(nome, def) { const i = process.argv.indexOf(nome); return i > -1 ? process.argv[i + 1] : def; }
const dominio = process.argv[2];
if (!dominio || dominio.startsWith("--")) { console.error("Uso: node fascicolo.js dominio.it [--azienda ...] [--verificatore ...]"); process.exit(1); }
const host = dominio.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
const dir = path.join(__dirname, "risultati", host);
const esito = JSON.parse(fs.readFileSync(path.join(dir, "esito.json"), "utf8"));
const azienda = arg("--azienda", host);
const verificatore = arg("--verificatore", "Check AI Act · verifica automatica");
const data = new Date(esito.quando);
const dataIt = data.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) + ", ore " + data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const vendor = esito.vendor.length ? esito.vendor.join(", ") : "non identificato dall'HTML";
const umano = c => String(c || "").replace(/rifiutato: #?[\w-]+/i, "cookie non necessari rifiutati").replace(/rifiutato: (.+?)(?= ·|$)/i, "cookie non necessari rifiutati («$1»)").replace("nessun banner o nessun bottone di rifiuto", "nessun banner cookie").replace("seconda passata: cookie accettati", "seconda passata con cookie accettati");
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rilievi generati dall'esito.
const rilievi = [];
const v = esito.verdetto;
const msg = esito.desktop.primo_messaggio || esito.mobile.primo_messaggio || "";
if (v === "scoperto") {
  rilievi.push({ id: "R1", testo: "Il primo messaggio della chat non informa che si tratta di un sistema automatico o di intelligenza artificiale.", rif: "Art. 50 par. 1 e 5", prio: "alta", fix: "Inserire l'avviso nel titolo della finestra e nel primo messaggio (testi in sezione 6). Va mostrato a ogni nuova conversazione." });
} else if (v === "al_limite") {
  rilievi.push({ id: "R1", testo: `La chat si presenta come «${esc(esito.desktop.prova || esito.mobile.prova)}»: lascia intendere un sistema automatico ma non dichiara l'intelligenza artificiale. Le Linee guida della Commissione (20 luglio 2026) considerano insufficienti le etichette generiche.`, rif: "Art. 50 par. 1 e 5; Linee guida Commissione 2026", prio: "alta", fix: "Sostituire con un avviso esplicito (testi in sezione 6)." });
} else if (v === "nessun_messaggio") {
  rilievi.push({ id: "R1", testo: "La chat si apre ma non mostra alcun messaggio iniziale leggibile prima che l'utente scriva: l'utente non viene informato al primo contatto.", rif: "Art. 50 par. 5", prio: "alta", fix: "Aggiungere un messaggio di benvenuto con l'avviso, visibile prima del primo input dell'utente." });
} else if (v === "chat_umana_o_modulo") {
  rilievi.push({ id: "R1", testo: "La chat risulta gestita da operatori o preceduta da un modulo di contatto. Se dietro al modulo risponde un sistema automatico, l'avviso va dato prima della prima risposta.", rif: "Art. 50 par. 1 (si applica solo se risponde un'IA)", prio: "da verificare", fix: "Confermare se le risposte in chat sono date da persone o da un sistema automatico; nel secondo caso aggiungere l'avviso nel primo messaggio." });
} else if (v === "da_verificare" || v === "pannello_non_chat") {
  rilievi.push({ id: "R1", testo: "La chat si apre ma il testo iniziale non permette di stabilire chi risponde.", rif: "Art. 50 par. 5", prio: "da verificare", fix: "Indicare il canale e un orario in cui il bot risponde; la verifica viene ripetuta." });
} else if (v === "vendor_senza_widget" || v === "chat_non_trovata") {
  rilievi.push({ id: "R1", testo: v === "vendor_senza_widget" ? `Il sito carica il codice del fornitore di chat (${esc(vendor)}) ma la verifica automatica non ha potuto aprire la finestra: il widget si attiva solo in condizioni particolari (consenso, orario, pagina).` : "La verifica automatica non ha trovato una chat sul sito.", rif: "Perimetro", prio: "da verificare", fix: "Indicare la pagina e le condizioni in cui la chat compare; la verifica viene ripetuta su quella pagina." });
}
if (/telefono|numero|email|e-mail|mail/i.test(msg) && v !== "in_regola") {
  rilievi.push({ id: "R2", testo: "La chat chiede un dato personale (telefono o email) senza chiarire chi lo riceve e a che scopo.", rif: "GDPR art. 13; Art. 50 par. 1", prio: "alta", fix: "Aggiungere accanto al campo una riga su chi ricontatta e per cosa, con link all'informativa." });
}
const mob = esito.mobile;
if (mob.chat_aperta && esito.desktop.chat_aperta && mob.giudizio !== esito.desktop.giudizio) {
  rilievi.push({ id: "R3", testo: `L'esito cambia tra desktop (${esito.desktop.giudizio}) e telefono (${mob.giudizio}): l'avviso non è coerente su tutti i dispositivi.`, rif: "Art. 50 par. 5 (chiaro e distinguibile)", prio: "media", fix: "Allineare il primo messaggio sui due layout e verificarlo su schermo da 375 px." });
}
rilievi.push({ id: "R" + (rilievi.length + 1), testo: "Non risulta, dalla verifica esterna, documentazione della formazione del personale che gestisce la chat (obbligo di alfabetizzazione).", rif: "Art. 4", prio: "da verificare", fix: "Una sessione registrata (data, partecipanti, contenuti) sul funzionamento e sui limiti dell'assistente." });
rilievi.push({ id: "R" + (rilievi.length + 1), testo: "Non risulta un registro dei sistemi di IA in uso verso clienti e pubblico, con ruoli (fornitore/deployer) e date.", rif: "Prerequisito art. 50; art. 26", prio: "da verificare", fix: "Un foglio con: strumento, fornitore, cosa fa l'IA, dove sta l'avviso, chi ne risponde." });

const n_alta = rilievi.filter(r => r.prio === "alta").length;
const titoloEsito = v === "in_regola" ? "In regola sul primo contatto" : (n_alta ? `Scoperto: ${rilievi.length} rilievi, ${n_alta} ad alta priorità` : "Da completare: verifica dal vivo richiesta");
const classeEsito = v === "in_regola" ? "ok" : (n_alta ? "bad" : "warn");
const nomeBot = (msg.match(/^([A-ZÀ-Ý][\w' ]{2,40}?)(?=\s+(Ciao|Benvenut|Hi|Hello|Salve))/) || [])[1] || "";

const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fascicolo trasparenza AI Act · ${esc(azienda)}</title>
<style>
:root{--ink:#15202b;--muted:#5b6771;--line:#d9dee4;--soft:#f1f4f8;--bad:#b3261e;--warn:#b26a00;--ok:#1c7c3f;--accent:#0b3d91}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:820px;margin:0 auto;padding:40px 24px 80px}h1{font-size:30px;line-height:1.15;margin:0 0 6px}
h2{font-size:20px;margin:36px 0 10px;padding-top:14px;border-top:2px solid var(--ink)}p{margin:0 0 10px}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:10px 0 16px;font-size:14px}th,td{border:1px solid var(--line);padding:8px 10px;vertical-align:top;text-align:left}th{background:var(--soft)}
.esito{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;color:#fff}.esito.bad{background:var(--bad)}.esito.warn{background:var(--warn)}.esito.ok{background:var(--ok)}
.box{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0;background:var(--soft)}
.testo{border-left:4px solid var(--accent);padding:10px 14px;margin:10px 0;background:#fff;border-radius:0 8px 8px 0}.testo b{display:block;margin-bottom:4px}
figure{margin:12px 0;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff}figure img{max-width:100%;max-height:440px;display:block;margin:0 auto}figcaption{font-size:13px;color:var(--muted);margin-top:8px}
.cop{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin:20px 0 10px;font-size:14px}.cop span{color:var(--muted)}
.g-alta{color:var(--bad);font-weight:700}.g-media{color:var(--warn);font-weight:700}.g-da{color:var(--muted);font-weight:700}ul{padding-left:20px}li{margin-bottom:4px}
@media print{main{padding:0}h2{break-after:avoid}figure,table,.box{break-inside:avoid}}
</style></head><body><main>
<p class="muted">Fascicolo di verifica · trasparenza AI Act (Reg. UE 2024/1689, art. 50) · verifica tecnica di conformità, non parere legale</p>
<h1>${esc(azienda)} · chat del sito</h1>
<p><span class="esito ${classeEsito}">${esc(titoloEsito)}</span></p>
<div class="cop">
<div><span>Sito</span><br>${esc(esito.url)}</div>
<div><span>Sistema verificato</span><br>Chat del sito${nomeBot ? ` «${esc(nomeBot)}»` : ""} · fornitore: ${esc(vendor)}</div>
<div><span>Data e ora della verifica</span><br>${esc(dataIt)}</div>
<div><span>Verificato da</span><br>${esc(verificatore)}</div>
<div><span>Metodo</span><br>Apertura automatica del sito con Chrome, rifiuto dei cookie non necessari, apertura della chat, lettura del primo messaggio, screenshot datati su desktop (1280 px) e telefono (375 px)</div>
<div><span>Prossimo ricontrollo</span><br>Scadenze normative: 2 dicembre 2026, 2 febbraio 2027; o a ogni modifica del bot</div>
</div>

<h2>1. In sintesi</h2>
<p>${v === "in_regola"
  ? `La chat dichiara al primo contatto di essere un sistema di intelligenza artificiale («${esc(esito.desktop.prova || esito.mobile.prova)}»). Sul punto dell'art. 50 par. 1 il sito risulta in regola; restano i punti da documentare in sezione 5.`
  : v === "chat_umana_o_modulo"
  ? `La chat del sito risulta gestita da operatori o preceduta da un modulo («${esc(esito.desktop.prova || esito.mobile.prova)}»). L'obbligo dell'art. 50 par. 1 riguarda i sistemi di intelligenza artificiale: se le risposte sono date da persone non si applica; se dietro al modulo risponde un sistema automatico, l'avviso manca.`
  : v === "scoperto" || v === "al_limite" || v === "nessun_messaggio"
  ? `Il primo messaggio della chat${nomeBot ? `, che si presenta come «${esc(nomeBot)}»,` : ""} non dice che si tratta di un sistema di intelligenza artificiale. Dal 2 agosto 2026 l'avviso è obbligatorio al primo contatto (art. 50 par. 1 e 5) e dal 23 ottobre 2026 l'ACN può ordinare l'adeguamento e pubblicare il nome del responsabile (D.Lgs. 179/2026, art. 22). La correzione è una riga di testo nel messaggio di benvenuto e nel titolo della finestra: i testi sono in sezione 6.`
  : `La verifica automatica non ha potuto aprire la chat. ${esito.vendor.length ? `Il codice del fornitore (${esc(vendor)}) è presente: il widget si attiva probabilmente solo dopo il consenso ai cookie o in certe pagine.` : "Non risulta una chat sulla home."} Indicare la pagina in cui la chat compare per completare la verifica.`}</p>
<div class="box"><b>Cosa fare, in ordine</b><ol style="margin:6px 0 0">${rilievi.filter(r => r.prio !== "da verificare").map(r => `<li>${esc(r.fix)}</li>`).join("")}<li>Salvare uno screenshot datato del nuovo primo messaggio, da desktop e da telefono: il ricontrollo automatico lo confronta con questo fascicolo.</li></ol></div>

<h2>2. Perimetro</h2>
<table><tr><th>Verificato</th><th>Come</th><th>Esito</th></tr>
<tr><td>Chat del sito, desktop 1280 px</td><td>${esc(umano(esito.desktop.cookie))}; chat: ${esito.desktop.chat_aperta ? "aperta" : "non aperta"}</td><td>${esc(esito.desktop.giudizio)}</td></tr>
<tr><td>Chat del sito, telefono 375 px</td><td>${esc(umano(esito.mobile.cookie))}; chat: ${esito.mobile.chat_aperta ? "aperta" : "non aperta"}</td><td>${esc(esito.mobile.giudizio)}</td></tr>
<tr><td>Centralino o voicebot telefonico</td><td>Non in perimetro di questa verifica</td><td>—</td></tr>
<tr><td>Contenuti generati con IA pubblicati</td><td>Non in perimetro di questa verifica</td><td>—</td></tr></table>

<h2>3. Riferimenti</h2>
<ul>
<li><b>Art. 50 par. 1</b>: i sistemi che interagiscono con persone devono far sì che queste sappiano di interagire con un'IA, salvo che sia evidente per una persona ragionevolmente informata. Applicabile dal 2 agosto 2026; il Reg. (UE) 2026/1744 non lo ha rinviato.</li>
<li><b>Art. 50 par. 5</b>: informazione chiara e distinguibile, al più tardi alla prima interazione. Linee guida della Commissione del 20 luglio 2026: non bastano i termini di servizio né un'etichetta generica come «assistente».</li>
<li><b>Art. 4</b>: alfabetizzazione del personale, dal 2 febbraio 2025.</li>
<li><b>Art. 99 par. 4 e 6</b>: fino a 15 M€ o 3% del fatturato mondiale; per le PMI il minore dei due.</li>
<li><b>D.Lgs. 179/2026, art. 15, 22, 23</b>: dal 23 ottobre 2026 l'ACN ispeziona anche senza preavviso, ordina l'adeguamento, pubblica la violazione e il responsabile.</li>
<li><b>GDPR art. 13</b>: informativa sui dati raccolti in chat.</li></ul>

<h2>4. Prove</h2>
${["desktop", "mobile"].map(k => esito[k].screenshot ? `<figure><img src="${esc(path.basename(esito[k].screenshot))}" alt="Chat ${k}"><figcaption>Prova ${k === "desktop" ? "P1" : "P2"} · ${esc(esito.url)}, ${esc(dataIt)}, ${k === "desktop" ? "desktop 1280 px" : "telefono 375 px"}. ${esito[k].primo_messaggio ? `Primo messaggio letto: «${esc(esito[k].primo_messaggio.slice(0, 300))}»` : "Nessun messaggio letto."}</figcaption></figure>` : "").join("")}

<h2>5. Rilievi</h2>
<table><tr><th>ID</th><th>Rilievo</th><th>Riferimento</th><th>Priorità</th><th>Correzione</th></tr>
${rilievi.map(r => `<tr><td>${r.id}</td><td>${r.testo}</td><td>${esc(r.rif)}</td><td class="${r.prio === "alta" ? "g-alta" : r.prio === "media" ? "g-media" : "g-da"}">${esc(r.prio)}</td><td>${esc(r.fix)}</td></tr>`).join("")}</table>

<h2>6. Testi di avviso pronti</h2>
<p class="muted">Da incollare nel widget. Uno per il titolo, uno per il primo messaggio.</p>
<div class="testo"><b>Titolo della finestra</b>Assistente automatico ${esc(azienda)}</div>
<div class="testo"><b>Primo messaggio, versione breve</b>Ciao, sono l'assistente automatico di ${esc(azienda)}: funziono con intelligenza artificiale. Posso aiutarti subito; se preferisci parlare con una persona, scrivimelo.</div>
<div class="testo"><b>Primo messaggio, versione con raccolta di un contatto</b>Ciao, sono l'assistente automatico di ${esc(azienda)} (intelligenza artificiale). Per farti richiamare da una persona del nostro team lascia qui il tuo numero: lo usiamo solo per questo contatto. Informativa privacy: [link].</div>
<div class="testo"><b>English</b>Hi, I'm ${esc(azienda)}'s automated assistant, powered by artificial intelligence. I can help you right away; to speak with a person, just say so.</div>
<div class="testo"><b>Paragrafo per l'informativa privacy</b>Sul sito è attivo un assistente automatico basato su intelligenza artificiale${esito.vendor.length ? `, fornito da ${esc(vendor)}` : ""}. Le conversazioni e i dati inseriti in chat sono trattati per rispondere alle richieste e per ricontattare l'utente, e conservati per [n] mesi. L'utente è informato della natura automatica dell'assistente all'inizio di ogni conversazione.</div>

<h2>7. Chiusura e ricontrollo</h2>
<table><tr><th>Passo</th><th>Chi</th><th>Prova da conservare</th></tr>
<tr><td>Nuovo titolo e primo messaggio pubblicati</td><td>${esc(azienda)} con il fornitore della chat</td><td>Screenshot datato da desktop e da telefono</td></tr>
<tr><td>Informativa privacy aggiornata</td><td>${esc(azienda)}</td><td>Copia della pagina con data</td></tr>
<tr><td>Formazione del personale registrata</td><td>${esc(azienda)}</td><td>Verbale con data e partecipanti</td></tr>
<tr><td>Ricontrollo automatico</td><td>Check AI Act</td><td>Nuova versione di questo fascicolo con esito «in regola»</td></tr></table>
<p class="muted">Questo fascicolo documenta una verifica tecnica, eseguita in automatico, dei testi e dei flussi visibili all'utente alla data indicata. Non è un parere legale e non copre canali non elencati nel perimetro.</p>
</main></body></html>`;

const base = `fascicolo-${host}-${esito.quando.slice(0, 10)}`;
const htmlPath = path.join(dir, base + ".html");
fs.writeFileSync(htmlPath, html);
const pdfPath = path.join(dir, base + ".pdf");
try {
  execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore", timeout: 60000 });
} catch (e) { console.error("PDF non generato (Chrome mancante?):", e.message.slice(0, 100)); }
console.log(JSON.stringify({ dominio: host, verdetto: v, rilievi: rilievi.length, html: htmlPath, pdf: fs.existsSync(pdfPath) ? pdfPath : null }));
