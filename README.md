# La Révélation de votre peau

Lecture de peau en cinq questions, pour l'institut **Révélation Beauté** (Ans, depuis 2005).

La cliente ouvre la page avec un QR code dans l'institut, répond à cinq questions,
reçoit son « ordonnance de peau » — son profil, son rituel, son coffret — la reçoit
aussi par email, et montre l'écran à l'accueil.

Ce document est écrit pour quelqu'un qui n'est pas développeur. Chaque section
dit quoi faire, dans l'ordre.

---

## 1. Avant toute commande

Les commandes de ce document se lancent depuis le dossier du projet. Ouvrez le
Terminal et tapez, **une fois pour toutes** :

```
cd "/Users/francesco/Desktop/diagnostic-peau rb"
```

Les guillemets sont nécessaires : le nom du dossier contient une espace.
Tant que vous ne fermez pas la fenêtre, vous y restez. Sans ce `cd`, le Terminal
répond `Cannot find module` — il cherche au mauvais endroit.

Pour **voir le site sur votre ordinateur**, un double-clic sur `index.html` ne
suffit pas : le navigateur refuse alors de lire les fichiers de données.

```
python3 -m http.server 8000
```

Laissez la fenêtre ouverte et allez sur `http://localhost:8000` dans votre
navigateur. Pour tester une source précise, comme le fera le QR code :
`http://localhost:8000/?src=salle-attente`. Pour arrêter : `Ctrl + C`.

---

## 2. Ce qu'il y a dans le dossier

```
index.html                  la lecture de peau
confidentialite.html        la page vie privée
css/style.css               toute l'apparence
js/moteur.js                les règles de décision
js/app.js                   l'enchaînement des écrans
data/diagnostic.json        questions, logique, rituel, textes des profils   ← à modifier
data/produits.json          produits, coffrets, disponibilité                 ← à modifier
data/config.json            les réglages du quotidien                         ← à modifier
data/catalogue-visage-ella-bache.csv   le catalogue de référence
assets/logo/                le monogramme R/B
assets/produits/            les 26 visuels produits
apps-script/Code.gs         le script du Google Sheet
qr/                         les QR codes, une fois le site en ligne
tools/                      les outils (section 8)
```

Les trois fichiers marqués d'une flèche sont les seuls à toucher au quotidien.
**Tout le reste peut rester tel quel.**

---

## 3. Les réglages du quotidien — `data/config.json`

| Réglage | Ce qu'il fait |
|---|---|
| `saison` | `"noel"` affiche les coffrets de Noël. `"permanent"` les masque et affiche « Votre duo de soins ». À changer en janvier. |
| `tirage_date` | Date du tirage au sort, `"2026-12-24"` par exemple. À `null`, le tirage n'est pas mentionné du tout. |
| `apps_script_url` | L'adresse du script qui enregistre et envoie (section 6). À `null`, l'application marche mais n'enregistre rien et n'envoie rien. |
| `email_contact` | L'adresse affichée sur la page Confidentialité. **À renseigner.** |
| `duree_conservation_ans` | La durée annoncée sur la page Confidentialité. |

Une date s'écrit `"année-mois-jour"`, entre guillemets. `null` s'écrit sans guillemets.

> Un fichier `.json` mal écrit empêche la page de s'ouvrir. En cas de doute,
> lancez le contrôle de la section 8 : il vous dira quelle ligne pose problème.

---

## 4. Changer la lecture — `data/diagnostic.json`

### Une question ou un texte
Modifiez ce qui est entre guillemets, jamais les étiquettes avant les deux-points.

### L'ordre de priorité des profils
Section `branche_a` → `priorites`. La liste est lue de haut en bas : **la première
ligne dont la condition est vraie donne le profil**, les suivantes ne sont pas
examinées. Pour changer l'ordre, déplacez les lignes. La dernière, celle dont
`si_code` vaut `null`, est le profil par défaut.

### Le rituel
Section `etapes_rituel` : six étapes, dans l'ordre d'affichage.

| Étape | Fréquence | Ce qu'elle contient |
|---|---|---|
| Démaquiller | matin et soir | Huile Tomate + Eau **ou** Lait selon la peau |
| Nettoyer | matin et soir | Mousseline + Tonique Tomate Éclat |
| Exfolier | 1 à 2 fois par semaine | Exfoliant Oléo-Gel Tomate |
| Traiter | matin et soir | les deux soins du profil |
| Protéger | chaque matin | Le Daily UV SPF 50+ |
| Compléter | en cure | le complément alimentaire du profil |

Trois réglages utiles sur une étape :

- `produit_selon` choisit un produit d'après les réponses. C'est ainsi que le
  **Lait** remplace l'**Eau** quand la peau tiraille, réagit ou est sèche.
- `sauf_si_profil` retire l'étape pour les profils cités. L'exfoliation est
  aujourd'hui retirée pour la **peau réactive**.
- `selon_profil` et `complement_du_profil` vont chercher les produits dans la
  fiche du profil.

### Les choix multiples
La question 4 porte `choix_multiple: true` : la cliente peut cocher plusieurs
préoccupations. **Le profil reste donné par l'ordre de priorité** ; les autres
préoccupations sont rappelées sous le rituel par la phrase de
`note_preoccupations`. La réponse nommée dans `exclusif` se coche seule.

Pour rendre une autre question à choix multiple, ajoutez-lui `choix_multiple: true`
et une `mention` sur chaque réponse.

### Les profils
Chaque profil porte son nom, ses deux phrases, sa gamme, ses deux soins, son
soin regard, son complément et son coffret. Les champs `soin_regard`,
`complement` et `coffret` peuvent valoir `null` : l'élément ne s'affiche pas.

---

## 5. Les produits — `data/produits.json`

- **Un prix de coffret** : champ `prix_eur`. Les prix de produits à l'unité ne
  sont **jamais** affichés dans l'application.
- **« au lieu de »** : champ `valeur_reelle_eur`. À `null`, rien ne s'affiche.
- **Une rupture** : passez `disponible` de `true` à `false`. Un coffret
  indisponible est remplacé par « Votre duo de soins ».
- **Le contenu d'un coffret** : champ `contenu`. À `null`, rien ne s'affiche.
- **La phrase qui relie le coffret au rituel** : champ `lien_rituel`.
  À ne remplir **que** si le contenu du coffret est confirmé.
- **La marque** : champ `marque`. La mention en bas d'ordonnance se compose
  toute seule à partir des marques réellement proposées.

---

## 6. Le Google Sheet — enregistrer et envoyer

Sans cette étape, l'application fonctionne : elle n'enregistre simplement rien
et n'envoie aucun email.

**1.** Créez un Google Sheet vide, appelé par exemple « Lectures de peau ».

**2.** Menu **Extensions → Apps Script**. Effacez le code affiché, collez tout
le contenu de `apps-script/Code.gs`, enregistrez.

**3.** Tout en haut du script, remplissez **les deux seules lignes à remplir** :

```javascript
var EMAIL_INSTITUT = 'votre.adresse@exemple.be';
var URL_SITE = 'https://votre-nom.github.io/diagnostic-peau/';
```

La première vous fait recevoir un message à chaque lecture. La seconde sert à
afficher le monogramme dans les emails. Laissez `''` si vous ne les avez pas
encore : tout fonctionne quand même.

**4.** Choisissez la fonction `creerTableauDeBord` dans la liste déroulante,
cliquez sur **Exécuter**, et acceptez l'autorisation que Google demande
(« Paramètres avancés » → « Accéder au projet »). L'onglet « Tableau de bord »
apparaît.

**5.** **Déployer → Nouveau déploiement**, type **Application Web** :
- *Exécuter en tant que* : **moi**
- *Qui a accès* : **tout le monde**

Copiez l'adresse qui s'affiche et collez-la dans `data/config.json` :

```json
"apps_script_url": "https://script.google.com/macros/s/VOTRE-ADRESSE/exec",
```

### Ce qui se passe ensuite
Chaque lecture écrit une ligne dans l'onglet « Lectures ». Si la cliente laisse
son email et coche la première case, elle **reçoit son ordonnance** et **vous
recevez un message** avec prénom, profil, coffret, code et provenance.

### Les colonnes à remplir à la main

| Colonne | Ce que l'accueil y note |
|---|---|
| **Achat (oui/non)** | `oui` si la cliente a acheté |
| **Produit acheté** | le nom, en toutes lettres |
| **Date de rappel** | **ne rien écrire** : se calcule seule, six semaines après, dès que vous écrivez `oui` |
| **Ordonnance envoyée** | renseignée par le script |

### Si vous modifiez le script plus tard
Il faut redéployer : **Déployer → Gérer les déploiements → crayon → Version :
nouvelle version → Déployer**. Sans cela, l'ancienne version continue de tourner.

---

## 7. Les photos des produits

Les 26 visuels sont déjà en place. Pour **en remplacer un**, déposez simplement
votre fichier dans `assets/produits/` **au même nom**. Rien d'autre à faire.

Les visuels actuels viennent des packshots officiels, recadrés au plus près et
posés sur un fond Crème Amande. Les flacons sortent bien ; les cartons blancs
restent pâles, parce qu'ils sont blancs. **Ceux-là gagnent à être rephotographiés
à l'institut**, sur fond Crème Amande, à la lumière de la fenêtre.

Deux visuels manquent encore :

- `skinissime-creme-regard.webp` — introuvable en ligne, à photographier
- les trois compléments LPG — pas de packshot disponible

Pour régénérer tous les visuels depuis le site officiel :

```
python3 -m pip install opencv-python numpy
python3 tools/images.py
```

`python3 tools/images.py --liste` montre la correspondance sans rien télécharger.
Chaque passage écrit aussi `tools/planche-contact.png`, à regarder avant de valider.

---

## 8. Vérifier que tout va bien

Trois outils. Ils ne modifient rien.

**La logique** — rejoue les 456 combinaisons de réponses possibles, combinaisons
de la question 4 comprises, et affiche le profil obtenu :

```
node tools/test-logique.js
```

**La charte et les règles** — mots interdits, couleurs hors palette, Or Révélation
sur fond clair, prix inventés, fichiers manquants, cohérence des données :

```
node tools/verifier.js
```

**L'email** — écrit `tools/apercu-ordonnance.html`, à ouvrir dans un navigateur.
Ce n'est pas une maquette : la page est produite par le script qui enverra les
vrais emails.

```
node tools/apercu-email.js
```

Lancez les deux premiers après chaque modification des fichiers `data/`.
S'ils affichent `OK` partout, vous pouvez mettre en ligne.

---

## 9. Mettre le site en ligne (GitHub Pages, gratuit)

**1.** Créez un compte sur [github.com](https://github.com) si besoin.

**2.** Créez un dépôt (*New repository*), par exemple `diagnostic-peau`, en **public**.

**3.** Envoyez-y le contenu de ce dossier : *uploading an existing file*, puis
glissez-déposez tous les fichiers.

**4.** **Settings → Pages**. Sous *Source* : **Deploy from a branch**, branche
`main`, dossier `/ (root)`. Enregistrez.

**5.** Deux minutes plus tard, l'adresse s'affiche en haut de cette même page.

> **Ce qu'il ne faut jamais envoyer sur GitHub** : un export du Google Sheet,
> une liste de clientes, des prix d'achat, le niveau de stock. Le fichier
> `data/catalogue-visage-ella-bache.csv` a déjà été nettoyé de la colonne
> `stock_salonkee` et des prix d'achat. Il ne contient que les prix publics.

---

## 10. Les QR codes

Une fois le site en ligne :

```
python3 -m pip install segno
python3 tools/qr.py --base https://votre-nom.github.io/diagnostic-peau/
```

Trois fichiers apparaissent dans `qr/` : salle d'attente, manucure, comptoir.
Chacun mène à la même page mais enregistre d'où vient la cliente. Ce sont des
SVG : ils s'impriment net à n'importe quelle taille. Le script relit chaque code
avant de l'écrire.

Pour ajouter une source, modifiez `sources_trafic` dans `data/config.json`
**et** la liste `SOURCES` en haut de `tools/qr.py`.

---

## 11. Ce qui attend encore une décision

- `email_contact` est à `null` dans `data/config.json`.
- `EMAIL_INSTITUT` et `URL_SITE` sont vides dans `apps-script/Code.gs`.
- Le contenu des coffrets Hydratation, Rides & Fermeté et Anti-Âge est à `null`,
  donc leur `lien_rituel` aussi.
- `valeur_reelle_eur` est à `null` pour les quatre coffrets : aucune valeur
  barrée ne s'affiche tant qu'elle n'est pas confirmée.
- **Trois profils n'ont pas de complément alimentaire** : Teint terne, Peau
  réactive, Peau brillante. L'étape « Compléter » ne s'affiche pas pour eux.
- Les trois compléments LPG n'ont ni prix ni conditionnement dans le catalogue.
- La Crème Micro-Comblante est marquée disponible alors que la caisse l'a
  comptée à zéro : c'est l'étape « Traiter » du profil Rides installées.
- L'intitulé de l'exfoliant est à confirmer : la caisse enregistre « Exfoliant
  Oléo-Gel Tomate », l'esthéticienne parle du micro-peeling Tomate.
- **Un seul texte reste sous le seuil de contraste AA** : « DEPUIS 2005 », en Or
  Révélation sur le Charbon du bandeau, atteint 3,6 pour 1 au lieu de 4,5. C'est
  la conséquence directe de la charte, qui impose ces deux couleurs ensemble. Ce
  texte fait partie de la signature de marque, aux côtés du monogramme, ce qui le
  place dans l'exception prévue par la norme pour les logotypes. Tout le reste
  passe le seuil.
- La police Montserrat n'est pas chargée : le wordmark est un fichier vectoriel,
  aucun texte n'a donc besoin de cette police.

---

## 12. La charte, en bref

| | |
|---|---|
| Charbon `#3D3B3A` | texte, fonds sombres, bandeau bas |
| Parchemin `#FAF7F2` | fond principal |
| Crème Amande `#E8DDD3` | cartes, zones secondaires, sélection, fond des visuels |
| Sable Doré `#C9A87C` | filets, ornements, progression |
| Or Révélation `#B08D57` | **uniquement sur fond Charbon** |

Cormorant Garamond pour les titres et les questions, League Spartan pour les
étiquettes, les boutons et les chiffres. Aucune ombre, aucun dégradé, aucun
arrondi au-delà de 2 px, aucun emoji.

Les soins Ella Baché et LPG n'apparaissent que comme la sélection de l'institut :
une seule mention discrète, dans le résultat.
