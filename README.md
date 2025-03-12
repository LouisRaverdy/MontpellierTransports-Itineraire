# 🚋 Montpellier Transports - Itinéraire 🏙️

**Montpellier Transports a besoin de toi !** 🫵
👉 **Va à la section _"Comment Contribuer"_ pour savoir comment participer !**

[![CodeFactor](https://www.codefactor.io/repository/github/louisraverdy/montpelliertransports-itineraire/badge)](https://www.codefactor.io/repository/github/louisraverdy/montpelliertransports-itineraire)

---

## 📌 Description

Bienvenue dans le projet **Montpellier Transports - Itinéraire** 🚊 !  
Ce projet est **le cœur de l'algorithme d'itinéraire** de l'application [Montpellier Transports](https://montpellier-transports.fr).

🛠️ **Il implémente une version optimisée de l'algorithme RAPTOR** (_Round-based Public Transit Optimized Router_), initialement développé par [PlanarNetwork](https://github.com/planarnetwork/raptor).

⚡ **Cet algorithme permet de :**  
✔️ Calculer les itinéraires **les plus rapides** et **optimaux** en transports publics.
✔️ Prendre en compte **les horaires, les correspondances et les temps de trajet**.
✔️ **Estimer les émissions de CO₂** pour évaluer l'impact écologique de chaque trajet.

---

## 🤝 Comment Contribuer ?

Toutes les contributions sont **les bienvenues** ! 🚀
Si tu cherches de l'inspiration, voici quelques pistes :

✅ **Optimisation du code** (réduction du temps de calcul, optimisation serveur, etc.)
✅ **Amélioration des itinéraires** (trouver les trajets les plus pertinents, éviter les erreurs)
✅ **Ajout de nouvelles fonctionnalités** (suggestions bienvenues !)

🔗 **N'hésite pas à proposer une issue ou une pull request !**

---

## 🔥 Fonctionnalités

✅ **Calcul rapide et optimal** des itinéraires en transport public.
✅ **Prise en compte des horaires et correspondances** pour des trajets précis.
✅ **Estimation des émissions de CO₂** pour sensibiliser à l’impact environnemental.
✅ **Optimisation de l'algorithme RAPTOR** pour une meilleure efficacité.
✅ **Projet open-source** : libre d'utilisation avec mention des crédits.

---

## 🚀 Installation

### 📌 Prérequis

🔹 **Node.js** (version **16** ou supérieure)
🔹 **npm** (Node Package Manager)

### 📥 Étapes d'installation

1️⃣ Clone le dépôt sur ta machine :
```bash
git clone https://github.com/LouisRaverdy/MontpellierTransports-Itineraire.git
cd MontpellierTransports-Itineraire
```

2️⃣ Installe les dépendances nécessaires :  
```bash
npm install
```

---

## ⚙️ Utilisation  

### 🏗️ Compilation du projet
1️⃣ Avant de lancer l'application et à chaque modification, compile le projet avec :  
```bash
npm run build
```

### 📥 Récupération des données GTFS
Après la compilation, télécharge les données en exécutant :
```bash
npm run getter
```

> ⚠️ **Note** : Les données GTFS sont mises à jour régulièrement.
> 👉 Pense à les **re-télécharger environ toutes les semaines** pour garantir des itinéraires à jour ! ✅

### ▶️ Lancement du projet
Une fois les données récupérées et le projet compilé, démarre l’application avec :
```bash
npm start
```

---

## 🌍 API - Effectuer des requêtes  

Une fois le serveur lancé, tu peux effectuer des requêtes vers l'API pour interagir avec le calculateur d'itinéraire.  
📌 **Exemples d'utilisation avec Postman, cURL ou un client HTTP** :  

### 📍 **Rechercher un itinéraire**
**📌 POST** `/itineraire/trip`

🔹 **Description** : Recherche un itinéraire entre un départ et une destination, en prenant en compte les horaires et filtres.
🔹 **Exemple de requête JSON** :
```json
{
  "depart": "S5102",
  "destination": "S5123",
  "datetime": "2025-03-22T08:24:00Z",
  "isAller": true,
  // "filters": ["Tram"] filtrer les trajets avec uniquement des trams
}
```

### 📍 **Rechercher un chemin piéton**
**📌 GET** `/itineraire/path`

🔹 **Description** : Trouve le chemin le plus court pour un piéton entre deux points géographiques.
🔹 **Exemple d'URL** :
```plaintext
/itineraire/path?startLat=43.605276&startLng=3.877580&finishLat=43.603341&finishLng=3.879929
```

### ⏳ Recalculer un itinéraire déja planifié
**📌 POST** `/itineraire/delay`

🔹 **Description** : Recalcule le meme itinéraire en fonction d’une nouvelle date.
🔹 **Exemple de requête JSON** :
```json
{
   "tripDetails": [
      {
         "ligne_id": 2,
         "direction_id": [
               0,
               1215,
               1582402858
         ],
         "stations": [
            {
               "logical_id": "S5760",
               "physical_id": 1189,
               "nom": "Saint-Jean de Védas Centre",
               "time": 45540
            },
            {
               "logical_id": "S5761",
               "physical_id": 1190,
               "nom": "Saint-Jean le Sec",
               "time": 45660
            },
            {
               "logical_id": "S5751",
               "physical_id": 1191,
               "nom": "La Condamine",
               "time": 45720
            },
            {
               "logical_id": "S5766",
               "physical_id": 1192,
               "nom": "Victoire 2",
               "time": 45840
            },
            {
               "logical_id": "S5633",
               "physical_id": 1193,
               "nom": "Sabines",
               "time": 46080
            },
            {
               "logical_id": "S5672",
               "physical_id": 1194,
               "nom": "Villeneuve d'Angoulême",
               "time": 46200
            },
            {
               "logical_id": "S5433",
               "physical_id": 1195,
               "nom": "Croix d'Argent",
               "time": 46320
            },
            {
               "logical_id": "S5555",
               "physical_id": 1196,
               "nom": "Mas Drevon",
               "time": 46380
            },
            {
               "logical_id": "S5523",
               "physical_id": 1197,
               "nom": "Lemasson",
               "time": 46440
            },
            {
               "logical_id": "S5635",
               "physical_id": 1198,
               "nom": "Saint-Cléophas",
               "time": 46560
            },
            {
               "logical_id": "S5569",
               "physical_id": 1199,
               "nom": "Nouveau Saint-Roch",
               "time": 46680
            },
            {
               "logical_id": "S5629",
               "physical_id": 1200,
               "nom": "Rondelet",
               "time": 46740
            }
         ]
      }
   ],
  "newDate": "2025-03-22T08:24:00Z",
  "isAller": true,
}
```

---

## 🎯 Contribuer

Les contributions sont **ouvertes à tous** ! 🤝  

```bash
# 🔹 Une idée ?
Propose une issue 📝

# 🔹 Une amélioration ?
Fais une pull request 🔧

# 🔹 Un bug ?
Ouvre un ticket 🐛
```
Merci d’utiliser **Montpellier Transports - Itinéraire** ! ❤️  

---


## ⚠️ Notes importantes  

> ⚠️ **Évite de modifier le format des données d'entrée des requêtes**, sauf si nécessaire.
> 🚀 **Les performances sont essentielles** : toute optimisation est la bienvenue !

---

## 👏 Crédits  

- 💡 **Algorithme RAPTOR** : [PlanarNetwork RAPTOR](https://github.com/planarnetwork/raptor)  
- 🛠️ **Développé pour** : [Montpellier Transports](https://montpellier-transports.fr)  
- 🤝 **(Bientôt) Toi !** 🚀  

---

## 📜 Licence  

🔓 Ce projet est sous licence **MIT**.  
📌 Vous êtes libre de l'utiliser et de l'adapter, mais toute utilisation doit **mentionner les crédits** à ce projet et à l’algorithme **RAPTOR**.  

---

### 🚀 **Prêt à contribuer ? On t’attend !** 🏆