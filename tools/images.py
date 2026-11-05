#!/usr/bin/env python3
"""
Prépare les visuels produits — Révélation Beauté

Récupère les packshots officiels Ella Baché, remplace leur fond blanc par le
Parchemin de la charte, uniformise le cadrage et exporte en WebP dans
assets/produits/ sous les noms attendus par l'application.

    python3 tools/images.py                 # tout
    python3 tools/images.py --liste         # montre la correspondance sans rien faire
    python3 tools/images.py coffret-eclat   # un seul visuel

Produit aussi tools/planche-contact.png, à regarder avant de valider.

Dépendances : opencv-python, numpy.
Les photos prises à l'institut, elles, se déposent directement dans
assets/produits/ : ce script ne les touche pas.
"""

import argparse
import pathlib
import sys
import urllib.request

import cv2
import numpy as np

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / "assets" / "produits"
SOURCE = "https://www.ellabache.com/"

PARCHEMIN = (242, 247, 250)   # #FAF7F2 en BGR
CREME = (211, 221, 232)       # #E8DDD3 en BGR
CHARBON = (58, 59, 61)        # #3D3B3A en BGR

COTE_PRODUIT = 600
COTE_COFFRET = 900
QUALITE = 82
MARGE = 0.03                  # air autour du produit, en part du petit côté

# nom de fichier attendu par l'application  ->  chemin du packshot officiel
VISUELS = {
    "huile-tomate-demaquillante": "1850-thickbox_default/huile-tomate-demaquillante.jpg",
    "eau-tomate-demaquillante": "1852-thickbox_default/eau-tomate-demaquillante.jpg",
    "lait-tomate-demaquillant": "1851-thickbox_default/lait-tomate-demaquillant.jpg",
    "tonique-tomate-eclat": "1854-thickbox_default/tonique-tomate-eclat.jpg",
    "exfoliant-oleo-gel-tomate": "2425-thickbox_default/exfoliant-oleo-gel-tomate.jpg",
    "mousseline-tomate-nettoyante": "1956-thickbox_default/mousseline-tomate-nettoyante.jpg",
    "daily-uv-spf50": "3020-thickbox_default/le-daily-uv.jpg",
    "serum-red-focus": "1857-thickbox_default/serum-magistral-red-focus.jpg",
    "creme-probiotiques-hydra-apaisante": "1858-thickbox_default/creme-aux-probiotiques-hydra-apaisante.jpg",
    "serum-sebatics": "1865-thickbox_default/serum-magistral-sebatics.jpg",
    "creme-detox-hydra-matifiante": "1867-thickbox_default/creme-detox-hydra-matifiante.jpg",
    "super-serum-hydra-repulpant": "2506-thickbox_default/super-serum-hydra-repulpant.jpg",
    "gel-creme-hydra-repulpant": "2887-thickbox_default/gel-creme-hydra-repulpant.jpg",
    "soin-regard-hydra-repulpant": "2891-thickbox_default/soin-regard-hydra-repulpant.jpg",
    "essence-micro-peeling": "1902-thickbox_default/essence-micro-peeling.jpg",
    "creme-tomate-originale": "1814-thickbox_default/creme-tomate-l-originale.jpg",
    "soin-regard-renovateur-eclat": "2977-thickbox_default/soin-regard-renovateur-eclat.jpg",
    "super-serum-micro-combleur": "1874-thickbox_default/super-serum-micro-combleur.jpg",
    "creme-micro-comblante": "1877-thickbox_default/creme-micro-comblante.jpg",
    "soin-regard-micro-combleur": "1879-thickbox_default/soin-regard-micro-combleur.jpg",
    "super-serum-pro-liftant": "2784-thickbox_default/super-serum-pro-liftant.jpg",
    "creme-riche-pro-liftante": "2795-thickbox_default/creme-riche-pro-liftante.jpg",
    "coffret-eclat": "3037-thickbox_default/grand-coffret-collector.jpg",
    "coffret-hydratation": "3023-thickbox_default/grand-coffret-hydratation.jpg",
    "coffret-rides-fermete": "3027-thickbox_default/grand-coffret-rides-fermete.jpg",
    "coffret-anti-age": "3032-thickbox_default/grand-coffret-anti-age.jpg",
}

# Introuvable sur le site : à photographier à l'institut.
MANQUANTS = {
    "skinissime-creme-regard": "Skinissime Crème Regard Totale Sublimatrice 15 ml",
}


def telecharger(chemin):
    requete = urllib.request.Request(SOURCE + chemin, headers={"User-Agent": "Mozilla/5.0"})
    donnees = urllib.request.urlopen(requete, timeout=30).read()
    image = cv2.imdecode(np.frombuffer(donnees, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("fichier illisible")
    return image


def contenu(image, seuil=243):
    """Bornes du produit : tout ce qui n'est pas du blanc de studio."""
    gris = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    marque = gris < seuil
    colonnes = np.where(marque.any(axis=0))[0]
    rangs = np.where(marque.any(axis=1))[0]
    if len(colonnes) == 0 or len(rangs) == 0:
        return None
    return rangs[0], rangs[-1], colonnes[0], colonnes[-1]


def sur_creme(image, tolerance=7):
    """
    Pose le produit sur du Crème Amande, pour qu'un carton blanc se détache.

    Le fond de studio est repéré en partant des quatre coins : seules les
    zones blanches reliées au bord basculent en Crème Amande. Le produit, lui,
    garde ses blancs — c'est ce léger écart qui le rend visible en vignette.

    Si le remplissage déborde sur le produit (carton sans ombre, blanc sur
    blanc sans aucune arête), on renonce au fond coloré pour ce visuel plutôt
    que d'effacer la moitié de la photo.
    """
    h, w = image.shape[:2]
    masque = np.zeros((h + 2, w + 2), np.uint8)
    travail = image.copy()
    drapeaux = 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8)
    for graine in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        cv2.floodFill(travail, masque, graine, 0,
                      (tolerance,) * 3, (tolerance,) * 3, drapeaux)
    fond = masque[1:-1, 1:-1]

    bornes = contenu(image)
    if bornes is not None:
        haut, bas, gauche, droite = bornes
        aire = max(1, (bas - haut + 1) * (droite - gauche + 1))
        mange = (fond[haut:bas + 1, gauche:droite + 1] > 0).sum() / aire
        if mange > 0.55:
            return None  # le détourage dévore le produit : on s'abstient

    alpha = cv2.GaussianBlur(fond.astype(np.float32) / 255.0, (0, 0), 1.2)[:, :, None]
    plage = np.full_like(image, CREME, dtype=np.uint8)
    return (image * (1 - alpha) + plage * alpha).astype(np.uint8)


def teinte_creme(image):
    """Repli : filtre l'image entière en Crème Amande, rien n'est perdu."""
    renforce = cv2.convertScaleAbs(image, alpha=1.14, beta=-16)
    sortie = renforce.astype(np.float32) / 255.0 * np.array(CREME, dtype=np.float32)
    return np.clip(sortie, 0, 255).astype(np.uint8)


def recadrer(image, bornes, cote):
    """
    Cadre au plus près du produit et GARDE SES PROPORTIONS.

    Un flacon haut et fin enfermé dans un carré perd les deux tiers de sa
    largeur : en vignette, il ne reste qu'un trait. En conservant le rapport
    du produit, la même vignette le montre deux à trois fois plus grand.
    """
    if bornes is None:
        decoupe = image
    else:
        haut, bas, gauche, droite = bornes
        air = int(min(image.shape[:2]) * MARGE)
        haut = max(0, haut - air)
        gauche = max(0, gauche - air)
        bas = min(image.shape[0] - 1, bas + air)
        droite = min(image.shape[1] - 1, droite + air)
        decoupe = image[haut:bas + 1, gauche:droite + 1]

    h, w = decoupe.shape[:2]
    facteur = min(1.0, cote / max(h, w))
    if facteur < 1.0:
        decoupe = cv2.resize(decoupe, (max(1, int(w * facteur)), max(1, int(h * facteur))),
                             interpolation=cv2.INTER_AREA)
    return decoupe


def preparer(nom, chemin):
    brut = telecharger(chemin)
    bornes = contenu(brut)
    pose = sur_creme(brut)
    detoure = pose is not None
    if not detoure:
        pose = teinte_creme(brut)
    cote = COTE_COFFRET if nom.startswith("coffret") else COTE_PRODUIT
    fini = recadrer(pose, bornes, cote)

    SORTIE.mkdir(parents=True, exist_ok=True)
    fichier = SORTIE / (nom + ".webp")
    if not cv2.imwrite(str(fichier), fini, [cv2.IMWRITE_WEBP_QUALITY, QUALITE]):
        raise IOError("écriture impossible")
    return fichier, fini, detoure


def planche(images):
    """Planche contact : tout voir d'un coup avant d'intégrer."""
    if not images:
        return None
    colonnes, vignette, marge, bas = 5, 230, 18, 34
    lignes = (len(images) + colonnes - 1) // colonnes
    largeur = colonnes * (vignette + marge) + marge
    hauteur = lignes * (vignette + bas + marge) + marge + 46

    toile = np.full((hauteur, largeur, 3), PARCHEMIN, dtype=np.uint8)
    cv2.putText(toile, "REVELATION BEAUTE - planche contact", (marge, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, CHARBON, 1, cv2.LINE_AA)

    for i, (nom, image) in enumerate(images):
        y = 46 + (i // colonnes) * (vignette + bas + marge) + marge
        x = marge + (i % colonnes) * (vignette + marge)
        ih, iw = image.shape[:2]
        f = min(vignette / iw, vignette / ih)
        petit = cv2.resize(image, (max(1, int(iw * f)), max(1, int(ih * f))),
                           interpolation=cv2.INTER_AREA)
        ph, pw = petit.shape[:2]
        toile[y:y + vignette, x:x + vignette] = CREME
        toile[y + (vignette - ph) // 2:y + (vignette - ph) // 2 + ph,
              x + (vignette - pw) // 2:x + (vignette - pw) // 2 + pw] = petit
        cv2.rectangle(toile, (x, y), (x + vignette, y + vignette), (124, 168, 201), 1)
        etiquette = nom if len(nom) <= 30 else nom[:29] + "."
        cv2.putText(toile, etiquette, (x, y + vignette + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, CHARBON, 1, cv2.LINE_AA)

    fichier = RACINE / "tools" / "planche-contact.png"
    cv2.imwrite(str(fichier), toile)
    return fichier


def main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("noms", nargs="*", help="un ou plusieurs visuels ; vide = tous")
    options.add_argument("--liste", action="store_true", help="montre la correspondance et s'arrête")
    arguments = options.parse_args()

    if arguments.liste:
        for nom, chemin in VISUELS.items():
            print(f"  {nom + '.webp':42s} <- {chemin}")
        for nom, intitule in MANQUANTS.items():
            print(f"  {nom + '.webp':42s} <- INTROUVABLE EN LIGNE : {intitule}")
        return

    demandes = arguments.noms or list(VISUELS)
    inconnus = [n for n in demandes if n not in VISUELS]
    if inconnus:
        sys.exit("Visuel inconnu : " + ", ".join(inconnus))

    faits, echecs = [], []
    for nom in demandes:
        try:
            fichier, image, detoure = preparer(nom, VISUELS[nom])
            faits.append((nom, image))
            print(f"  {nom + '.webp':42s} {fichier.stat().st_size // 1024:>4} Ko"
                  f"   {'fond remplacé' if detoure else 'teinté (fond non séparable)'}")
        except Exception as erreur:
            echecs.append((nom, erreur))
            print(f"  {nom + '.webp':42s} ÉCHEC : {erreur}")

    contact = planche(faits)
    print(f"\n  {len(faits)} visuel(s) prêt(s) dans assets/produits/")
    if contact:
        print(f"  Planche contact : tools/{contact.name}")
    for nom, intitule in MANQUANTS.items():
        print(f"\n  À photographier à l'institut : {intitule}")
        print(f"  puis déposer assets/produits/{nom}.webp")
    if echecs:
        sys.exit(1)


if __name__ == "__main__":
    main()
