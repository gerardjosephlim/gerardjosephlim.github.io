<?php
// public/api/material.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../../app/Services/MaterialService.php';
$config = require __DIR__ . '/../../app/Config/config.php';

try {
    $materialId = isset($_GET['id']) ? trim($_GET['id']) : '';

    if (empty($materialId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing parameter: id']);
        exit;
    }

    $service = new MaterialService($config);
    $structure = $service->getMaterialStructure($materialId);

    echo json_encode($structure);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
