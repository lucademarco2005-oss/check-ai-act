/**
 * CHECK AI ACT: salva le richieste di audit su un Google Foglio.
 *
 * Installazione (una volta sola):
 * 1. Crea un Google Foglio vuoto, copia l'ID dall'URL e incollalo in SHEET_ID.
 * 2. Menu Estensioni > Apps Script, cancella il codice di esempio e incolla questo file.
 * 3. Distribuisci > Nuova distribuzione > App web. Esegui come: me. Chi ha accesso: chiunque.
 * 4. Autorizza, copia l'URL che finisce con /exec e incollalo in index.html nella riga  var ENDPOINT = "";
 */

var SHEET_ID = '';
var NOTIFICA_EMAIL = ''; // opzionale: un'email per ricevere un avviso a ogni richiesta

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Data', 'Nome', 'Azienda', 'Email', 'Telefono', 'Sito', 'Note', 'Esito check', 'Privacy', 'Fonte']);
    }
    var c = {};
    try { c = JSON.parse(d.check || '{}'); } catch (err) {}
    var esito = c.applicabili
      ? (c.coperti + '/' + c.applicabili + ' coperti, ' + c.scoperti + ' scoperti, ' + c.daVerificare + ' da verificare')
      : '';
    sheet.appendRow([
      new Date(),
      d.nome || '',
      d.azienda || '',
      d.email || '',
      "'" + (d.telefono || ''),
      d.sito || '',
      d.note || '',
      esito,
      d.privacy || '',
      d.fonte || ''
    ]);
    if (NOTIFICA_EMAIL) {
      MailApp.sendEmail(
        NOTIFICA_EMAIL,
        'Richiesta audit AI Act: ' + (d.azienda || d.nome || ''),
        'Nome: ' + d.nome + '\nAzienda: ' + d.azienda + '\nEmail: ' + d.email + '\nTelefono: ' + d.telefono +
        '\nSito: ' + d.sito + '\nNote: ' + d.note + '\nEsito check: ' + esito
      );
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, errore: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('CHECK AI ACT endpoint attivo');
}
