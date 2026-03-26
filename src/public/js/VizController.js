/**
 * VizController — Orchestrateur des visualisations
 *
 * Gère le cycle de vie des instances de visualisation D3.js,
 * la navigation inter-visualisations et le clic sur un nœud.
 *
 * Dépendances :
 *   - StateManager (global)
 *   - CirclePacking, CollapsibleTree, Sunburst, CombinedViz (globals)
 */
class VizController {
    /**
     * @param {string}       containerSelector  Sélecteur CSS du conteneur de rendu
     * @param {StateManager} stateManager
     */
    constructor(containerSelector, stateManager) {
        this._container  = document.querySelector(containerSelector);
        this._state      = stateManager;
        this._activeViz  = null;
        this._conceptsMap = {}; // uri → label

        this._state.subscribe((s, action) => this._onStateChange(s, action));
    }

    /**
     * Enregistre la liste des concepts pour la résolution des labels.
     * @param {Array} concepts  Tableau {uri, label}
     */
    setConcepts(concepts) {
        this._conceptsMap = {};
        concepts.forEach(c => { this._conceptsMap[c.uri] = c.label || c.uri; });
    }

    // -------------------------------------------------------------------------
    // API publique
    // -------------------------------------------------------------------------

    /**
     * Basculer vers une visualisation en conservant le nœud courant.
     * @param {string}  vizType   'circle-packing' | 'collapsible-tree' | 'sunburst' | 'combined'
     * @param {string}  [nodeUri] URI du nœud à centrer (défaut : nœud courant)
     * @param {string}  [nodeLabel]
     */
    switchTo(vizType, nodeUri, nodeLabel) {

        // 1. Sauvegarder l'état de la viz courante
        if (this._activeViz && this._state.get('currentViz')) {
            this._state.dispatch({
                type:     'SAVE_VIZ_STATE',
                vizType:  this._state.get('currentViz'),
                vizState: this._activeViz.getState(),
            });
        }

        // 2. Mettre à jour le nœud sélectionné si fourni
        if (nodeUri) {
            this._state.dispatch({ type: 'SELECT_NODE', node: { uri: nodeUri, label: nodeLabel || nodeUri } });
        }

        // 3. Mettre à jour la viz active dans l'état
        this._state.dispatch({ type: 'SWITCH_VIZ', vizType });

        // 4. Mettre à jour l'UI (sélect + nav buttons)
        this._syncUI(vizType, nodeUri);

        // 5. Rendre la visualisation
        this._render(vizType, nodeUri || (this._state.get('currentNode') || {}).uri);
    }

    /**
     * Rendu direct sans changer l'état de navigation (utilisé par le bouton "Visualiser").
     */
    renderCurrent(vizType, nodeUri, depth) {
        this._hideContextMenu();
        if (depth !== undefined) {
            this._state.dispatch({ type: 'SET_DEPTH', depth: parseInt(depth, 10) || 3 });
        }
        if (nodeUri !== undefined) {
            const label = this._getLabelForUri(nodeUri);
            this._state.dispatch({ type: 'SELECT_NODE', node: { uri: nodeUri, label } });
        }
        this._state.dispatch({ type: 'SWITCH_VIZ', vizType });
        this._render(vizType, nodeUri);
    }

    /**
     * Rendu de la visualisation combinée.
     */
    renderCombined(conceptUri, propertyUri, depth) {
        this._hideContextMenu();
        this._state.dispatch({ type: 'SWITCH_VIZ', vizType: 'combined' });
        if (conceptUri) {
            this._state.dispatch({ type: 'SELECT_NODE', node: { uri: conceptUri, label: conceptUri } });
        }
        this._renderCombined(conceptUri, propertyUri, depth);
    }

    // -------------------------------------------------------------------------
    // Rendu interne
    // -------------------------------------------------------------------------

    _render(vizType, nodeUri) {
        const depth = this._state.get('depth') || 3;

        if (vizType === 'combined') {
            const saved = this._state.get('vizStates')['combined'];
            this._renderCombined(
                nodeUri || (saved && saved.conceptUri),
                saved && saved.propertyUri,
                saved && saved.depth || depth,
            );
            return;
        }

        let url;
        if (vizType === 'sunburst') {
            url = nodeUri
                ? `/api/hierarchy?concept=${encodeURIComponent(nodeUri)}&depth=-1`
                : '/api/hierarchy?depth=-1';
        } else {
            url = '/api/hierarchy'
                + (nodeUri ? `?concept=${encodeURIComponent(nodeUri)}&depth=${depth}` : `?depth=${depth}`);
        }

        this._container.innerHTML = '<p style="color:#888;padding:1rem;">Chargement\u2026</p>';

        fetch(url)
            .then(r => r.json())
            .then(json => {
                if (json.status !== 'ok' || !json.data) {
                    this._container.innerHTML = `<p style="color:red;padding:1rem;">Erreur API : ${json.message || 'réponse invalide'}</p>`;
                    return;
                }
                this._container.innerHTML = '';
                this._instantiateAndRender(vizType, json.data);
            })
            .catch(err => {
                this._container.innerHTML = `<p style="color:red;padding:1rem;">Erreur réseau : ${err.message}</p>`;
            });
    }

    _renderCombined(conceptUri, propertyUri, depth) {
        if (!conceptUri) {
            this._container.innerHTML = '<p style="color:#888;padding:1rem;">Sélectionnez un concept.</p>';
            return;
        }

        let url = `/api/combined?concept=${encodeURIComponent(conceptUri)}&depth=${encodeURIComponent(depth || 2)}`;
        if (propertyUri) url += `&property=${encodeURIComponent(propertyUri)}`;

        this._container.innerHTML = '<p style="color:#888;padding:1rem;">Chargement\u2026</p>';

        fetch(url)
            .then(r => r.json())
            .then(json => {
                if (json.status !== 'ok' || !json.data) {
                    this._container.innerHTML = `<p style="color:red;padding:1rem;">Erreur API : ${json.message || 'réponse invalide'}</p>`;
                    return;
                }
                this._container.innerHTML = '';

                if (this._activeViz && this._activeViz.destroy) this._activeViz.destroy();

                const viz = new CombinedViz(this._container, {
                    width:       this._container.clientWidth || 1000,
                    height:      700,
                    onNodeClick: (nodeData) => this._handleNodeClick(nodeData, 'combined'),
                });
                this._activeViz = viz;

                viz.setState({ conceptUri, propertyUri: propertyUri || null, depth: parseInt(depth, 10) || 2 });
                viz.render(json.data);

                // Restaurer l'état sauvegardé si le concept est identique
                const saved = this._state.get('vizStates')['combined'];
                if (saved && saved.conceptUri === conceptUri) viz.setState(saved);
            })
            .catch(err => {
                this._container.innerHTML = `<p style="color:red;padding:1rem;">Erreur réseau : ${err.message}</p>`;
            });
    }

    _instantiateAndRender(vizType, data) {
        if (this._activeViz && this._activeViz.destroy) this._activeViz.destroy();

        const ClassMap = {
            'circle-packing':   typeof CirclePacking   !== 'undefined' ? CirclePacking   : null,
            'collapsible-tree': typeof CollapsibleTree !== 'undefined' ? CollapsibleTree : null,
            'sunburst':         typeof Sunburst        !== 'undefined' ? Sunburst        : null,
        };

        const VizClass = ClassMap[vizType];
        if (!VizClass) { console.error('Unknown viz type:', vizType); return; }

        const viz = new VizClass(this._container, {
            width:       this._container.clientWidth || 900,
            height:      650,
            onNodeClick: (nodeData) => this._handleNodeClick(nodeData, vizType),
        });
        this._activeViz = viz;
        viz.render(data);

        // Restaurer l'état sauvegardé
        const saved = this._state.get('vizStates')[vizType];
        if (saved) viz.setState(saved);
    }

    // -------------------------------------------------------------------------
    // Gestion du clic nœud
    // -------------------------------------------------------------------------

    _handleNodeClick(nodeData, sourceVizType) {
        const uri   = nodeData.id || nodeData.uri || nodeData.name || null;
        const label = nodeData.label || nodeData.name || uri || '?';

        if (!uri || nodeData.direction === 'up') return;

        // Mettre à jour le concept sélectionné (breadcrumb + input)
        this._state.dispatch({ type: 'SELECT_NODE', node: { uri, label } });

        const conceptSearch = document.getElementById('concept-search');
        if (conceptSearch) conceptSearch.value = label;
    }

    // -------------------------------------------------------------------------
    // Synchronisation de l'UI
    // -------------------------------------------------------------------------

    _syncUI(vizType, nodeUri) {
        // Mettre à jour les boutons de nav
        document.querySelectorAll('#viz-nav [data-viz]').forEach(btn => {
            const isActive = btn.dataset.viz === vizType;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Mettre à jour l'input de recherche de concept
        if (nodeUri) {
            const label = this._getLabelForUri(nodeUri);
            const conceptSearch = document.getElementById('concept-search');
            if (conceptSearch) conceptSearch.value = label;
        }

        // Afficher/masquer les contrôles combinée
        const combinedDiv = document.getElementById('combined-controls');
        if (combinedDiv) combinedDiv.classList.toggle('hidden', vizType !== 'combined');
    }

    _getLabelForUri(uri) {
        return this._conceptsMap[uri] || uri;
    }

    // -------------------------------------------------------------------------
    // Réaction aux changements d'état externe
    // -------------------------------------------------------------------------

    _onStateChange(state, action) {
        // Synchroniser les boutons nav
        if (action.type === 'SWITCH_VIZ') {
            document.querySelectorAll('#viz-nav [data-viz]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.viz === state.currentViz);
            });
        }
    }
}
