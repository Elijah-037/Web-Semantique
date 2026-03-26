/**
 * CirclePacking — Visualisation en coupe (énoncé SAE501)
 *
 * Racine = carré (owl:Thing ou concept sélectionné)
 * Fils/descendants = cercles imbriqués, dépliables progressivement
 * Clic sur cercle avec enfants → expand / collapse
 * Clic sur feuille → rien
 * Clic sur le carré racine → tout replier
 */
class CirclePacking {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.width         = options.width  || this.container.clientWidth  || 800;
        this.height        = options.height || this.container.clientHeight || 600;
        this.onFocusChange = options.onFocusChange || null;
        this.svg           = null;
        this._gMain        = null;
        this._zoom         = null;
        this._root         = null;
        this.currentTransform = d3.zoomIdentity;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    render(hierarchyData) {
        this.destroy();
        this._draw(hierarchyData);
    }

    getState() {
        const expandedUris = new Set();
        if (this._root) {
            this._root.descendants().forEach(d => {
                if (d.depth >= 1 && d.children) expandedUris.add(d.data.id);
            });
        }
        return { expandedUris };
    }

    setState(state) {
        if (!state || !state.expandedUris || !this._root) return;
        const expand = (node) => {
            if (node.depth >= 1 && state.expandedUris.has(node.data.id) && node._children) {
                node.children  = node._children;
                node._children = null;
            }
            if (node.children) node.children.forEach(expand);
        };
        expand(this._root);
        this._redraw();
    }

    destroy() {
        if (this.svg) this.svg.remove();
        this.svg    = null;
        this._gMain = null;
        this._zoom  = null;
        this._root  = null;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    _draw(rawData) {
        const W    = this.width;
        const H    = this.height;
        const self = this;

        const svg = d3.select(this.container)
            .append('svg')
            .attr('width',   W)
            .attr('height',  H)
            .attr('viewBox', `0 0 ${W} ${H}`)
            .style('font',   '10px sans-serif')
            .style('cursor', 'default');

        this.svg = svg;

        // Main group (le zoom y applique son transform)
        const gMain = svg.append('g');
        this._gMain = gMain;

        // Zoom manuel — position initiale = translate(2,2) pour compenser le padding du pack
        const initTransform = d3.zoomIdentity.translate(2, 2);
        this._zoom = d3.zoom()
            .scaleExtent([0.2, 8])
            .on('zoom', (event) => {
                self.currentTransform = event.transform;
                gMain.attr('transform', event.transform);
            });
        svg.call(this._zoom);
        svg.call(this._zoom.transform, initTransform);

        // Construire la hiérarchie D3
        const root = d3.hierarchy(rawData, d => d.children);

        // Replier tout ce qui est en dessous du niveau 0 (on ne montre que root + enfants directs)
        root.descendants().forEach(d => {
            if (d.depth >= 1 && d.children) {
                d._children = d.children;
                d.children  = null;
            }
        });

        this._root = root;
        this._redraw();
    }

    _redraw() {
        const W    = this.width;
        const H    = this.height;
        const self = this;
        const root = this._root;
        const gMain = this._gMain;

        gMain.selectAll('*').remove();

        // Recalculer la somme et le layout pack sur les nœuds visibles uniquement
        root.sum(() => 1).sort((a, b) => b.value - a.value);
        d3.pack().size([W - 4, H - 4]).padding(6)(root);

        // Couleurs : une par famille (parent)
        const families = [...new Set(
            root.descendants().map(d => d.parent ? d.parent.data.id : '__root__')
        )];
        const color = d3.scaleOrdinal().domain(families).range(d3.schemeSet3);

        // ── Carré racine ───────────────────────────────────────────────────────
        const squareSide = Math.min(W - 4, H - 4) * 0.98;
        const squareX    = root.x - squareSide / 2;
        const squareY    = root.y - squareSide / 2;

        const rootGroup = gMain.append('g')
            .attr('class', 'node node--root')
            .style('cursor', 'pointer')
            .on('click', () => {
                // Replier tous les nœuds → retour à l'état initial
                root.descendants().forEach(d => {
                    if (d.depth >= 1 && d.children) {
                        d._children = d.children;
                        d.children  = null;
                    }
                });
                self._redraw();
            });

        rootGroup.append('rect')
            .attr('x',      squareX)
            .attr('y',      squareY)
            .attr('width',  squareSide)
            .attr('height', squareSide)
            .attr('rx', 4)
            .attr('fill',         '#ffffff')
            .attr('stroke',       '#d4d4d8')
            .attr('stroke-width', 2);

        rootGroup.append('title').text(root.data.name || root.data.id || 'Top');

        rootGroup.append('text')
            .attr('x',           root.x)
            .attr('y',           squareY + 16)
            .attr('text-anchor', 'middle')
            .attr('font-size',   '13px')
            .attr('font-weight', 'bold')
            .attr('fill',        '#09090b')
            .text(self._label(root.data));

        // ── Cercles descendants (nœuds visibles uniquement) ────────────────────
        const descendants = root.descendants().filter(d => d.depth > 0);

        const nodeGroups = gMain.selectAll('g.node--circle')
            .data(descendants, d => d.data.id)
            .join('g')
            .attr('class', 'node node--circle')
            .style('cursor', d => (d.children || d._children) ? 'pointer' : 'default')
            .on('click', (event, d) => {
                event.stopPropagation();
                if (self.onFocusChange) self.onFocusChange(d.data.id);
                if (!d.children && !d._children) return; // feuille → rien
                // Toggle expand / collapse
                if (d.children) { d._children = d.children; d.children = null; }
                else            { d.children  = d._children; d._children = null; }
                self._redraw();
            })
            .on('mouseover', (event, d) => self._highlight(d, true))
            .on('mouseout',  (event, d) => self._highlight(d, false));

        nodeGroups.append('circle')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r',  d => d.r)
            .attr('fill', d => {
                const familyKey = d.parent ? d.parent.data.id : '__root__';
                return d3.color(color(familyKey)).brighter(d.depth * 0.3);
            })
            .attr('stroke',       d => (d.children || d._children) ? '#555' : '#999')
            .attr('stroke-width', d => (d.children || d._children) ? 1.5 : 0.8)
            .attr('opacity', 0.85);

        nodeGroups.append('title')
            .text(d => (d.data.name || d.data.id || '') + (d.data.uri ? `\n${d.data.uri}` : ''));

        nodeGroups.append('text')
            .attr('x',                  d => d.x)
            .attr('y',                  d => d.y)
            .attr('text-anchor',        'middle')
            .attr('dominant-baseline',  'middle')
            .attr('font-size',          d => Math.min(12, d.r * 0.45) + 'px')
            .attr('fill',               '#09090b')
            .attr('pointer-events',     'none')
            .text(d => d.r > 12 ? self._label(d.data) : '');
    }

    _label(nodeData) {
        const name  = nodeData.name || nodeData.label || nodeData.id || '';
        const hash  = name.lastIndexOf('#');
        if (hash  !== -1) return name.slice(hash  + 1);
        const slash = name.lastIndexOf('/');
        if (slash !== -1) return name.slice(slash + 1);
        return name;
    }

    _highlight(d, on) {
        const uriSet = new Set();
        d.each(node => uriSet.add(node.data.id)); // uniquement les visibles

        d3.select(this.container).selectAll('g.node--circle circle')
            .attr('opacity', node => {
                if (!on) return 0.85;
                return uriSet.has(node.data.id) ? 1 : 0.4;
            })
            .attr('stroke-width', node => {
                if (!on) return (node.children || node._children) ? 1.5 : 0.8;
                return uriSet.has(node.data.id) ? 2.5 : 0.5;
            });
    }
}
