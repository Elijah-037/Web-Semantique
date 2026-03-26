<?php

declare(strict_types=1);

namespace App\Models;

class GraphModel
{
    /**
     * Returns the properties (ObjectProperty, DataProperty) of a given concept URI.
     */
    public function getProperties(string $conceptUri): array
    {
        // TODO: implement with EasyRDF in TASK-04
        return [];
    }

    /**
     * Returns the hierarchy of a property (sub-properties, super-properties).
     */
    public function getPropertyHierarchy(string $propertyUri): array
    {
        // TODO: implement with EasyRDF in TASK-04
        return [];
    }

    /**
     * Returns a combined graph: inheritance + properties + property chain up to depth p.
     */
    public function getCombined(string $conceptUri, string $propertyUri, int $depth = 1): array
    {
        // TODO: implement in TASK-09
        return [];
    }
}
