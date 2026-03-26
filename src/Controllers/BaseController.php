<?php

declare(strict_types=1);

namespace App\Controllers;

abstract class BaseController
{
    protected function render(string $view, array $data = []): void
    {
        extract($data);
        $viewPath = __DIR__ . '/../Views/' . $view . '.html.php';

        ob_start();
        require $viewPath;
        $content = ob_get_clean();

        require __DIR__ . '/../Views/layouts/main.html.php';
    }

    protected function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
