<?php
// public/api/bands.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../../app/Services/BandStructureService.php';
$config = require __DIR__ . '/../../app/Config/config.php';

try {
    $materialId = isset($_GET['material']) ? trim($_GET['material']) : '';

    if (empty($materialId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing parameter: material']);
        exit;
    }

    $service = new BandStructureService($config);
    $bands = $service->getBandStructure($materialId);

    echo json_encode($bands);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
