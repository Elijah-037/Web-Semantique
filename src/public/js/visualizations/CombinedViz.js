/**
 * CombinedViz — Visualisation combinée (TASK-09)
 *
 * Affiche simultanément :
 *  - L'héritage d'un concept C (arbre de classes via subClassOf)
 *  - Les propriétés du concept C
 *  - La chaîne des propriétés P sur une profondeur p
 *
 * Rendu : force-directed graph (D3 v7)
 *
 * Différentiation visuelle :
 *  - Nœuds hiérarchie seuls   : cercles bleu-gris (#7bafd4)
 *  - Nœuds chaîne seuls       : cercles orange (#f4a261)
 *  - Nœuds partagés           : cercles verts (#2a9d8f)
 *  - Liens subClassOf         : traits gris fins (---)
 *  - Liens propriété          : flèches rouges avec étiquette (→)
 */
class CombinedViz {
    /**
     * @param {string|HTMLElement} container  Sélecteur CSS ou élément DOM
     * @param {object}             options
     * @param {number}  [options.width=1000]
     * @param {number}  [options.height=700]
     * @param {function} [options.onNodeClick]  Callback(nodeData) lors du clic
     */
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.width       = options.width  || 1000;
        this.height      = options.height || 700;
        this.onNodeClick = options.onNodeClick || null;

        // Internal state
        this.currentConcept  = null;
        this.currentProperty = null;
        this.currentDepth    = 2;
        this.expandedNodes   = new Set();

        this._svg        = null;
        this._simulation = null;
        this._allNodes   = [];
        this._allLinks   = [];
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Renders the combined visualization from API data.
     *
     * @param {object} combinedData  Response from GET /api/combined
     *   combinedData.hierarchy    — D3 tree object
     *   combinedData.properties   — array of property objects
     *   combinedData.propertyChain — { nodes: [...], links: [...] }
     */
    render(combinedData) {
        this._clear();
        const { hierarchy, propertyChain } = combinedData;

        // --- Build unified node/link sets ---
        const nodeMap = {};  // id → node object

        // 1. Extract all nodes from hierarchy (BFS on tree)
        const hierarchyNodeIds = new Set();
        const treeQueue = [hierarchy];
        while (treeQueue.length) {
            const n = treeQueue.shift();
            if (!n || !n.id) continue;
            hierarchyNodeIds.add(n.id);
            if (!nodeMap[n.id]) {
                nodeMap[n.id] = {
                    id:     n.id,
                    label:  n.label || n.name || this._localName(n.id),
                    group:  'hierarchy',
                };
            }
            if (n.children && n.children.length) {
                n.children.forEach(c => treeQueue.push(c));
            }
        }

        // 2. Property chain nodes — mark shared ones green
        const chainNodes  = (propertyChain && propertyChain.nodes)  || [];
        const chainLinks  = (propertyChain && propertyChain.links)  || [];

        chainNodes.forEach(cn => {
            if (nodeMap[cn.id]) {
                // Shared node — upgrade group
                nodeMap[cn.id].group = 'shared';
            } else {
                nodeMap[cn.id] = {
                    id:    cn.id,
                    label: cn.label || this._localName(cn.id),
                    group: 'chain',
                };
            }
        });

        this._allNodes = Object.values(nodeMap);

        // 3. Hierarchy links (subClassOf)
        const hierLinks = [];
        const hierQueue2 = [{ node: hierarchy, parent: null }];
        while (hierQueue2.length) {
            const { node, parent } = hierQueue2.shift();
            if (!node || !node.id) continue;
            if (parent) {
                hierLinks.push({
                    source: parent.id,
                    target: node.id,
                    type:   'hierarchy',
                    label:  '',
                });
            }
            if (node.children) {
                node.children.forEach(c => hierQueue2.push({ node: c, parent: node }));
            }
        }

        // 4. Property chain links
        const propLinks = chainLinks.map(l => ({
            source: l.source,
            target: l.target,
            type:   'property',
            label:  l.label || '',
        }));

        this._allLinks = [...hierLinks, ...propLinks];

        // --- Build SVG ---
        this._buildSvg();
        this._startSimulation();
    }

    /**
     * Returns current state for later restoration.
     * @returns {object}
     */
    getState() {
        return {
            conceptUri:    this.currentConcept,
            propertyUri:   this.currentProperty,
            depth:         this.currentDepth,
            expandedNodes: [...this.expandedNodes],
        };
    }

    /**
     * Restores a state previously captured by getState().
     * @param {object} state
     */
    setState(state) {
        if (!state) return;
        if (state.conceptUri  !== undefined) this.currentConcept  = state.conceptUri;
        if (state.propertyUri !== undefined) this.currentProperty = state.propertyUri;
        if (state.depth       !== undefined) this.currentDepth    = state.depth;
        if (Array.isArray(state.expandedNodes)) {
            this.expandedNodes = new Set(state.expandedNodes);
        }
    }

    /**
     * Stops the simulation and removes the SVG element.
     */
    destroy() {
        if (this._simulation) {
            this._simulation.stop();
            this._simulation = null;
        }
        this._clear();
    }

    // -------------------------------------------------------------------------
    // Internal — SVG construction
    // -------------------------------------------------------------------------

    _clear() {
        d3.select(this.container).selectAll('*').remove();
    }

    _buildSvg() {
        const svg = d3.select(this.container)
            .append('svg')
            .attr('width',  this.width)
            .attr('height', this.height)
            .attr('class',  'combined-viz-svg')
            .style('background', 'transparent');

        this._svg = svg;

        // Arrow marker for property links
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id',           'arrow-combined')
            .attr('viewBox',      '0 -5 10 10')
            .attr('refX',         18)
            .attr('refY',         0)
            .attr('markerWidth',   6)
            .attr('markerHeight',  6)
            .attr('orient',       'auto')
            .append('path')
            .attr('d',    'M0,-5L10,0L0,5')
            .attr('fill', '#e63946');

        // Zoom / pan
        const gMain = svg.append('g').attr('class', 'combined-main');
        this._gMain = gMain;

        svg.call(
            d3.zoom()
                .scaleExtent([0.1, 4])
                .on('zoom', (event) => gMain.attr('transform', event.transform))
        );

        // Groups (links below nodes)
        gMain.append('g').attr('class', 'links-hier');
        gMain.append('g').attr('class', 'links-prop');
        gMain.append('g').attr('class', 'nodes-g');
    }

    _startSimulation() {
        const nodes = this._allNodes.map(d => Object.assign({}, d));
        const links = this._allLinks.map(d => Object.assign({}, d));

        // Node lookup for D3 force
        const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

        // Resolve string source/target to node objects
        const resolvedLinks = links.filter(l => {
            l.sourceNode = nodeById[l.source];
            l.targetNode = nodeById[l.target];
            return l.sourceNode && l.targetNode;
        });

        const hierLinks = resolvedLinks.filter(l => l.type === 'hierarchy');
        const propLinks = resolvedLinks.filter(l => l.type === 'property');
        const allResolved = [...hierLinks, ...propLinks];

        // Simulation
        this._simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(allResolved)
                .id(d => d.id)
                .distance(d => d.type === 'hierarchy' ? 80 : 120)
                .strength(d => d.type === 'hierarchy' ? 1 : 0.5)
            )
            .force('charge',  d3.forceManyBody().strength(-220))
            .force('center',  d3.forceCenter(this.width / 2, this.height / 2))
            .force('collide', d3.forceCollide(30));

        const gMain = this._gMain;

        // ---- Hierarchy links (grey, no marker) ----
        const linkHierSel = gMain.select('g.links-hier')
            .selectAll('line.link-hier')
            .data(hierLinks)
            .enter()
            .append('line')
            .attr('class',        'link-hier')
            .attr('stroke',       '#d4d4d8')
            .attr('stroke-width', 1.5)
            .attr('opacity',      1);

        // ---- Property links (red arrow + label) ----
        const linkPropG = gMain.select('g.links-prop')
            .selectAll('g.link-prop')
            .data(propLinks)
            .enter()
            .append('g')
            .attr('class', 'link-prop');

        const linkPropLine = linkPropG.append('line')
            .attr('stroke',       '#e63946')
            .attr('stroke-width', 2)
            .attr('marker-end',   'url(#arrow-combined)');

        const linkPropText = linkPropG.append('text')
            .attr('font-size',   '11px')
            .attr('fill',        '#e63946')
            .attr('text-anchor', 'middle')
            .text(d => d.label);

        // ---- Nodes ----
        const colorMap = {
            hierarchy: '#7bafd4',
            chain:     '#f4a261',
            shared:    '#2a9d8f',
        };

        const nodeSel = gMain.select('g.nodes-g')
            .selectAll('g.node-combined')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node-combined')
            .style('cursor', 'pointer')
            .call(
                d3.drag()
                    .on('start', (event, d) => {
                        if (!event.active) this._simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on('drag', (event, d) => {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on('end', (event, d) => {
                        if (!event.active) this._simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                    })
            )
            .on('click', (event, d) => {
                event.stopPropagation();
                if (typeof this.onNodeClick === 'function') {
                    this.onNodeClick(d);
                }
            });

        nodeSel.append('circle')
            .attr('r',            10)
            .attr('fill',         d => colorMap[d.group] || '#999')
            .attr('stroke',       '#ffffff')
            .attr('stroke-width', 2.5);

        nodeSel.append('text')
            .attr('dy',         '0.31em')
            .attr('x',          14)
            .attr('font-size',  '12px')
            .attr('fill',       '#09090b')
            .text(d => d.label);

        // Tooltip title
        nodeSel.append('title').text(d => d.id);

        // ---- Tick ----
        this._simulation.on('tick', () => {
            linkHierSel
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            linkPropLine
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            linkPropText
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2 - 6);

            nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // ---- Legend ----
        this._drawLegend();
    }

    _drawLegend() {
        const legend = this._svg.append('g')
            .attr('class',     'legend')
            .attr('transform', 'translate(12, 12)');

        const items = [
            { color: '#7bafd4', label: 'Hiérarchie (subClassOf)' },
            { color: '#f4a261', label: 'Chaîne de propriété' },
            { color: '#2a9d8f', label: 'Nœud partagé' },
        ];

        items.forEach((item, i) => {
            const g = legend.append('g').attr('transform', `translate(0, ${i * 22})`);
            g.append('circle').attr('r', 7).attr('cx', 7).attr('cy', 7)
                .attr('fill', item.color).attr('stroke', '#fff').attr('stroke-width', 1.5);
            g.append('text').attr('x', 20).attr('y', 12).attr('font-size', '12px')
                .attr('fill', '#52525b').text(item.label);
        });

        // Property link legend
        const gLink = legend.append('g').attr('transform', `translate(0, ${items.length * 22})`);
        gLink.append('line')
            .attr('x1', 0).attr('y1', 7).attr('x2', 18).attr('y2', 7)
            .attr('stroke', '#e63946').attr('stroke-width', 2);
        gLink.append('text').attr('x', 22).attr('y', 12).attr('font-size', '12px')
            .attr('fill', '#52525b').text('Lien de propriété');
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _localName(uri) {
        if (!uri) return '';
        const hash  = uri.lastIndexOf('#');
        if (hash  !== -1) return uri.slice(hash  + 1);
        const slash = uri.lastIndexOf('/');
        if (slash !== -1) return uri.slice(slash + 1);
        return uri;
    }
}
