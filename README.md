# SAE501 — Web Sémantique : Visualisation d'Ontologies OWL 2

Application web de visualisation interactive d'ontologies OWL 2, développée dans le cadre de la SAE501 (Université Sorbonne Paris Nord — Jérôme NOBECOURT).

---

## Fonctionnalités

- Visualisation de l'héritage d'un concept (hiérarchie de classes)
- Visualisation des propriétés d'un concept (ObjectProperty, DataProperty)
- Visualisation de la hiérarchie d'une propriété
- Visualisation combinée : héritage + propriétés + chaîne de propriétés sur une profondeur configurable
- Navigation inter-visualisations avec conservation de l'état

### Types de visualisations D3.js

| Type | Description |
|------|-------------|
| Circle Packing | Hiérarchie en cercles imbriqués (coupe) |
| Collapsible Tree | Arbre hiérarchique repliable (progressive) |
| Zoomable Sunburst | Anneaux concentriques autour du concept courant (radiale) |

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | PHP 8.3, architecture MVC |
| Parser ontologie | EasyRDF 1.1 |
| Visualisation | D3.js v7 |
| Format données | RDF / OWL 2 |
| Serveur | Apache 2 (mod_rewrite) |
| Conteneurisation | Docker + Docker Compose |

---

## Prérequis

### Pour le mode développement (recommandé)

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20
- Git

> Aucune installation locale de PHP ou Composer n'est nécessaire.

### Pour une installation sans Docker (optionnel)

- PHP ≥ 8.0 avec les extensions : `xml`, `mbstring`, `json`
- [Composer](https://getcomposer.org/) ≥ 2
- Apache 2 avec `mod_rewrite` activé

---

## Lancer le projet en développement

### 1. Cloner le dépôt

```bash
git clone <url-du-repo>
cd Web-S-mantique---Kevin
```

### 2. Démarrer les conteneurs

```bash
docker-compose up --build
```

Le premier démarrage télécharge l'image PHP, installe les extensions et les dépendances Composer. Les démarrages suivants sont plus rapides.

L'application est accessible sur : **http://localhost:8080**

### 3. Arrêter les conteneurs

```bash
docker-compose down
```

Pour supprimer également le volume `vendor_cache` :

```bash
docker-compose down -v
```

---

## Rechargement à chaud

Le dossier `src/` est monté directement dans le conteneur. Toute modification d'un fichier PHP ou d'une vue est **immédiatement prise en compte** sans redémarrer le conteneur ni rebuilder l'image.

Un rebuild (`docker-compose up --build`) n'est nécessaire que si vous modifiez :
- `Dockerfile.dev`
- `src/composer.json` (ajout/suppression de dépendances)

---

## Variables d'environnement

| Variable | Valeur par défaut | Description |
|----------|------------------|-------------|
| `OWL_FILE_PATH` | `/var/www/assets/AfricanWildlifeOntology1.owl` | Chemin vers le fichier ontologie |
| `APP_DEBUG` | `true` | Affichage des erreurs PHP |

---

## Structure du projet

```
/
├── Dockerfile.dev              # Image Docker de développement
├── docker-compose.yml          # Orchestration des services
├── Assets/
│   └── AfricanWildlifeOntology1.owl  # Ontologie OWL 2 de référence
├── src/
│   ├── composer.json           # Dépendances PHP (EasyRDF)
│   ├── public/
│   │   ├── index.php           # Front controller (point d'entrée unique)
│   │   └── .htaccess           # Réécriture Apache
│   ├── Controllers/
│   │   ├── BaseController.php  # render() + json()
│   │   ├── OntologyController.php
│   │   └── ApiController.php
│   ├── Models/
│   │   ├── OntologyModel.php   # Parsing classes/hiérarchie
│   │   └── GraphModel.php      # Parsing propriétés/graphe
│   ├── Views/
│   │   ├── layouts/main.html.php
│   │   └── ontology/index.html.php
│   ├── Core/
│   │   ├── App.php             # Bootstrap + enregistrement des routes
│   │   └── Router.php          # Dispatch HTTP
│   └── config/
│       └── app.php             # Configuration (chemin OWL, base_url)
├── tasks/                      # Fiches de tâches de développement
└── TASKS.md                    # Tableau de bord des tâches
```

---

## API REST

| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/` | Interface principale |
| GET | `/api/concepts` | Liste de tous les concepts |
| GET | `/api/hierarchy?concept=<uri>&depth=<n>` | Hiérarchie d'un concept |
| GET | `/api/properties?concept=<uri>` | Propriétés d'un concept |
| GET | `/api/property-hierarchy?property=<uri>` | Hiérarchie d'une propriété |
| GET | `/api/combined?concept=<uri>&property=<uri>&depth=<n>` | Visualisation combinée |

Toutes les réponses sont au format **JSON**.

---

## Débogage

Xdebug est préinstallé dans l'image de développement (port `9003`).

Pour consulter les logs Apache/PHP :

```bash
docker-compose logs -f php
```

Pour ouvrir un shell dans le conteneur :

```bash
docker-compose exec php bash
```

Pour vérifier que EasyRDF est bien disponible :

```bash
docker-compose exec php php -r "require 'vendor/autoload.php'; echo EasyRdf\Graph::class . PHP_EOL;"
```

---

## Ontologie de référence

Le fichier `Assets/AfricanWildlifeOntology1.owl` est une ontologie OWL 2 décrivant la faune africaine. Elle est utilisée comme jeu de données de test et de démonstration pour toutes les visualisations.
