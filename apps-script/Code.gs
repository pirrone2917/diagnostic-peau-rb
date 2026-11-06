/**
 * Révélation Beauté — lectures de peau
 *
 * Ce script fait trois choses :
 *   1. il écrit une ligne par lecture dans l'onglet « Lectures » ;
 *   2. il envoie son ordonnance de peau à la cliente, par email ;
 *   3. il vous prévient, vous, à chaque lecture.
 *
 * Installation pas à pas : voir le README, section « Le Google Sheet ».
 * Deux lignes à remplir ci-dessous, et rien d'autre.
 */

/* ============================================================
   LES DEUX SEULES LIGNES À REMPLIR
   ============================================================ */

/** Votre adresse email : vous recevrez un message à chaque lecture.
 *  Laissez vide ('') si vous ne voulez pas être prévenu. */
var EMAIL_INSTITUT = '';

/** L'adresse du site une fois en ligne, par exemple
 *  'https://revelationbeaute.github.io/diagnostic-peau/'.
 *  Sert à afficher le monogramme dans les emails. Laissez vide tant que
 *  le site n'est pas publié : l'email reste impeccable, sans l'image. */
var URL_SITE = 'https://pirrone2917.github.io/diagnostic-peau-rb/';

/* ============================================================
   À partir d'ici, rien à modifier.
   ============================================================ */

var ONGLET_LECTURES = 'Lectures';
var ONGLET_BORD = 'Tableau de bord';

var CHARBON = '#3D3B3A';
var PARCHEMIN = '#FAF7F2';
var CREME = '#E8DDD3';
var SABLE = '#C9A87C';
var OR = '#B08D57';

var SERIF = "Georgia, 'Times New Roman', Times, serif";
var LINEAIRE = "'Helvetica Neue', Helvetica, Arial, sans-serif";

var COLONNES = [
  'Horodatage',              // A
  'Source',                  // B
  'Branche',                 // C
  'Saison',                  // D
  'Prénom',                  // E
  'Email',                   // F
  'Anniversaire',            // G
  'Réponses (codes)',        // H
  'Réponses (détail)',       // I
  'Profil',                  // J
  'Coffret recommandé',      // K
  'Code lecture',            // L
  'Consentement conseil',    // M
  'Consentement actualités', // N
  'Durée (secondes)',        // O
  'Achat (oui/non)',         // P — rempli à la main par l'accueil
  'Produit acheté',          // Q — rempli à la main par l'accueil
  'Date de rappel',          // R — calculée automatiquement
  'Ordonnance envoyée'       // S — renseignée par le script
];

var COL_CODE_LECTURE = 12; // L
var COL_RAPPEL = 18;       // R
var COL_ENVOI = 19;        // S

/* ------------------------------------------------------------ Réception */

function doPost(e) {
  // Un seul enregistrement à la fois : évite deux lignes pour la même lecture
  // quand deux envois arrivent presque en même temps.
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(20000);
    var donnees = JSON.parse(e.postData.contents);
    enregistrer(donnees);
    return reponse({ ok: true });
  } catch (erreur) {
    console.error(erreur);
    return reponse({ ok: false });
  } finally {
    try { verrou.releaseLock(); } catch (ignore) {}
  }
}

function doGet() {
  return reponse({ ok: true, service: 'Révélation Beauté — lectures de peau' });
}

function reponse(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------- Écriture */

function enregistrer(d) {
  var feuille = feuilleLectures();
  var ligne = [
    d.horodatage ? new Date(d.horodatage) : new Date(),
    d.source || '',
    d.branche === 'a' ? 'Pour elle' : (d.branche === 'b' ? 'Cadeau' : ''),
    d.saison || '',
    d.prenom || '',
    d.email || '',
    d.anniversaire || '',
    d.codes || '',
    d.reponses ? JSON.stringify(d.reponses) : '',
    d.profil || '',
    d.coffret || '',
    d.code_lecture || '',
    d.consentement_conseil ? 'oui' : 'non',
    d.consentement_actualites ? 'oui' : 'non',
    (d.duree_secondes === null || d.duree_secondes === undefined) ? '' : d.duree_secondes
  ];

  // L'application envoie deux fois la même lecture : à l'affichage du résultat,
  // puis si la cliente laisse son email. On met donc à jour la ligne existante.
  var rang = rangDuCode(feuille, d.code_lecture);
  var dejaEnvoyee = false;

  if (rang > 0) {
    dejaEnvoyee = String(feuille.getRange(rang, COL_ENVOI).getValue()).indexOf('oui') === 0;
    feuille.getRange(rang, 1, 1, ligne.length).setValues([ligne]);
  } else {
    feuille.appendRow(ligne);
    rang = feuille.getLastRow();
    poserFormuleRappel(feuille, rang);
  }

  // L'ordonnance ne part qu'une fois, et seulement si la cliente l'a demandée.
  if (!dejaEnvoyee && d.email && d.consentement_conseil && d.ordonnance) {
    var partie = envoyerOrdonnance(d);
    feuille.getRange(rang, COL_ENVOI).setValue(partie ? 'oui' : 'échec');
    if (partie) notifierInstitut(d);
  }
}

function rangDuCode(feuille, code) {
  if (!code) return 0;
  var dernier = feuille.getLastRow();
  if (dernier < 2) return 0;
  var codes = feuille.getRange(2, COL_CODE_LECTURE, dernier - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === String(code)) return i + 2;
  }
  return 0;
}

/** Six semaines après la lecture, et seulement si l'accueil a noté « oui ». */
function poserFormuleRappel(feuille, rang) {
  feuille.getRange(rang, COL_RAPPEL)
    .setFormula('=IF(LOWER($P' + rang + ')="oui",$A' + rang + '+42,"")')
    .setNumberFormat('dd/mm/yyyy');
}

/* --------------------------------------------------------- Les emails */

function envoyerOrdonnance(d) {
  try {
    MailApp.sendEmail({
      to: d.email,
      name: 'Révélation Beauté',
      subject: 'Votre ordonnance de peau — ' + (d.ordonnance.profil || 'Révélation Beauté'),
      htmlBody: htmlOrdonnance(d),
      body: texteOrdonnance(d)
    });
    return true;
  } catch (erreur) {
    console.error('Envoi impossible : ' + erreur);
    return false;
  }
}

function notifierInstitut(d) {
  if (!EMAIL_INSTITUT) return;
  var o = d.ordonnance;
  var lignes = [
    'Nouvelle lecture de peau.',
    '',
    'Prénom      : ' + (d.prenom || '—'),
    'Email       : ' + (d.email || '—'),
    'Profil      : ' + (o.profil || '—'),
    'Coffret     : ' + (o.coffret ? o.coffret.nom + ' — ' + o.coffret.prix : 'duo de soins'),
    'Code        : ' + (d.code_lecture || '—'),
    'Provenance  : ' + (d.source || '—'),
    'Actualités  : ' + (d.consentement_actualites ? 'oui' : 'non'),
    '',
    'Elle vient de recevoir son ordonnance par email.',
    'Le détail est dans l’onglet « Lectures » du Google Sheet.'
  ];
  try {
    MailApp.sendEmail({
      to: EMAIL_INSTITUT,
      name: 'Lectures de peau',
      subject: (o.profil || 'Lecture') + ' — ' + (d.prenom || 'sans prénom') + ' — ' + (d.code_lecture || ''),
      body: lignes.join('\n')
    });
  } catch (erreur) {
    console.error('Notification impossible : ' + erreur);
  }
}

/* ------------------------------------------------- L'ordonnance en HTML */

function htmlOrdonnance(d) {
  var o = d.ordonnance;
  var mots = o.intitules || {};
  var h = [];

  h.push('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  h.push('<title>Votre ordonnance de peau</title></head>');
  h.push('<body style="margin:0;padding:0;background:' + PARCHEMIN + ';">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + PARCHEMIN + ';">');
  h.push('<tr><td align="center" style="padding:28px 14px 36px;">');
  h.push('<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid ' + SABLE + ';">');

  /* En-tête */
  h.push('<tr><td style="padding:30px 28px 0;">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  h.push('<td align="left" valign="top">' + monogramme() + '</td>');
  h.push('<td align="right" valign="top" style="' + style(LINEAIRE, 10, CHARBON) + 'letter-spacing:2px;text-transform:uppercase;line-height:19px;">');
  h.push(echappe(mots.entete || 'Lecture de peau') + '<br>' + echappe(o.code || '') + '<br>' + echappe(o.date || ''));
  h.push('</td></tr></table>');
  h.push('<div style="border-top:1px solid ' + CREME + ';margin-top:22px;"></div>');
  h.push('</td></tr>');

  /* Corps */
  h.push('<tr><td style="padding:22px 28px 30px;">');

  if (d.prenom) {
    h.push(p(style(SERIF, 17, CHARBON) + 'font-style:italic;', 'Pour ' + echappe(d.prenom)));
  }
  h.push('<h1 style="' + style(SERIF, 32, CHARBON) + 'font-weight:normal;line-height:1.15;margin:14px 0 0;">'
    + echappe(o.profil || '') + '</h1>');
  h.push(filet());

  if (o.peau_dit) {
    h.push(etiquette(mots.peau_dit || 'Votre peau dit :'));
    h.push(p(style(SERIF, 20, CHARBON) + 'font-style:italic;line-height:1.5;',
      '« ' + echappe(o.peau_dit) + ' »'));
  }
  if (o.besoin) {
    h.push(etiquette(mots.besoin || 'Ce dont elle a besoin :'));
    h.push(p(style(SERIF, 20, CHARBON) + 'line-height:1.5;', echappe(o.besoin)));
  }

  if (o.etapes && o.etapes.length) {
    h.push(etiquette(mots.rituel || 'Votre rituel Révélation'));
    h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">');
    o.etapes.forEach(function (etape) {
      h.push('<tr><td style="border-top:1px solid ' + CREME + ';padding:14px 0;">');
      h.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>');
      h.push('<td valign="top" width="30" style="' + style(LINEAIRE, 13, CHARBON) + 'padding-right:10px;">' + etape.numero + '.</td>');
      h.push('<td valign="top">');
      h.push('<div style="' + style(LINEAIRE, 11, CHARBON) + 'letter-spacing:2px;text-transform:uppercase;">'
        + echappe(etape.titre) + '</div>');
      if (etape.note) {
        h.push('<div style="' + style(LINEAIRE, 9, CHARBON)
          + 'letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">'
          + echappe(etape.note) + '</div>');
      }
      h.push('<div style="' + style(SERIF, 17, CHARBON) + 'font-style:italic;margin-top:4px;">'
        + echappe(etape.gamme) + '</div>');
      (etape.produits || []).forEach(function (nom) {
        h.push('<div style="' + style(SERIF, 17, CHARBON) + 'line-height:1.45;margin-top:8px;">'
          + echappe(nom) + '</div>');
      });
      h.push('</td></tr></table></td></tr>');
    });
    h.push('</table>');
    h.push('<div style="border-top:1px solid ' + CREME + ';"></div>');
  }

  if (o.soin_regard) {
    h.push(etiquette(mots.soin_regard || 'Pour le regard'));
    h.push(p(style(SERIF, 17, CHARBON) + 'line-height:1.45;margin-top:8px;', echappe(o.soin_regard)));
  }

  (o.notes || []).forEach(function (note) {
    h.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>');
    h.push('<td width="2" style="background:' + SABLE + ';"></td>');
    h.push('<td style="' + style(SERIF, 17, CHARBON) + 'font-style:italic;line-height:1.55;padding-left:14px;">'
      + echappe(note) + '</td></tr></table>');
  });

  if (o.cheque_cadeau) {
    h.push(p(style(SERIF, 17, CHARBON) + 'font-style:italic;line-height:1.55;margin-top:20px;',
      echappe(o.cheque_cadeau)));
  }

  /* Le coffret vient après le conseil, jamais avant. */
  if (o.coffret) {
    if (mots.pont_coffret) {
      h.push(p(style(SERIF, 18, CHARBON) + 'line-height:1.6;margin-top:26px;', echappe(mots.pont_coffret)));
    }
    h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:' + CREME + ';">');
    h.push('<tr><td style="padding:22px;">');
    h.push('<div style="' + style(LINEAIRE, 10, CHARBON) + 'letter-spacing:2px;text-transform:uppercase;">'
      + echappe(mots.coffret || 'Votre coffret de Noël') + '</div>');
    h.push('<div style="' + style(SERIF, 25, CHARBON) + 'line-height:1.2;margin-top:8px;">'
      + echappe(o.coffret.nom) + '</div>');
    h.push('<div style="' + style(LINEAIRE, 16, CHARBON) + 'letter-spacing:1px;margin-top:10px;">'
      + echappe(o.coffret.prix)
      + (o.coffret.valeur_reelle
        ? ' <span style="' + style(SERIF, 16, CHARBON) + 'font-style:italic;">au lieu de '
          + echappe(o.coffret.valeur_reelle) + '</span>'
        : '')
      + '</div>');
    if (o.coffret.lien_rituel) {
      h.push('<div style="' + style(SERIF, 17, CHARBON) + 'line-height:1.55;margin-top:12px;">'
        + echappe(o.coffret.lien_rituel) + '</div>');
    }
    (o.coffret.contenu || []).forEach(function (ligne) {
      h.push('<div style="' + style(SERIF, 16, CHARBON) + 'line-height:1.5;padding:7px 0;border-top:1px solid '
        + PARCHEMIN + ';">' + echappe(ligne) + '</div>');
    });
    h.push('</td></tr></table>');
  } else if (o.duo && o.duo.length) {
    h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;background:' + CREME + ';">');
    h.push('<tr><td style="padding:22px;">');
    h.push('<div style="' + style(LINEAIRE, 10, CHARBON) + 'letter-spacing:2px;text-transform:uppercase;">'
      + echappe(mots.duo || 'Votre duo de soins') + '</div>');
    o.duo.forEach(function (nom) {
      h.push('<div style="' + style(SERIF, 17, CHARBON) + 'line-height:1.45;margin-top:12px;">'
        + echappe(nom) + '</div>');
    });
    h.push('</td></tr></table>');
  }

  h.push(p(style(LINEAIRE, 9, CHARBON) + 'letter-spacing:2px;text-transform:uppercase;margin-top:26px;',
    echappe(o.mention_marque || mots.mention_marque || '')));
  h.push('<div style="border-top:1px solid ' + CREME + ';margin-top:20px;"></div>');
  h.push(p(style(SERIF, 18, CHARBON) + 'font-style:italic;margin-top:18px;',
    echappe(mots.signature || 'L’équipe Révélation Beauté')));

  h.push('</td></tr>');

  /* Pied Charbon */
  var appel = o.appel_action || {};
  h.push('<tr><td style="background:' + CHARBON + ';padding:28px;">');
  h.push('<div style="' + style(SERIF, 24, PARCHEMIN) + 'line-height:1.22;">'
    + echappe(appel.titre || 'Présentez cet email à l’accueil.') + '</div>');
  h.push('<div style="' + style(SERIF, 17, PARCHEMIN) + 'line-height:1.55;margin-top:10px;">'
    + echappe(appel.texte || '') + '</div>');
  h.push('<div style="' + style(LINEAIRE, 10, PARCHEMIN) + 'letter-spacing:2px;text-transform:uppercase;margin-top:22px;">Lecture n°</div>');
  h.push('<div style="' + style(LINEAIRE, 25, OR) + 'letter-spacing:2px;margin-top:6px;">'
    + echappe(o.code || '') + '</div>');
  h.push('</td></tr>');

  var institut = o.institut || {};
  h.push('<tr><td style="background:' + CHARBON + ';padding:0 28px 28px;">');
  h.push('<div style="border-top:1px solid ' + OR + ';padding-top:18px;' + style(LINEAIRE, 10, PARCHEMIN)
    + 'letter-spacing:2px;text-transform:uppercase;line-height:19px;">'
    + echappe(institut.nom || 'Révélation Beauté') + '<br>'
    + echappe(institut.adresse || '') + '</div>');
  h.push('<div style="' + style(LINEAIRE, 10, OR) + 'letter-spacing:3px;text-transform:uppercase;margin-top:14px;">Depuis '
    + echappe(institut.depuis || '2005') + '</div>');
  h.push('</td></tr>');

  h.push('</table></td></tr></table></body></html>');
  return h.join('\n');
}

/** Version texte, pour les boîtes mail qui n'affichent pas le HTML. */
function texteOrdonnance(d) {
  var o = d.ordonnance;
  var l = [];
  l.push('RÉVÉLATION BEAUTÉ — LECTURE DE PEAU');
  l.push(o.code + ' — ' + o.date);
  l.push('');
  if (d.prenom) l.push('Pour ' + d.prenom);
  l.push(o.profil);
  l.push('');
  if (o.peau_dit) l.push('Votre peau dit : « ' + o.peau_dit + ' »');
  if (o.besoin) l.push('Ce dont elle a besoin : ' + o.besoin);
  l.push('');
  (o.etapes || []).forEach(function (e) {
    l.push(e.numero + '. ' + e.titre.toUpperCase() + ' — ' + e.gamme);
    (e.produits || []).forEach(function (n) { l.push('   ' + n); });
  });
  if (o.soin_regard) { l.push(''); l.push('Pour le regard : ' + o.soin_regard); }
  (o.notes || []).forEach(function (n) { l.push(''); l.push(n); });
  if (o.coffret) {
    l.push('');
    l.push(o.coffret.nom + ' — ' + o.coffret.prix
      + (o.coffret.valeur_reelle ? ' au lieu de ' + o.coffret.valeur_reelle : ''));
    (o.coffret.contenu || []).forEach(function (c) { l.push('   ' + c); });
  } else if (o.duo && o.duo.length) {
    l.push('');
    l.push('Votre duo de soins :');
    o.duo.forEach(function (n) { l.push('   ' + n); });
  }
  l.push('');
  l.push('Présentez cet email à l’accueil. Lecture n° ' + o.code);
  l.push((o.institut && o.institut.nom) || 'Révélation Beauté');
  if (o.institut && o.institut.adresse) l.push(o.institut.adresse);
  return l.join('\n');
}

/* ------------------------------------------------------ Petits morceaux */

function style(police, taille, couleur) {
  return 'font-family:' + police + ';font-size:' + taille + 'px;color:' + couleur + ';';
}

function p(styles, contenu) {
  return '<div style="' + styles + 'margin-top:8px;">' + contenu + '</div>';
}

function etiquette(texte) {
  return '<div style="' + style(LINEAIRE, 10, CHARBON)
    + 'letter-spacing:2px;text-transform:uppercase;margin-top:26px;">' + echappe(texte) + '</div>';
}

function filet() {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">'
    + '<tr><td width="56" height="1" style="background:' + SABLE + ';font-size:0;line-height:0;">&nbsp;</td></tr></table>';
}

function monogramme() {
  if (!URL_SITE) {
    return '<span style="' + style(LINEAIRE, 11, CHARBON)
      + 'letter-spacing:3px;text-transform:uppercase;">Révélation Beauté</span>';
  }
  var base = URL_SITE.charAt(URL_SITE.length - 1) === '/' ? URL_SITE : URL_SITE + '/';
  return '<img src="' + base + 'assets/logo/rb-monogramme-charbon.png" width="52" alt="Révélation Beauté"'
    + ' style="display:block;border:0;width:52px;height:auto;">';
}

function echappe(texte) {
  return String(texte === null || texte === undefined ? '' : texte)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------ Onglets */

function feuilleLectures() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(ONGLET_LECTURES);

  if (!feuille) feuille = classeur.insertSheet(ONGLET_LECTURES);
  if (feuille.getLastRow() === 0) {
    feuille.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES])
      .setFontWeight('bold').setBackground(CREME);
    feuille.setFrozenRows(1);
    feuille.setColumnWidth(1, 150);
    feuille.setColumnWidth(9, 220);
    feuille.getRange('A:A').setNumberFormat('dd/mm/yyyy HH:mm');
  }
  return feuille;
}

/**
 * À lancer une fois, à la main, depuis l'éditeur Apps Script :
 * crée l'onglet « Tableau de bord ». Les chiffres se mettent à jour seuls ensuite.
 */
function creerTableauDeBord() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  feuilleLectures();

  var feuille = classeur.getSheetByName(ONGLET_BORD);
  if (feuille) classeur.deleteSheet(feuille);
  feuille = classeur.insertSheet(ONGLET_BORD, 0);

  var L = ONGLET_LECTURES;

  feuille.getRange('A1').setValue('TABLEAU DE BORD — LECTURES DE PEAU').setFontWeight('bold').setFontSize(13);
  feuille.getRange('A2').setValue('Les chiffres se recalculent seuls à chaque nouvelle lecture.').setFontStyle('italic');

  var resume = [
    ['Lectures enregistrées', '=COUNTA(\'' + L + '\'!A2:A)'],
    ['Lectures avec email', '=COUNTIF(\'' + L + '\'!F2:F,"?*")'],
    ['Achats notés par l\'accueil', '=COUNTIF(\'' + L + '\'!P2:P,"oui")'],
    ['Taux d\'achat global', '=IF(B4=0,"",B6/B4)']
  ];
  feuille.getRange(4, 1, resume.length, 1).setValues(resume.map(function (r) { return [r[0]]; }));
  feuille.getRange(4, 2, resume.length, 1).setFormulas(resume.map(function (r) { return [r[1]]; }));
  feuille.getRange('B7').setNumberFormat('0.0%');

  feuille.getRange('A10').setValue('LECTURES PAR SOURCE').setFontWeight('bold');
  feuille.getRange('A11').setFormula(
    '=IFERROR(QUERY(\'' + L + '\'!B2:B,"select B, count(B) where B is not null group by B order by count(B) desc label B \'Source\', count(B) \'Lectures\'",0),"Aucune lecture pour l\'instant")');

  feuille.getRange('D10').setValue('LECTURES PAR PROFIL').setFontWeight('bold');
  feuille.getRange('D11').setFormula(
    '=IFERROR(QUERY(\'' + L + '\'!J2:J,"select J, count(J) where J is not null group by J order by count(J) desc label J \'Profil\', count(J) \'Lectures\'",0),"Aucune lecture pour l\'instant")');

  feuille.getRange('A22').setValue('TAUX D\'ACHAT PAR PROFIL').setFontWeight('bold');
  feuille.getRange(23, 1, 1, 4).setValues([['Profil', 'Lectures', 'Achats', 'Taux d\'achat']]).setFontWeight('bold');
  feuille.getRange('A24').setFormula(
    '=IFERROR(UNIQUE(FILTER(\'' + L + '\'!J2:J,\'' + L + '\'!J2:J<>"")),"")');
  feuille.getRange('B24').setFormula(
    '=ARRAYFORMULA(IF(A24:A="","",COUNTIF(\'' + L + '\'!J2:J,A24:A)))');
  feuille.getRange('C24').setFormula(
    '=ARRAYFORMULA(IF(A24:A="","",COUNTIFS(\'' + L + '\'!J2:J,A24:A,\'' + L + '\'!P2:P,"oui")))');
  feuille.getRange('D24').setFormula(
    '=ARRAYFORMULA(IF(A24:A="","",IF(B24:B=0,"",C24:C/B24:B))) ');
  feuille.getRange('D24:D').setNumberFormat('0.0%');

  feuille.setColumnWidth(1, 220);
  feuille.setColumnWidth(2, 110);
  feuille.setColumnWidth(3, 110);
  feuille.setColumnWidth(4, 120);
  feuille.getRange('A1:F2').setBackground(PARCHEMIN);

  SpreadsheetApp.getUi().alert('Le tableau de bord est prêt.');
}

/**
 * S'envoie à vous-même un exemple d'ordonnance, pour voir l'email
 * sans attendre une vraie cliente. Remplissez EMAIL_INSTITUT d'abord.
 */
function envoyerUnExemple() {
  if (!EMAIL_INSTITUT) {
    SpreadsheetApp.getUi().alert('Remplissez d’abord EMAIL_INSTITUT en haut du script.');
    return;
  }
  var feuille = feuilleLectures();
  var dernier = feuille.getLastRow();
  if (dernier < 2) {
    SpreadsheetApp.getUi().alert('Aucune lecture enregistrée pour l’instant : faites-en une sur le site.');
    return;
  }
  SpreadsheetApp.getUi().alert(
    'Pour voir l’email, faites une lecture sur le site en indiquant votre propre adresse : '
    + 'vous la recevrez comme une cliente.');
}

/** Remet les formules de rappel sur toutes les lignes. */
function reparerFormulesRappel() {
  var feuille = feuilleLectures();
  for (var rang = 2; rang <= feuille.getLastRow(); rang++) poserFormuleRappel(feuille, rang);
}
