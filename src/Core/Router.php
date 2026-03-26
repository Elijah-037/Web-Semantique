<?php

declare(strict_types=1);

namespace App\Core;

class Router
{
    private array $routes = [];

    public function register(string $method, string $uri, string $controller, string $action): void
    {
        $this->routes[] = [
            'method'     => strtoupper($method),
            'uri'        => $uri,
            'controller' => $controller,
            'action'     => $action,
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        $uri = strtok($uri, '?');

        foreach ($this->routes as $route) {
            if ($route['method'] === strtoupper($method) && $route['uri'] === $uri) {
                $controllerClass = 'App\\Controllers\\' . $route['controller'];
                $controller = new $controllerClass();
                $action = $route['action'];
                $controller->$action();
                return;
            }
        }

        http_response_code(404);
        echo json_encode(['error' => 'Route not found']);
    }
}
