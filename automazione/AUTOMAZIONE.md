# Automazione completa · Check trasparenza AI Act

Nessuna persona esterna: niente avvocati, partner, verifiche a mano. La macchina trova i siti, apre la chat, fotografa, giudica, scrive al prospect, incassa, consegna il fascicolo e ricontrolla. Il prodotto diventa una **verifica tecnica automatica**, venduta a prezzo basso e in volume, non una consulenza.

## Il flusso

```
prospetti.txt ──▶ verifica.js ──▶ pipeline.js ──▶ mail con screenshot (Resend) ──▶ link di ordine
                 (Chrome headless:                                                   │
                  cookie, chat, primo                                                ▼
                  messaggio, giudizio,                                        Stripe Payment Link
                  screenshot desktop+mobile)                                         │ webhook
                                                                                     ▼
clienti.csv ◀── audit.yml (GitHub Actions) ◀── stripe-webhook/worker.js (Cloudflare) ◀┘
     │               verifica.js → fascicolo.js → consegna.js → PDF via email al cliente
     ▼
ricontrollo.yml: ogni 1° del mese + 2 dicembre + 2 febbraio → ricontrollo.js → nuovo fascicolo solo se cambia
```

## I pezzi

| File | Cosa fa | Sostituisce |
|---|---|---|
| `verifica.js` | Apre il sito con Chrome, rifiuta i cookie, trova e apre la chat (selettori noti + euristica sugli elementi fissi in basso), legge il primo messaggio, giudica, screenshot desktop e 375 px. 3 siti in parallelo, circa 40 s a sito | la persona che apre la chat dal telefono |
| `fascicolo.js` | Da `esito.json` genera il fascicolo HTML e PDF: rilievi, priorità, correzioni, testi di avviso, prove | chi scrive il report |
| `pipeline.js` | Lista → verifica → bozze mail con screenshot allegato per chi è scoperto → invio via Resend con `--invia` → `pipeline.csv` | il venditore |
| `consegna.js` | Verifica + fascicolo + mail al cliente con PDF | la consegna |
| `ricontrollo.js` | Riverifica i clienti, confronta con lo storico, manda il nuovo fascicolo solo se cambia | il canone a mano |
| `.github/workflows/audit.yml` | Parte da un ordine Stripe (repository_dispatch) o a mano; consegna in 3-5 minuti | la settimana di lavoro |
| `.github/workflows/ricontrollo.yml` | Cron mensile e alle scadenze normative | il ricontrollo |
| `.github/workflows/prospezione.yml` | Ogni lunedì verifica `prospetti.txt` e manda le mail | l'outbound settimanale |
| `stripe-webhook/worker.js` | Cloudflare Worker: pagamento Stripe → avvio dell'audit su GitHub | l'ordine a mano |

## Esiti dello scanner

| Verdetto | Significato | Si scrive al prospect? |
|---|---|---|
| `scoperto` | il bot saluta e non dice di essere un'AI | sì |
| `al_limite` | si presenta come «assistente virtuale/digitale» senza dire AI | sì |
| `nessun_messaggio` | la chat si apre vuota | sì, con tono di domanda |
| `in_regola` | dichiara l'AI al primo contatto | no |
| `chat_umana_o_modulo` | operatori, orari, modulo pre-chat: l'art. 50 può non applicarsi | no |
| `da_verificare`, `pannello_non_chat` | testo non classificabile o pannello sbagliato | no |
| `vendor_senza_widget` | codice del vendor presente, widget non attivato in automatico | no (lista separata) |
| `chat_non_trovata` | nessuna chat in home | no |

## Prove fatte l'11 ottobre 2026

- I 3 casi verificati a mano il giorno prima: Spiagge.it `in_regola` con il messaggio esatto; Yoyomove `scoperto` (chat aperta, «Consulente Yoyomove... lasciaci il tuo numero», fornitore Aimage); The Double F `vendor_senza_widget` (HubSpot non carica il widget in headless).
- Lotto di 25 siti grandi: 5 in regola (Spiagge.it, Yves Rocher su indigo.ai, Leasys su Userbot, Cup Solidale, Pinalli su Heres), 1 scoperto (Yoyomove), 5 chat con operatori o modulo (Mondo Convenienza, OVS, Illumia, Eataly, Veratour), 6 con codice del vendor ma widget non attivato (Zendesk, HubSpot, Kommunicate), 6 senza chat in home, 2 da completare. Circa 40 secondi a sito, 3 in parallelo.
- Consegna completa provata davvero: `consegna.js --invia` su Yoyomove ha verificato, generato il PDF (4 rilievi) e mandato la mail con allegato tramite Resend, risposta 200, in meno di 2 minuti.
- Pipeline di prospezione in modalità bozza sui 25: 2 bozze pronte con screenshot (Yoyomove, Santander Consumer), nessun invio.

## Limiti onesti

- I widget che si attivano solo dopo il consenso ai cookie o in pagine interne (HubSpot, alcuni Zendesk) non si aprono: finiscono in `vendor_senza_widget`. Si recupera in parte passando pagine interne (es. `/contatti`) nella lista.
- Il giudizio è a regole, non a modello: è deterministico e spiegabile nel fascicolo. Un modello (Claude) può essere aggiunto per i casi `da_verificare`, con chiave API.
- La voce (centralino con AI) non è coperta: serve un account Twilio e la trascrizione (la chiave ElevenLabs Speech-to-Text già presente va bene). Da aggiungere quando c'è il primo cliente che lo chiede.
- Il fascicolo è una verifica tecnica, non un parere legale, e lo dice. Nessun avvocato nel flusso: il prezzo deve essere coerente con questo.

## Prezzo coerente con l'automazione

| Voce | Prezzo | Costo marginale |
|---|---|---|
| Audit automatico (fascicolo PDF in 5 minuti) | 290 € | ~0,05 € di GitHub Actions + Resend |
| Ricontrollo alle scadenze normative + mensile, 12 mesi | 190 €/anno | ~0,60 € |
| Pacchetto audit + 12 mesi | 390 € | — |

Con 1.500-2.000 aziende target e un prodotto che costa zero da erogare, 100 ordini l'anno fanno 29-39 mila euro con margine quasi pieno. La prospezione automatica a 60 siti a settimana costa solo i limiti di invio di Resend.

## Cosa serve una volta sola (account tuoi, 1 ora)

1. **Repo**: copiare la cartella `automazione/` nel repo `check-ai-act` (cartella `automazione`, con `.github/workflows` alla radice del repo) e fare push.
2. **Resend**: verificare un dominio (es. `audit.tuodominio.it`); secrets GitHub `RESEND_API_KEY`, `MITTENTE`, `RISPONDI_A`. Senza dominio verificato Resend manda solo al tuo indirizzo.
3. **Stripe**: un Payment Link da 290 € e uno da 390 € con due campi personalizzati `sito` e `azienda`; il link va in `LINK_STRIPE` dentro `index.html` e nel secret `LINK_ORDINE`.
4. **Cloudflare**: `cd stripe-webhook && npx wrangler deploy`, poi `wrangler secret put` per `STRIPE_WEBHOOK_SECRET`, `GITHUB_TOKEN` (fine-grained, repo `check-ai-act`, permessi Contents e Actions), `GITHUB_REPO`. In Stripe: webhook `checkout.session.completed` verso l'URL del worker.
5. **Prospezione**: `prospetti.txt` con i domini (lo scanner statico `scansiona.js` ne produce 60 a settimana), `contatti.csv` opzionale (dominio,email,nome,azienda). Secret `PROSPEZIONE_INVIA=1` quando si vuole che le mail partano davvero.

Da quel momento: ordine → fascicolo in 5 minuti; ogni lunedì mail ai nuovi scoperti; ogni mese e alle scadenze ricontrollo dei clienti. Zero persone.

## Comandi locali

```bash
cd automazione
node verifica.js yoyomove.com spiagge.it            # verifica dal vivo
node fascicolo.js yoyomove.com --azienda "Yoyomove"   # fascicolo HTML + PDF
node pipeline.js --lista lotto.txt                    # bozze mail (senza invio)
node consegna.js --dominio yoyomove.com --email tu@esempio.it   # consegna completa (senza --invia: solo PDF)
node ricontrollo.js --clienti clienti.csv             # confronto con lo storico
```
