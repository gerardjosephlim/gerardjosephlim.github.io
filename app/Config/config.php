<?php
// app/Config/config.php

return [
    'env' => getenv('APP_ENV') ?: 'development',
    
    // Server-side material registry
    'materials' => [
        'silicon' => [
            'name' => 'Silicon',
            'formula' => 'Si',
            'structure_path' => __DIR__ . '/../../data/silicon/structure.json',
            'bands_path' => __DIR__ . '/../../data/silicon/bands.json'
        ]
    ]
];
