# Check trasparenza AI Act

Dal 2 agosto 2026 chi usa chatbot, voicebot o contenuti generati con AI verso clienti e pubblico deve dirlo (Regolamento UE 2024/1689, art. 50). Sanzioni fino a 15 M€ o 3% del fatturato (per le PMI il minore dei due). Business case completo in `reports/`. È l'idea numero uno del report Idea Radar 2026-W38.

## Cosa si vende

| | Prezzo | Cosa include |
|---|---|---|
| Audit automatico (vedi `automazione/`) | 290 € | Fascicolo PDF in 5 minuti: chat aperta da desktop e telefono, primo messaggio letto, rilievi, testi da incollare, screenshot datati. |
| Audit con verifica umana | 1.500 € fisso | Prova del bot dal vivo (desktop e telefono), controllo dei contenuti pubblicati, fascicolo con screenshot datati, correzioni e testi di avviso già scritti. Consegna in 5 giorni lavorativi. |
| Ricontrollo | 150 €/mese | Nuova verifica a ogni modifica del bot e a ogni cambio di regole. Disdetta libera. |

I prezzi sono costanti in cima a `index.html`: si cambiano in due righe.

## Cosa c'è

- `automazione/`: **la versione senza persone**. Scanner dal vivo con Chrome headless (apre la chat, legge il primo messaggio, giudica, screenshot), fascicolo generato in automatico, pipeline di contatto con invio via Resend, consegna automatica dopo pagamento Stripe, ricontrollo mensile. Tutto in `automazione/AUTOMAZIONE.md`.

- `index.html`: pagina pubblica. 12 domande, semaforo, elenco di cosa manca con l'articolo di riferimento e cosa fare, report stampabile, modulo di richiesta audit.
- `scansiona.js`: primo passaggio dell'audit. Dato un sito, trova i widget di chat noti, cerca gli avvisi "sei con un'AI" nel testo e nell'informativa privacy, dice cosa provare dal vivo.
- `google-apps-script.gs`: salva le richieste del modulo su un Google Foglio.
- `lista-primi-contatti.md`: 76 siti scansionati, 17 con chat e senza avviso (non nel repo pubblico).
- `mail-primo-contatto.md`: mail e follow-up per chi è scoperto (non nel repo pubblico).
- `partner-canale.md`: i fornitori di chatbot italiani con i loro clienti dichiarati, e la mail per proporgli l'audit da rivendere.
- `presentazione/`: pacchetto per la decisione del CEO. `LEGGIMI.md` (indice e cosa è stato fatto), `presentazione.html` e `.pdf` (11 slide), `audio/presentazione.mp3` (la presentazione raccontata), `audio-testo.md`.
- `fascicolo/`: il prodotto consegnato. Fascicolo di verifica su Yoyomove (HTML + PDF): sintesi, perimetro, riferimenti, prove con screenshot, rilievi con priorità e correzione, testi di avviso pronti da incollare, piano di chiusura. Per un nuovo cliente si copia l'HTML, si cambiano i campi e si stampa in PDF con Chrome.
- `verifiche-dal-vivo.md` e `prove/`: chat provate a mano con screenshot datato. Yoyomove e The Double F scoperti, Spiagge.it in regola.

## Online

Pagina pubblicata: https://lucademarco2005-oss.github.io/check-ai-act/ (repo `lucademarco2005-oss/check-ai-act`).

Restano da fare:

1. Google Foglio nuovo, incolla `google-apps-script.gs` in Estensioni > Apps Script, distribuisci come app web, copia l'URL `/exec` in `ENDPOINT` dentro `index.html`.
2. In `index.html` metti anche `WA_NUMBER` (numero WhatsApp di chi vende).
3. Ripubblicare con `git push` sul repo.

## Per fare un audit

```bash
node scansiona.js https://www.sito-del-cliente.it
```

Poi apri il sito da un telefono vero, scrivi al bot e chiama il centralino. Lo screenshot del primo messaggio, con data, va nel fascicolo.

## A chi venderlo

- Aziende italiane da 50 a 500 dipendenti con un chatbot o un voicebot in produzione: responsabile customer care, e-commerce, marketing.
- Agenzie e software house che installano chatbot: fanno l'audit sui propri clienti e rivendono il ricontrollo.
- Lo scanner serve per l'outbound: si scansionano 50 siti con chat, si scrive solo a chi non mostra l'avviso.

## Riferimenti

- [AI Act: la checklist per le organizzazioni dal 2 agosto 2026](https://www.noze.it/insights/ai-act-checklist-obblighi-agosto-2026/)
- [AI Act, obblighi di trasparenza operativi per chatbot e contenuti generati dall'IA](https://www.fiscal-focus.it/news-24/ore-17-43-ai-act-obblighi-di-trasparenza-operativi-per-chatbot-e-contenuti-generati-dall-ia,3,187282)
- [Chi usa l'AI deve dirlo chiaro, la sanzione è molto cara](https://www.tomshw.it/business/chi-usa-lai-deve-dirlo-chiaro-la-sanzione-e-molto-cara)
- [AI Act, dal 2 agosto 2026 gli obblighi di trasparenza per i chatbot](https://www.milanofinanza.it/news/ai-act-dal-2-agosto-2026-entrano-in-vigore-gli-obblighi-di-trasparenza-per-i-chatbot-ecco-cosa-202607311152178104)
