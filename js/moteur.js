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

    var codeRetenu = null;
    for (var i = 0; i < priorites.length; i++) {
      var regle = priorites[i];
      if (regle.si_code === null || codes.indexOf(regle.si_code) !== -1) {
        profilId = regle.profil;
        codeRetenu = regle.si_code;
        break;
      }
    }
    if (!profilId) return null;

    var profil = diagnostic.profils[profilId];
    if (!profil) return null;

    return {
      id: profilId,
      profil: profil,
      notes: notesSecondaires(codes, profilId, diagnostic)
        .concat(notePreoccupations(codes, codeRetenu, diagnostic)),
      soinRegardId: soinRegard(codes, profil, diagnostic)
    };
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
  function notePreoccupations(codes, codeRetenu, diagnostic) {
    var regle = diagnostic.branche_a.note_preoccupations;
    if (!regle) return [];

    var question = null;
    var questions = diagnostic.branche_a.questions;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].choix_multiple) { question = questions[i]; break; }
    }
    if (!question) return [];

    var autres = [];
    question.reponses.forEach(function (reponse) {
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
  function rituel(profil, diagnostic, produits, codes, profilId) {
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
        ids = (profil.produits_traiter || []).slice();
        gamme = profil.gamme_traiter;
      }

      // L'étape « Compléter » n'existe que si le profil a un complément.
      if (modele.complement_du_profil) {
        if (!profil || !profil.complement) continue;
        ids = [profil.complement];
      }

      var choisi = produitSelon(modele.produit_selon, codes);
      if (choisi) ids.push(choisi);

      var etape = composer(retenues.length + 1, modele.titre, modele.note, gamme, ids, produits);
      if (etape.produits.length) retenues.push(etape);
    }
    return retenues;
  }

  /** Choisit un produit d'après les réponses : la première règle vraie gagne. */
  function produitSelon(regle, codes) {
    if (!regle || !regle.regles) return null;
    var reponses = codes || [];
    for (var i = 0; i < regle.regles.length; i++) {
      var ligne = regle.regles[i];
      var conditions = ligne.si_codes || [];
      var toutesVraies = true;
      for (var j = 0; j < conditions.length; j++) {
        if (reponses.indexOf(conditions[j]) === -1) { toutesVraies = false; break; }
      }
      if (toutesVraies) return ligne.produit;
    }
    return null;
  }

  function composer(numero, titre, note, gamme, ids, produits) {
    var retenus = [];
    for (var i = 0; i < (ids || []).length; i++) {
      var fiche = produits.produits[ids[i]];
      if (fiche && fiche.disponible === true) retenus.push({ id: ids[i], produit: fiche });
    }
    return { numero: numero, titre: titre, note: note || '', gamme: gamme, produits: retenus };
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

    var resume = {
      branche: ctx.branche,
      code: ctx.code,
      date: ctx.date,
      intitules: diagnostic.intitules_ordonnance,
      profil: profil ? profil.nom : '',
      peau_dit: ctx.branche === 'a' && profil ? profil.peau_dit : '',
      besoin: profil ? profil.besoin : '',
      etapes: [],
      soin_regard: '',
      notes: ctx.resultat.notes || [],
      coffret: null,
      duo: [],
      cheque_cadeau: ctx.resultat.chequeCadeau || '',
      appel_action: diagnostic.appel_action,
      institut: ctx.config.institut
    };

    if (ctx.branche === 'a' && profil) {
      rituel(profil, diagnostic, ctx.produits, ctx.codes, ctx.profilId).forEach(function (etape) {
        resume.etapes.push({
          numero: etape.numero,
          titre: etape.titre,
          note: etape.note,
          gamme: etape.gamme,
          produits: etape.produits.map(function (p) { return nomComplet(p.produit); })
        });
      });
      if (ctx.resultat.soinRegardId) {
        var regard = ctx.produits.produits[ctx.resultat.soinRegardId];
        if (regard) resume.soin_regard = nomComplet(regard);
      }
    }

    resume.mention_marque = mentionMarques(
      resume.etapes.length ? rituel(profil, diagnostic, ctx.produits, ctx.codes, ctx.profilId) : [],
      coffret ? coffret.coffret : null,
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
      (profil.produits_traiter || []).forEach(function (id) {
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
