/*
 * La Révélation de votre peau — Révélation Beauté
 *
 * Ce fichier gère l'enchaînement des écrans et l'affichage.
 * Il ne contient aucune question, aucun texte de profil et aucun prix :
 * tout vient de data/diagnostic.json, data/produits.json et data/config.json.
 *
 * Les décisions (profil, coffret) sont prises par js/moteur.js.
 */
(function () {
  'use strict';

  var CHEMIN_IMAGES = 'assets/produits/';

  var etat = {
    diagnostic: null,
    produits: null,
    config: null,
    source: 'inconnue',
    branche: null,
    parcours: [],
    index: 0,
    reponses: {},
    codesParQuestion: [],
    resultat: null,
    codeLecture: null,
    prenom: null,
    debut: null
  };

  var vue = {};

  /* ------------------------------------------------------------ Démarrage */

  document.addEventListener('DOMContentLoaded', function () {
    vue.accueil = document.getElementById('ecran-accueil');
    vue.question = document.getElementById('ecran-question');
    vue.resultat = document.getElementById('ecran-resultat');
    vue.questionCorps = document.getElementById('question-corps');
    vue.resultatCorps = document.getElementById('resultat-corps');
    vue.retour = document.getElementById('question-retour');
    vue.filet = document.getElementById('progression-filet');
    vue.rang = document.getElementById('progression-rang');
    vue.bouton = document.getElementById('accueil-bouton');
    vue.alerte = document.getElementById('accueil-alerte');

    vue.bouton.disabled = true;
    vue.retour.addEventListener('click', reculer);

    charger();
  });

  function charger() {
    Promise.all([
      json('data/diagnostic.json'),
      json('data/produits.json'),
      json('data/config.json')
    ]).then(function (fichiers) {
      etat.diagnostic = fichiers[0];
      etat.produits = fichiers[1];
      etat.config = fichiers[2];
      etat.source = lireSource(etat.config);
      habillerAccueil();
      vue.bouton.disabled = false;
      vue.bouton.addEventListener('click', commencer);
    }).catch(function () {
      vue.bouton.hidden = true;
      vue.alerte.hidden = false;
      vue.alerte.textContent = 'Cette page a besoin d’être ouverte depuis l’adresse du site. Demandez-nous de l’ouvrir pour vous à l’accueil.';
    });
  }

  function json(chemin) {
    return fetch(chemin, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(chemin);
      return r.json();
    });
  }

  function lireSource(config) {
    var brut = new URLSearchParams(window.location.search).get('src');
    if (!brut) return 'directe';
    var permises = config.sources_trafic || [];
    return permises.indexOf(brut) !== -1 ? brut : 'inconnue';
  }

  function habillerAccueil() {
    var a = etat.diagnostic.accueil;
    document.getElementById('accueil-surtitre').textContent = a.surtitre;
    document.getElementById('accueil-titre').innerHTML =
      '<em>' + echappe(a.titre_avant) + '</em><br>' + echappe(a.titre_apres);
    document.getElementById('accueil-texte').textContent = a.texte;
    vue.bouton.textContent = a.bouton;
  }

  /* -------------------------------------------------------------- Parcours */

  function commencer() {
    etat.branche = null;
    etat.parcours = [etat.diagnostic.question_entree];
    etat.index = 0;
    etat.reponses = {};
    etat.codesParQuestion = [];
    etat.resultat = null;
    etat.codeLecture = null;
    etat.prenom = null;
    etat.enTransition = false;
    etat.debut = new Date();
    montrer('question');
    afficherQuestion();
  }

  function afficherQuestion() {
    var question = etat.parcours[etat.index];
    var total = 1 + (etat.branche === 'b' ? 3 : 5);
    var multiple = question.choix_multiple === true;

    vue.filet.style.width = Math.round((etat.index / total) * 100) + '%';
    vue.rang.textContent = question.numero
      ? 'Question ' + question.numero + ' / ' + (total - 1)
      : 'Avant de commencer';
    vue.retour.style.visibility = etat.index === 0 ? 'hidden' : 'visible';

    var html = '<h2 class="titre-ecran entre">' + echappe(question.libelle) + '</h2>';
    if (question.aide) html += '<p class="aide entre">' + echappe(question.aide) + '</p>';
    if (multiple) html += '<p class="aide entre">Plusieurs réponses possibles.</p>';

    html += '<ul class="reponses entre">';
    question.reponses.forEach(function (rep, i) {
      html += '<li><button class="reponse' + (multiple ? ' reponse--multiple' : '') + '" type="button"'
        + (multiple ? ' aria-pressed="false"' : '') + ' data-rang="' + i + '">'
        + echappe(rep.libelle) + '</button></li>';
    });
    html += '</ul>';

    if (multiple) {
      html += '<div class="entre" style="margin-top:1.75rem">'
        + '<button class="bouton" type="button" id="continuer" disabled>'
        + echappe(question.bouton_continuer || 'CONTINUER') + '</button></div>';
    }

    vue.questionCorps.innerHTML = html;
    var deja = etat.reponses[question.id];
    var dejaListe = multiple ? (deja || []) : (deja ? [deja] : []);

    vue.questionCorps.querySelectorAll('.reponse').forEach(function (bouton) {
      var reponse = question.reponses[Number(bouton.dataset.rang)];
      // En revenant en arrière, la cliente retrouve ses choix précédents.
      if (dejaListe.indexOf(reponse.id) !== -1) {
        bouton.classList.add('reponse--choisie');
        if (multiple) bouton.setAttribute('aria-pressed', 'true');
      }
      bouton.addEventListener('click', function () {
        if (multiple) basculer(question, reponse, bouton);
        else repondre(question, reponse, bouton);
      });
    });

    if (multiple) {
      document.getElementById('continuer').addEventListener('click', function () {
        validerChoixMultiple(question);
      });
      majContinuer();
    }
    document.querySelector('.scene').scrollIntoView({ block: 'start' });
  }

  /* ------------------------------------------------------- Réponse unique */

  function repondre(question, reponse, bouton) {
    if (etat.enTransition) return;
    etat.enTransition = true;

    vue.questionCorps.querySelectorAll('.reponse').forEach(function (b) {
      b.classList.remove('reponse--choisie');
      b.disabled = true;
    });
    bouton.classList.add('reponse--choisie');

    etat.reponses[question.id] = reponse.id;

    if (question.id === etat.diagnostic.question_entree.id) {
      // Changer de branche efface les réponses de l'autre branche.
      etat.branche = reponse.branche;
      etat.codesParQuestion = [];
      etat.reponses = {};
      etat.reponses[question.id] = reponse.id;
      etat.parcours = [etat.diagnostic.question_entree]
        .concat(etat.diagnostic['branche_' + etat.branche].questions);
    } else {
      etat.codesParQuestion[etat.index - 1] = [reponse.code];
    }

    attendre(avancer);
  }

  /* ------------------------------------------------------ Choix multiples */

  /** Coche ou décoche une réponse. Une réponse « exclusive » décoche les autres. */
  function basculer(question, reponse, bouton) {
    var choisi = bouton.classList.contains('reponse--choisie');
    var boutons = vue.questionCorps.querySelectorAll('.reponse');

    if (!choisi && reponse.id === question.exclusif) {
      boutons.forEach(function (b) {
        b.classList.remove('reponse--choisie');
        b.setAttribute('aria-pressed', 'false');
      });
    } else if (!choisi && question.exclusif) {
      boutons.forEach(function (b) {
        var autre = question.reponses[Number(b.dataset.rang)];
        if (autre.id === question.exclusif) {
          b.classList.remove('reponse--choisie');
          b.setAttribute('aria-pressed', 'false');
        }
      });
    }

    bouton.classList.toggle('reponse--choisie', !choisi);
    bouton.setAttribute('aria-pressed', String(!choisi));
    majContinuer();
  }

  function majContinuer() {
    var bouton = document.getElementById('continuer');
    if (!bouton) return;
    bouton.disabled = vue.questionCorps.querySelectorAll('.reponse--choisie').length === 0;
  }

  function validerChoixMultiple(question) {
    if (etat.enTransition) return;
    var choisies = [];
    vue.questionCorps.querySelectorAll('.reponse--choisie').forEach(function (b) {
      choisies.push(question.reponses[Number(b.dataset.rang)]);
    });
    if (!choisies.length) return;

    etat.enTransition = true;
    etat.reponses[question.id] = choisies.map(function (r) { return r.id; });
    etat.codesParQuestion[etat.index - 1] = choisies.map(function (r) { return r.code; });
    attendre(avancer);
  }

  /* --------------------------------------------------------- Enchaînement */

  function avancer() {
    etat.enTransition = false;
    if (etat.index + 1 < etat.parcours.length) {
      etat.index += 1;
      afficherQuestion();
    } else {
      conclure();
    }
  }

  function reculer() {
    if (etat.index === 0 || etat.enTransition) return;
    etat.index -= 1;
    if (etat.index === 0) {
      etat.branche = null;
      etat.parcours = [etat.diagnostic.question_entree];
      etat.codesParQuestion = [];
    } else {
      etat.codesParQuestion = etat.codesParQuestion.slice(0, etat.index - 1);
    }
    afficherQuestion();
  }

  /** Toutes les réponses mises bout à bout, comme les attend le moteur. */
  function codesPlats() {
    var plats = [];
    etat.codesParQuestion.forEach(function (groupe) {
      (groupe || []).forEach(function (code) { plats.push(code); });
    });
    return plats;
  }

  function attendre(suite) {
    var pause = reduit() ? 1 : 420;
    window.setTimeout(suite, pause);
  }

  function reduit() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------------------------------------------------------- La révélation */

  function conclure() {
    vue.filet.style.width = '100%';
    var codes = codesPlats();
    etat.resultat = etat.branche === 'a'
      ? MoteurLecture.profilBrancheA(codes, etat.diagnostic)
      : MoteurLecture.coffretBrancheB(codes, etat.diagnostic);

    var codeProfil = etat.resultat && etat.resultat.profil ? etat.resultat.profil.code : 'RVB';
    etat.codeLecture = MoteurLecture.codeLecture(codeProfil);

    montrer('resultat');
    vue.resultatCorps.innerHTML = etat.branche === 'a' ? htmlOrdonnance() : htmlCarteCadeau();
    brancherResultat();
    reveler();
    enregistrer();
  }

  function htmlOrdonnance() {
    var d = etat.diagnostic;
    var mots = d.intitules_ordonnance;
    var profil = etat.resultat.profil;
    var etapes = MoteurLecture.rituel(profil, d, etat.produits, codesPlats(), etat.resultat.id);
    var coffret = MoteurLecture.coffretAffichable(profil.coffret, etat.produits, etat.config);
    var regard = etat.resultat.soinRegardId ? etat.produits.produits[etat.resultat.soinRegardId] : null;

    var h = '<article class="ordonnance">';
    h += entete(mots);
    h += '<p class="ordonnance__destinataire revele" id="destinataire"' + (etat.prenom ? '' : ' hidden') + '>'
      + (etat.prenom ? 'Pour ' + echappe(etat.prenom) : '') + '</p>';
    h += '<h2 class="profil-nom revele">' + echappe(profil.nom) + '</h2>';
    h += '<hr class="filet filet--trace revele" id="filet-profil">';

    h += '<div class="bloc revele"><p class="etiquette">' + echappe(mots.peau_dit) + '</p>'
      + '<p class="bloc__texte bloc__texte--dit">&#171;&#8201;' + echappe(profil.peau_dit) + '&#8201;&#187;</p></div>';
    h += '<div class="bloc revele"><p class="etiquette">' + echappe(mots.besoin) + '</p>'
      + '<p class="bloc__texte">' + echappe(profil.besoin) + '</p></div>';

    h += '<div class="bloc revele"><p class="etiquette">' + echappe(mots.rituel) + '</p>'
      + '<ol class="rituel">';
    etapes.forEach(function (etape) {
      h += '<li><p class="rituel__numero">' + etape.numero + '.</p><div>'
        + '<p class="rituel__titre">' + echappe(etape.titre) + '</p>'
        + (etape.note ? '<p class="rituel__note">' + echappe(etape.note) + '</p>' : '')
        + '<p class="rituel__gamme">' + echappe(etape.gamme) + '</p></div>'
        + '<ul class="rituel__produits">';
      etape.produits.forEach(function (p) { h += '<li>' + htmlProduit(p.produit) + '</li>'; });
      h += '</ul></li>';
    });
    h += '</ol></div>';

    if (regard) {
      h += '<div class="bloc revele"><p class="etiquette">' + echappe(mots.soin_regard) + '</p>'
        + '<ul class="rituel__produits" style="margin-top:.75rem"><li>' + htmlProduit(regard) + '</li></ul></div>';
    }

    (etat.resultat.notes || []).forEach(function (note) {
      h += '<p class="note revele">' + echappe(note) + '</p>';
    });

    h += '<div class="revele">' + htmlCoffretOuDuo(coffret, profil, mots) + '</div>';
    h += '<p class="mention-marque revele">'
      + echappe(MoteurLecture.mentionMarques(etapes, coffret ? coffret.coffret : null, mots.mention_marque))
      + '</p>';
    h += '<p class="signature revele">' + echappe(mots.signature) + '</p>';
    h += '</article>';

    h += htmlAppelAction();
    h += htmlCollecte();
    return h;
  }

  function htmlCarteCadeau() {
    var d = etat.diagnostic;
    var mots = d.intitules_ordonnance;
    var b = d.branche_b.intitules;
    var profil = etat.resultat.profil;
    var coffret = MoteurLecture.coffretAffichable(etat.resultat.coffretId, etat.produits, etat.config);

    var h = '<article class="ordonnance">';
    h += entete(mots);
    h += '<h2 class="profil-nom revele">' + echappe(b.titre_resultat) + '</h2>';
    h += '<hr class="filet filet--trace revele" id="filet-profil">';
    h += '<p class="bloc__texte revele" style="margin-top:1.5rem">' + echappe(b.intro) + '</p>';

    if (profil) {
      h += '<div class="bloc revele"><p class="etiquette">' + echappe(mots.besoin) + '</p>'
        + '<p class="bloc__texte">' + echappe(profil.besoin) + '</p></div>';
    }

    h += '<div class="revele">' + htmlCoffretOuDuo(coffret, profil, mots) + '</div>';

    if (etat.resultat.chequeCadeau) {
      h += '<p class="note revele">' + echappe(etat.resultat.chequeCadeau) + '</p>';
    }

    h += '<p class="mention-marque revele">'
      + echappe(MoteurLecture.mentionMarques([], coffret ? coffret.coffret : null, mots.mention_marque))
      + '</p>';
    h += '<p class="signature revele">' + echappe(mots.signature) + '</p>';
    h += '</article>';

    h += htmlAppelAction();
    h += htmlCollecte();
    return h;
  }

  function entete(mots) {
    return '<header class="ordonnance__entete revele">'
      + '<img class="monogramme" src="assets/logo/rb-monogramme-charbon.svg" alt="Révélation Beauté" width="52" height="45">'
      + '<div class="ordonnance__reference"><span>' + echappe(mots.entete) + '</span><br>'
      + '<span>' + echappe(etat.codeLecture) + '</span><br>'
      + '<span>' + dateDuJour() + '</span></div></header>';
  }

  function htmlCoffretOuDuo(coffret, profil, mots) {
    // Le rituel est le conseil ; le coffret n'arrive qu'après, comme une facilité.
    var h = coffret && mots.pont_coffret
      ? '<p class="pont">' + echappe(mots.pont_coffret) + '</p>'
      : '';
    h += '<section class="coffret">';
    if (coffret) {
      h += htmlVisuelCoffret(coffret.coffret);
      h += '<p class="etiquette">' + echappe(mots.coffret) + '</p>';
      h += '<h3 class="coffret__nom">' + echappe(coffret.coffret.nom) + '</h3>';

      // Le prix de référence ne s'affiche que s'il a été confirmé par l'institut.
      h += '<p class="coffret__prix">' + MoteurLecture.prix(coffret.coffret.prix_eur);
      if (typeof coffret.coffret.valeur_reelle_eur === 'number') {
        h += '<span class="coffret__valeur">au lieu de ' + MoteurLecture.prix(coffret.coffret.valeur_reelle_eur) + '</span>';
      }
      h += '</p>';

      // La phrase qui relie le coffret au rituel, quand le contenu est confirmé.
      if (coffret.coffret.lien_rituel) {
        h += '<p class="coffret__lien">' + echappe(coffret.coffret.lien_rituel) + '</p>';
      }

      if (coffret.coffret.contenu && coffret.coffret.contenu.length) {
        h += '<ul class="coffret__contenu">';
        coffret.coffret.contenu.forEach(function (ligne) { h += '<li>' + echappe(ligne) + '</li>'; });
        h += '</ul>';
      }
    } else {
      h += '<p class="etiquette">' + echappe(mots.duo) + '</p>';
      h += '<ul class="rituel__produits" style="margin-top:1rem">';
      (profil ? profil.produits_traiter : []).forEach(function (id) {
        var fiche = etat.produits.produits[id];
        if (fiche && fiche.disponible === true) h += '<li>' + htmlProduit(fiche) + '</li>';
      });
      h += '</ul>';
    }
    h += '</section>';
    return h;
  }

  function htmlVisuelCoffret(coffret) {
    if (!coffret.image) return '';
    return '<div class="coffret__visuel" data-visuel>'
      + '<img loading="lazy" alt="' + echappe(coffret.nom) + '" src="' + CHEMIN_IMAGES + encodeURIComponent(coffret.image) + '">'
      + '</div>';
  }

  function htmlProduit(produit) {
    var h = '<div class="produit">';
    if (produit.image) {
      h += '<div class="produit__visuel" data-visuel>'
        + '<img loading="lazy" alt="" src="' + CHEMIN_IMAGES + encodeURIComponent(produit.image) + '">'
        + '</div>';
    } else {
      h += '<div></div>';
    }
    h += '<div><p class="produit__nom">' + echappe(produit.nom) + '</p>';
    if (produit.contenance) h += '<p class="produit__contenance">' + echappe(produit.contenance) + '</p>';
    h += '</div></div>';
    return h;
  }

  function htmlAppelAction() {
    var a = etat.diagnostic.appel_action;
    return '<section class="accueil-bloc revele">'
      + '<h2 class="accueil-bloc__titre">' + echappe(a.titre) + '</h2>'
      + '<p class="accueil-bloc__texte">' + echappe(a.texte) + '</p>'
      + '<p class="accueil-bloc__etiquette">Lecture n°</p>'
      + '<p class="accueil-bloc__code">' + echappe(etat.codeLecture) + '</p></section>'
      + '<div class="reprise revele"><button class="bouton bouton--second" type="button" id="recommencer">'
      + echappe(a.bouton_recommencer) + '</button></div>';
  }

  function htmlCollecte() {
    var c = etat.diagnostic.collecte_email;
    var tirage = etat.config.tirage_date;

    var h = '<section class="collecte revele" id="collecte">';
    h += '<h2 class="titre-ecran">' + echappe(c.titre) + '</h2>';
    if (tirage) {
      h += '<p class="aide">' + echappe(c.sous_titre) + ' Tirage le ' + echappe(dateLisible(tirage)) + '.</p>';
    }
    h += '<form id="formulaire" novalidate>';
    h += champ('prenom', c.champ_prenom, 'text', 'given-name', true);
    h += champ('email', c.champ_email, 'email', 'email', true);
    h += '<div class="champ"><label for="jour">' + echappe(c.champ_anniversaire) + '</label>'
      + '<div class="champ--duo">'
      + '<input id="jour" name="jour" type="number" min="1" max="31" inputmode="numeric" placeholder="Jour">'
      + '<input id="mois" name="mois" type="number" min="1" max="12" inputmode="numeric" placeholder="Mois">'
      + '</div></div>';

    h += '<label class="consentement"><input type="checkbox" id="consentement" name="consentement">'
      + '<span>' + echappe(c.consentement_obligatoire) + '</span></label>';
    h += '<label class="consentement"><input type="checkbox" id="actualites" name="actualites">'
      + '<span>' + echappe(c.consentement_facultatif) + '</span></label>';

    h += '<p class="mentions" id="formulaire-message" role="status"></p>';
    h += '<button class="bouton" type="submit">' + echappe(c.bouton) + '</button>';
    h += '<p class="mentions">Vos réponses sont conservées ' + echappe(String(etat.config.duree_conservation_ans))
      + ' ans. <a href="confidentialite.html">' + echappe(c.lien_confidentialite) + '</a></p>';
    h += '</form></section>';
    return h;
  }

  function champ(id, libelle, type, autocomplete, requis) {
    return '<div class="champ"><label for="' + id + '">' + echappe(libelle) + '</label>'
      + '<input id="' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + autocomplete + '"'
      + (requis ? ' required' : '') + '></div>';
  }

  /* ------------------------------------------------------- Après affichage */

  function brancherResultat() {
    var recommencer = document.getElementById('recommencer');
    if (recommencer) recommencer.addEventListener('click', repartir);

    // Une photo pas encore déposée : on efface proprement sa réserve.
    document.querySelectorAll('[data-visuel] img').forEach(function (image) {
      image.addEventListener('error', function () {
        var reserve = image.parentNode;
        reserve.classList.add(reserve.className.indexOf('coffret') !== -1
          ? 'coffret__visuel--vide' : 'produit__visuel--vide');
      });
    });

    var formulaire = document.getElementById('formulaire');
    if (formulaire) formulaire.addEventListener('submit', envoyer);
  }

  function reveler() {
    var elements = Array.prototype.slice.call(document.querySelectorAll('.revele'));
    var pas = reduit() ? 0 : 180;
    elements.forEach(function (element, i) {
      element.style.setProperty('--d', (i * pas) + 'ms');
    });
    window.requestAnimationFrame(function () {
      elements.forEach(function (element) { element.classList.add('revele--visible'); });
      var filet = document.getElementById('filet-profil');
      if (filet) window.setTimeout(function () { filet.classList.add('est-trace'); }, pas * 3);
    });
  }

  function repartir() {
    montrer('accueil');
    etat.branche = null;
    etat.index = 0;
    etat.codesParQuestion = [];
    etat.reponses = {};
    etat.resultat = null;
    etat.codeLecture = null;
    etat.prenom = null;
    vue.resultatCorps.innerHTML = '';
    window.scrollTo(0, 0);
  }

  function montrer(nom) {
    ['accueil', 'question', 'resultat'].forEach(function (cle) {
      vue[cle].classList.toggle('ecran--actif', cle === nom);
    });
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ Formulaire */

  function envoyer(evenement) {
    evenement.preventDefault();
    var message = document.getElementById('formulaire-message');
    var prenom = valeur('prenom');
    var email = valeur('email');
    var consentement = document.getElementById('consentement').checked;

    if (!prenom) { return refuser(message, 'Merci d’indiquer votre prénom.', 'prenom'); }
    if (!emailValide(email)) { return refuser(message, 'Merci de vérifier votre adresse email.', 'email'); }
    if (!consentement) { return refuser(message, 'Merci de cocher la première case pour que nous puissions vous conseiller.', 'consentement'); }

    etat.prenom = prenom;
    var destinataire = document.getElementById('destinataire');
    if (destinataire) {
      destinataire.textContent = 'Pour ' + prenom;
      destinataire.hidden = false;
    }

    enregistrer({
      prenom: prenom,
      email: email,
      anniversaire: anniversaire(),
      consentement_conseil: true,
      consentement_actualites: document.getElementById('actualites').checked
    });

    var collecte = document.getElementById('collecte');
    collecte.innerHTML = '<p class="etiquette">' + echappe(etat.diagnostic.collecte_email.titre) + '</p>'
      + '<p class="confirmation" style="margin-top:.75rem">'
      + echappe(etat.diagnostic.collecte_email.confirmation) + '</p>';
  }

  function refuser(message, texte, idChamp) {
    message.textContent = texte;
    var champ = document.getElementById(idChamp);
    if (champ && champ.focus) champ.focus();
    return false;
  }

  function valeur(id) {
    var champ = document.getElementById(id);
    return champ ? champ.value.trim() : '';
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function anniversaire() {
    var jour = valeur('jour');
    var mois = valeur('mois');
    if (!jour || !mois) return '';
    return jour.padStart(2, '0') + '/' + mois.padStart(2, '0');
  }

  /* -------------------------------------------------------- Enregistrement */

  /**
   * Envoie la lecture au Google Sheet par l'Apps Script.
   * Silencieux par construction : si l'adresse n'est pas configurée
   * ou si l'envoi échoue, la cliente ne voit jamais d'erreur.
   */
  function enregistrer(complement) {
    var url = etat.config.apps_script_url;
    if (!url) return;

    var profil = etat.resultat && etat.resultat.profil ? etat.resultat.profil : null;
    var coffretId = etat.branche === 'a'
      ? (profil ? profil.coffret : null)
      : (etat.resultat ? etat.resultat.coffretId : null);
    var coffret = MoteurLecture.coffretAffichable(coffretId, etat.produits, etat.config);

    var charge = {
      horodatage: new Date().toISOString(),
      source: etat.source,
      branche: etat.branche,
      saison: etat.config.saison,
      reponses: etat.reponses,
      codes: codesPlats().join(' '),
      profil: profil ? profil.nom : '',
      coffret: coffret ? coffret.coffret.nom : '',
      code_lecture: etat.codeLecture,
      duree_secondes: etat.debut ? Math.round((Date.now() - etat.debut.getTime()) / 1000) : null,
      prenom: '',
      email: '',
      anniversaire: '',
      consentement_conseil: false,
      consentement_actualites: false,
      ordonnance: MoteurLecture.resumeOrdonnance({
        branche: etat.branche,
        resultat: etat.resultat,
        diagnostic: etat.diagnostic,
        produits: etat.produits,
        config: etat.config,
        code: etat.codeLecture,
        date: dateDuJour(),
        codes: codesPlats(),
        profilId: etat.resultat.id
      })
    };
    Object.keys(complement || {}).forEach(function (cle) { charge[cle] = complement[cle]; });

    try {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(charge)
      }).catch(function () { /* silence voulu */ });
    } catch (erreur) { /* silence voulu */ }
  }

  /* ------------------------------------------------------------- Utilitaires */

  function dateDuJour() {
    return new Date().toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function dateLisible(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function echappe(texte) {
    return String(texte === null || texte === undefined ? '' : texte)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
