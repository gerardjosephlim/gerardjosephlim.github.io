<?php
// app/Services/BandStructureService.php

class BandStructureService {
    private array $config;

    public function __construct(array $config) {
        $this->config = $config;
    }

    public function getBandStructure(string $id): array {
        // 1. Validate ID against allowlist
        if (!isset($this->config['materials'][$id])) {
            throw new InvalidArgumentException("Material ID '{$id}' is not supported.");
        }

        $materialInfo = $this->config['materials'][$id];
        $filePath = $materialInfo['bands_path'];

        if (!file_exists($filePath)) {
            throw new RuntimeException("Band data file not found for material '{$id}'.");
        }

        $jsonContent = file_get_contents($filePath);
        $data = json_decode($jsonContent, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException("Band data is not valid JSON: " . json_last_error_msg());
        }

        // 2. Validate data shape on the server
        $this->validateBandData($data);

        return $data;
    }

    private function validateBandData(array $data): void {
        $requiredKeys = ['materialId', 'energyReference', 'calculatedGap', 'experimentalGap', 'vbm', 'cbm', 'branches'];
        foreach ($requiredKeys as $key) {
            if (!isset($data[$key])) {
                throw new RuntimeException("Missing required band key: '{$key}'");
            }
        }

        if (!is_array($data['branches']) || empty($data['branches'])) {
            throw new RuntimeException("Branches list must be a non-empty array.");
        }

        foreach ($data['branches'] as $index => $branch) {
            $branchKeys = ['name', 'kpoints', 'kpointsCartesian', 'distances', 'energies'];
            foreach ($branchKeys as $bKey) {
                if (!isset($branch[$bKey])) {
                    throw new RuntimeException("Branch at index {$index} missing key: '{$bKey}'");
                }
            }

            $numKpoints = count($branch['kpoints']);
            if (count($branch['kpointsCartesian']) !== $numKpoints) {
                throw new RuntimeException("Branch {$branch['name']} length mismatch: kpoints ({$numKpoints}) vs kpointsCartesian (" . count($branch['kpointsCartesian']) . ")");
            }
            if (count($branch['distances']) !== $numKpoints) {
                throw new RuntimeException("Branch {$branch['name']} length mismatch: kpoints ({$numKpoints}) vs distances (" . count($branch['distances']) . ")");
            }

            if (!is_array($branch['energies']) || empty($branch['energies'])) {
                throw new RuntimeException("Branch {$branch['name']} energies list must be a non-empty array.");
            }

            foreach ($branch['energies'] as $bandIndex => $bandEnergies) {
                if (!is_array($bandEnergies)) {
                    throw new RuntimeException("Branch {$branch['name']} band {$bandIndex} energies must be an array.");
                }
                if (count($bandEnergies) !== $numKpoints) {
                    throw new RuntimeException("Branch {$branch['name']} band {$bandIndex} length mismatch: expected {$numKpoints} points, got " . count($bandEnergies));
                }
            }
        }
    }
}
