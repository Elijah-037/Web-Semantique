/**
 * CollapsibleTree — Visualisation progressive (énoncé SAE501)
 *
 * - Liens subClassOf (sans nom) → arbre hiérarchique collapsible
 * - Propriétés nommées (ObjectProperty) → flèches orientées domaine → range
 */
class CollapsibleTree {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.width       = options.width  || this.container.clientWidth  || 800;
        this.height      = options.height || this.container.clientHeight || 600;
        this.onNodeClick = options.onNodeClick || null;
        this.svg         = null;
        this._zoom       = null;
        this._root       = null;
        this._g          = null;
        this._treeLayout = null;
        this._namedLinks = [];
        this._uid        = 'ct_' + Math.random().toString(36).slice(2, 9);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    render(data) {
        this.destroy();
        this._namedLinks = data.links || [];
        this._draw(data.tree);
    }

    destroy() {
        if (this.svg) this.svg.remove();
        this.svg         = null;
        this._zoom       = null;
        this._root       = null;
        this._g          = null;
        this._treeLayout = null;
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
        this._update(this._root);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    _draw(treeData) {
        const W = this.width;
        const H = this.height;

        const svg = d3.select(this.container)
            .append('svg')
            .attr('width',   W)
            .attr('height',  H)
            .attr('viewBox', `0 0 ${W} ${H}`)
            .style('font', '11px sans-serif')
            .style('cursor', 'default');

        this.svg = svg;

        // Arrowhead marker for named relation arrows
        svg.append('defs').append('marker')
            .attr('id',          this._uid + '_arrow')
            .attr('viewBox',     '0 -5 10 10')
            .attr('refX',        18)
            .attr('refY',        0)
            .attr('markerWidth', 5)
            .attr('markerHeight',5)
            .attr('orient',      'auto')
          .append('path')
            .attr('d',    'M0,-5L10,0L0,5')
            .attr('fill', '#e74c3c');

        // Main group — centré verticalement, marge gauche pour les labels
        this._g = svg.append('g').attr('transform', `translate(90, ${H / 2})`);

        // Zoom & pan — initialisé sur la position de centrage pour que
        // la molette parte de là et non de translate(0,0)
        const initTransform = d3.zoomIdentity.translate(90, H / 2);
        this._zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => this._g.attr('transform', event.transform));
        svg.call(this._zoom);
        svg.call(this._zoom.transform, initTransform);

        // Build D3 hierarchy
        const root  = d3.hierarchy(treeData, d => d.children);
        // Collapse every node below depth 0 (show only root + direct children)
        root.descendants().forEach(d => {
            if (d.depth >= 1 && d.children) {
                d._children  = d.children;
                d.children   = null;
            }
        });
        this._root    = root;
        this._root.x0 = 0;
        this._root.y0 = 0;

        // Tree layout — nodeSize gives uniform spacing
        this._treeLayout = d3.tree().nodeSize([22, 180]);

        this._update(this._root);
    }

    _update(source) {
        const self     = this;
        const duration = 250;
        const root     = this._root;
        const g        = this._g;

        // Recompute layout
        this._treeLayout(root);

        const nodes = root.descendants();
        const links = root.links();

        // ── Nodes ──────────────────────────────────────────────────────────────
        const nodeSel = g.selectAll('g.ct-node')
            .data(nodes, d => d.data.id);

        const nodeEnter = nodeSel.enter()
            .append('g')
            .attr('class', 'ct-node')
            .attr('transform', `translate(${source.y0 || 0},${source.x0 || 0})`)
            .on('click', (event, d) => {
                event.stopPropagation();
                if (self.onFocusChange) self.onFocusChange(d.data.id);
                if (d.children || d._children) {
                    // Toggle expand / collapse
                    if (d.children) { d._children = d.children; d.children = null; }
                    else            { d.children = d._children; d._children = null; }
                    self._update(d);
                }
                // feuille → rien
            });

        nodeEnter.append('circle').attr('r', 6).attr('stroke-width', 1.5);

        nodeEnter.append('text')
            .attr('dy', '0.32em')
            .attr('pointer-events', 'none')
            .attr('fill', '#09090b');

        // Merge + animate
        const nodeUpdate = nodeEnter.merge(nodeSel);
        nodeUpdate.transition().duration(duration)
            .attr('transform', d => `translate(${d.y},${d.x})`);

        nodeUpdate.style('cursor', d => (d.children || d._children) ? 'pointer' : 'default');

        nodeUpdate.select('circle')
            .attr('fill',   d => (d.children || d._children) ? '#09090b' : '#d4d4d8')
            .attr('stroke', d => (d.children || d._children) ? 'rgba(0,0,0,0.15)' : 'rgba(161,161,170,0.6)');

        nodeUpdate.select('text')
            .attr('x',           d => (d.children || d._children) ? -10 : 10)
            .attr('text-anchor', d => (d.children || d._children) ? 'end' : 'start')
            .text(d => self._label(d.data));

        // Exit
        const nodeExit = nodeSel.exit()
            .transition().duration(duration)
            .attr('transform', `translate(${source.y},${source.x})`)
            .remove();
        nodeExit.select('circle').attr('r', 0);
        nodeExit.select('text').style('fill-opacity', 0);

        // ── Links (subClassOf — no name) ───────────────────────────────────────
        const linkSel = g.selectAll('path.ct-link')
            .data(links, d => d.target.data.id);

        const linkEnter = linkSel.enter()
            .insert('path', 'g')
            .attr('class', 'ct-link')
            .attr('d', () => {
                const o = { x: source.x0 || 0, y: source.y0 || 0 };
                return this._diagonal(o, o);
            });

        linkEnter.merge(linkSel)
            .transition().duration(duration)
            .attr('d', d => this._diagonal(d.source, d.target));

        linkSel.exit()
            .transition().duration(duration)
            .attr('d', () => {
                const o = { x: source.x, y: source.y };
                return this._diagonal(o, o);
            })
            .remove();

        // Save positions for next transition origin
        nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });

        // ── Named relation arrows (object properties) ──────────────────────────
        this._drawNamedLinks(g, nodes);
    }

    _drawNamedLinks(g, visibleNodes) {
        g.selectAll('.ct-rel-link, .ct-rel-label').remove();

        const byId   = new Map(visibleNodes.map(d => [d.data.id, d]));
        const colors = d3.scaleOrdinal(d3.schemeTableau10);
        const arrowId = this._uid + '_arrow';

        this._namedLinks.forEach(rel => {
            const src = byId.get(rel.source);
            const tgt = byId.get(rel.target);
            if (!src || !tgt) return;

            const color = colors(rel.label);

            // Offset the quadratic bezier to avoid overlapping tree lines
            const dx  = tgt.y - src.y;
            const dy  = tgt.x - src.x;
            const cpx = (src.y + tgt.y) / 2 + dy * 0.35;
            const cpy = (src.x + tgt.x) / 2 - dx * 0.35;

            g.append('path')
                .attr('class',        'ct-rel-link')
                .attr('d',            `M ${src.y} ${src.x} Q ${cpx} ${cpy} ${tgt.y} ${tgt.x}`)
                .attr('stroke',       color)
                .attr('stroke-width', 1.5)
                .attr('fill',         'none')
                .attr('stroke-dasharray', '4 2')
                .attr('marker-end',   `url(#${arrowId})`);

            g.append('text')
                .attr('class',       'ct-rel-label')
                .attr('x',           cpx)
                .attr('y',           cpy - 4)
                .attr('text-anchor', 'middle')
                .attr('font-size',   '9px')
                .attr('fill',        color)
                .text(rel.label);
        });
    }

    _diagonal(s, d) {
        return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${d.x}, ${d.y} ${d.x}`;
    }

    _label(nodeData) {
        const name = nodeData.label || nodeData.name || nodeData.id || '';
        const hash  = name.lastIndexOf('#');
        if (hash  !== -1) return name.slice(hash  + 1);
        const slash = name.lastIndexOf('/');
        if (slash !== -1) return name.slice(slash + 1);
        return name;
    }
}
