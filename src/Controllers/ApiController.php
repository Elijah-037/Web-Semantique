<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\OntologyModel;

class ApiController extends BaseController
{
    private OntologyModel $model;

    public function __construct()
    {
        $this->model = new OntologyModel();
    }

    // -------------------------------------------------------------------------
    // GET /api/concepts
    // -------------------------------------------------------------------------

    public function concepts(): void
    {
        $classes = $this->model->getAllClasses();

        $data = array_map(fn($c) => [
            'uri'   => $c['uri'],
            'label' => $c['label'],
        ], $classes);

        $this->json(['status' => 'ok', 'data' => $data]);
    }

    // -------------------------------------------------------------------------
    // GET /api/all-properties
    // -------------------------------------------------------------------------

    public function allProperties(): void
    {
        $properties = $this->model->getAllProperties();

        $data = array_map(fn($p) => [
            'uri'   => $p['uri'],
            'label' => $p['label'],
            'type'  => $p['type'],
        ], $properties);

        $this->json(['status' => 'ok', 'data' => $data]);
    }

    // -------------------------------------------------------------------------
    // GET /api/hierarchy?concept=...&depth=...
    // -------------------------------------------------------------------------

    public function hierarchy(): void
    {
        $conceptParam = $_GET['concept'] ?? null;
        $depth        = isset($_GET['depth']) ? (int)$_GET['depth'] : -1;

        $rootUri = null;

        if ($conceptParam !== null && $conceptParam !== '') {
            $rootUri = $this->resolveUri($conceptParam);
            if ($rootUri === null) {
                $this->error("Concept not found: {$conceptParam}", 404);
            }
        }

        $tree = $this->model->getClassHierarchy($rootUri);

        $this->json(['status' => 'ok', 'data' => $tree]);
    }

    // -------------------------------------------------------------------------
    // GET /api/properties?concept=...
    // -------------------------------------------------------------------------

    public function properties(): void
    {
        $conceptParam = $_GET['concept'] ?? null;

        if ($conceptParam === null || $conceptParam === '') {
            $this->error('Missing required parameter: concept');
        }

        $classUri = $this->resolveUri($conceptParam);
        if ($classUri === null) {
            $this->error("Concept not found: {$conceptParam}", 404);
        }

        $props = $this->model->getPropertiesOfClass($classUri);

        $objectProperties = array_values(array_filter($props, fn($p) => $p['type'] === 'ObjectProperty'));
        $dataProperties   = array_values(array_filter($props, fn($p) => $p['type'] === 'DatatypeProperty'));

        $localName = $this->extractLocalName($classUri);

        $this->json([
            'status' => 'ok',
            'data'   => [
                'concept'          => ['uri' => $classUri, 'label' => $localName],
                'objectProperties' => $objectProperties,
                'dataProperties'   => $dataProperties,
            ],
        ]);
    }

    // -------------------------------------------------------------------------
    // GET /api/property-hierarchy?property=...
    // -------------------------------------------------------------------------

    public function propertyHierarchy(): void
    {
        $propertyParam = $_GET['property'] ?? null;

        $propertyUri = null;

        if ($propertyParam !== null && $propertyParam !== '') {
            $propertyUri = $this->resolvePropertyUri($propertyParam);
            if ($propertyUri === null) {
                $this->error("Property not found: {$propertyParam}", 404);
            }
        }

        $tree = $this->model->getPropertyHierarchy($propertyUri);

        $this->json(['status' => 'ok', 'data' => $tree]);
    }

    // -------------------------------------------------------------------------
    // GET /api/combined?concept=...&property=...&depth=...
    // -------------------------------------------------------------------------

    public function combined(): void
    {
        $conceptParam  = $_GET['concept'] ?? null;
        $propertyParam = $_GET['property'] ?? null;
        $depth         = isset($_GET['depth']) ? (int)$_GET['depth'] : 2;

        if ($conceptParam === null || $conceptParam === '') {
            $this->error('Missing required parameter: concept');
        }

        $classUri = $this->resolveUri($conceptParam);
        if ($classUri === null) {
            $this->error("Concept not found: {$conceptParam}", 404);
        }

        // Hierarchy
        $hierarchy = $this->model->getClassHierarchy($classUri);

        // Properties of concept
        $props = $this->model->getPropertiesOfClass($classUri);

        // Property chain
        $propertyChain = ['nodes' => [], 'links' => []];

        if ($propertyParam !== null && $propertyParam !== '') {
            $propertyUri = $this->resolvePropertyUri($propertyParam);
            if ($propertyUri === null) {
                $this->error("Property not found: {$propertyParam}", 404);
            }
            $propertyChain = $this->model->getPropertyChain($propertyUri, $depth);
        }

        $this->json([
            'status' => 'ok',
            'data'   => [
                'hierarchy'     => $hierarchy,
                'properties'    => $props,
                'propertyChain' => $propertyChain,
            ],
        ]);
    }

    // -------------------------------------------------------------------------
    // GET /api/ancestors?concept=...
    // -------------------------------------------------------------------------

    public function ancestors(): void
    {
        $conceptParam = $_GET['concept'] ?? null;

        if ($conceptParam === null || $conceptParam === '') {
            $this->error('Missing required parameter: concept');
        }

        $classUri = $this->resolveUri($conceptParam);
        if ($classUri === null) {
            $this->error("Concept not found: {$conceptParam}", 404);
        }

        $ancestorUris = $this->model->getAncestors($classUri);

        $data = array_map(fn(string $uri) => [
            'uri'   => $uri,
            'label' => $this->extractLocalName($uri),
        ], $ancestorUris);

        $this->json(['status' => 'ok', 'data' => $data]);
    }

    // -------------------------------------------------------------------------
    // GET /api/progressive?concept=...
    // -------------------------------------------------------------------------

    public function progressive(): void
    {
        $conceptParam = $_GET['concept'] ?? null;
        $rootUri      = null;

        if ($conceptParam !== null && $conceptParam !== '') {
            $rootUri = $this->resolveUri($conceptParam);
            if ($rootUri === null) {
                $this->error("Concept not found: {$conceptParam}", 404);
            }
        }

        $data = $this->model->getProgressiveData($rootUri);
        $this->json(['status' => 'ok', 'data' => $data]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Resolves a concept parameter (full URI or localName) to a class URI.
     * Returns null if not found.
     */
    private function resolveUri(string $param): ?string
    {
        if (str_contains($param, '://')) {
            return $param;
        }

        foreach ($this->model->getAllClasses() as $class) {
            if ($class['localName'] === $param) {
                return $class['uri'];
            }
        }

        return null;
    }

    /**
     * Resolves a property parameter (full URI or localName) to a property URI.
     * Returns null if not found.
     */
    private function resolvePropertyUri(string $param): ?string
    {
        if (str_contains($param, '://')) {
            return $param;
        }

        foreach ($this->model->getAllProperties() as $prop) {
            if ($prop['localName'] === $param) {
                return $prop['uri'];
            }
        }

        return null;
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
     * Outputs a JSON error response and terminates.
     */
    private function error(string $message, int $status = 400): never
    {
        $this->json(['status' => 'error', 'message' => $message], $status);
        exit;
    }
}
