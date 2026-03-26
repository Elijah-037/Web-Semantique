<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAE501 — Web Sémantique</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <link rel="stylesheet" href="/css/app.css">
    <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body>
    <header>
        <span class="header-dot"></span>
        <h1>Visualisation d'ontologie OWL 2</h1>
        <p class="subtitle">AfricanWildlifeOntology</p>
    </header>
    <main>
        <?= $content ?>
    </main>
    <script src="/js/visualizations/CirclePacking.js?v=13"></script>
    <script src="/js/visualizations/CollapsibleTree.js?v=13"></script>
    <script src="/js/visualizations/ZoomableSunburst.js?v=13"></script>
    <script src="/js/visualizations/CombinedViz.js?v=13"></script>
    <script src="/js/app.js?v=13"></script>
</body>
</html>
