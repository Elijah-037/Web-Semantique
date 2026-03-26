/**
 * ZoomableSunburst — Visualisation radiale (énoncé SAE501)
 *
 * Nœud central = concept courant
 * 1er anneau = fils, 2ème = petits-fils, etc.
 * Même couleur pour les fils d'un même père (teinte par ancêtre de profondeur 1)
 * Clic sur un arc  → zoome (ce nœud devient le centre)
 * Clic sur le centre → remonte au père
 */
class ZoomableSunburst {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.width         = options.width  || this.container.clientWidth  || 800;
        this.height        = options.height || this.container.clientHeight || 600;
        this.onFocusChange = options.onFocusChange || null;
        this.svg           = null;
        this._root         = null;
        this._focused      = null;
        this._radius       = null;
        this._arc          = null;
        this._pathSel      = null;
        this._textSel      = null;
        this._centerLabel  = null;
        this._zoom         = null;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    render(data) {
        this.destroy();
        this._draw(data);
    }

    getState() {
        // Exporte les ancêtres du nœud focalisé pour que les autres vues
        // sachent quels nœuds déplier lors d'un changement de vue
        const expandedUris = new Set();
        if (this._focused && this._focused !== this._root) {
            let node = this._focused;
            while (node && node.depth >= 1) {
                expandedUris.add(node.data.id);
                node = node.parent;
            }
        }
        return { expandedUris };
    }

    setState(state) {
        if (!state || !state.expandedUris || !this._root || state.expandedUris.size === 0) return;
        // Cherche le nœud le plus profond qui correspond à l'état importé
        let deepest = null;
        this._root.descendants().forEach(d => {
            if (state.expandedUris.has(d.data.id)) {
                if (!deepest || d.depth > deepest.depth) deepest = d;
            }
        });
        if (deepest && deepest !== this._focused) this._zoomTo(deepest);
    }

    destroy() {
        if (this.svg) this.svg.remove();
        this.svg          = null;
        this._root        = null;
        this._focused     = null;
        this._radius      = null;
        this._arc         = null;
        this._pathSel     = null;
        this._textSel     = null;
        this._centerLabel = null;
        this._zoom        = null;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    _draw(rawData) {
        const W      = this.width;
        const H      = this.height;
        const self   = this;
        const radius = Math.min(W, H) / 6;
        this._radius = radius;

        // Hiérarchie D3
        const root = d3.hierarchy(rawData, d => d.children)
            .sum(() => 1)
            .sort((a, b) => b.value - a.value);

        d3.partition().size([2 * Math.PI, root.height + 1])(root);
        root.each(d => d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 });

        this._root    = root;
        this._focused = root;

        // Couleur : teinte par ancêtre de profondeur 1, luminosité croissante avec la profondeur
        const color     = d3.scaleOrdinal(d3.schemeTableau10);
        const baseColor = (d) => {
            let node = d;
            while (node.depth > 1) node = node.parent;
            return node.depth === 0 ? '#cccccc' : color(node.data.id);
        };
        const fillColor = (d) => {
            const base = d3.color(baseColor(d));
            if (!base) return '#aaa';
            return base.brighter(Math.min(0.35 * (d.depth - 1), 1.0)).toString();
        };

        // Générateur d'arcs
        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(radius * 1.5)
            .innerRadius(d => d.y0 * radius)
            .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));
        this._arc = arc;

        // SVG
        const svg = d3.select(this.container)
            .append('svg')
            .attr('width',   W)
            .attr('height',  H)
            .attr('viewBox', `0 0 ${W} ${H}`)
            .style('font',   '10px sans-serif');
        this.svg = svg;

        // Groupe principal — centré dans le SVG
        const gZoom = svg.append('g')
            .attr('transform', `translate(${W / 2},${H / 2})`);

        // Zoom & pan manuel (molette / drag)
        this._zoom = d3.zoom()
            .scaleExtent([0.3, 6])
            .on('zoom', (event) => {
                gZoom.attr('transform',
                    `translate(${W / 2 + event.transform.x},${H / 2 + event.transform.y}) scale(${event.transform.k})`
                );
            });
        svg.call(this._zoom);

        // ── Arcs ──────────────────────────────────────────────────────────────
        const pathSel = gZoom.append('g')
            .selectAll('path')
            .data(root.descendants().slice(1))
            .join('path')
            .attr('fill',         d => fillColor(d))
            .attr('fill-opacity', d => self._arcVisible(d.current) ? (d.children ? 0.80 : 0.55) : 0)
            .attr('pointer-events', d => self._arcVisible(d.current) ? 'auto' : 'none')
            .attr('d',            d => arc(d.current))
            .attr('stroke',       'rgba(255,255,255,0.8)')
            .attr('stroke-width', 0.5)
            .style('cursor',      d => d.children ? 'pointer' : 'default')
            .on('click', (event, d) => {
                event.stopPropagation();
                if (!d.children) return; // feuille → rien
                self._zoomTo(d);
            });

        pathSel.append('title').text(d => self._label(d.data));
        this._pathSel = pathSel;

        // ── Labels sur les arcs ────────────────────────────────────────────────
        const textSel = gZoom.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor',   'middle')
            .selectAll('text')
            .data(root.descendants().slice(1))
            .join('text')
            .attr('dy',           '0.35em')
            .attr('font-size',    '9px')
            .attr('fill',         '#111111')
            .attr('fill-opacity', d => +self._labelVisible(d.current))
            .attr('transform',    d => self._labelTransform(d.current))
            .text(d => self._label(d.data));
        this._textSel = textSel;

        // ── Cercle central (clic = remonter au père) ──────────────────────────
        gZoom.append('circle')
            .attr('r',            radius)
            .attr('fill',         '#ffffff')
            .attr('stroke',       '#d4d4d8')
            .attr('stroke-width', 1.5)
            .style('cursor',      'pointer')
            .on('click', () => self._zoomTo(self._focused.parent ?? self._root));

        // ── Label central ─────────────────────────────────────────────────────
        this._centerLabel = gZoom.append('text')
            .attr('text-anchor',   'middle')
            .attr('dy',            '0.35em')
            .attr('font-size',     '12px')
            .attr('font-weight',   'bold')
            .attr('fill',          '#09090b')
            .attr('pointer-events', 'none')
            .text(self._label(rawData));
    }

    _zoomTo(p) {
        if (!p || p === this._focused) return;
        this._focused = p;
        this._centerLabel.text(this._label(p.data));
        if (this.onFocusChange) this.onFocusChange(p.data.id);
        this._transition(p);
    }

    _transition(newFocus) {
        const self = this;
        const root = this._root;
        const arc  = this._arc;

        root.each(d => d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - newFocus.x0) / (newFocus.x1 - newFocus.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - newFocus.x0) / (newFocus.x1 - newFocus.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - newFocus.depth),
            y1: Math.max(0, d.y1 - newFocus.depth),
        });

        const t = this.svg.transition().duration(750);

        this._pathSel.transition(t)
            .tween('data', d => {
                const i = d3.interpolate(d.current, d.target);
                return t => d.current = i(t);
            })
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || self._arcVisible(d.target);
            })
            .attr('fill-opacity',   d => self._arcVisible(d.target) ? (d.children ? 0.80 : 0.55) : 0)
            .attr('pointer-events', d => self._arcVisible(d.target) ? 'auto' : 'none')
            .attrTween('d',         d => () => arc(d.current));

        this._textSel.transition(t)
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || self._labelVisible(d.target);
            })
            .attr('fill-opacity', d => +self._labelVisible(d.target))
            .attrTween('transform', d => () => self._labelTransform(d.current));
    }

    _arcVisible(d) {
        return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
    }

    _labelVisible(d) {
        return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    _labelTransform(d) {
        const r = this._radius;
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * r;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    _label(nodeData) {
        const name  = nodeData.label || nodeData.name || nodeData.id || '';
        const hash  = name.lastIndexOf('#');
        if (hash  !== -1) return name.slice(hash  + 1);
        const slash = name.lastIndexOf('/');
        if (slash !== -1) return name.slice(slash + 1);
        return name;
    }
}
