<?php
// app/Services/MaterialService.php

class MaterialService {
    private array $config;

    public function __construct(array $config) {
        $this->config = $config;
    }

    public function getMaterialStructure(string $id): array {
        // 1. Validate ID against allowlist
        if (!isset($this->config['materials'][$id])) {
            throw new InvalidArgumentException("Material ID '{$id}' is not supported.");
        }

        $materialInfo = $this->config['materials'][$id];
        $filePath = $materialInfo['structure_path'];

        if (!file_exists($filePath)) {
            throw new RuntimeException("Structure data file not found for material '{$id}'.");
        }

        $jsonContent = file_get_contents($filePath);
        $data = json_decode($jsonContent, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException("Structure data is not valid JSON: " . json_last_error_msg());
        }

        // 2. Validate data shape on the server
        $this->validateStructureData($data);

        return $data;
    }

    private function validateStructureData(array $data): void {
        $requiredKeys = ['materialId', 'name', 'formula', 'latticeConstant', 'primitiveVectors', 'conventionalAtoms', 'primitiveAtoms'];
        foreach ($requiredKeys as $key) {
            if (!isset($data[$key])) {
                throw new RuntimeException("Missing required structure key: '{$key}'");
            }
        }

        if (!is_array($data['primitiveVectors']) || count($data['primitiveVectors']) !== 3) {
            throw new RuntimeException("Lattice vectors must be a 3x3 matrix.");
        }

        foreach ($data['primitiveVectors'] as $vector) {
            if (!is_array($vector) || count($vector) !== 3) {
                throw new RuntimeException("Lattice vectors must contain 3-dimensional components.");
            }
        }

        if (!is_array($data['conventionalAtoms']) || empty($data['conventionalAtoms'])) {
            throw new RuntimeException("Conventional atoms list must be a non-empty array.");
        }

        foreach ($data['conventionalAtoms'] as $atom) {
            if (!isset($atom['pos']) || count($atom['pos']) !== 3 || !isset($atom['weight'])) {
                throw new RuntimeException("Atom positions must contain 3 coordinates and an occupancy weight.");
            }
        }
    }
}
