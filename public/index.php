<?php
// public/index.php

$config = require __DIR__ . '/../app/Config/config.php';
$isDevelopment = $config['env'] === 'development';
$debugEnabled = isset($_GET['debug']) && $_GET['debug'] == '1';

// Load assets from manifest
$appScript = '/assets/app.js';
$appStylesheet = '/assets/main.css';

$manifestPath = __DIR__ . '/assets/manifest.json';
if (file_exists($manifestPath)) {
    $manifest = json_decode(file_get_contents($manifestPath), true);
    if (isset($manifest['app.js'])) {
        $appScript = $manifest['app.js'];
    }
    if (isset($manifest['main.css'])) {
        $appStylesheet = $manifest['main.css'];
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crystal Electronic Structure Explorer</title>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($appStylesheet); ?>">
    <!-- Three.js and OrbitControls CDNs -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body class="dark-theme">
    <header class="app-header">
        <div class="logo-area">
            <h1>Crystal Electronic Structure Explorer</h1>
        </div>
        <div class="controls-area">
            <label for="material-select">Material:</label>
            <select id="material-select">
                <option value="silicon">Silicon (Si)</option>
            </select>
            <button id="reset-camera">Reset View</button>
            <button id="toggle-theme">Toggle Theme</button>
        </div>
    </header>

    <main class="app-container" id="app-layout">
        <!-- Panel 1: Real-Space Crystal Structure -->
        <section class="view-panel" id="crystal-panel" aria-label="Real-Space Crystal Structure">
            <div class="panel-header-row">
                <h2 class="panel-title">Real Space</h2>
                <span class="panel-badge real-space">⬡ Crystal Structure</span>
            </div>
            <div class="canvas-container" id="crystal-canvas"></div>
            <div class="panel-controls">
                <label><input type="checkbox" id="toggle-conventional" checked> Conventional Cell</label>
                <label><input type="checkbox" id="toggle-primitive"> Primitive Cell</label>
                <label><input type="checkbox" id="toggle-bonds" checked> Show Bonds</label>
            </div>
        </section>

        <!-- Panel 2: Reciprocal-Space Brillouin Zone -->
        <section class="view-panel" id="bz-panel" aria-label="Reciprocal-Space Brillouin Zone">
            <div class="panel-header-row">
                <h2 class="panel-title">Reciprocal Space</h2>
                <span class="panel-badge reciprocal-space">◈ Brillouin Zone</span>
            </div>
            <div class="canvas-container" id="bz-canvas"></div>
            <div class="panel-controls">
                <label><input type="checkbox" id="toggle-bz" checked> BZ Boundary</label>
                <label><input type="checkbox" id="toggle-kpath" checked> k-Path</label>
                <label><input type="checkbox" id="toggle-symmetry-pts" checked> Special Points</label>
            </div>
        </section>

        <!-- Panel 3: Electronic Band Structure -->
        <section class="view-panel" id="band-panel" aria-label="Electronic Band Structure">
            <h2 class="panel-title">Electronic Band Structure</h2>
            <div class="canvas-container" id="band-canvas"></div>
            <div class="panel-controls">
                <label><input type="checkbox" id="toggle-scissor"> Scissor Corrected Teaching View</label>
                <span class="gap-info" id="calculated-gap-display">Calculated Gap: --</span>
            </div>
        </section>
    </main>

    <!-- Info & Explanation Panel -->
    <footer class="app-footer">
        <div id="explanation-container">
            <div class="tabs">
                <button class="tab-btn active" data-tab="learning">Guided Learning</button>
                <button class="tab-btn" data-tab="provenance">Sources & Methodology</button>
                <button class="tab-btn" data-tab="details">Active Selection Info</button>
            </div>
            
            <div class="tab-content active" id="tab-learning">
                <div class="guided-tour-controls">
                    <button id="prev-step" disabled>&larr; Previous</button>
                    <span id="tour-step-indicator">Stage 1 / 15</span>
                    <button id="next-step">Next &rarr;</button>
                </div>
                <div class="tour-text" id="guided-tour-description">
                    Loading guided tour step...
                </div>
            </div>
            
            <div class="tab-content" id="tab-provenance">
                <h3>Silicon mp-149 Reference Data</h3>
                <p><strong>Structure:</strong> Diamond cubic silicon (FCC Bravais lattice with two-atom basis).</p>
                <p><strong>Lattice parameter:</strong> Approximately 5.431 Å (NIST/CODATA reference: 5.431020511 Å).</p>
                <p><strong>Symmetry convention:</strong> Setyawan-Curtarolo standard primitive reciprocal basis.</p>
                <p><strong>Electronic structure:</strong> DFT-GGA (PBE) eigenvalues from Materials Project <code>mp-149</code>.</p>
                <p><strong>Experimental indirect gap:</strong> ~1.12 eV at room temperature.</p>
                <p class="caveat"><em>Caveat:</em> Calculated DFT-PBE band gaps systematically underestimate the experimental value.</p>
            </div>

            <div class="tab-content" id="tab-details">
                <div id="selection-details-content">
                    Click on an atom, a symmetry point, or a path segment to view coordinates and physical meaning.
                </div>
            </div>
        </div>
    </footer>

    <!-- Developer Validation Overlay -->
    <?php if ($debugEnabled): ?>
    <div id="debug-dashboard" class="debug-overlay">
        <h3>Physics Validation Dashboard</h3>
        <ul id="validation-list">
            <li>Running physics tests...</li>
        </ul>
        <button id="close-debug">Close</button>
    </div>
    <?php endif; ?>

    <!-- Load main script as ES module -->
    <script type="module" src="<?php echo htmlspecialchars($appScript); ?>"></script>
</body>
</html>
