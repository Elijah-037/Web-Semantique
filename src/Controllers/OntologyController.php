<?php

declare(strict_types=1);

namespace App\Controllers;

class OntologyController extends BaseController
{
    public function index(): void
    {
        $this->render('ontology/index');
    }
}
