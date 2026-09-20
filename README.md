# Skypoint

Petite application web (PWA) pour compter les points d'une partie de Skyjo :
démarrer une partie, ajouter/modifier/retirer des joueurs, noter le score au
tour par tour, et fin automatique dès qu'un joueur atteint le score cible
(100 points par défaut). Historique des parties conservé sur l'appareil.

Aucune dépendance, aucune build : HTML/CSS/JS pur.

## Utilisation sur iPhone

1. Ouvrir l'URL GitHub Pages du projet dans Safari.
2. Appuyer sur le bouton de partage, puis **Sur l'écran d'accueil**.
3. L'app s'ouvre ensuite comme une application native, y compris hors-ligne.

## Développement local

Aucune installation requise : servir simplement le dossier avec un serveur
statique, par exemple :

```bash
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000`.

## Déploiement (GitHub Pages)

Dans les paramètres du repo GitHub : **Settings → Pages → Deploy from a
branch**, choisir la branche `main` et le dossier `/ (root)`.
