<?php

declare(strict_types=1);

namespace App\Core;

class App
{
    private Router $router;

    public function __construct()
    {
        $this->router = new Router();
        $this->registerRoutes();
    }

    private function registerRoutes(): void
    {
        $this->router->register('GET', '/', 'OntologyController', 'index');
        $this->router->register('GET', '/api/hierarchy', 'ApiController', 'hierarchy');
        $this->router->register('GET', '/api/properties', 'ApiController', 'properties');
        $this->router->register('GET', '/api/property-hierarchy', 'ApiController', 'propertyHierarchy');
        $this->router->register('GET', '/api/combined', 'ApiController', 'combined');
        $this->router->register('GET', '/api/concepts', 'ApiController', 'concepts');
        $this->router->register('GET', '/api/ancestors', 'ApiController', 'ancestors');
        $this->router->register('GET', '/api/progressive', 'ApiController', 'progressive');
        $this->router->register('GET', '/api/all-properties', 'ApiController', 'allProperties');
    }

    public function run(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri    = $_SERVER['REQUEST_URI'] ?? '/';

        $this->router->dispatch($method, $uri);
    }
}
