#!/usr/bin/env node
// Ricontrollo periodico dei clienti: riverifica ogni dominio in clienti.csv, confronta con l'ultimo esito,
// e manda la mail solo se qualcosa è cambiato (o a una scadenza normativa, con --forza).
// Uso: node ricontrollo.js [--clienti clienti.csv] [--invia] [--forza]
// clienti.csv: dominio,email,azienda

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function arg(n, d) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; }
const file = arg("--clienti", path.join(__dirname, "clienti.csv"));
const invia = process.argv.includes("--invia"), forza = process.argv.includes("--forza");
if (!fs.existsSync(file)) { console.error("manca", file); process.exit(1); }
const STORICO = path.join(__dirname, "storico"); fs.mkdirSync(STORICO, { recursive: true });

const righe = fs.readFileSync(file, "utf8").split("\n").slice(1).map(l => l.split(",").map(x => (x || "").trim())).filter(r => r[0]);
const report = [];
for (const [dominio, email, azienda] of righe) {
  const d = dominio.replace(/^www\./, "");
  const precedenteFile = path.join(STORICO, d + ".json");
  const precedente = fs.existsSync(precedenteFile) ? JSON.parse(fs.readFileSync(precedenteFile, "utf8")) : null;
  const r = spawnSync("node", [path.join(__dirname, "verifica.js"), d], { stdio: ["ignore", "ignore", "inherit"] });
  const esitoFile = path.join(__dirname, "risultati", d, "esito.json");
  if (r.status !== 0 || !fs.existsSync(esitoFile)) { report.push({ dominio: d, stato: "errore" }); continue; }
  const e = JSON.parse(fs.readFileSync(esitoFile, "utf8"));
  const firma = e.verdetto + "|" + (e.desktop.primo_messaggio || "").slice(0, 200) + "|" + (e.mobile.primo_messaggio || "").slice(0, 200);
  const cambiato = !precedente || precedente.firma !== firma;
  fs.writeFileSync(precedenteFile, JSON.stringify({ firma, verdetto: e.verdetto, quando: e.quando }, null, 2));
  let inviato = false;
  if ((cambiato || forza) && invia) {
    const c = spawnSync("node", [path.join(__dirname, "consegna.js"), "--dominio", d, "--email", email, "--azienda", azienda || d, "--invia"], { encoding: "utf8" });
    inviato = /"inviato":true/.test(c.stdout);
  }
  report.push({ dominio: d, verdetto: e.verdetto, prima: precedente ? precedente.verdetto : null, cambiato, inviato });
}
console.log(JSON.stringify(report, null, 2));
