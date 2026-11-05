#!/usr/bin/env python3
"""
Génère les QR codes de la lecture de peau, un par source, en SVG.

Charbon sur Parchemin, monogramme R/B au centre, correction d'erreur
maximale pour que le monogramme ne gêne jamais la lecture.

    python3 tools/qr.py --base https://monsite.github.io/diagnostic-peau/

Les fichiers sont écrits dans qr/. Relancez la commande si l'adresse change.
Dépendance : segno  (python3 -m pip install segno)
"""

import argparse
import pathlib
import re
import sys

CHARBON = "#3D3B3A"
PARCHEMIN = "#FAF7F2"

SOURCES = ["salle-attente", "manucure", "comptoir"]

MODULE = 10          # côté d'un module, en unités SVG
MARGE = 4            # quiet zone, en modules (4 = minimum de la norme)
PART_CENTRE = 0.20   # part de la largeur occupée par le monogramme

RACINE = pathlib.Path(__file__).resolve().parent.parent


def monogramme():
    """Renvoie (contenu interne, viewBox) du monogramme charbon."""
    fichier = RACINE / "assets" / "logo" / "rb-monogramme-charbon.svg"
    texte = fichier.read_text(encoding="utf-8")

    ouverture = re.search(r"<svg\b[^>]*>", texte)
    if not ouverture:
        raise SystemExit("Le fichier du monogramme ne ressemble pas à un SVG.")
    boite = re.search(r'viewBox="([^"]+)"', ouverture.group(0))
    if not boite:
        raise SystemExit("Le monogramme n'a pas de viewBox.")

    interieur = texte[ouverture.end():texte.rindex("</svg>")]
    return interieur.strip(), boite.group(1)


def matrice(url):
    import segno
    code = segno.make(url, error="h")
    return [[bool(c) for c in rang] for rang in code.matrix]


def svg(url, interieur_logo, boite_logo):
    grille = matrice(url)
    n = len(grille)
    cote = (n + 2 * MARGE) * MODULE

    morceaux = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{cote}" height="{cote}" '
        f'viewBox="0 0 {cote} {cote}" role="img" aria-label="Lecture de peau — Révélation Beauté">',
        f'<rect width="{cote}" height="{cote}" fill="{PARCHEMIN}"/>',
    ]

    # Les modules en un seul chemin : fichier léger, impression nette.
    chemin = []
    for y, rang in enumerate(grille):
        for x, plein in enumerate(rang):
            if plein:
                chemin.append(
                    f"M{(x + MARGE) * MODULE} {(y + MARGE) * MODULE}h{MODULE}v{MODULE}h-{MODULE}z"
                )
    morceaux.append(f'<path fill="{CHARBON}" d="{"".join(chemin)}"/>')

    # Réserve centrale en Parchemin, puis le monogramme par-dessus.
    # Le monogramme n'occupe qu'une partie de la réserve : il garde de l'air
    # autour de lui et ne touche jamais les modules du code.
    reserve = round(cote * PART_CENTRE / MODULE) * MODULE
    bord = round((cote - reserve) / 2 / MODULE) * MODULE
    morceaux.append(
        f'<rect x="{bord}" y="{bord}" width="{reserve}" height="{reserve}" fill="{PARCHEMIN}"/>'
    )

    logo = reserve * 0.66
    decalage = bord + (reserve - logo) / 2
    morceaux.append(
        f'<clipPath id="reserve"><rect x="{bord}" y="{bord}" '
        f'width="{reserve}" height="{reserve}"/></clipPath>'
    )
    morceaux.append(
        f'<g clip-path="url(#reserve)">'
        f'<svg x="{decalage:.1f}" y="{decalage:.1f}" width="{logo:.1f}" height="{logo:.1f}" '
        f'viewBox="{boite_logo}" preserveAspectRatio="xMidYMid meet" overflow="hidden">'
        f'{interieur_logo}</svg></g>'
    )

    morceaux.append("</svg>")
    return "\n".join(morceaux), grille, cote


def verifier(grille, url):
    """Relit le QR code, réserve centrale comprise, pour s'assurer qu'il reste lisible."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("  (vérification sautée : opencv n'est pas installé)")
        return None

    n = len(grille)
    echelle = 8
    marge = MARGE * echelle
    image = np.full((n * echelle + 2 * marge, n * echelle + 2 * marge), 255, dtype=np.uint8)
    for y in range(n):
        for x in range(n):
            if grille[y][x]:
                image[marge + y * echelle: marge + (y + 1) * echelle,
                      marge + x * echelle: marge + (x + 1) * echelle] = 0

    # On blanchit exactement la zone couverte par la réserve centrale.
    cote = image.shape[0]
    reserve = int(cote * PART_CENTRE)
    bord = (cote - reserve) // 2
    image[bord:bord + reserve, bord:bord + reserve] = 255

    lu, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
    return lu == url


def main():
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--base", required=True,
                           help="adresse du site, par exemple https://monsite.github.io/diagnostic-peau/")
    options = arguments.parse_args()

    base = options.base if options.base.endswith("/") else options.base + "/"
    interieur, boite = monogramme()
    dossier = RACINE / "qr"
    dossier.mkdir(exist_ok=True)

    for source in SOURCES:
        url = f"{base}?src={source}"
        contenu, grille, _ = svg(url, interieur, boite)
        fichier = dossier / f"qr-{source}.svg"
        fichier.write_text(contenu, encoding="utf-8")

        etat = verifier(grille, url)
        marque = {True: "relu sans erreur", False: "ILLISIBLE", None: "non vérifié"}[etat]
        print(f"  {fichier.relative_to(RACINE)}  →  {url}   [{marque}]")
        if etat is False:
            sys.exit("Un QR code n'est pas relisible : réduisez PART_CENTRE dans ce script.")

    print("\nTerminé. Les fichiers SVG s'impriment à n'importe quelle taille.")


if __name__ == "__main__":
    main()
