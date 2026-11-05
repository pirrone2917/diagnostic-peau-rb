/*
 * Test de la logique de lecture de peau — Révélation Beauté
 *
 * Fait tourner TOUTES les combinaisons de réponses possibles
 * (216 pour la branche A, 24 pour la branche B) à travers le moteur réel
 * (js/moteur.js), celui-là même qui tourne dans l'application.
 *
 * Lancement :  node tools/test-logique.js
 * Écrit aussi le détail complet dans tools/resultats-logique.csv
 */
'use strict';

var fs = require('fs');
var path = require('path');

var racine = path.join(__dirname, '..');
var moteur = require(path.join(racine, 'js', 'moteur.js'));
var diagnostic = lire('data/diagnostic.json');
var produits = lire('data/produits.json');
var config = lire('data/config.json');

function lire(chemin) {
  return JSON.parse(fs.readFileSync(path.join(racine, chemin), 'utf8'));
}

/* ------------------------------------------------- Codes issus du diagnostic */

function codesDe(questionId, branche) {
  var questions = diagnostic[branche].questions;
  for (var i = 0; i < questions.length; i++) {
    if (questions[i].id === questionId) {
      return questions[i].reponses.map(function (r) { return r.code; });
    }
  }
  throw new Error('Question introuvable : ' + questionId);
}

var R = codesDe('q1_reactivite', 'branche_a');
var S = codesDe('q2_brillance', 'branche_a');
var H = codesDe('q3_hydratation', 'branche_a');
var P_SIMPLES = codesDe('q4_preoccupation', 'branche_a');

/* La question 4 accepte plusieurs réponses : on teste toutes les combinaisons.
   « Rien de particulier » se coche seul. */
var P = combinaisons(P_SIMPLES.filter(function (c) { return c !== 'P_AUCUN'; }))
  .concat([['P_AUCUN']]);

function combinaisons(codes) {
  var toutes = [];
  for (var masque = 1; masque < (1 << codes.length); masque++) {
    var lot = [];
    for (var i = 0; i < codes.length; i++) if (masque & (1 << i)) lot.push(codes[i]);
    toutes.push(lot);
  }
  return toutes;
}
var Y = codesDe('q5_regard', 'branche_a');

var AGE = codesDe('b1_age', 'branche_b');
var PEAU = codesDe('b2_peau', 'branche_b');
var INTENTION = codesDe('b3_intention', 'branche_b');

/* --------------------------------------------------------------- Branche A */

var lignesA = [];
var erreurs = [];
var reglesUtilisees = {};

R.forEach(function (r) {
  S.forEach(function (s) {
    H.forEach(function (h) {
      P.forEach(function (p) {
        Y.forEach(function (y) {
          var codes = [r, s, h].concat(p, [y]);
          var res = moteur.profilBrancheA(codes, diagnostic);

          if (!res) { erreurs.push('Aucun profil pour ' + codes.join(' ')); return; }
          reglesUtilisees[res.id] = (reglesUtilisees[res.id] || 0) + 1;

          var coffret = moteur.coffretAffichable(res.profil.coffret, produits, config);
          var etapes = moteur.rituel(res.profil, diagnostic, produits, codes, res.id);
          var regard = res.soinRegardId ? produits.produits[res.soinRegardId] : null;

          // Controles de coherence
          etapes.forEach(function (e) {
            if (e.produits.length === 0) {
              erreurs.push('Etape « ' + e.titre + ' » vide pour ' + res.profil.nom + ' (' + codes.join(' ') + ')');
            }
          });
          if (res.soinRegardId && !regard) {
            erreurs.push('Soin regard inconnu au catalogue : ' + res.soinRegardId);
          }
          if (res.profil.coffret && !produits.coffrets[res.profil.coffret]) {
            erreurs.push('Coffret inconnu au catalogue : ' + res.profil.coffret);
          }

          lignesA.push({
            codes: codes.join(' '),
            r: r, s: s, h: h, p: p.join('+'), y: y,
            profil: res.profil.nom,
            code: res.profil.code,
            bloc: coffret ? coffret.coffret.nom : diagnostic.intitules_ordonnance.duo,
            prix: coffret ? coffret.coffret.prix_eur.toFixed(2).replace('.', ',') + ' €' : '',
            regard: regard ? regard.nom : '',
            note: res.notes.length ? 'sensibilité ponctuelle' : ''
          });
        });
      });
    });
  });
});

/* --------------------------------------------------------------- Branche B */

var lignesB = [];

AGE.forEach(function (a) {
  PEAU.forEach(function (pe) {
    INTENTION.forEach(function (it) {
      var codes = [a, pe, it];
      var res = moteur.coffretBrancheB(codes, diagnostic);
      if (!res) { erreurs.push('Aucun coffret pour ' + codes.join(' ')); return; }

      var coffret = moteur.coffretAffichable(res.coffretId, produits, config);
      // Hors saison de Noël, l'absence de coffret est normale : on affiche le duo.
      if (!coffret && config.saison === 'noel') {
        erreurs.push('Coffret non affichable : ' + res.coffretId + ' (' + codes.join(' ') + ')');
      }

      lignesB.push({
        codes: codes.join(' '),
        age: a, peau: pe, intention: it,
        bloc: coffret ? coffret.coffret.nom : diagnostic.intitules_ordonnance.duo,
        prix: coffret ? coffret.coffret.prix_eur.toFixed(2).replace('.', ',') + ' €' : '',
        cheque: res.chequeCadeau ? 'oui' : ''
      });
    });
  });
});

/* ------------------------------------------------------------- Affichage */

var libelles = {};
['branche_a', 'branche_b'].forEach(function (b) {
  diagnostic[b].questions.forEach(function (q) {
    q.reponses.forEach(function (rep) { libelles[rep.code] = rep.libelle; });
  });
});

function pad(texte, largeur) {
  texte = String(texte);
  while (longueur(texte) < largeur) texte += ' ';
  return texte;
}
function longueur(texte) {
  // longueur visuelle : les accents composes ne comptent pas double
  return texte.normalize('NFC').length;
}

console.log('');
console.log('=== BRANCHE A — profil obtenu selon les questions 1 a 4 ===');
console.log('(la question 5 ne change pas le profil : elle ajoute seulement le soin regard)');
console.log('');
console.log(pad('Q1 réactivité', 14) + pad('Q2 brillance', 14) + pad('Q3 hydrat.', 12)
  + pad('rides', 8) + pad('ovale', 8) + pad('éclat', 8) + pad('aucun', 8));
console.log('-'.repeat(72));

var codesProfil = {};
Object.keys(diagnostic.profils).forEach(function (id) {
  codesProfil[id] = diagnostic.profils[id].code;
});

R.forEach(function (r) {
  S.forEach(function (s) {
    H.forEach(function (h) {
      var cellules = P_SIMPLES.map(function (p) {
        return moteur.profilBrancheA([r, s, h, p, 'Y0'], diagnostic).profil.code;
      });
      console.log(pad(r, 14) + pad(s, 14) + pad(h, 12)
        + cellules.map(function (c) { return pad(c, 8); }).join(''));
    });
  });
});

console.log('');
console.log('Légende des codes de profil :');
Object.keys(diagnostic.profils).forEach(function (id) {
  var pr = diagnostic.profils[id];
  var coffret = moteur.coffretAffichable(pr.coffret, produits, config);
  console.log('  ' + pad(pr.code, 5) + pad(pr.nom, 24)
    + pad(coffret ? coffret.coffret.nom : diagnostic.intitules_ordonnance.duo, 36)
    + (coffret ? coffret.coffret.prix_eur.toFixed(2).replace('.', ',') + ' €' : '—'));
});

console.log('');
console.log('Répartition sur les ' + lignesA.length + ' combinaisons de la branche A :');
Object.keys(reglesUtilisees).sort().forEach(function (id) {
  var pr = diagnostic.profils[id];
  var n = reglesUtilisees[id];
  var pourcent = Math.round((n / lignesA.length) * 100);
  console.log('  ' + pad(pr.nom, 24) + pad(n + ' / ' + lignesA.length, 14) + pourcent + ' %');
});

console.log('');
console.log('Soin regard ajouté si Q5 = Oui :');
Object.keys(diagnostic.profils).forEach(function (id) {
  var pr = diagnostic.profils[id];
  var regard = pr.soin_regard ? produits.produits[pr.soin_regard] : null;
  console.log('  ' + pad(pr.nom, 24) + (regard ? regard.nom : 'aucun soin regard prévu'));
});

console.log('');
console.log('=== BRANCHE B — offrir (les 24 combinaisons) ===');
console.log('');
console.log(pad('Âge', 16) + pad('Sa peau', 30) + pad('Intention', 26) + pad('Coffret', 34) + pad('Prix', 9) + 'Chèque');
console.log('-'.repeat(122));
lignesB.forEach(function (l) {
  console.log(pad(libelles[l.age], 16) + pad(libelles[l.peau], 30) + pad(libelles[l.intention], 26)
    + pad(l.bloc, 34) + pad(l.prix, 9) + l.cheque);
});

/* --------------------------------------------------------------- Fichier */

var lignesCsv = ['branche;codes;profil;bloc_affiche;prix_affiche;soin_regard;note'];
lignesA.forEach(function (l) {
  lignesCsv.push(['A', l.codes, l.profil, l.bloc, l.prix, l.regard, l.note].join(';'));
});
lignesB.forEach(function (l) {
  lignesCsv.push(['B', l.codes, '', l.bloc, l.prix, '', l.cheque ? 'chèque-cadeau proposé' : ''].join(';'));
});
fs.writeFileSync(path.join(__dirname, 'resultats-logique.csv'), lignesCsv.join('\n') + '\n', 'utf8');

/* ------------------------------------------------------------- Contrôles */

console.log('');
console.log('=== CONTRÔLES ===');
var attenduA = R.length * S.length * H.length * P.length * Y.length;
var attenduB = AGE.length * PEAU.length * INTENTION.length;
verifier('Branche A : toutes les combinaisons donnent un profil', lignesA.length === attenduA,
  lignesA.length + ' / ' + attenduA);
verifier('Branche B : toutes les combinaisons donnent un coffret', lignesB.length === attenduB,
  lignesB.length + ' / ' + attenduB);
verifier('Les 6 profils sont atteignables', Object.keys(reglesUtilisees).length === Object.keys(diagnostic.profils).length,
  Object.keys(reglesUtilisees).length + ' / ' + Object.keys(diagnostic.profils).length + ' profils atteints');
verifier('Aucun prix de produit à l\'unité dans les résultats',
  lignesA.every(function (l) { return l.prix === '' || /€$/.test(l.prix); }), 'prix coffrets uniquement');
verifier('Aucune anomalie de catalogue', erreurs.length === 0,
  erreurs.length === 0 ? 'aucune' : erreurs.length + ' anomalie(s)');

if (erreurs.length) {
  console.log('');
  erreurs.slice(0, 20).forEach(function (e) { console.log('  ! ' + e); });
}

console.log('');
console.log('Détail complet des ' + (lignesA.length + lignesB.length) + ' cas : tools/resultats-logique.csv');
console.log('');

function verifier(intitule, condition, detail) {
  console.log('  [' + (condition ? 'OK ' : 'NON') + '] ' + pad(intitule, 56) + (detail || ''));
}

process.exit(erreurs.length ? 1 : 0);
