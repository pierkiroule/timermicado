# Release checklist – Timer MICADO

## 1) Scénarios de tests manuels (non-régression)

> Pré-requis: lancer l'app en local (`npm run dev`) et renseigner une heure de fin.

### A. Lancer une session
- [ ] Ouvrir l’app sur l’écran de configuration.
- [ ] Saisir un nombre de situations et une heure de fin.
- [ ] Cliquer sur `🚀 Lancer`.
- [ ] Vérifier l’affichage de la vue run (camembert + liste).

### B. Sauvegarder une session
- [ ] Ouvrir `💾 Bibliothèque de sessions`.
- [ ] Saisir un nom dans “Créer une nouvelle sauvegarde”.
- [ ] Cliquer sur `Sauvegarder la liste actuelle`.
- [ ] Vérifier l’apparition de la sauvegarde dans la liste + notice de succès.

### C. Reprendre une session
- [ ] Sélectionner une sauvegarde.
- [ ] Vérifier que le bouton `Reprendre (heure de fin ci-dessus)` est activé si l’heure de fin est renseignée.
- [ ] Cliquer sur Reprendre.
- [ ] Vérifier la notice de reprise et la reconstruction du timer.

### D. Supprimer une session
- [ ] Sélectionner une sauvegarde.
- [ ] Cliquer sur `Supprimer la sauvegarde sélectionnée`.
- [ ] Vérifier disparition de la sauvegarde et notice de suppression.

### E. Exporter template
- [ ] Sélectionner une sauvegarde.
- [ ] Cliquer sur `Partager la liste (template)`.
- [ ] Vérifier qu’un fichier `*.template.json` est téléchargé.
- [ ] Vérifier que le JSON contient `type: "template"`.

### F. Importer template + collisions de nom
- [ ] Importer le template exporté (`Importer un template`).
- [ ] Vérifier création d’une nouvelle sauvegarde (ID distinct).
- [ ] Réimporter le même fichier plusieurs fois.
- [ ] Vérifier les noms: `Nom`, `Nom (copie 1)`, `Nom (copie 2)`, etc.
- [ ] Vérifier qu’aucune sauvegarde existante n’est écrasée.

## 2) Vérification accessibilité (nouvelles modales/accordéons)

### A. Modale `📊 Stats live`
- [ ] Ouvrir la modale via le bouton sous le camembert.
- [ ] Vérifier présence des attributs dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`).
- [ ] Vérifier que le focus est placé sur le bouton `Fermer` à l’ouverture.
- [ ] Appuyer sur `Escape` et vérifier la fermeture.

### B. Accordéons bas de page
- [ ] Vérifier `aria-expanded` + `aria-controls` pour:
  - `💾 Bibliothèque de sessions`
  - `📈 Synthèse sessions`
- [ ] Vérifier navigation clavier (Enter/Espace) pour ouverture/fermeture.
- [ ] Vérifier états vides: aucune session / aucune sélection / données incomplètes.

## 3) Contrôles automatiques minimum
- [ ] `npm test`
- [ ] `npm run build`

## 4) Go / No-Go release
- [ ] Tous les tests automatisés passent.
- [ ] Tous les scénarios manuels A→F sont validés.
- [ ] Accessibilité minimale validée (modale + accordéons).
- [ ] Vérification finale UX: aucun contrôle historique existant n’a été déplacé/supprimé.

## 5) Invariants temporels
- [ ] Refuser une heure déjà passée sans reporter au lendemain.
- [ ] Vérifier que pause/reprise, ajout/suppression et poids ne changent jamais l’échéance.
- [ ] Recharger pendant une pause : conserver son début et les événements précédents.
- [ ] Dépasser l’échéance pendant une pause ou après mise en veille : afficher TERMINÉ et zéro temps restant ; figer les statistiques à l’échéance.
- [ ] Terminer plus tôt : conserver l’heure de fin fixée, enregistrer la fin réelle et afficher zéro temps restant après rechargement.
- [ ] Supprimer toutes les situations puis recharger : conserver la réunion et son échéance ; pouvoir ajouter une nouvelle situation avant la fin.
- [ ] Supprimer puis ajouter une situation : ne pas réutiliser l’identifiant supprimé dans la chronologie.
