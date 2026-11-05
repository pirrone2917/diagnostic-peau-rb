/*
 * Aperçu de l'ordonnance envoyée par email — Révélation Beauté
 *
 *   node tools/apercu-email.js
 *   node tools/apercu-email.js teint_terne
 *   node tools/apercu-email.js cadeau
 *
 * Écrit tools/apercu-ordonnance.html, à ouvrir dans un navigateur.
 *
 * L'aperçu n'est pas une maquette : il appelle la fonction htmlOrdonnance
 * de apps-script/Code.gs, exactement celle qui composera les vrais emails.
 * Ce que vous voyez est donc ce que la cliente recevra.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var racine = path.join(__dirname, '..');
var moteur = require(path.join(racine, 'js', 'moteur.js'));
var diagnostic = lire('data/diagnostic.json');
var produits = lire('data/produits.json');
var config = lire('data/config.json');

function lire(chemin) {
  return JSON.parse(fs.readFileSync(path.join(racine, chemin), 'utf8'));
}

/* --------------------------------------------------- Les cas d'exemple */

var CAS = {
  teint_terne: {
    titre: 'Teint terne, regard fatigué, sensibilité ponctuelle',
    branche: 'a', codes: ['R1', 'S1', 'H0', 'P_ECLAT', 'Y1'], prenom: 'Claire'
  },
  peau_reactive: {
    titre: 'Peau réactive (pas de coffret : duo de soins)',
    branche: 'a', codes: ['R2', 'S1', 'H1', 'P_AUCUN', 'Y0'], prenom: 'Sophie'
  },
  peau_assoiffee: {
    titre: 'Peau assoiffée, regard fatigué',
    branche: 'a', codes: ['R0', 'S0', 'H2', 'P_AUCUN', 'Y1'], prenom: 'Nathalie'
  },
  rides: {
    titre: 'Rides installées',
    branche: 'a', codes: ['R0', 'S1', 'H0', 'P_RIDES', 'Y1'], prenom: 'Martine'
  },
  cadeau: {
    titre: 'Carte cadeau (branche « offrir »)',
    branche: 'b', codes: ['A_PLUS50', 'B_RIDES', 'I_LEGERE'], prenom: 'Isabelle'
  }
};

/* ----------------------------------------------- Le script Apps Script */

function chargerAppsScript() {
  var source = fs.readFileSync(path.join(racine, 'apps-script', 'Code.gs'), 'utf8');
  var bac = {
    console: console,
    // L'aperçu n'envoie rien : ces objets ne sont là que pour que le fichier se charge.
    MailApp: { sendEmail: function () {} },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return null; } },
    ContentService: { createTextOutput: function () { return { setMimeType: function () {} }; } },
    Date: Date, JSON: JSON, String: String, Number: Number
  };
  vm.createContext(bac);
  vm.runInContext(source, bac, { filename: 'Code.gs' });
  return bac;
}

/* ------------------------------------------------------------ Aperçu */

function ordonnanceDe(cas) {
  var resultat = cas.branche === 'a'
    ? moteur.profilBrancheA(cas.codes, diagnostic)
    : moteur.coffretBrancheB(cas.codes, diagnostic);

  var code = moteur.codeLecture(
    resultat && resultat.profil ? resultat.profil.code : 'RVB',
    function () { return 0.4821; }
  );

  return moteur.resumeOrdonnance({
    branche: cas.branche,
    resultat: resultat,
    diagnostic: diagnostic,
    produits: produits,
    config: config,
    code: code,
    date: new Date().toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' })
  });
}

function main() {
  var demande = process.argv[2];
  var cles = demande && CAS[demande] ? [demande] : Object.keys(CAS);
  if (demande && !CAS[demande]) {
    console.log('\nCas inconnu. Choisissez parmi : ' + Object.keys(CAS).join(', ') + '\n');
    process.exit(1);
  }

  var appsScript = chargerAppsScript();
  var morceaux = [];

  cles.forEach(function (cle) {
    var cas = CAS[cle];
    var ordonnance = ordonnanceDe(cas);
    var email = appsScript.htmlOrdonnance({
      prenom: cas.prenom,
      email: 'exemple@exemple.be',
      code_lecture: ordonnance.code,
      ordonnance: ordonnance
    });

    // On n'extrait que le corps : les aperçus sont empilés dans une seule page.
    var corps = email.slice(email.indexOf('<body'), email.indexOf('</body>'));
    corps = corps.slice(corps.indexOf('>') + 1);

    morceaux.push('<section class="cas">'
      + '<p class="titre">' + cas.titre + '</p>'
      + '<p class="objet">Objet : Votre ordonnance de peau — ' + (ordonnance.profil || '') + '</p>'
      + corps + '</section>');
    console.log('  ' + cle + '  →  ' + (ordonnance.profil || 'carte cadeau')
      + (ordonnance.coffret ? '  ·  ' + ordonnance.coffret.nom + ' ' + ordonnance.coffret.prix : '  ·  duo de soins'));
  });

  var page = [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Aperçu — l’ordonnance envoyée par email</title>',
    '<style>',
    '  body { margin:0; padding:28px 14px 60px; background:#E8DDD3;',
    '         font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }',
    '  .entete { max-width:600px; margin:0 auto 28px; color:#3D3B3A; }',
    '  .entete h1 { font-family:Georgia,serif; font-weight:normal; font-size:26px; margin:0 0 8px; }',
    '  .entete p { font-size:13px; line-height:1.6; margin:0; }',
    '  .cas { max-width:600px; margin:0 auto 40px; }',
    '  .titre { font-size:11px; letter-spacing:2px; text-transform:uppercase;',
    '           color:#3D3B3A; margin:0 0 4px; }',
    '  .objet { font-size:12px; color:#3D3B3A; opacity:.75; margin:0 0 10px; }',
    '</style></head><body>',
    '<div class="entete"><h1>L’ordonnance envoyée par email</h1>',
    '<p>Voici exactement ce que recevra la cliente qui laisse son adresse, ',
    'pour chacun des cas de figure. Cette page est générée par le script lui-même : ',
    'ce n’est pas une maquette.</p></div>',
    morceaux.join('\n'),
    '</body></html>'
  ].join('\n');

  var sortie = path.join(__dirname, 'apercu-ordonnance.html');
  fs.writeFileSync(sortie, page, 'utf8');
  console.log('\nAperçu écrit dans tools/apercu-ordonnance.html — ouvrez-le dans votre navigateur.\n');
}

main();
