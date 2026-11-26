/*
 * Moteur de lecture de peau — Révélation Beauté
 *
 * Ce fichier ne contient AUCUNE question, AUCUN texte de profil et AUCUN prix.
 * Il se contente d'appliquer les règles écrites dans data/diagnostic.json
 * et le catalogue de data/produits.json.
 *
 * Pour changer une question, un profil ou l'ordre de priorité :
 * modifier data/diagnostic.json, jamais ce fichier.
 *
 * Il fonctionne dans le navigateur et sous Node (utilisé par tools/test-logique.js),
 * de sorte que les tests vérifient exactement le code qui tourne en production.
 */
(function (racine) {
  'use strict';

  /* ---------------------------------------------------------------- Branche A */

  /**
   * Détermine le profil à partir des codes de réponse (ex. ["R0","S1","H2","P_RIDES","Y1"]).
   * Applique les priorités de diagnostic.json dans l'ordre : le premier test vrai gagne.
   */
  function profilBrancheA(codes, diagnostic) {
    var priorites = diagnostic.branche_a.priorites;
    var profilId = null;

    var regleRetenue = null;
    for (var i = 0; i < priorites.length; i++) {
      var regle = priorites[i];
      if (!regleVraie(regle, codes, diagnostic)) continue;
      profilId = regle.profil;
      regleRetenue = regle;
      break;
    }
    if (!profilId) return null;

    var profil = diagnostic.profils[profilId];
    if (!profil) return null;

    return {
      id: profilId,
      profil: profil,
      notes: notesSecondaires(codes, profilId, diagnostic)
        .concat(notePreoccupations(codes, regleRetenue, diagnostic)),
      soinRegardId: soinRegard(codes, profil, diagnostic)
    };
  }

  /**
   * Une règle de priorité est-elle vraie ?
   * Trois formes, décrites dans diagnostic.json :
   *   si_code                 — la cliente a donné ce code ;
   *   si_min_preoccupations   — elle a coché au moins ce nombre de préoccupations ;
   *   si_code à null          — la règle de secours, toujours vraie.
   */
  function regleVraie(regle, codes, diagnostic) {
    if (typeof regle.si_min_preoccupations === 'number') {
      return compterPreoccupations(codes, diagnostic) >= regle.si_min_preoccupations;
    }
    return regle.si_code === null || codes.indexOf(regle.si_code) !== -1;
  }

  /** Combien de préoccupations la cliente a-t-elle cochées à la question 4 ? */
  function compterPreoccupations(codes, diagnostic) {
    var liste = diagnostic.branche_a.codes_preoccupations || [];
    var total = 0;
    for (var i = 0; i < liste.length; i++) {
      if (codes.indexOf(liste[i]) !== -1) total++;
    }
    return total;
  }

  /* -------------------------------------------------------- Le grade Ella Baché */

  /**
   * Situe la peau sur l'échelle d'Ella Baché.
   *
   * Leur schéma a deux axes : l'âge et l'exposition aux stress environnementaux.
   * Le grade part donc de la tranche d'âge et monte d'un cran quand la cliente
   * cumule assez de facteurs d'exposition. Le seuil et les paliers sont dans
   * diagnostic.json ; rien n'est écrit en dur ici.
   *
   * Le grade ne choisit jamais la gamme : la formation Ella Baché demande de
   * traiter « non pas en fonction de l'âge, mais des signes cliniques visibles ».
   * Il sert à régler la richesse des textures.
   */
  function grade(codes, diagnostic) {
    var reglage = (diagnostic.branche_a || {}).grades;
    if (!reglage) return null;
    var reponses = codes || [];

    var niveau = null;
    var base = reglage.base_age || {};
    for (var cle in base) {
      if (base.hasOwnProperty(cle) && reponses.indexOf(cle) !== -1) { niveau = base[cle]; break; }
    }
    if (niveau === null) return null;

    var facteurs = [];
    var exposition = reglage.codes_exposition || [];
    for (var i = 0; i < exposition.length; i++) {
      if (reponses.indexOf(exposition[i]) !== -1) facteurs.push(exposition[i]);
    }
    var releve = facteurs.length >= (reglage.seuil_exposition || 2);
    if (releve) niveau = Math.min(niveau + 1, reglage.maximum);

    var palier = (reglage.echelle || {})[String(niveau)] || {};
    var mentions = mentionsDeCodes(facteurs, diagnostic);

    return {
      niveau: niveau,
      titre: palier.titre || '',
      texte: palier.texte || '',
      releve: releve,
      facteurs: mentions,
      phrase: String(reglage.phrase || '')
        .replace('{titre}', palier.titre || '')
        .replace('{intitule}', reglage.intitule || '')
        .replace('{texte}', palier.texte || ''),
      phrase_exposition: releve
        ? String(reglage.phrase_exposition || '').replace('{facteurs}', enumerer(mentions))
        : ''
    };
  }

  /** Retrouve, dans les questions, la mention à afficher pour chaque code. */
  function mentionsDeCodes(codes, diagnostic) {
    var questions = (diagnostic.branche_a || {}).questions || [];
    var mentions = [];
    for (var i = 0; i < questions.length; i++) {
      var reponses = questions[i].reponses || [];
      for (var j = 0; j < reponses.length; j++) {
        if (codes.indexOf(reponses[j].code) !== -1 && reponses[j].mention) {
          mentions.push(reponses[j].mention);
        }
      }
    }
    return mentions;
  }

  /** « a, b et c » — une énumération française. */
  function enumerer(liste) {
    if (!liste || !liste.length) return '';
    if (liste.length === 1) return liste[0];
    return liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1];
  }

  /** Phrases secondaires affichées sous le rituel (sensibilité ponctuelle, etc.). */
  function notesSecondaires(codes, profilId, diagnostic) {
    var regles = diagnostic.branche_a.notes_secondaires || [];
    var retenues = [];

    for (var i = 0; i < regles.length; i++) {
      var note = regles[i];
      if (codes.indexOf(note.si_code) === -1) continue;
      var exclus = note.sauf_si_profil || [];
      if (exclus.indexOf(profilId) !== -1) continue;
      retenues.push(note.texte);
    }
    return retenues;
  }

  /**
   * Quand la cliente a coché plusieurs préoccupations, une seule donne le profil.
   * Les autres sont rappelées sous le rituel, pour que rien ne soit perdu.
   */
  function notePreoccupations(codes, regleRetenue, diagnostic) {
    var regle = diagnostic.branche_a.note_preoccupations;
    if (!regle) return [];

    // Quand le profil a été choisi parce que les signes se cumulent, la gamme
    // les prend déjà tous en charge : rappeler la liste n'apprendrait rien.
    if (regleRetenue && typeof regleRetenue.si_min_preoccupations === 'number') return [];
    var codeRetenu = regleRetenue ? regleRetenue.si_code : null;

    // On ne lit que les préoccupations : la question 7 accepte elle aussi
    // plusieurs réponses, et elle n'a rien à faire ici.
    var attendus = diagnostic.branche_a.codes_preoccupations || [];
    var reponses = [];
    (diagnostic.branche_a.questions || []).forEach(function (question) {
      (question.reponses || []).forEach(function (reponse) {
        if (attendus.indexOf(reponse.code) !== -1) reponses.push(reponse);
      });
    });
    if (!reponses.length) return [];

    var autres = [];
    reponses.forEach(function (reponse) {
      if (!reponse.mention) return;
      if (reponse.code === codeRetenu) return;
      if (codes.indexOf(reponse.code) !== -1) autres.push(reponse.mention);
    });
    if (!autres.length) return [];

    var liste = autres.length === 1
      ? autres[0]
      : autres.slice(0, -1).join(', ') + (regle.liaison || ' et ') + autres[autres.length - 1];
    return [regle.texte.replace('{autres}', liste)];
  }

  /** Ajoute le soin regard du profil si la cliente signale un regard fatigué. */
  function soinRegard(codes, profil, diagnostic) {
    var regle = diagnostic.branche_a.regle_soin_regard;
    if (!regle || codes.indexOf(regle.si_code) === -1) return null;
    return profil.soin_regard || null;
  }

  /* ---------------------------------------------------------------- Branche B */

  /**
   * Détermine le coffret à offrir à partir des codes de la branche B.
   * La première règle dont TOUTES les conditions sont vraies gagne.
   */
  function coffretBrancheB(codes, diagnostic) {
    var regles = diagnostic.branche_b.regles;
    var retenue = null;

    for (var i = 0; i < regles.length; i++) {
      var regle = regles[i];
      var conditions = regle.si_codes || [];
      var toutesVraies = true;
      for (var j = 0; j < conditions.length; j++) {
        if (codes.indexOf(conditions[j]) === -1) { toutesVraies = false; break; }
      }
      if (toutesVraies) { retenue = regle; break; }
    }
    if (!retenue) return null;

    var mention = diagnostic.branche_b.mention_cheque_cadeau;
    var afficherCheque = !!(mention && codes.indexOf(mention.si_code) !== -1);

    return {
      coffretId: retenue.coffret,
      profilId: retenue.profil_associe,
      profil: diagnostic.profils[retenue.profil_associe] || null,
      chequeCadeau: afficherCheque ? mention.texte : null
    };
  }

  /* ------------------------------------------------------- Coffret et rituel */

  /**
   * Renvoie le coffret à afficher, ou null s'il faut présenter « Votre duo de soins ».
   * Un coffret n'est proposé que s'il existe, qu'il est disponible
   * et qu'il appartient à la saison active.
   */
  function coffretAffichable(coffretId, produits, config) {
    if (!coffretId) return null;
    var coffret = produits.coffrets[coffretId];
    if (!coffret) return null;
    if (coffret.disponible !== true) return null;
    var saisons = coffret.saisons || [];
    if (saisons.indexOf(config.saison) === -1) return null;
    return { id: coffretId, coffret: coffret };
  }

  /**
   * Construit le rituel d'après diagnostic.json : les étapes, leur ordre,
   * les produits choisis selon les réponses, et ceux qui ne conviennent pas
   * à ce profil. Les produits indisponibles sont écartés.
   */
  function rituel(profil, diagnostic, produits, codes, profilId, niveauGrade) {
    var liste = diagnostic.etapes_rituel || [];
    var retenues = [];

    for (var i = 0; i < liste.length; i++) {
      var modele = liste[i];

      // Une étape peut ne pas convenir à un profil : une peau réactive
      // ne s'exfolie pas comme une autre.
      var exclus = modele.sauf_si_profil || [];
      if (profilId && exclus.indexOf(profilId) !== -1) continue;

      var ids = (modele.produits || []).slice();
      var gamme = modele.gamme;

      if (modele.selon_profil) {
        if (!profil) continue;
        // La texture de la crème se choisit ici : elle dépend de la peau et du grade.
        ids = produitsTraiter(profil, codes, niveauGrade);
        gamme = profil.gamme_traiter;
      }

      // Le démaquillant suit la gamme, comme dans les protocoles Ella Baché.
      if (modele.produit_selon_gamme && profil) {
        var parGamme = modele.produit_selon_gamme;
        var suivantGamme = parGamme[profil.gamme_traiter] || parGamme._defaut;
        if (suivantGamme) ids.push(suivantGamme);
      }

      // L'exfoliant suit le profil : l'enzymatique doux pour une peau réactive.
      if (modele.produit_selon_profil) {
        var parProfil = modele.produit_selon_profil;
        var suivantProfil = (profilId && parProfil[profilId]) || parProfil._defaut;
        if (suivantProfil) ids.push(suivantProfil);
      }

      // L'étape « Compléter » n'existe que si le profil a un complément.
      if (modele.complement_du_profil) {
        if (!profil || !profil.complement) continue;
        ids = [profil.complement];
      }

      var choisi = produitSelon(modele.produit_selon, codes, niveauGrade);
      if (choisi) ids.push(choisi);

      var etape = composer(retenues.length + 1, modele.titre, modele.note, gamme, ids, produits);

      // Seule l'étape « Traiter » porte le résumé de la gamme : c'est celle
      // sur laquelle la cliente interrogera son esthéticienne.
      if (modele.selon_profil) etape.resume = resumeGamme(gamme, produits);

      // Un soin juste mais absent de la caisse n'est pas tu : il devient
      // une commande à passer, pas un silence.
      if (etape.manquants.length) {
        etape.note_manquants = (diagnostic.intitules_ordonnance || {}).note_indisponible || '';
      }

      if (etape.produits.length || etape.manquants.length) retenues.push(etape);
    }
    return retenues;
  }

  /** Choisit un produit d'après les réponses : la première règle vraie gagne. */
  function produitSelon(regle, codes, niveauGrade) {
    if (!regle || !regle.regles) return null;
    var reponses = codes || [];
    for (var i = 0; i < regle.regles.length; i++) {
      var ligne = regle.regles[i];
      // Une règle de grade : elle ne s'applique qu'à partir d'un palier.
      if (typeof ligne.si_grade_min === 'number') {
        if (typeof niveauGrade !== 'number') continue;
        if (niveauGrade < ligne.si_grade_min) continue;
        return ligne.produit;
      }
      var conditions = ligne.si_codes || [];
      var toutesVraies = true;
      for (var j = 0; j < conditions.length; j++) {
        if (reponses.indexOf(conditions[j]) === -1) { toutesVraies = false; break; }
      }
      if (toutesVraies) return ligne.produit;
    }
    return null;
  }

  /** La phrase de la gamme, vérifiée sur la documentation de la marque. */
  function resumeGamme(gamme, produits) {
    var fiches = produits.gammes || {};
    return fiches[gamme] && fiches[gamme].resume ? fiches[gamme].resume : '';
  }

  function composer(numero, titre, note, gamme, ids, produits) {
    var retenus = [];
    var manquants = [];
    for (var i = 0; i < (ids || []).length; i++) {
      var fiche = produits.produits[ids[i]];
      if (!fiche) continue;
      if (fiche.disponible === true) retenus.push({ id: ids[i], produit: fiche });
      else manquants.push({ id: ids[i], produit: fiche });
    }
    return { numero: numero, titre: titre, note: note || '', gamme: gamme,
             resume: '', produits: retenus, manquants: manquants, note_manquants: '' };
  }

  /**
   * Les soins du profil : le sérum, puis la crème dont la texture dépend
   * de la peau et du grade. Utilisé par le rituel et par le duo de secours,
   * pour qu'ils ne puissent pas diverger.
   */
  function produitsTraiter(profil, codes, niveauGrade) {
    if (!profil) return [];
    var ids = (profil.produits_traiter || []).slice();
    var creme = produitSelon(profil.creme_selon, codes, niveauGrade);
    if (creme) ids.push(creme);
    return ids;
  }

  /* ----------------------------------------------------------- Code de lecture */

  /** Code de lecture du type RB-HYD-4821 : 3 lettres de profil, 4 chiffres. */
  function codeLecture(codeProfil, hasard) {
    var tirage = typeof hasard === 'function' ? hasard() : Math.random();
    var chiffres = String(1000 + Math.floor(tirage * 9000));
    return 'RB-' + codeProfil + '-' + chiffres;
  }

  /** Les marques réellement proposées, pour la mention en bas d'ordonnance. */
  function mentionMarques(etapes, coffret, modele) {
    var marques = [];
    (etapes || []).forEach(function (etape) {
      (etape.produits || []).forEach(function (p) {
        var marque = p.produit ? p.produit.marque : null;
        if (marque && marques.indexOf(marque) === -1) marques.push(marque);
      });
    });
    if (coffret && coffret.marque && marques.indexOf(coffret.marque) === -1) {
      marques.push(coffret.marque);
    }
    if (!marques.length) return '';
    var liste = marques.length === 1
      ? marques[0]
      : marques.slice(0, -1).join(', ') + ' et ' + marques[marques.length - 1];
    return String(modele || '').replace('{marques}', liste);
  }

  /* ------------------------------------------------------------------- Prix */

  /** Un prix rond s'écrit sans décimales : on retire le « ,00 » inutile. */
  function prix(montant) {
    var texte = montant % 1 === 0 ? String(montant) : montant.toFixed(2).replace('.', ',');
    return texte + ' €';
  }

  /* --------------------------------------------------- Résumé de l'ordonnance */

  /**
   * Met en forme l'ordonnance sous une forme simple, utilisée à la fois
   * par l'email envoyé à la cliente et par l'aperçu du certificat.
   * Aucun texte n'est inventé ici : tout vient de diagnostic.json.
   *
   * ctx = { branche, resultat, diagnostic, produits, config, code, date }
   */
  function resumeOrdonnance(ctx) {
    if (!ctx.resultat) return null;

    var diagnostic = ctx.diagnostic;
    var profil = ctx.resultat.profil;
    var coffretId = ctx.branche === 'a'
      ? (profil ? profil.coffret : null)
      : ctx.resultat.coffretId;
    var coffret = coffretAffichable(coffretId, ctx.produits, ctx.config);

    var lecture = grade(ctx.codes || [], diagnostic);

    var resume = {
      branche: ctx.branche,
      code: ctx.code,
      date: ctx.date,
      grade: lecture,
      intitules: diagnostic.intitules_ordonnance,
      profil: profil ? profil.nom : '',
      peau_dit: ctx.branche === 'a' && profil ? profil.peau_dit : '',
      besoin: profil ? profil.besoin : '',
      etapes: [],
      soin_regard: '',
      soin_regard_a_commander: false,
      notes: ctx.resultat.notes || [],
      coffret: null,
      duo: [],
      cheque_cadeau: ctx.resultat.chequeCadeau || '',
      appel_action: diagnostic.appel_action,
      institut: ctx.config.institut
    };

    var niveau = lecture ? lecture.niveau : undefined;
    var etapes = ctx.branche === 'a' && profil
      ? rituel(profil, diagnostic, ctx.produits, ctx.codes, ctx.profilId, niveau)
      : [];

    if (ctx.branche === 'a' && profil) {
      etapes.forEach(function (etape) {
        resume.etapes.push({
          numero: etape.numero,
          titre: etape.titre,
          note: etape.note,
          gamme: etape.gamme,
          resume: etape.resume,
          produits: etape.produits.map(function (p) { return nomComplet(p.produit); }),
          manquants: etape.manquants.map(function (p) { return nomComplet(p.produit); }),
          note_manquants: etape.note_manquants
        });
      });
      if (ctx.resultat.soinRegardId) {
        var regard = ctx.produits.produits[ctx.resultat.soinRegardId];
        if (regard) {
          resume.soin_regard = nomComplet(regard);
          // Le soin regard juste peut lui aussi manquer en caisse.
          resume.soin_regard_a_commander = regard.disponible !== true;
        }
      }
    }

    resume.mention_marque = mentionMarques(
      etapes, coffret ? coffret.coffret : null,
      diagnostic.intitules_ordonnance.mention_marque);

    if (coffret) {
      resume.coffret = {
        nom: coffret.coffret.nom,
        prix: prix(coffret.coffret.prix_eur),
        valeur_reelle: typeof coffret.coffret.valeur_reelle_eur === 'number'
          ? prix(coffret.coffret.valeur_reelle_eur) : '',
        lien_rituel: coffret.coffret.lien_rituel || '',
        contenu: coffret.coffret.contenu || []
      };
    } else if (profil) {
      produitsTraiter(profil, ctx.codes, niveau).forEach(function (id) {
        var fiche = ctx.produits.produits[id];
        if (fiche && fiche.disponible === true) resume.duo.push(nomComplet(fiche));
      });
    }

    return resume;
  }

  function nomComplet(produit) {
    return produit.nom + (produit.contenance ? ' ' + produit.contenance : '');
  }

  /* ------------------------------------------------------------------ Export */

  var api = {
    profilBrancheA: profilBrancheA,
    grade: grade,
    produitsTraiter: produitsTraiter,
    coffretBrancheB: coffretBrancheB,
    coffretAffichable: coffretAffichable,
    rituel: rituel,
    codeLecture: codeLecture,
    mentionMarques: mentionMarques,
    prix: prix,
    resumeOrdonnance: resumeOrdonnance
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    racine.MoteurLecture = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
