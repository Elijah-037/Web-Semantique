/**
 * StateManager — Gestionnaire d'état global des visualisations
 *
 * Gère l'état courant (viz active, nœud sélectionné, profondeur) et
 * sauvegarde l'état interne de chaque visualisation pour permettre la
 * restauration lors d'un retour.
 * L'état est persisté dans sessionStorage pour survivre à un rechargement.
 */
class StateManager {
    constructor() {
        this.state = {
            currentViz:  null,   // 'circle-packing' | 'collapsible-tree' | 'sunburst' | 'combined'
            currentNode: null,   // { uri, label }
            depth:       3,
            vizStates: {
                'circle-packing':   null,
                'collapsible-tree': null,
                'sunburst':         null,
                'combined':         null,
            },
        };
        this._history = [];      // pile d'états précédents pour le retour arrière
        this._listeners = [];
    }

    /** Abonner une fonction aux changements d'état. */
    subscribe(fn) {
        this._listeners.push(fn);
    }

    /** Dispatcher une action et notifier les abonnés. */
    dispatch(action) {
        // Sauvegarder l'état courant dans l'historique avant modification
        if (action.type === 'SELECT_NODE' || action.type === 'SWITCH_VIZ') {
            this._history.push(JSON.parse(JSON.stringify(this.state)));
            if (this._history.length > 50) this._history.shift();
        }
        this.state = this._reduce(this.state, action);
        this._listeners.forEach(fn => fn(this.state, action));
        this.persist();
    }

    /** Revenir à l'état précédent. Retourne true si un retour a été effectué. */
    goBack() {
        if (this._history.length === 0) return false;
        this.state = this._history.pop();
        this._listeners.forEach(fn => fn(this.state, { type: 'GO_BACK' }));
        this.persist();
        return true;
    }

    /** Indique si un retour arrière est possible. */
    canGoBack() {
        return this._history.length > 0;
    }

    _reduce(state, action) {
        switch (action.type) {
            case 'SWITCH_VIZ':
                return { ...state, currentViz: action.vizType };

            case 'SELECT_NODE':
                return { ...state, currentNode: action.node };

            case 'SET_DEPTH':
                return { ...state, depth: action.depth };

            case 'SAVE_VIZ_STATE':
                return {
                    ...state,
                    vizStates: {
                        ...state.vizStates,
                        [action.vizType]: action.vizState,
                    },
                };

            default:
                return state;
        }
    }

    /** Réinitialiser l'état à la vue racine (Thing). */
    resetToRoot() {
        this._history.push(JSON.parse(JSON.stringify(this.state)));
        if (this._history.length > 50) this._history.shift();
        this.state = {
            ...this.state,
            currentNode: null,
            currentViz: this.state.currentViz || 'collapsible-tree',
        };
        this._listeners.forEach(fn => fn(this.state, { type: 'RESET_TO_ROOT' }));
        this.persist();
    }

    /** Persister l'état dans sessionStorage. */
    persist() {
        try {
            sessionStorage.setItem('sae501_vizState', JSON.stringify(this.state));
            // Persister aussi l'historique (les 20 derniers pour éviter trop de données)
            const historyToSave = this._history.slice(-20);
            sessionStorage.setItem('sae501_vizHistory', JSON.stringify(historyToSave));
        } catch (_) { /* quota exceeded — ignore */ }
    }

    /** Restaurer l'état depuis sessionStorage. */
    restore() {
        try {
            const saved = sessionStorage.getItem('sae501_vizState');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state = { ...this.state, ...parsed };
            }
            const savedHistory = sessionStorage.getItem('sae501_vizHistory');
            if (savedHistory) {
                this._history = JSON.parse(savedHistory);
            }
        } catch (_) { /* JSON invalide — ignore */ }
    }

    /** Raccourci lecture. */
    get(key) {
        return this.state[key];
    }
}
