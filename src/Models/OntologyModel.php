<?php

declare(strict_types=1);

namespace App\Models;

use EasyRdf\Graph;
use EasyRdf\RdfNamespace;

class OntologyModel
{
    private Graph $graph;
    private string $owlFile;

    /** The real ontology namespace (detected from owl:Ontology rdf:about). */
    private string $ontologyNs = '';

    public function __construct()
    {
        $config = require __DIR__ . '/../config/app.php';
        $this->owlFile = $config['owl_file'];
        $this->graph = new Graph();
        $this->loadGraph();
        RdfNamespace::set('owl', 'http://www.w3.org/2002/07/owl#');
        $this->detectOntologyNamespace();
    }

    /**
     * Detect the ontology namespace from the owl:Ontology declaration.
     * Used to fix URIs that reference the broken "xml:base#" prefix.
     */
    private function detectOntologyNamespace(): void
    {
        foreach ($this->graph->allOfType('owl:Ontology') as $ont) {
            $uri = $ont->getUri();
            if ($uri && !str_contains($uri, 'xml:base')) {
                $this->ontologyNs = $uri . '#';
                return;
            }
        }
    }

    /**
     * Normalize a URI: replace the broken "xml:base#" prefix with the real
     * ontology namespace detected from the owl:Ontology declaration.
     */
    private function normalizeUri(string $uri): string
    {
        if ($this->ontologyNs && str_starts_with($uri, 'xml:base#')) {
            return $this->ontologyNs . substr($uri, strlen('xml:base#'));
        }
        return $uri;
    }

    /**
     * Reverse-normalize a URI back to "xml:base#" form (for graph lookups).
     */
    private function denormalizeUri(string $uri): string
    {
        if ($this->ontologyNs && str_starts_with($uri, $this->ontologyNs)) {
            return 'xml:base#' . substr($uri, strlen($this->ontologyNs));
        }
        return $uri;
    }

    /**
     * Get a graph resource, trying both normalized and denormalized URI forms.
     */
    private function findResource(string $normalizedUri): ?\EasyRdf\Resource
    {
        $resource = $this->graph->resource($normalizedUri);
        // If not found or has no properties, try the denormalized form
        if ($resource === null || $resource->propertyUris() === []) {
            $alt = $this->graph->resource($this->denormalizeUri($normalizedUri));
            if ($alt !== null && $alt->propertyUris() !== []) {
                return $alt;
            }
        }
        return $resource;
    }

    private function loadGraph(): void
    {
        $cacheFile = sys_get_temp_dir() . '/ontology_cache_' . md5($this->owlFile) . '.ser';

        if (file_exists($cacheFile) && filemtime($cacheFile) >= filemtime($this->owlFile)) {
            $serialized = file_get_contents($cacheFile);
            if ($serialized !== false) {
                $cached = unserialize($serialized);
                if ($cached instanceof Graph) {
                    $this->graph = $cached;
                    return;
                }
            }
        }

        $this->graph->parseFile($this->owlFile, 'rdfxml');

        file_put_contents($cacheFile, serialize($this->graph));
    }

    /**
     * Returns the list of all OWL classes (non-blank IRIs).
     *
     * @return array<int, array{uri: string, localName: string, label: string}>
     */
    public function getAllClasses(): array
    {
        $classes = [];

        foreach ($this->graph->allOfType('owl:Class') as $resource) {
            if ($resource->isBNode()) {
                continue;
            }

            $uri = $this->normalizeUri($resource->getUri());
            $localName = $this->extractLocalName($uri);
            $labelResource = $resource->get('rdfs:label');
            $label = $labelResource !== null ? (string)$labelResource : $localName;

            $classes[] = [
                'uri'       => $uri,
                'localName' => $localName,
                'label'     => $label,
            ];
        }

        usort($classes, fn($a, $b) => strcmp($a['label'], $b['label']));

        return $classes;
    }

    /**
     * Returns the class hierarchy tree rooted at $rootUri (D3.js-compatible).
     * If $rootUri is null, uses owl:Thing as virtual root.
     *
     * @return array<string, mixed>
     */
    public function getClassHierarchy(?string $rootUri = null): array
    {
        $thingUri = 'http://www.w3.org/2002/07/owl#Thing';

        if ($rootUri === null) {
            $rootUri = $thingUri;
        } else {
            $rootUri = $this->normalizeUri($rootUri);
        }

        return $this->buildHierarchyNode($rootUri, []);
    }

    /**
     * Recursively builds a hierarchy node, tracking visited URIs to prevent cycles.
     *
     * @param string[] $visited
     * @return array<string, mixed>
     */
    private function buildHierarchyNode(string $uri, array $visited): array
    {
        $localName = $this->extractLocalName($uri);
        $resource = $this->findResource($uri);
        $labelResource = $resource !== null ? $resource->get('rdfs:label') : null;
        $label = $labelResource !== null ? (string)$labelResource : $localName;

        $node = [
            'id'    => $uri,
            'name'  => $localName,
            'label' => $label,
        ];

        $visited[] = $uri;

        $children = $this->findDirectSubclasses($uri, $visited);
        if (!empty($children)) {
            $node['children'] = $children;
        }

        return $node;
    }

    /**
     * Finds all direct subclasses of $parentUri, skipping blank nodes and already-visited URIs.
     *
     * @param string[] $visited
     * @return array<int, array<string, mixed>>
     */
    private function findDirectSubclasses(string $parentUri, array $visited): array
    {
        $children = [];
        $parentResource = $this->graph->resource($parentUri);

        foreach ($this->graph->allOfType('owl:Class') as $class) {
            if ($class->isBNode()) {
                continue;
            }

            $classUri = $this->normalizeUri($class->getUri());

            if (in_array($classUri, $visited, true)) {
                continue;
            }

            foreach ($class->all('rdfs:subClassOf') as $superClass) {
                if ($superClass->isBNode()) {
                    continue;
                }

                if ($this->normalizeUri($superClass->getUri()) === $parentUri) {
                    $children[] = $this->buildHierarchyNode($classUri, $visited);
                    break;
                }
            }
        }

        // Classes with no explicit subClassOf are implicitly under owl:Thing
        if ($parentUri === 'http://www.w3.org/2002/07/owl#Thing') {
            foreach ($this->graph->allOfType('owl:Class') as $class) {
                if ($class->isBNode()) {
                    continue;
                }

                $classUri = $this->normalizeUri($class->getUri());

                if ($classUri === $parentUri || in_array($classUri, $visited, true)) {
                    continue;
                }

                $subClassOfs = $class->all('rdfs:subClassOf');
                $hasNonBlankParent = false;
                foreach ($subClassOfs as $superClass) {
                    if (!$superClass->isBNode()) {
                        $hasNonBlankParent = true;
                        break;
                    }
                }

                if (!$hasNonBlankParent) {
                    // Check it's not already added as a child of another class
                    $alreadyAdded = false;
                    foreach ($children as $child) {
                        if ($child['id'] === $classUri) {
                            $alreadyAdded = true;
                            break;
                        }
                    }
                    if (!$alreadyAdded) {
                        $children[] = $this->buildHierarchyNode($classUri, $visited);
                    }
                }
            }
        }

        return $children;
    }

    /**
     * Returns the ancestor chain of a class (from owl:Thing down to the class's direct parent).
     *
     * @return string[]
     */
    public function getAncestors(string $classUri): array
    {
        $ancestors = [];
        $this->collectAncestors($classUri, $ancestors, []);
        return array_reverse($ancestors);
    }

    /**
     * @param string[] $result
     * @param string[] $visited
     */
    private function collectAncestors(string $classUri, array &$result, array $visited): void
    {
        $classUri = $this->normalizeUri($classUri);
        if (in_array($classUri, $visited, true)) {
            return;
        }

        $visited[] = $classUri;
        $resource = $this->findResource($classUri);

        if ($resource === null) {
            return;
        }

        foreach ($resource->all('rdfs:subClassOf') as $superClass) {
            if ($superClass->isBNode()) {
                continue;
            }

            $superUri = $this->normalizeUri($superClass->getUri());
            $result[] = $superUri;
            $this->collectAncestors($superUri, $result, $visited);
        }
    }

    /**
     * Returns subclasses of $classUri up to $depth levels (-1 = unlimited).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getSubclasses(string $classUri, int $depth = -1): array
    {
        return $this->collectSubclasses($this->normalizeUri($classUri), $depth, 0, []);
    }

    /**
     * @param string[] $visited
     * @return array<int, array<string, mixed>>
     */
    private function collectSubclasses(string $classUri, int $depth, int $currentDepth, array $visited): array
    {
        if ($depth !== -1 && $currentDepth >= $depth) {
            return [];
        }

        if (in_array($classUri, $visited, true)) {
            return [];
        }

        $visited[] = $classUri;
        $result = [];

        foreach ($this->graph->allOfType('owl:Class') as $class) {
            if ($class->isBNode()) {
                continue;
            }

            $uri = $this->normalizeUri($class->getUri());

            if (in_array($uri, $visited, true)) {
                continue;
            }

            foreach ($class->all('rdfs:subClassOf') as $superClass) {
                if ($superClass->isBNode()) {
                    continue;
                }

                if ($this->normalizeUri($superClass->getUri()) === $classUri) {
                    $localName = $this->extractLocalName($uri);
                    $labelResource = $class->get('rdfs:label');
                    $label = $labelResource !== null ? (string)$labelResource : $localName;

                    $entry = [
                        'uri'       => $uri,
                        'localName' => $localName,
                        'label'     => $label,
                        'children'  => $this->collectSubclasses($uri, $depth, $currentDepth + 1, $visited),
                    ];

                    $result[] = $entry;
                    break;
                }
            }
        }

        return $result;
    }

    // -------------------------------------------------------------------------
    // Property methods (TASK-04)
    // -------------------------------------------------------------------------

    /**
     * Returns all OWL properties (ObjectProperty + DatatypeProperty).
     *
     * @return array<int, array{uri: string, localName: string, label: string, type: string, domain: string|null, range: string|null, inverseOf: string|null, characteristics: string[]}>
     */
    public function getAllProperties(): array
    {
        $properties = [];

        $characteristicMap = [
            'http://www.w3.org/2002/07/owl#TransitiveProperty'        => 'Transitive',
            'http://www.w3.org/2002/07/owl#FunctionalProperty'        => 'Functional',
            'http://www.w3.org/2002/07/owl#InverseFunctionalProperty' => 'InverseFunctional',
            'http://www.w3.org/2002/07/owl#SymmetricProperty'         => 'Symmetric',
            'http://www.w3.org/2002/07/owl#AsymmetricProperty'        => 'Asymmetric',
            'http://www.w3.org/2002/07/owl#ReflexiveProperty'         => 'Reflexive',
            'http://www.w3.org/2002/07/owl#IrreflexiveProperty'       => 'Irreflexive',
        ];

        $typeMap = [
            'owl:ObjectProperty'   => 'ObjectProperty',
            'owl:DatatypeProperty' => 'DatatypeProperty',
        ];

        foreach ($typeMap as $rdfType => $typeLabel) {
            foreach ($this->graph->allOfType($rdfType) as $resource) {
                if ($resource->isBNode()) {
                    continue;
                }

                $uri       = $this->normalizeUri($resource->getUri());
                $localName = $this->extractLocalName($uri);
                $labelRes  = $resource->get('rdfs:label');
                $label     = $labelRes !== null ? (string)$labelRes : $localName;

                // domain
                $domainRes = $resource->get('rdfs:domain');
                $domain    = ($domainRes !== null && !$domainRes->isBNode())
                    ? $this->normalizeUri($domainRes->getUri())
                    : null;

                // range
                $rangeRes = $resource->get('rdfs:range');
                $range    = ($rangeRes !== null && !$rangeRes->isBNode())
                    ? $this->normalizeUri($rangeRes->getUri())
                    : null;

                // inverseOf
                $inverseRes = $resource->get('owl:inverseOf');
                $inverseOf  = ($inverseRes !== null && !$inverseRes->isBNode())
                    ? $this->normalizeUri($inverseRes->getUri())
                    : null;

                // characteristics from rdf:type assertions
                $characteristics = [];
                foreach ($resource->all('rdf:type') as $typeRes) {
                    if ($typeRes->isBNode()) {
                        continue;
                    }
                    $typeUri = $typeRes->getUri();
                    if (isset($characteristicMap[$typeUri])) {
                        $characteristics[] = $characteristicMap[$typeUri];
                    }
                }

                $properties[] = [
                    'uri'             => $uri,
                    'localName'       => $localName,
                    'label'           => $label,
                    'type'            => $typeLabel,
                    'domain'          => $domain,
                    'range'           => $range,
                    'inverseOf'       => $inverseOf,
                    'characteristics' => $characteristics,
                ];
            }
        }

        usort($properties, fn($a, $b) => strcmp($a['label'], $b['label']));

        return $properties;
    }

    /**
     * Returns all properties whose domain is $classUri or one of its ancestors,
     * plus properties with no explicit domain (global properties).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getPropertiesOfClass(string $classUri): array
    {
        $classUri     = $this->normalizeUri($classUri);
        $ancestors    = $this->getAncestors($classUri);
        $classAndAnc  = array_merge([$classUri], $ancestors);
        $allProperties = $this->getAllProperties();

        $result = [];
        foreach ($allProperties as $prop) {
            if ($prop['domain'] === null || in_array($prop['domain'], $classAndAnc, true)) {
                $result[] = $prop;
            }
        }

        return $result;
    }

    /**
     * Returns the property hierarchy tree (via rdfs:subPropertyOf).
     * If $rootPropertyUri is null a virtual root named "Properties" is used.
     *
     * @return array<string, mixed>
     */
    public function getPropertyHierarchy(?string $rootPropertyUri = null): array
    {
        if ($rootPropertyUri !== null) {
            return $this->buildPropertyNode($rootPropertyUri, []);
        }

        // Collect all properties to find root-level ones (no subPropertyOf)
        $allUris = [];
        foreach (['owl:ObjectProperty', 'owl:DatatypeProperty'] as $rdfType) {
            foreach ($this->graph->allOfType($rdfType) as $resource) {
                if (!$resource->isBNode()) {
                    $allUris[] = $this->normalizeUri($resource->getUri());
                }
            }
        }

        $rootChildren = [];
        foreach ($allUris as $uri) {
            $resource = $this->graph->resource($uri);
            $hasParent = false;
            foreach ($resource->all('rdfs:subPropertyOf') as $parentProp) {
                if (!$parentProp->isBNode() && in_array($this->normalizeUri($parentProp->getUri()), $allUris, true)) {
                    $hasParent = true;
                    break;
                }
            }
            if (!$hasParent) {
                $rootChildren[] = $this->buildPropertyNode($uri, []);
            }
        }

        return [
            'id'       => 'virtual:properties',
            'name'     => 'Properties',
            'label'    => 'Properties',
            'children' => $rootChildren,
        ];
    }

    /**
     * Recursively builds a property hierarchy node.
     *
     * @param string[] $visited
     * @return array<string, mixed>
     */
    private function buildPropertyNode(string $uri, array $visited): array
    {
        $localName = $this->extractLocalName($uri);
        $resource  = $this->graph->resource($uri);
        $labelRes  = $resource !== null ? $resource->get('rdfs:label') : null;
        $label     = $labelRes !== null ? (string)$labelRes : $localName;

        $node    = ['id' => $uri, 'name' => $localName, 'label' => $label];
        $visited[] = $uri;

        $children = $this->findDirectSubProperties($uri, $visited);
        if (!empty($children)) {
            $node['children'] = $children;
        }

        return $node;
    }

    /**
     * Finds all direct sub-properties of $parentUri.
     *
     * @param string[] $visited
     * @return array<int, array<string, mixed>>
     */
    private function findDirectSubProperties(string $parentUri, array $visited): array
    {
        $children = [];

        foreach (['owl:ObjectProperty', 'owl:DatatypeProperty'] as $rdfType) {
            foreach ($this->graph->allOfType($rdfType) as $resource) {
                if ($resource->isBNode()) {
                    continue;
                }

                $uri = $this->normalizeUri($resource->getUri());
                if (in_array($uri, $visited, true)) {
                    continue;
                }

                foreach ($resource->all('rdfs:subPropertyOf') as $parentProp) {
                    if (!$parentProp->isBNode() && $this->normalizeUri($parentProp->getUri()) === $parentUri) {
                        $children[] = $this->buildPropertyNode($uri, $visited);
                        break;
                    }
                }
            }
        }

        return $children;
    }

    /**
     * Returns the property chain as a directed graph up to $depth levels.
     *
     * @return array{nodes: array<int, array{id: string, label: string, type: string}>, links: array<int, array{source: string, target: string, label: string, propertyUri: string}>}
     */
    public function getPropertyChain(string $propertyUri, int $depth): array
    {
        $nodes = [];
        $links = [];

        $this->expandPropertyChain($propertyUri, $depth, 0, $nodes, $links, []);

        return [
            'nodes' => array_values($nodes),
            'links' => $links,
        ];
    }

    /**
     * Recursively expands the property chain.
     *
     * @param array<string, array{id: string, label: string, type: string}> $nodes
     * @param array<int, array{source: string, target: string, label: string, propertyUri: string}> $links
     * @param string[] $visitedProps
     */
    private function expandPropertyChain(
        string $propertyUri,
        int    $maxDepth,
        int    $currentDepth,
        array  &$nodes,
        array  &$links,
        array  $visitedProps
    ): void {
        if ($currentDepth >= $maxDepth || in_array($propertyUri, $visitedProps, true)) {
            return;
        }

        $visitedProps[] = $propertyUri;
        $propResource   = $this->graph->resource($propertyUri);

        if ($propResource === null) {
            return;
        }

        $propLabel = $this->extractLocalName($propertyUri);
        $labelRes  = $propResource->get('rdfs:label');
        if ($labelRes !== null) {
            $propLabel = (string)$labelRes;
        }

        // Collect domain classes
        $domainUris = [];
        foreach ($propResource->all('rdfs:domain') as $domRes) {
            if (!$domRes->isBNode()) {
                $domainUris[] = $this->normalizeUri($domRes->getUri());
            }
        }

        // Collect range classes
        $rangeUris = [];
        foreach ($propResource->all('rdfs:range') as $rangeRes) {
            if (!$rangeRes->isBNode()) {
                $rangeUris[] = $this->normalizeUri($rangeRes->getUri());
            }
        }

        // Add domain nodes
        foreach ($domainUris as $domUri) {
            if (!isset($nodes[$domUri])) {
                $nodes[$domUri] = [
                    'id'    => $domUri,
                    'label' => $this->extractLocalName($domUri),
                    'type'  => 'class',
                ];
            }
        }

        // Add range nodes and links
        foreach ($rangeUris as $rangeUri) {
            if (!isset($nodes[$rangeUri])) {
                $nodes[$rangeUri] = [
                    'id'    => $rangeUri,
                    'label' => $this->extractLocalName($rangeUri),
                    'type'  => 'class',
                ];
            }

            foreach ($domainUris as $domUri) {
                $links[] = [
                    'source'      => $domUri,
                    'target'      => $rangeUri,
                    'label'       => $propLabel,
                    'propertyUri' => $propertyUri,
                ];
            }

            // If no domain, emit link from a virtual source
            if (empty($domainUris)) {
                $virtualSrc = 'virtual:any';
                if (!isset($nodes[$virtualSrc])) {
                    $nodes[$virtualSrc] = ['id' => $virtualSrc, 'label' => 'Any', 'type' => 'class'];
                }
                $links[] = [
                    'source'      => $virtualSrc,
                    'target'      => $rangeUri,
                    'label'       => $propLabel,
                    'propertyUri' => $propertyUri,
                ];
            }

            // Continue chain: find properties whose domain is this range class
            $rangeProperties = $this->getPropertiesOfClass($rangeUri);
            foreach ($rangeProperties as $nextProp) {
                $this->expandPropertyChain(
                    $nextProp['uri'],
                    $maxDepth,
                    $currentDepth + 1,
                    $nodes,
                    $links,
                    $visitedProps
                );
            }
        }
    }

    /**
     * Returns the direct sub-properties of $propertyUri.
     *
     * @return array<int, array{uri: string, localName: string, label: string}>
     */
    public function getSubProperties(string $propertyUri): array
    {
        $result = [];

        foreach (['owl:ObjectProperty', 'owl:DatatypeProperty'] as $rdfType) {
            foreach ($this->graph->allOfType($rdfType) as $resource) {
                if ($resource->isBNode()) {
                    continue;
                }

                foreach ($resource->all('rdfs:subPropertyOf') as $parentProp) {
                    if (!$parentProp->isBNode() && $this->normalizeUri($parentProp->getUri()) === $propertyUri) {
                        $uri       = $this->normalizeUri($resource->getUri());
                        $localName = $this->extractLocalName($uri);
                        $labelRes  = $resource->get('rdfs:label');
                        $result[]  = [
                            'uri'       => $uri,
                            'localName' => $localName,
                            'label'     => $labelRes !== null ? (string)$labelRes : $localName,
                        ];
                        break;
                    }
                }
            }
        }

        return $result;
    }

    /**
     * Returns all pairs of inverse properties.
     *
     * @return array<int, array{property: string, inverse: string}>
     */
    public function getInverseProperties(): array
    {
        $pairs = [];
        $seen  = [];

        foreach ($this->graph->allOfType('owl:ObjectProperty') as $resource) {
            if ($resource->isBNode()) {
                continue;
            }

            $uri        = $this->normalizeUri($resource->getUri());
            $inverseRes = $resource->get('owl:inverseOf');

            if ($inverseRes === null || $inverseRes->isBNode()) {
                continue;
            }

            $inverseUri = $this->normalizeUri($inverseRes->getUri());
            $key        = implode('|', [min($uri, $inverseUri), max($uri, $inverseUri)]);

            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $pairs[]    = ['property' => $uri, 'inverse' => $inverseUri];
            }
        }

        return $pairs;
    }

    // -------------------------------------------------------------------------
    // Existing alias methods
    // -------------------------------------------------------------------------

    /**
     * Returns the list of all classes (concepts) — alias for getAllClasses().
     *
     * @return array<int, array{uri: string, localName: string, label: string}>
     */
    public function getConcepts(): array
    {
        return $this->getAllClasses();
    }

    /**
     * Returns the class hierarchy tree — alias kept for backward compatibility.
     *
     * @return array<string, mixed>
     */
    public function getHierarchy(?string $conceptUri = null, int $depth = -1): array
    {
        return $this->getClassHierarchy($conceptUri);
    }

    /**
     * Extracts the local name from a URI (part after # or last /).
     */
    private function extractLocalName(string $uri): string
    {
        $hash = strrpos($uri, '#');
        if ($hash !== false) {
            return substr($uri, $hash + 1);
        }

        $slash = strrpos($uri, '/');
        if ($slash !== false) {
            return substr($uri, $slash + 1);
        }

        return $uri;
    }

    /**
     * Returns the subclass hierarchy tree + named object property relations for the progressive view.
     *
     * @return array{tree: array<string, mixed>, links: array<int, array{source: string, target: string, label: string, propertyUri: string}>}
     */
    public function getProgressiveData(?string $conceptUri = null): array
    {
        $tree = $this->getClassHierarchy($conceptUri);

        $allUris = [];
        $this->collectUrisFromTree($tree, $allUris);

        // Extract named relations from owl:Restriction on class subClassOf axioms.
        // Pattern: ClassA rdfs:subClassOf (owl:Restriction onProperty P someValuesFrom ClassB)
        $seen  = [];
        $links = [];

        foreach ($this->graph->allOfType('owl:Class') as $class) {
            if ($class->isBNode()) continue;

            $domainUri = $this->normalizeUri($class->getUri());
            if (!in_array($domainUri, $allUris, true)) continue;

            foreach ($class->all('rdfs:subClassOf') as $restriction) {
                if (!$restriction->isBNode()) continue;

                $onProp = $restriction->get('owl:onProperty');
                $svf    = $restriction->get('owl:someValuesFrom');

                if ($onProp === null || $svf === null || $svf->isBNode()) continue;

                $propUri  = $this->normalizeUri($onProp->getUri());
                $rangeUri = $this->normalizeUri($svf->getUri());

                $key = $domainUri . '|' . $propUri . '|' . $rangeUri;
                if (isset($seen[$key])) continue;
                $seen[$key] = true;

                $propRes   = $this->graph->resource($propUri);
                $propLabel = $propRes?->get('rdfs:label');
                $propName  = $propLabel !== null ? (string)$propLabel : $this->extractLocalName($propUri);

                $links[] = [
                    'source'      => $domainUri,
                    'target'      => $rangeUri,
                    'label'       => $propName,
                    'propertyUri' => $propUri,
                ];
            }
        }

        return ['tree' => $tree, 'links' => $links];
    }

    /**
     * @param string[] $uris
     */
    private function collectUrisFromTree(array $node, array &$uris): void
    {
        $uris[] = $node['id'];
        foreach ($node['children'] ?? [] as $child) {
            $this->collectUrisFromTree($child, $uris);
        }
    }
}
