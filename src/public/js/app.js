/**
 * app.js — Point d'entrée principal
 *
 * Vues classes : Coupe (CirclePacking) | Progressive (CollapsibleTree) | Radiale (ZoomableSunburst)
 * Vue propriétés du concept : CombinedViz sur /api/properties?concept=...
 * Vue hiérarchie de propriété : CirclePacking sur /api/property-hierarchy?property=...
 *
 * L'état de déploiement est partagé entre les vues de classe (Coupe/Progressive/Radiale).
 * Les menus déroulants permettent de naviguer directement vers un concept ou une propriété.
 */

// ─────────────────────────────────────────────────────────────────────────────
// État global
// ─────────────────────────────────────────────────────────────────────────────

let currentFocusUri = null;   // URI du concept courant (vues classes + propriétés concept)
let currentPropUri  = null;   // URI de la propriété courante (vue hiérarchie propriété)
let activeViz       = null;
let activeVizType   = 'coupe'; // 'coupe' | 'progressive' | 'radial' | 'props' | 'prop-hier'
let pendingState    = null;    // état à restaurer au prochain rendu

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btn-coupe')
        .addEventListener('click', () => switchViz('coupe'));
    document.getElementById('btn-progressive')
        .addEventListener('click', () => switchViz('progressive'));
    document.getElementById('btn-radial')
        .addEventListener('click', () => switchViz('radial'));
    document.getElementById('btn-props')
        .addEventListener('click', () => switchViz('props'));

    document.getElementById('select-concept')
        .addEventListener('change', onConceptSelect);
    document.getElementById('select-property')
        .addEventListener('change', onPropertySelect);

    // Charger les menus déroulants puis afficher la vue initiale
    await Promise.all([loadConcepts(), loadAllProperties()]);

    loadAndRender(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Chargement des menus déroulants
// ─────────────────────────────────────────────────────────────────────────────

async function loadConcepts() {
    try {
        const resp = await fetch('/api/concepts');
        const json = await resp.json();
        if (json.status !== 'ok') return;

        const select = document.getElementById('select-concept');
        json.data
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label))
            .forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.uri;
                opt.textContent = c.label;
                select.appendChild(opt);
            });
    } catch (_) {}
}

async function loadAllProperties() {
    try {
        const resp = await fetch('/api/all-properties');
        const json = await resp.json();
        if (json.status !== 'ok') return;

        const select = document.getElementById('select-property');
        json.data
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label))
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.uri;
                opt.textContent = p.label + (p.type === 'DatatypeProperty' ? ' (D)' : ' (O)');
                select.appendChild(opt);
            });
    } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestionnaires des menus déroulants
// ─────────────────────────────────────────────────────────────────────────────

function onConceptSelect(e) {
    const uri = e.target.value || null;
    currentFocusUri = uri;

    // Si on était en vue hiérarchie de propriété, revenir à coupe
    if (activeVizType === 'prop-hier') {
        activeVizType = 'coupe';
        updateNavButtons('coupe');
    }

    loadAndRender(currentFocusUri);
}

function onPropertySelect(e) {
    const uri = e.target.value;
    if (!uri) return;
    currentPropUri = uri;

    // Réinitialiser l'état partagé (changement de catégorie de données)
    pendingState = null;
    activeVizType = 'prop-hier';
    updateNavButtons('prop-hier');

    loadAndRender(currentPropUri);
}

// ─────────────────────────────────────────────────────────────────────────────
// Changement de visualisation (boutons du nav)
// ─────────────────────────────────────────────────────────────────────────────

function isClassViz(type) {
    return type === 'coupe' || type === 'progressive' || type === 'radial';
}

function switchViz(type) {
    if (type === activeVizType) return;

    // Partager l'état entre vues de la même catégorie (classes ↔ classes)
    pendingState = (isClassViz(type) && isClassViz(activeVizType) && activeViz)
        ? activeViz.getState()
        : null;

    activeVizType = type;
    updateNavButtons(type);

    loadAndRender(currentFocusUri);
}

function updateNavButtons(type) {
    document.querySelectorAll('.viz-card').forEach(b => b.classList.remove('active'));
    const ids = {
        coupe:       'btn-coupe',
        progressive: 'btn-progressive',
        radial:      'btn-radial',
        props:       'btn-props',
    };
    if (ids[type]) {
        document.getElementById(ids[type])?.classList.add('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement et rendu
// ─────────────────────────────────────────────────────────────────────────────

async function loadAndRender(uri) {
    const loading = document.getElementById('loading');
    const errEl   = document.getElementById('error-message');

    errEl?.classList.add('hidden');

    // Messages d'invite quand aucune sélection
    if (activeVizType === 'props' && !uri) {
        if (activeViz) { activeViz.destroy(); activeViz = null; }
        renderPlaceholder('Sélectionne un concept dans le menu déroulant ou dans Coupe / Progressive / Radiale pour voir ses propriétés.');
        return;
    }

    if (activeVizType === 'prop-hier' && !uri) {
        if (activeViz) { activeViz.destroy(); activeViz = null; }
        renderPlaceholder('Sélectionne une propriété dans le menu déroulant pour voir sa hiérarchie.');
        return;
    }

    loading?.classList.remove('hidden');

    try {
        const url  = buildUrl(uri);
        const resp = await fetch(url);
        const json = await resp.json();

        if (json.status !== 'ok' || !json.data) {
            throw new Error(json.message || 'Réponse invalide');
        }

        render(json.data);
    } catch (err) {
        if (errEl) {
            errEl.textContent = 'Erreur : ' + err.message;
            errEl.classList.remove('hidden');
        }
    } finally {
        loading?.classList.add('hidden');
    }
}

function buildUrl(uri) {
    if (activeVizType === 'props') {
        return '/api/properties?concept=' + encodeURIComponent(uri);
    }
    if (activeVizType === 'prop-hier') {
        return uri
            ? '/api/property-hierarchy?property=' + encodeURIComponent(uri)
            : '/api/property-hierarchy';
    }
    if (activeVizType === 'progressive') {
        return uri
            ? '/api/progressive?concept=' + encodeURIComponent(uri)
            : '/api/progressive';
    }
    // coupe et radiale utilisent le même endpoint de hiérarchie
    return uri
        ? '/api/hierarchy?concept=' + encodeURIComponent(uri) + '&depth=-1'
        : '/api/hierarchy?depth=-1';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu de la visualisation
// ─────────────────────────────────────────────────────────────────────────────

function render(data) {
    const container = document.getElementById('viz-container');

    d3.select(container).selectAll('.viz-placeholder').remove();

    if (activeViz) { activeViz.destroy(); activeViz = null; }

    const options = {
        width:         container.clientWidth,
        height:        container.clientHeight,
        onFocusChange: (uri) => {
            currentFocusUri = uri;
            syncConceptSelect(uri);
        },
    };

    if (activeVizType === 'props') {
        activeViz = new CombinedViz(container, options);
        activeViz.render(buildPropertiesVizData(data));
    } else if (activeVizType === 'progressive') {
        activeViz = new CollapsibleTree(container, options);
        activeViz.render(data); // data = { tree, links }
    } else if (activeVizType === 'radial') {
        activeViz = new ZoomableSunburst(container, options);
        activeViz.render(data);
    } else if (activeVizType === 'prop-hier') {
        // La hiérarchie de propriété a le même format que la hiérarchie de classes
        activeViz = new CirclePacking(container, options);
        activeViz.render(data);
    } else {
        // coupe (défaut)
        activeViz = new CirclePacking(container, options);
        activeViz.render(data);
    }

    if (pendingState) {
        activeViz.setState(pendingState);
        pendingState = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation du menu déroulant concept
// ─────────────────────────────────────────────────────────────────────────────

function syncConceptSelect(uri) {
    const select = document.getElementById('select-concept');
    if (!select || !uri) return;
    for (const opt of select.options) {
        if (opt.value === uri) {
            select.value = uri;
            return;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformation des données propriétés → format CombinedViz
// ─────────────────────────────────────────────────────────────────────────────

function buildPropertiesVizData(data) {
    const concept  = data.concept;
    const objProps = data.objectProperties || [];

    const hierarchy = {
        id:       concept.uri,
        label:    concept.label,
        name:     concept.label,
        children: [],
    };

    const nodeMap    = {};
    const chainLinks = [];

    objProps.forEach(prop => {
        const rangeUri = prop.range;
        if (!rangeUri) return;

        if (!nodeMap[rangeUri]) {
            nodeMap[rangeUri] = {
                id:    rangeUri,
                label: uriLocalName(rangeUri),
            };
        }

        chainLinks.push({
            source: concept.uri,
            target: rangeUri,
            label:  prop.label || uriLocalName(prop.uri),
        });
    });

    return {
        hierarchy,
        properties:    objProps,
        propertyChain: {
            nodes: Object.values(nodeMap),
            links: chainLinks,
        },
    };
}

function uriLocalName(uri) {
    if (!uri) return '';
    const h = uri.lastIndexOf('#');
    if (h !== -1) return uri.slice(h + 1);
    const s = uri.lastIndexOf('/');
    if (s !== -1) return uri.slice(s + 1);
    return uri;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message d'invite quand aucun concept n'est sélectionné
// ─────────────────────────────────────────────────────────────────────────────

function renderPlaceholder(message) {
    const container = document.getElementById('viz-container');
    d3.select(container).selectAll('*').remove();
    d3.select(container).append('p')
        .attr('class', 'viz-placeholder')
        .text(message);
}
