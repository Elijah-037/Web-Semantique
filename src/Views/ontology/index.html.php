<div id="app">

    <aside id="sidebar">

        <div class="sb-section">
            <span class="sb-label">Concept</span>
            <select id="select-concept" class="sb-select">
                <option value="">— owl:Thing (racine) —</option>
            </select>
        </div>

        <div class="sb-divider"></div>

        <div class="sb-section">
            <span class="sb-label">Visualisation</span>
            <div class="viz-cards">
                <button id="btn-coupe" class="viz-card active">
                    <span class="vc-icon">◉</span>
                    <span class="vc-body">
                        <span class="vc-name">Coupe</span>
                        <span class="vc-desc">Cercles imbriqués</span>
                    </span>
                </button>
                <button id="btn-progressive" class="viz-card">
                    <span class="vc-icon">☷</span>
                    <span class="vc-body">
                        <span class="vc-name">Progressive</span>
                        <span class="vc-desc">Arbre dépliable</span>
                    </span>
                </button>
                <button id="btn-radial" class="viz-card">
                    <span class="vc-icon">◎</span>
                    <span class="vc-body">
                        <span class="vc-name">Radiale</span>
                        <span class="vc-desc">Sunburst zoomable</span>
                    </span>
                </button>
            </div>
        </div>

        <div class="sb-divider"></div>

        <div class="sb-section">
            <span class="sb-label">Propriété</span>
            <select id="select-property" class="sb-select">
                <option value="">— Sélectionner —</option>
            </select>
            <button id="btn-props" class="viz-card" style="margin-top:.6rem">
                <span class="vc-icon">⬢</span>
                <span class="vc-body">
                    <span class="vc-name">Propriétés</span>
                    <span class="vc-desc">Graphe combiné</span>
                </span>
            </button>
        </div>

        <div class="sb-footer">
            <span class="sb-footer-text">OWL 2 · EasyRDF · D3.js v7</span>
        </div>

    </aside>

    <div id="viz-container">
        <div id="loading" class="hidden">Chargement…</div>
        <div id="error-message" class="hidden"></div>
    </div>

</div>
