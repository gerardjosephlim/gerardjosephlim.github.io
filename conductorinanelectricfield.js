// Canvas and Context
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const fieldStrength = document.getElementById('fieldStrength');
const fieldStrengthValue = document.getElementById('fieldStrengthValue');
const showElectrons = document.getElementById('showElectrons');
const showIons = document.getElementById('showIons');
const showFieldLines = document.getElementById('showFieldLines');
const showSurfaceCharges = document.getElementById('showSurfaceCharges');
const timeValue = document.getElementById('timeValue');
const equilibriumValue = document.getElementById('equilibriumValue');
const externalFieldValue = document.getElementById('externalFieldValue');
const inducedFieldValue = document.getElementById('inducedFieldValue');
const netFieldValue = document.getElementById('netFieldValue');
const physicsNote = document.getElementById('physicsNote');

// Simulation State
let simulationTime = 0;
let externalFieldStrength = 0.0; // kV/m - default to 0
let speedMultiplier = 5;

// Field is active when strength > 0
function isFieldActive() {
    return externalFieldStrength > 0;
}

// Physics Constants
const ELECTRON_CHARGE = -1.602e-19; // Coulombs
const ELECTRON_MASS = 9.109e-31; // kg
const RELAXATION_TIME = 1e-9; // 1 nanosecond for visualization
const THERMAL_VELOCITY = 1e5; // m/s (simplified)

// Conductor Properties
const CONDUCTOR_WIDTH = 400;
const CONDUCTOR_HEIGHT = 300;
const LATTICE_SPACING = 30;
const ELECTRON_RADIUS = 3;
const ION_RADIUS = 4;

// Particle Arrays
let ions = [];
let electrons = [];
let initialElectronPositions = [];

// Canvas Setup
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

// Initialize Particles
function initializeParticles() {
    ions = [];
    electrons = [];
    initialElectronPositions = [];

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const startX = centerX - CONDUCTOR_WIDTH / 2;
    const startY = centerY - CONDUCTOR_HEIGHT / 2;
    const margin = 20; // Keep particles away from edges

    // Calculate how many ions fit in each dimension
    const numIonsX = Math.floor((CONDUCTOR_WIDTH - 2 * margin) / LATTICE_SPACING);
    const numIonsY = Math.floor((CONDUCTOR_HEIGHT - 2 * margin) / LATTICE_SPACING);

    // Calculate total lattice size
    const latticeWidth = (numIonsX - 1) * LATTICE_SPACING;
    const latticeHeight = (numIonsY - 1) * LATTICE_SPACING;

    // Center the lattice within the conductor
    const latticeStartX = startX + (CONDUCTOR_WIDTH - latticeWidth) / 2;
    const latticeStartY = startY + (CONDUCTOR_HEIGHT - latticeHeight) / 2;

    // Create lattice of positive ion cores (centered and aligned)
    for (let i = 0; i < numIonsX; i++) {
        for (let j = 0; j < numIonsY; j++) {
            ions.push({
                x: latticeStartX + i * LATTICE_SPACING,
                y: latticeStartY + j * LATTICE_SPACING,
                fixed: true
            });
        }
    }

    // Create mobile electrons (one per ion for neutral conductor)
    ions.forEach(ion => {
        const electron = {
            x: ion.x + (Math.random() - 0.5) * LATTICE_SPACING * 0.2,
            y: ion.y + (Math.random() - 0.5) * LATTICE_SPACING * 0.2,
            vx: (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001,
            vy: (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001,
            initialX: ion.x,
            initialY: ion.y,
            driftX: 0,
            driftY: 0
        };
        electrons.push(electron);
        initialElectronPositions.push({ x: electron.x, y: electron.y });
    });
}

// Physics Update
function updatePhysics(dt) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const conductorLeft = centerX - CONDUCTOR_WIDTH / 2;
    const conductorRight = centerX + CONDUCTOR_WIDTH / 2;
    const conductorTop = centerY - CONDUCTOR_HEIGHT / 2;
    const conductorBottom = centerY + CONDUCTOR_HEIGHT / 2;
    const margin = 10;

    if (isFieldActive()) {
        // External field is ON - electrons drift slowly
        const fieldX = externalFieldStrength * 1000; // Convert kV/m to V/m

        electrons.forEach((electron, idx) => {
            // Force on electron: F = qE (q is negative for electrons)
            const forceX = ELECTRON_CHARGE * fieldX;

            // Acceleration: a = F/m
            const ax = forceX / ELECTRON_MASS;

            // Update drift velocity with damping
            const dampingFactor = Math.exp(-dt / RELAXATION_TIME);
            electron.driftX = electron.driftX * dampingFactor + ax * dt * (1 - dampingFactor);

            // Update position with VERY slow drift for gradual visualization
            electron.x += electron.driftX * dt * speedMultiplier * 1E-12;

            // Add thermal motion (random walk)
            electron.x += electron.vx * dt * speedMultiplier * 0.1;
            electron.y += electron.vy * dt * speedMultiplier * 0.1;

            // Randomize thermal velocity occasionally
            if (Math.random() < 0.05) {
                electron.vx = (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001;
                electron.vy = (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001;
            }

            // Keep electrons within conductor bounds
            if (electron.x < conductorLeft + margin) {
                electron.x = conductorLeft + margin;
                electron.vx = Math.abs(electron.vx);
                electron.driftX = Math.max(0, electron.driftX);
            }
            if (electron.x > conductorRight - margin) {
                electron.x = conductorRight - margin;
                electron.vx = -Math.abs(electron.vx);
                electron.driftX = Math.min(0, electron.driftX);
            }
            if (electron.y < conductorTop + margin) {
                electron.y = conductorTop + margin;
                electron.vy = Math.abs(electron.vy);
            }
            if (electron.y > conductorBottom - margin) {
                electron.y = conductorBottom - margin;
                electron.vy = -Math.abs(electron.vy);
            }
        });
    } else {
        // External field is OFF - electrons redistribute quickly back to neutral state
        electrons.forEach((electron, idx) => {
            // Pull electron back toward its initial position
            const dx = electron.initialX - electron.x;
            const dy = electron.initialY - electron.y;

            // Fast redistribution with spring-like force
            electron.x += dx * dt * speedMultiplier * 0.3; // Fast return to equilibrium
            electron.y += dy * dt * speedMultiplier * 0.3;

            // Decay drift velocity
            electron.driftX *= 0.85;

            // Add thermal motion
            electron.x += electron.vx * dt * speedMultiplier * 0.1;
            electron.y += electron.vy * dt * speedMultiplier * 0.1;

            // Randomize thermal velocity occasionally
            if (Math.random() < 0.05) {
                electron.vx = (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001;
                electron.vy = (Math.random() - 0.5) * THERMAL_VELOCITY * 0.001;
            }

            // Keep electrons within conductor bounds
            if (electron.x < conductorLeft + margin) {
                electron.x = conductorLeft + margin;
                electron.vx = Math.abs(electron.vx);
            }
            if (electron.x > conductorRight - margin) {
                electron.x = conductorRight - margin;
                electron.vx = -Math.abs(electron.vx);
            }
            if (electron.y < conductorTop + margin) {
                electron.y = conductorTop + margin;
                electron.vy = Math.abs(electron.vy);
            }
            if (electron.y > conductorBottom - margin) {
                electron.y = conductorBottom - margin;
                electron.vy = -Math.abs(electron.vy);
            }
        });
    }

    simulationTime += dt;
}

// Calculate Internal Field (field due to accumulated surface charges)
function calculateInternalField() {
    if (!isFieldActive()) return 0;

    const centerX = canvas.width / 2;
    const conductorLeft = centerX - CONDUCTOR_WIDTH / 2;
    const conductorRight = centerX + CONDUCTOR_WIDTH / 2;

    // Count electrons on left vs right side
    let leftElectrons = 0;
    let rightElectrons = 0;

    electrons.forEach(e => {
        if (e.x < centerX) leftElectrons++;
        else rightElectrons++;
    });

    // Calculate charge imbalance
    // At equilibrium: leftElectrons >> rightElectrons
    // The surface charges create an internal field opposing the external field
    const totalElectrons = electrons.length;
    const chargeAsymmetry = (leftElectrons - rightElectrons) / totalElectrons; // -1 to 1

    // Internal field magnitude (opposes external field)
    // When fully accumulated (chargeAsymmetry ≈ 1), internal field ≈ external field
    // Direction: opposite to external field (points left when external points right)
    const internalFieldMagnitude = Math.abs(chargeAsymmetry) * externalFieldStrength;

    return internalFieldMagnitude;
}

// Calculate net field inside conductor (external - internal)
function calculateNetField() {
    const internalField = calculateInternalField();
    // Net field = external field - internal field (they oppose each other)
    const netField = externalFieldStrength - internalField;
    return Math.max(0, netField); // Can't be negative
}

// Check Equilibrium
function checkEquilibrium() {
    const netField = calculateNetField();
    return netField < externalFieldStrength * 0.1; // Within 10%
}

// Rendering Functions
function drawConductor() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const left = centerX - CONDUCTOR_WIDTH / 2;
    const top = centerY - CONDUCTOR_HEIGHT / 2;

    // Draw conductor block with copper color
    ctx.fillStyle = 'rgba(184, 115, 51, 0.2)';
    ctx.strokeStyle = 'rgba(255, 140, 66, 0.6)';
    ctx.lineWidth = 2;
    ctx.fillRect(left, top, CONDUCTOR_WIDTH, CONDUCTOR_HEIGHT);
    ctx.strokeRect(left, top, CONDUCTOR_WIDTH, CONDUCTOR_HEIGHT);

    // Label
    ctx.fillStyle = 'rgba(255, 140, 66, 0.8)';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Copper Conductor', centerX, top - 15);
}

function drawFieldLines() {
    if (!showFieldLines.checked) return;

    const centerY = canvas.height / 2;
    const conductorLeft = canvas.width / 2 - CONDUCTOR_WIDTH / 2;
    const conductorRight = canvas.width / 2 + CONDUCTOR_WIDTH / 2;

    const numLines = 8;
    const spacing = CONDUCTOR_HEIGHT / (numLines + 1);

    // Calculate brightness based on field strength (0-10 kV/m range)
    const maxFieldStrength = 10; // Maximum field strength in kV/m
    const fieldIntensity = Math.min(externalFieldStrength / maxFieldStrength, 1); // 0 to 1

    // External field lines: grey when off, blue with increasing brightness when on
    const lineAlpha = fieldIntensity > 0 ? 0.3 + fieldIntensity * 0.4 : 0.3;
    const arrowAlpha = fieldIntensity > 0 ? 0.5 + fieldIntensity * 0.5 : 0.4;

    const lineColor = fieldIntensity > 0
        ? `rgba(0, 212, 255, ${lineAlpha})`
        : 'rgba(100, 100, 100, 0.3)';
    const arrowColor = fieldIntensity > 0
        ? `rgba(0, 212, 255, ${arrowAlpha})`
        : 'rgba(100, 100, 100, 0.4)';

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    for (let i = 1; i <= numLines; i++) {
        const y = centerY - CONDUCTOR_HEIGHT / 2 + spacing * i;

        // External field lines (left side)
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(conductorLeft - 20, y);
        ctx.stroke();

        // Arrow (external field only)
        drawArrow(conductorLeft - 20, y, conductorLeft - 10, y, arrowColor);

        // External field lines (right side)
        ctx.beginPath();
        ctx.moveTo(conductorRight + 20, y);
        ctx.lineTo(canvas.width - 50, y);
        ctx.stroke();

        // Arrow (external field only)
        drawArrow(canvas.width - 50, y, canvas.width - 40, y, arrowColor);

        // Internal field lines (fade out at equilibrium)
        if (isFieldActive()) {
            const internalField = calculateInternalField();
            const alpha = (internalField / externalFieldStrength) * 0.3;
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(conductorLeft + 20, y);
            ctx.lineTo(conductorRight - 20, y);
            ctx.stroke();

            // Reset stroke style for next iteration
            ctx.strokeStyle = lineColor;
        }
    }

    ctx.setLineDash([]);

    // Field direction label - brightness also scales with field strength
    if (isFieldActive()) {
        const labelAlpha = 0.6 + fieldIntensity * 0.4;
        ctx.fillStyle = `rgba(0, 212, 255, ${labelAlpha})`;
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'left';
        ctx.fillText(`E⃗ external = ${externalFieldStrength.toFixed(1)} kV/m`, 60, canvas.height / 2 - CONDUCTOR_HEIGHT / 2 - 30);
    }

    drawFieldVectorsAboveConductor();
}

function drawFieldVectorsAboveConductor() {
    if (!isFieldActive()) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const top = centerY - CONDUCTOR_HEIGHT / 2;

    const internalField = calculateInternalField();
    const netField = calculateNetField();

    const scale = 15; // Pixels per kV/m
    const labelXOffset = -10;

    // Positions above conductor
    const extY = top - 90;
    const indY = top - 65;
    const netY = top - 40;

    // Helper to draw labeled vector
    const drawLabeledVector = (y, magnitude, color, label, direction) => {
        const length = magnitude * scale;

        ctx.fillStyle = color;
        ctx.font = 'bold 12px Inter';

        if (length >= 2) {
            const startX = centerX - length / 2;
            const endX = centerX + length / 2;

            ctx.strokeStyle = color;
            ctx.lineWidth = 3;

            ctx.beginPath();
            if (direction === 'right') {
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
                drawArrow(endX - 5, y, endX, y, color);
            } else {
                ctx.moveTo(endX, y);
                ctx.lineTo(startX, y);
                ctx.stroke();
                drawArrow(startX + 5, y, startX, y, color);
            }

            ctx.textAlign = 'right';
            ctx.fillText(label, centerX - length / 2 - 5, y + 4);
            ctx.textAlign = 'left';
            ctx.fillText(`${magnitude.toFixed(1)}`, centerX + length / 2 + 5, y + 4);
        } else {
            // Just draw the label at center if magnitude is zero
            ctx.textAlign = 'center';
            ctx.fillText(`${label} = 0.0`, centerX, y + 4);
        }
    };

    // Draw the three vectors
    // 1. External Field (Blue, points right)
    drawLabeledVector(extY, externalFieldStrength, 'rgba(0, 212, 255, 0.8)', 'E⃗_external', 'right');

    // 2. Induced Field (Red, points left)
    drawLabeledVector(indY, internalField, 'rgba(255, 100, 100, 0.8)', 'E⃗_induced', 'left');

    // 3. Net Field (Green, points right)
    const netColor = netField < 0.5 ? 'rgba(16, 185, 129, 0.9)' : 'rgba(245, 158, 11, 0.8)';
    drawLabeledVector(netY, netField, netColor, 'E⃗_net', 'right');
}

function drawArrow(x1, y1, x2, y2, color) {
    const headLength = 8;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function drawIons() {
    if (!showIons.checked) return;

    ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
    ions.forEach(ion => {
        ctx.beginPath();
        ctx.arc(ion.x, ion.y, ION_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Plus sign
        ctx.strokeStyle = 'rgba(255, 150, 150, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ion.x - 2, ion.y);
        ctx.lineTo(ion.x + 2, ion.y);
        ctx.moveTo(ion.x, ion.y - 2);
        ctx.lineTo(ion.x, ion.y + 2);
        ctx.stroke();
    });
}

function drawElectrons() {
    if (!showElectrons.checked) return;

    electrons.forEach(electron => {
        // Glow effect
        const gradient = ctx.createRadialGradient(electron.x, electron.y, 0, electron.x, electron.y, ELECTRON_RADIUS * 2);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(electron.x, electron.y, ELECTRON_RADIUS * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = 'rgba(150, 220, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(electron.x, electron.y, ELECTRON_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Minus sign
        ctx.strokeStyle = 'rgba(200, 240, 255, 1)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(electron.x - 2, electron.y);
        ctx.lineTo(electron.x + 2, electron.y);
        ctx.stroke();
    });
}

function drawSurfaceCharges() {
    if (!showSurfaceCharges.checked || !isFieldActive()) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const conductorLeft = centerX - CONDUCTOR_WIDTH / 2;
    const conductorRight = centerX + CONDUCTOR_WIDTH / 2;
    const conductorTop = centerY - CONDUCTOR_HEIGHT / 2;
    const conductorBottom = centerY + CONDUCTOR_HEIGHT / 2;

    // Count electrons on each side
    let leftCount = 0;
    let rightCount = 0;

    electrons.forEach(e => {
        if (e.x < centerX) leftCount++;
        else rightCount++;
    });

    const totalElectrons = electrons.length;
    const leftExcess = (leftCount / totalElectrons - 0.5) * 2; // -1 to 1
    const rightExcess = (rightCount / totalElectrons - 0.5) * 2;

    // Left surface (electron accumulation - negative charge)
    if (leftExcess > 0.1) {
        ctx.fillStyle = `rgba(100, 200, 255, ${leftExcess * 0.3})`;
        ctx.fillRect(conductorLeft - 5, conductorTop, 10, CONDUCTOR_HEIGHT);

        ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
        ctx.font = 'bold 20px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('−', conductorLeft - 25, centerY);

        ctx.font = '12px Inter';
        ctx.fillText('Excess', conductorLeft - 25, centerY + 20);
        ctx.fillText('Electrons', conductorLeft - 25, centerY + 35);
    }

    // Right surface (electron depletion - positive charge)
    if (rightExcess < -0.1) {
        ctx.fillStyle = `rgba(255, 100, 100, ${-rightExcess * 0.3})`;
        ctx.fillRect(conductorRight - 5, conductorTop, 10, CONDUCTOR_HEIGHT);

        ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
        ctx.font = 'bold 20px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('+', conductorRight + 25, centerY);

        ctx.font = '12px Inter';
        ctx.fillText('Electron', conductorRight + 25, centerY + 20);
        ctx.fillText('Deficit', conductorRight + 25, centerY + 35);
    }
}

// Main Render Loop
function render() {
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawFieldLines();
    drawConductor();
    drawIons();
    drawElectrons();
    drawSurfaceCharges();
}

// Animation Loop with 60Hz limit
let lastTime = Date.now();
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS; // 16.67ms
let lastFrameTime = Date.now();

function animate() {
    const currentTime = Date.now();
    const timeSinceLastFrame = currentTime - lastFrameTime;

    // Limit to 60Hz
    if (timeSinceLastFrame >= FRAME_TIME) {
        const dt = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;
        lastFrameTime = currentTime;

        // Always update physics (simulation auto-runs)
        updatePhysics(dt);
        updateUI();
        render();
    }

    requestAnimationFrame(animate);
}

// Update UI Values
function updateUI() {
    // Time display omitted per user request

    const isEquilibrium = checkEquilibrium();
    equilibriumValue.textContent = isEquilibrium ? 'Reached' : 'Not Reached';
    equilibriumValue.style.color = isEquilibrium ? '#10b981' : '#f59e0b';

    const internalField = calculateInternalField();
    const netField = calculateNetField();

    externalFieldValue.textContent = externalFieldStrength.toFixed(1) + ' kV/m';
    inducedFieldValue.textContent = internalField.toFixed(2) + ' kV/m';
    netFieldValue.textContent = netField.toFixed(2) + ' kV/m';

    // Update physics note
    if (isFieldActive()) {
        if (isEquilibrium) {
            physicsNote.textContent = 'Equilibrium reached: Net field ≈ 0';
            physicsNote.style.borderColor = '#10b981';
            physicsNote.style.color = '#10b981';
        } else {
            physicsNote.textContent = 'Electrons redistributing...';
            physicsNote.style.borderColor = '#00d4ff';
            physicsNote.style.color = '#00d4ff';
        }
    } else {
        physicsNote.textContent = 'No external field applied';
        physicsNote.style.borderColor = '#9ca3af';
        physicsNote.style.color = '#9ca3af';
    }
}

// Event Listeners
fieldStrength.addEventListener('input', (e) => {
    externalFieldStrength = parseFloat(e.target.value) / 10;
    fieldStrengthValue.textContent = externalFieldStrength.toFixed(1) + ' kV/m';
});

// Initialize
window.addEventListener('resize', () => {
    resizeCanvas();
    initializeParticles();
    render();
});

resizeCanvas();
initializeParticles();
updateUI();
animate();
