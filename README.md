# Citations Latines

PWA de 50 citations latines authentiques, une par écran.

## Mise en ligne (GitHub Pages)

1. Créer le dépôt et y envoyer **tout le contenu** de ce dossier (y compris `.github/`).
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Chaque envoi sur `main` lance le workflow **Déploiement**, qui :
   - importe les illustrations depuis Wikimedia Commons et les enregistre dans `img/` ;
   - minifie le CSS et le JS ;
   - incrémente la version du cache du service worker ;
   - publie le site.

Le rapport visuel des illustrations est publié à l’adresse `…/tools/rapport-images.html`.

## Structure

| Élément | Rôle |
| --- | --- |
| `index.html`, `css/`, `js/` | Application |
| `manifest.json`, `sw.js`, `icons/` | PWA (installation, hors ligne) |
| `fonts/` | Cormorant Garamond et EB Garamond, auto-hébergées |
| `data/citations.json` | Source unique des citations |
| `data/credits.json` | Crédits des illustrations (générés) |
| `img/` | Illustrations WebP 1080 × 1920 et 540 × 960, JPEG de secours (générées) |
| `tools/images.json` | Œuvre visée pour chaque auteur et critères de sélection |
| `GUIDE-EDITORIAL.md` | Règles de rédaction et de traduction |

## Mettre à jour

- **Citation** : modifier `data/citations.json` puis envoyer sur `main`.
- **Illustration** : indiquer le nom exact du fichier Commons dans `tools/images.json` (`"commons": ["Nom du fichier.jpg"]`), supprimer l’image correspondante de `img/` et de `data/credits.json`, puis envoyer sur `main`.
- **En local** (facultatif) : `npm install`, `npm run images`, `npm run build`, puis servir `dist/`.
