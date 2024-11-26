# Montpellier Transports - Itinéraire

[![CodeFactor](https://www.codefactor.io/repository/github/louisraverdy/montpelliertransports-itineraire/badge)](https://www.codefactor.io/repository/github/louisraverdy/montpelliertransports-itineraire)

## Description
Bienvenue dans le projet **Montpellier Transports - Itinéraire**, qui constitue le cœur de l'algorithme d'itinéraire de l'application [Montpellier Transports](https://montpellier-transports.fr).

Ce projet implémente une version optimisée de l'algorithme **RAPTOR** (Round-based Public Transit Optimized Router), initialement développé par [PlanarNetwork](https://github.com/planarnetwork/raptor).

Cet algorithme offre une solution efficace pour le calcul d'itinéraires dans les réseaux de transports publics, en prenant en compte les horaires, les correspondances et les temps de trajet pour fournir des itinéraires optimaux.

---

## Fonctionnalités
- **Calcul rapide et optimal des itinéraires** pour les réseaux de transport public.
- **Estimation des émissions de CO₂** pour les trajets en bus et tram, permettant aux utilisateurs de connaître l'impact environnemental de leurs déplacements.
- Implémentation améliorée de l'algorithme RAPTOR pour une meilleure compatibilité et des fonctionnalités étendues.
- Open source, utilisable librement avec mention des crédits.

---

## Installation
### Prérequis
- Node.js (version 14 ou supérieure)
- npm (Node Package Manager)

1. Clonez ce dépôt sur votre machine :
   ```bash
   git clone https://github.com/LouisRaverdy/MontpellierTransports-Itineraire.git
   ```
2. Installez les dépendances nécessaires :
   ```bash
   cd MontpellierTransports-Itineraire
   npm install
   ```
3. Préparer les données GTFS :

Assurez-vous de disposer des données GTFS nécessaires dans le dossier `imports` et les données de Montpellier dans `exports`.

Consultez les fichiers README dans ces dossiers pour plus de détails.

---

## Utilisation
### Compilation du projet
Avant de lancer l'application, vous devez compiler le projet :
```bash
npm run build
```
### Lancement du projet
Une fois le projet compilé, vous pouvez le démarer avec la commande :
```bash
npm start
```

### Exécution de l'algorithme
L'algorithme traite les données GTFS pour calculer les itinéraires optimaux et estime les émissions de CO₂ associées à chaque itinéraire. Assurez-vous que les données sont a jour (y compris dans la date dans l'appel de la fonction).

---

## Contribuer
Les contributions sont les bienvenues ! Si vous souhaitez améliorer cet algorithme ou proposer des fonctionnalités, n'hésitez pas à soumettre une pull request ou à ouvrir une issue.

Merci d'utiliser **Montpellier Transports - Itinéraire** !

---

## Notes importantes
- **Ne modifiez pas les paramètres d'entrée ou de sortie** (sauf si vous avez une idée géniale).
- Les crédits pour l'algorithme doivent être explicitement mentionnés lors de son utilisation ou de son intégration dans d'autres projets.

---

## Crédits
- Algorithme RAPTOR : [PlanarNetwork RAPTOR](https://github.com/planarnetwork/raptor)
- Ce projet : développé pour l'application [Montpellier Transports](https://montpellier-transports.fr).

---

## Licence
Ce projet est sous licence MIT. Vous êtes libre de l'utiliser et de l'adapter, mais toute utilisation doit être accompagnée des crédits appropriés à ce projet et à l'algorithme RAPTOR.
