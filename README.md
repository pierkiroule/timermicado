# Timer MICADO

Application locale de minuterie pour les réunions de pédopsychiatrie (staff clinique). Basée sur React + Vite avec un design flat inspiré de l'univers Google.

## Démarrage rapide

```bash
npm install
npm run dev
```

Puis ouvrez <http://localhost:5173>.

## Fonctionnalités clés

- Gestion des cas patients avec priorités.
- Minuterie globale + minuterie par cas.
- Mode pause/reprise et passage au cas suivant.
- Export Excel de la synthèse.
- Sauvegarde locale automatique (LocalStorage).

## Qualité / release

- Checklist de release et scénarios de non-régression : `RELEASE_CHECKLIST.md`.

## Règles temporelles

- L’heure de fin est fixée au lancement, pour aujourd’hui, et reste immuable pendant la réunion. Une heure passée est refusée ; elle n’est jamais reportée automatiquement au lendemain.
- Le budget restant vaut `max(0, heure de fin − heure actuelle)`. Une pause ne suspend pas l’horloge et ne prolonge pas la réunion.
- Chaque situation reçoit une part du budget proportionnelle à son poids. Ajouter, supprimer ou reprioriser une situation redistribue le budget sans changer l’échéance.
- À l’échéance, le budget est nul, même pendant une pause. Un arrêt anticipé conserve l’échéance prévue et enregistre séparément la fin réelle.
- Les compteurs s’arrêtent à la fin réelle ou à l’échéance. L’historique des événements et des pauses est conservé au rechargement pour les nouvelles sessions.
- Reprendre une liste sauvegardée démarre une nouvelle réunion avec une nouvelle échéance ; recharger la page conserve la réunion courante.
