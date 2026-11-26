/*
 * Contrôles avant mise en ligne — Révélation Beauté
 *
 *   node tools/verifier.js
 *
 * Ne modifie rien. Vérifie :
 *   — les mots interdits par la charte ;
 *   — les couleurs hors palette ;
 *   — que l'Or Révélation n'est jamais posé sur un fond clair ;
 *   — qu'aucun prix de produit à l'unité n'est affiché ;
 *   — qu'aucun prix affiché n'existe en dehors de produits.json ;
 *   — que les fichiers appelés existent bien.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var racine = path.join(__dirname, '..');
var soucis = [];
var remarques = [];

var PALETTE = ['#3D3B3A', '#FAF7F2', '#E8DDD3', '#C9A87C', '#B08D57'];

var MOTS_INTERDITS = [
  { motif: /\boffres?\b/gi, mot: 'offre' },
  { motif: /\bpromos?\b/gi, mot: 'promo' },
  { motif: /\bpromotions?\b/gi, mot: 'promotion' },
  { motif: /\bdeals?\b/gi, mot: 'deal' },
  { motif: /\bmiracles?\b/gi, mot: 'miracle' },
  { motif: /\bgarantie?s?\b/gi, mot: 'garanti' },
  { motif: /n[°o]\s?1\b/gi, mot: 'n°1' },
  { motif: /réservez\s+vite/gi, mot: 'réservez vite' },
  { motif: /dernière\s+chance/gi, mot: 'dernière chance' },
  { motif: /premium\s+accessible/gi, mot: 'premium accessible' },
  { motif: /!\s*!/g, mot: 'points d\'exclamation en série', texteSeulement: true },
  { motif: /\bguérit\b/gi, mot: 'guérit' },
  { motif: /\bélimine\b/gi, mot: 'élimine' },
  { motif: /\bplus que\s+\d+\s+(jours?|heures?|places?)/gi, mot: 'urgence artificielle' },
  { motif: /\bvite\s*!/gi, mot: 'urgence artificielle' }
];

/* ------------------------------------------------------------ Parcours */

function fichiersTexte() {
  var retenus = [];
  var ignores = ['.git', 'node_modules', 'assets', 'qr', '.claude'];

  (function parcourir(dossier) {
    fs.readdirSync(dossier, { withFileTypes: true }).forEach(function (entree) {
      if (entree.name.startsWith('.') && entree.name !== '.claude') return;
      var complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        if (ignores.indexOf(entree.name) === -1) parcourir(complet);
        return;
      }
      if (/\.(html|css|js|json|csv|md|gs|txt)$/i.test(entree.name)) retenus.push(complet);
    });
  })(racine);

  // Deux fichiers citent forcément les mots interdits : ce contrôle lui-même,
  // et le cahier des charges, qui en donne la liste.
  var horsControle = ['verifier.js', 'prompt-claude-code-diagnostic-rb.md'];
  return retenus.filter(function (f) { return horsControle.indexOf(path.basename(f)) === -1; });
}

function relatif(fichier) { return path.relative(racine, fichier); }

function lire(fichier) { return fs.readFileSync(fichier, 'utf8'); }

/* Les commentaires du code ne sont jamais lus par la cliente :
   on les met de côté avant de chercher des couleurs ou des montants. */
function sansCommentaires(contenu) {
  return contenu
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

/* Les entités HTML (&#171;) ne sont pas des couleurs. */
function sansEntites(contenu) {
  return contenu.replace(/&#\d+;?/g, ' ');
}

function ligneDe(contenu, position) {
  return contenu.slice(0, position).split('\n').length;
}

/* -------------------------------------------------- 1. Mots interdits */

function controleMots(fichiers) {
  fichiers.forEach(function (fichier) {
    var contenu = lire(fichier);
    var porteDuTexte = /\.(html|json|csv|md|txt)$/i.test(fichier);
    MOTS_INTERDITS.forEach(function (regle) {
      if (regle.texteSeulement && !porteDuTexte) return;
      var motif = new RegExp(regle.motif.source, regle.motif.flags);
      var trouve;
      while ((trouve = motif.exec(contenu)) !== null) {
        soucis.push('Mot interdit « ' + regle.mot +' » dans ' + relatif(fichier)
          + ' ligne ' + ligneDe(contenu, trouve.index) + ' : « ' + trouve[0].trim() + ' »');
        if (!motif.global) break;
      }
    });
  });
}

/* ------------------------------------------------ 2. Couleurs hors palette */

function controleCouleurs(fichiers) {
  fichiers.filter(function (f) { return /\.(css|html|js|gs|py)$/i.test(f); }).forEach(function (fichier) {
    var contenu = sansEntites(sansCommentaires(lire(fichier)));
    var hex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
    var trouve;
    while ((trouve = hex.exec(contenu)) !== null) {
      var valeur = trouve[0].toUpperCase();
      if (PALETTE.indexOf(valeur) === -1) {
        soucis.push('Couleur hors palette ' + valeur + ' dans ' + relatif(fichier)
          + ' ligne ' + ligneDe(contenu, trouve.index));
      }
    }
    var fonctions = /\b(rgba?|hsla?)\s*\(/g;
    while ((trouve = fonctions.exec(contenu)) !== null) {
      soucis.push('Couleur écrite en ' + trouve[1] + '() dans ' + relatif(fichier)
        + ' ligne ' + ligneDe(contenu, trouve.index) + ' : la charte n\'autorise que les cinq couleurs.');
    }
  });
}

/* ------------------------------- 3. Or Révélation jamais sur fond clair */

function controleOr() {
  var css = lire(path.join(racine, 'css', 'style.css'));
  var regles = decouperCss(css);

  var fondsCharbon = {};
  regles.forEach(function (regle) {
    if (/background\s*:\s*var\(--charbon\)/.test(regle.corps)) {
      regle.selecteurs.forEach(function (s) { fondsCharbon[classeDe(s)] = true; });
    }
  });

  regles.forEach(function (regle) {
    if (!/color\s*:\s*var\(--or-revelation\)/.test(regle.corps)) return;
    regle.selecteurs.forEach(function (selecteur) {
      var bloc = classeDe(selecteur).split('__')[0];
      if (!fondsCharbon[bloc] && !fondsCharbon[classeDe(selecteur)]) {
        soucis.push('Or Révélation utilisé par « ' + selecteur
          + ' » sans fond Charbon identifié : vérifiez à l\'œil.');
      } else {
        remarques.push('Or Révélation sur « ' + selecteur + ' », posé sur le fond Charbon de « .'
          + bloc + ' ».');
      }
    });
  });
}

function decouperCss(css) {
  var sans = css.replace(/\/\*[\s\S]*?\*\//g, '');
  var regles = [];
  var motif = /([^{}]+)\{([^{}]*)\}/g;
  var trouve;
  while ((trouve = motif.exec(sans)) !== null) {
    var selecteurs = trouve[1].split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.charAt(0) !== '@'; });
    if (selecteurs.length) regles.push({ selecteurs: selecteurs, corps: trouve[2] });
  }
  return regles;
}

function classeDe(selecteur) {
  var trouve = selecteur.match(/\.([A-Za-z0-9_-]+)/g);
  return trouve ? trouve[trouve.length - 1].slice(1) : selecteur;
}

/* --------------------------------- 4 et 5. Les prix affichés */

function controlePrix() {
  var produits = JSON.parse(lire(path.join(racine, 'data', 'produits.json')));
  var app = sansCommentaires(lire(path.join(racine, 'js', 'app.js')));
  var html = sansCommentaires(lire(path.join(racine, 'index.html'))
    + lire(path.join(racine, 'confidentialite.html')));

  if (/prix_public_eur/.test(app)) {
    soucis.push('js/app.js lit prix_public_eur : aucun prix de produit à l\'unité ne doit être affiché.');
  }

  var prixUnitaires = Object.keys(produits.produits).map(function (id) {
    return produits.produits[id].prix_public_eur;
  }).filter(Boolean);

  [['js/app.js', app], ['pages HTML', html]].forEach(function (couple) {
    prixUnitaires.forEach(function (montant) {
      var variantes = [String(montant), montant.toFixed(2), montant.toFixed(2).replace('.', ',')];
      variantes.forEach(function (texte) {
        if (couple[1].indexOf(texte + ' €') !== -1 || couple[1].indexOf(texte + ' €') !== -1) {
          soucis.push('Un prix de produit à l\'unité (' + texte + ' €) apparaît dans ' + couple[0] + '.');
        }
      });
    });
  });

  // Tout montant écrit en dur dans le code serait un chiffre inventé.
  var enDur = /(\d+[.,]?\d*)\s*(€|euros?)/gi;
  var trouve;
  [['js/app.js', app], ['index.html', html]].forEach(function (couple) {
    while ((trouve = enDur.exec(couple[1])) !== null) {
      soucis.push('Montant écrit en dur dans ' + couple[0] + ' : « ' + trouve[0]
        + ' ». Tout prix doit venir de produits.json.');
    }
  });

  // Les prix affichables doivent tous exister dans le catalogue.
  Object.keys(produits.coffrets).forEach(function (id) {
    var coffret = produits.coffrets[id];
    if (typeof coffret.prix_eur !== 'number') {
      soucis.push('Le coffret « ' + coffret.nom + ' » n\'a pas de prix utilisable.');
    }
    if (coffret.valeur_reelle_eur !== null) {
      remarques.push('Le coffret « ' + coffret.nom + ' » affiche une valeur barrée : '
        + coffret.valeur_reelle_eur + ' €. À confirmer avant mise en ligne.');
    }
  });
}

/* ------------------------------------------- 6. Fichiers appelés */

function controleFichiers() {
  var produits = JSON.parse(lire(path.join(racine, 'data', 'produits.json')));
  var manquantes = [];

  function verifierImage(nom) {
    if (!nom) return;
    if (!fs.existsSync(path.join(racine, 'assets', 'produits', nom))) manquantes.push(nom);
  }
  Object.keys(produits.produits).forEach(function (id) { verifierImage(produits.produits[id].image); });
  Object.keys(produits.coffrets).forEach(function (id) { verifierImage(produits.coffrets[id].image); });

  if (manquantes.length) {
    remarques.push(manquantes.length + ' photo(s) de produit pas encore déposée(s) dans assets/produits/ : '
      + 'l\'application affiche un bloc Crème Amande à la place, c\'est prévu.');
  }

  ['index.html', 'confidentialite.html'].forEach(function (page) {
    var contenu = lire(path.join(racine, page));
    var motif = /(?:src|href)="(?!https?:|mailto:|#)([^"]+)"/g;
    var trouve;
    while ((trouve = motif.exec(contenu)) !== null) {
      // Les feuilles de style et les scripts portent un « ?v=… » qui force
      // le navigateur à recharger : ce n'est pas une partie du nom de fichier.
      var chemin = trouve[1].split('?')[0];
      if (!chemin) continue;
      if (!fs.existsSync(path.join(racine, chemin))) {
        soucis.push('Fichier introuvable : ' + chemin + ' appelé par ' + page);
      }
    }
  });

  ['data/diagnostic.json', 'data/produits.json', 'data/config.json'].forEach(function (fichier) {
    try { JSON.parse(lire(path.join(racine, fichier))); }
    catch (erreur) { soucis.push(fichier + ' est mal écrit : ' + erreur.message); }
  });
}

/* ------------------------------------------- 7. Cohérence des données */

function controleCoherence() {
  var diagnostic = JSON.parse(lire(path.join(racine, 'data', 'diagnostic.json')));
  var produits = JSON.parse(lire(path.join(racine, 'data', 'produits.json')));

  Object.keys(diagnostic.profils).forEach(function (id) {
    var profil = diagnostic.profils[id];
    (profil.produits_traiter || []).forEach(function (ref) {
      if (!produits.produits[ref]) soucis.push('Le profil « ' + profil.nom + ' » cite un produit inconnu : ' + ref);
    });
    if (profil.soin_regard && !produits.produits[profil.soin_regard]) {
      soucis.push('Le profil « ' + profil.nom + ' » cite un soin regard inconnu : ' + profil.soin_regard);
    }
    if (profil.coffret && !produits.coffrets[profil.coffret]) {
      soucis.push('Le profil « ' + profil.nom + ' » cite un coffret inconnu : ' + profil.coffret);
    }
    var fiches = produits.gammes || {};
    if (profil.gamme_traiter && !fiches[profil.gamme_traiter]) {
      soucis.push('La gamme « ' + profil.gamme_traiter + ' » du profil « ' + profil.nom
        + ' » n\'a pas de fiche vérifiée dans produits.json : l\'ordonnance n\'aura rien à dire dessus.');
    } else if (profil.gamme_traiter && !fiches[profil.gamme_traiter].source) {
      soucis.push('La gamme « ' + profil.gamme_traiter + ' » n\'indique pas sa source : '
        + 'impossible de recontrôler ce qu\'elle affirme.');
    }
    if (profil.complement && !produits.produits[profil.complement]) {
      soucis.push('Le profil « ' + profil.nom + ' » cite un complément inconnu : ' + profil.complement);
    }
    if (!profil.complement) {
      remarques.push('Le profil « ' + profil.nom + ' » n\'a pas de complément alimentaire : '
        + 'l\'étape « Compléter » ne s\'affiche pas pour lui.');
    }
  });

  (diagnostic.etapes_rituel || []).forEach(function (etape) {
    (etape.produits || []).forEach(function (ref) {
      if (!produits.produits[ref]) {
        soucis.push('L\'étape « ' + etape.titre + ' » cite un produit inconnu : ' + ref);
      }
    });
    var choix = etape.produit_selon && etape.produit_selon.regles ? etape.produit_selon.regles : [];
    choix.forEach(function (regle) {
      if (!produits.produits[regle.produit]) {
        soucis.push('L\'étape « ' + etape.titre + ' » peut choisir un produit inconnu : ' + regle.produit);
      }
    });

    // Un produit peut aussi être choisi par une table : selon la gamme du profil
    // (le démaquillant) ou selon le profil lui-même (l'exfoliant).
    var tables = [];
    ['produit_selon_gamme', 'produit_selon_profil'].forEach(function (champ) {
      var table = etape[champ];
      if (!table) return;
      Object.keys(table).forEach(function (cle) {
        tables.push(table[cle]);
        if (!produits.produits[table[cle]]) {
          soucis.push('L\'étape « ' + etape.titre + ' » peut choisir un produit inconnu : ' + table[cle]);
        }
        if (champ === 'produit_selon_profil' && cle !== '_defaut' && !diagnostic.profils[cle]) {
          soucis.push('L\'étape « ' + etape.titre + ' » vise un profil inconnu : ' + cle);
        }
      });
    });

    if (!etape.selon_profil && !etape.complement_du_profil
        && !(etape.produits || []).length && !choix.length && !tables.length) {
      soucis.push('L\'étape « ' + etape.titre + ' » n\'a aucun produit.');
    }
    (etape.sauf_si_profil || []).forEach(function (id) {
      if (!diagnostic.profils[id]) {
        soucis.push('L\'étape « ' + etape.titre + ' » exclut un profil inconnu : ' + id);
      }
    });
  });

  diagnostic.branche_b.regles.forEach(function (regle) {
    if (regle.coffret && !produits.coffrets[regle.coffret]) {
      soucis.push('Une règle de la branche B cite un coffret inconnu : ' + regle.coffret);
    }
  });
}

/* ------------------------- 8. Accroches imprimées et sources acceptées */

/*
 * Une carte dont le src manque dans config.json verrait ses scans comptés
 * comme « inconnue » : le test d'accroches ne mesurerait plus rien.
 */
function controleAccroches() {
  var fichier = path.join(racine, 'data', 'accroches.json');
  if (!fs.existsSync(fichier)) return;

  var accroches = JSON.parse(lire(fichier));
  var config = JSON.parse(lire(path.join(racine, 'data', 'config.json')));
  var acceptees = config.sources_trafic || [];

  var tous = (accroches.accroches || []).map(function (a) { return a.src; });
  if (accroches.chevalet) tous.push(accroches.chevalet.src);

  tous.forEach(function (src) {
    if (acceptees.indexOf(src) === -1) {
      soucis.push('L\'accroche « ' + src + ' » n\'est pas dans sources_trafic de config.json : '
        + 'ses scans seraient comptés comme « inconnue ».');
    }
    if (!fs.existsSync(path.join(racine, 'qr', 'qr-' + src + '.png'))) {
      soucis.push('Il manque le QR code de l\'accroche « ' + src
        + ' » : relancez tools/qr.py.');
    }
  });

  var doublons = tous.filter(function (s, i) { return tous.indexOf(s) !== i; });
  doublons.forEach(function (s) {
    soucis.push('Deux accroches partagent le même src « ' + s + ' » : leurs scans se mélangeraient.');
  });

  remarques.push(tous.length + ' accroche(s) imprimée(s), chacune avec son propre QR code.');
}

/* ------------------------------------------------------------ Rapport */

var fichiers = fichiersTexte();
controleMots(fichiers);
controleCouleurs(fichiers);
controleOr();
controlePrix();
controleFichiers();
controleCoherence();
controleAccroches();

console.log('');
console.log('=== CONTRÔLES AVANT MISE EN LIGNE ===');
console.log('');
console.log('  ' + fichiers.length + ' fichiers texte examinés.');
console.log('');

if (soucis.length === 0) {
  console.log('  [OK ] Mots interdits');
  console.log('  [OK ] Couleurs hors palette');
  console.log('  [OK ] Or Révélation toujours sur fond Charbon');
  console.log('  [OK ] Aucun prix de produit à l\'unité affiché');
  console.log('  [OK ] Aucun montant écrit en dur');
  console.log('  [OK ] Fichiers appelés présents');
  console.log('  [OK ] Données cohérentes');
  console.log('  [OK ] Accroches imprimées et QR codes');
  console.log('  [OK ] Gammes documentées et sourcées');
} else {
  console.log('  ' + soucis.length + ' point(s) à corriger :');
  console.log('');
  soucis.forEach(function (s) { console.log('  ! ' + s); });
}

if (remarques.length) {
  console.log('');
  console.log('  Pour information :');
  remarques.forEach(function (r) { console.log('  · ' + r); });
}

console.log('');
process.exit(soucis.length ? 1 : 0);
