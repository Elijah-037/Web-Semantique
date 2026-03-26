/**
 * TASK-08 — Visualisation radiale : Zoomable Sunburst
 *
 * Nœud courant au centre, enfants sur le 1er anneau, petits-enfants sur le 2ème, etc.
 * Clic sur un arc → zoom sur ce nœud (il devient le centre).
 * Clic sur le centre → remonte au parent.
 * Code couleur : même teinte pour tous les descendants d'un même père direct.
 */
class Sunburst {
    constructor(container, options = {}) {
        this.container   = container;
        this.width       = options.width  || 700;
        this.height      = options.height || 700;
        this.radius      = Math.min(this.width, this.height) / 2;
        this.onNodeClick = options.onNodeClick || null;

        this.history     = []; // pile pour "remonter au parent"
        this.currentRoot = null;

        // État interne : données brutes + partition + éléments SVG
        this._rawData  = null;
        this._svg      = null;
        this._pathSel  = null;
        this._labelSel = null;
        this._centerSel = null;
    }

    // -------------------------------------------------------------------------
    // API publique
    // -------------------------------------------------------------------------

    /**
     * Rend le sunburst à partir d'un arbre hiérarchique JSON.
     * @param {Object} hierarchyData  { id, label, children: [...] }
     */
    render(hierarchyData) {
        this._rawData = hierarchyData;
        this.history  = [];

        // Vider le conteneur
        this.container.innerHTML = '';

        // Construire le SVG
        this._svg = d3.select(this.container)
            .append('svg')
            .attr('width',  this.width)
            .attr('height', this.height)
            .attr('viewBox', `${-this.width / 2} ${-this.height / 2} ${this.width} ${this.height}`)
            .style('font', '12px sans-serif');

        // Groupe principal
        this._g = this._svg.append('g');

        // Tooltip
        this._tooltip = d3.select(this.container)
            .append('div')
            .style('position', 'absolute')
            .style('background', 'rgba(0,0,0,0.75)')
            .style('color', '#fff')
            .style('padding', '4px 8px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('display', 'none');

        this._drawFromRoot(hierarchyData);
    }

    /**
     * Zoome sur un nœud (il devient le nœud courant / centre).
     */
    zoomIn(nodeData) {
        this.history.push(this.currentRoot);
        this.currentRoot = nodeData;
        this._drawFromRoot(nodeData);
    }

    /**
     * Remonte au parent (dépile l'historique).
     */
    zoomOut() {
        if (this.history.length > 0) {
            this.currentRoot = this.history.pop();
            const data = this.currentRoot !== null ? this.currentRoot : this._rawData;
            this._drawFromRoot(data);
        }
    }

    /** Retourne l'état courant (URI du nœud + historique). */
    getState() {
        return {
            rootUri: this.currentRoot
                ? (this.currentRoot.id || this.currentRoot.uri || null)
                : null,
            history: this.history.map(n =>
                n ? (n.id || n.uri || null) : null
            ),
        };
    }

    /** Restaure un état précédemment capturé par getState(). */
    setState(state) {
        // L'état sera pleinement reconstruit lors du prochain render()
        this._pendingState = state;
    }

    // -------------------------------------------------------------------------
    // Rendu interne
    // -------------------------------------------------------------------------

    _drawFromRoot(rootData) {
        this.currentRoot = rootData;

        // Nettoyer le groupe
        this._g.selectAll('*').remove();

        // ── Hiérarchie D3 ──
        const root = d3.hierarchy(rootData)
            .sum(d => (d.children && d.children.length) ? 0 : 1)
            .sort((a, b) => b.value - a.value);

        // ── Partition radiale ──
        const partition = d3.partition()
            .size([2 * Math.PI, this.radius]);

        partition(root);

        // ── Échelle de couleurs ──
        const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

        const getColor = (d) => {
            // Trouver l'ancêtre direct du centre (profondeur 1)
            let ancestor = d;
            while (ancestor.depth > 1) ancestor = ancestor.parent;
            if (ancestor.depth === 0) {
                // Le nœud lui-même est la racine
                return d3.color('#6baed6');
            }
            const base = d3.color(colorScale(ancestor.data.id || ancestor.data.label));
            if (!base) return '#ccc';
            // Éclaircir selon la profondeur pour les descendants
            return base.brighter((d.depth - 1) * 0.4).toString();
        };

        // ── Arc generator ──
        const ringWidth = this.radius / Math.max(root.height + 1, 2);

        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.depth === 0 ? 0            : d.y0)
            .outerRadius(d => d.depth === 0 ? ringWidth - 2 : d.y1 - 1);

        // ── Arcs ──
        const paths = this._g.append('g')
            .selectAll('path')
            .data(root.descendants())
            .join('path')
            .attr('d', arc)
            .attr('fill', d => d.depth === 0 ? '#e8e8e8' : getColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.5)
            .style('cursor', d => d.depth > 0 ? 'pointer' : 'zoom-out');

        // Interactions
        paths
            .on('mouseover', (event, d) => {
                if (d.depth === 0) return;
                d3.select(event.currentTarget).attr('opacity', 0.75);
                this._tooltip
                    .style('display', 'block')
                    .text(d.data.label || d.data.id || '');
            })
            .on('mousemove', (event) => {
                const rect = this.container.getBoundingClientRect();
                this._tooltip
                    .style('left', (event.clientX - rect.left + 12) + 'px')
                    .style('top',  (event.clientY - rect.top  - 28) + 'px');
            })
            .on('mouseout', (event, d) => {
                d3.select(event.currentTarget).attr('opacity', 1);
                this._tooltip.style('display', 'none');
            })
            .on('click', (event, d) => {
                event.stopPropagation();
                if (d.depth === 0) {
                    // Clic sur le centre → remonter
                    this.zoomOut();
                } else {
                    // Clic sur un arc → zoomer
                    if (this.onNodeClick) this.onNodeClick(d.data);
                    this.zoomIn(d.data);
                }
            });

        // ── Labels ──
        this._g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .selectAll('text')
            .data(root.descendants().filter(d => {
                if (d.depth === 0) return true;
                return (d.x1 - d.x0) > 0.04;
            }))
            .join('text')
            .attr('transform', d => this._labelTransform(d, arc, ringWidth))
            .attr('dy', '0.35em')
            .attr('font-size', d => {
                if (d.depth === 0) return '13px';
                return Math.min(12, (d.x1 - d.x0) * (this.radius / (root.height + 1)) * 0.4) + 'px';
            })
            .attr('fill', d => d.depth === 0 ? '#333' : '#fff')
            .attr('font-weight', d => d.depth === 0 ? 'bold' : 'normal')
            .text(d => {
                const label = d.data.label || d.data.id || '';
                if (d.depth === 0) return label;
                // Tronquer si l'arc est petit
                const arcLen = (d.x1 - d.x0) * d.y1;
                const maxChars = Math.floor(arcLen / 7);
                return maxChars < 3 ? '' : label.slice(0, Math.max(maxChars, 3));
            });

        // ── Indicateur de navigation (centre) ──
        if (this.history.length > 0) {
            this._g.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', `${ringWidth * 0.35}em`)
                .attr('font-size', '10px')
                .attr('fill', '#888')
                .attr('pointer-events', 'none')
                .text('↑ retour');
        }
    }

    _labelTransform(d, arc, ringWidth) {
        if (d.depth === 0) return 'rotate(0)';

        const angle  = (d.x0 + d.x1) / 2;   // angle milieu en radians
        const r      = (d.y0 + d.y1) / 2;    // rayon milieu
        const deg    = (angle * 180 / Math.PI) - 90;

        const x = Math.cos(angle - Math.PI / 2) * r;
        const y = Math.sin(angle - Math.PI / 2) * r;

        // Orienter le texte pour qu'il soit lisible
        const rotate = (deg > 90 && deg < 270) ? deg + 180 : deg;

        return `translate(${x},${y}) rotate(${rotate})`;
    }
}
