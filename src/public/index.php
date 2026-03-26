<?php

declare(strict_types=1);

// Suppress deprecation notices from EasyRDF (incompatible with PHP 8.x return types)
error_reporting(E_ALL & ~E_DEPRECATED);

require_once __DIR__ . '/../vendor/autoload.php';

$app = new App\Core\App();
$app->run();
