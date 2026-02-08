const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

// State
let charges = []; // {x, y, vx, vy, q, id, opacity, isFixed}
let sparks = []; // {x, y, vx, vy, life, color, type, targetX, targetY, startX, startY}
let selectedCharge = null;
let isDraggingCharge = false;
let isRunning = false;
let simSpeed = 0.05;
let showAxes = false;
let showEquipotentials = false;
let dragOffset = { x: 0, y: 0 };
let width, height;
let lastTime = 0;
const FPS = 30;
const FPS_INTERVAL = 1000 / FPS;

// Visualization Config
let useFixedLength = false;
let showForces = true;

// Physics Config
const GRID_SPACING = 40;
const VISUAL_K = 5000; // For field arrow rendering only
const COULOMB_K = 8.99e9; // Real physics constant
const CHARGE_RADIUS = 15;
const MAX_ARROW_LENGTH = 30;

// Units State
let gridUnit = 'mm'; // mm, cm, m
let chargeUnit = 'uC'; // nC, uC, mC, C

// UI Elements
const chargePanel = document.getElementById('charge-panel');
const chargeSlider = document.getElementById('charge-slider');
const chargeNumberInfo = document.getElementById('charge-number');
const closePanelBtn = document.getElementById('close-panel');
const vizModeToggle = document.getElementById('viz-mode-toggle');
const forceModeToggle = document.getElementById('force-mode-toggle');
const trashBin = document.getElementById('trash-bin');
const forceDisplayGroup = document.getElementById('force-display-group');
const forceXVal = document.getElementById('force-x');
const forceYVal = document.getElementById('force-y');
const gridUnitSelect = document.getElementById('grid-unit');
const chargeUnitSelect = document.getElementById('charge-unit');
const distancePanel = document.getElementById('distance-panel');
const distanceTableBody = document.querySelector('#distance-table tbody');

const playPauseBtn = document.getElementById('play-pause');
const playIcon = document.getElementById('play-icon');
const fixedDynamicToggle = document.getElementById('fixed-dynamic-toggle');
const stateLabel = document.getElementById('state-label');
const simSpeedSlider = document.getElementById('sim-speed');
const axesToggle = document.getElementById('axes-toggle');
const equipotentialToggle = document.getElementById('equipotential-toggle');
const posXInput = document.getElementById('pos-x');
const posYInput = document.getElementById('pos-y');
const velXInput = document.getElementById('vel-x');
const velYInput = document.getElementById('vel-y');
const energyVal = document.getElementById('energy-val');

// Initialization
function init() {
    resize();
    window.addEventListener('resize', resize);

    // Initial demo charges
    addCharge(width / 2 - 100, height / 2, 5);
    addCharge(width / 2 + 100, height / 2, -5);

    // Event Listeners
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);

    // UI Controls
    document.getElementById('add-charge').addEventListener('click', () => {
        addCharge(width / 2 + (Math.random() - 0.5) * 50, height / 2 + (Math.random() - 0.5) * 50, 5);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        charges = [];
        sparks = [];
        deselectCharge();
        draw();
    });

    // Toggles
    vizModeToggle.addEventListener('change', (e) => {
        useFixedLength = e.target.checked;
        draw();
    });

    forceModeToggle.addEventListener('change', (e) => {
        showForces = e.target.checked;
        updatePanelUI();
        draw();
    });

    axesToggle.addEventListener('change', (e) => {
        showAxes = e.target.checked;
        draw();
    });

    equipotentialToggle.addEventListener('change', (e) => {
        showEquipotentials = e.target.checked;
        draw();
    });

    playPauseBtn.addEventListener('click', () => {
        isRunning = !isRunning;
        if (isRunning) {
            playPauseBtn.classList.remove('btn-success');
            playPauseBtn.classList.add('btn-warning');
            playPauseBtn.innerHTML = '<span>⏸</span> Pause';
        } else {
            playPauseBtn.classList.remove('btn-warning');
            playPauseBtn.classList.add('btn-success');
            playPauseBtn.innerHTML = '<span>▶</span> Play';
        }
    });

    fixedDynamicToggle.addEventListener('change', (e) => {
        if (selectedCharge) {
            selectedCharge.isFixed = !e.target.checked; // If checked, it's dynamic, so isFixed = false
            stateLabel.textContent = e.target.checked ? 'Dynamic' : 'Static';
            updatePanelUI();
        }
    });

    simSpeedSlider.addEventListener('input', (e) => {
        simSpeed = parseFloat(e.target.value);
    });

    const updateChargePos = () => {
        if (selectedCharge) {
            const originX = width / 2;
            const originY = height / 2;
            selectedCharge.x = originX + (parseFloat(posXInput.value) || 0) * GRID_SPACING;
            selectedCharge.y = originY - (parseFloat(posYInput.value) || 0) * GRID_SPACING;
            selectedCharge.vx = 0;
            selectedCharge.vy = 0;
            updatePanelUI();
            draw();
        }
    };

    posXInput.addEventListener('input', updateChargePos);
    posYInput.addEventListener('input', updateChargePos);

    const updateChargeVel = () => {
        if (selectedCharge) {
            selectedCharge.vx = parseFloat(velXInput.value) || 0;
            selectedCharge.vy = - (parseFloat(velYInput.value) || 0); // Flip Y input to match screen coords (Up is negative Y)

            // Auto-switch to Dynamic if velocity is non-zero
            if ((selectedCharge.vx !== 0 || selectedCharge.vy !== 0) && selectedCharge.isFixed) {
                selectedCharge.isFixed = false;
                updatePanelUI();
            }
            // If users sets 0,0 do we auto switch to static? Maybe not, let them choose.
        }
    };

    velXInput.addEventListener('input', updateChargeVel);
    velYInput.addEventListener('input', updateChargeVel);

    // Unit Selectors
    gridUnitSelect.addEventListener('change', (e) => {
        gridUnit = e.target.value;
        updatePanelUI(); // Recalc forces
    });

    chargeUnitSelect.addEventListener('change', (e) => {
        chargeUnit = e.target.value;
        updatePanelUI(); // Recalc forces
    });

    // Charge Property Controls
    const updateChargeValue = (val) => {
        if (selectedCharge) {
            selectedCharge.q = parseFloat(val);
            updatePanelUI();
            draw();
        }
    };

    chargeSlider.addEventListener('input', (e) => updateChargeValue(e.target.value));
    chargeNumberInfo.addEventListener('input', (e) => updateChargeValue(e.target.value));

    closePanelBtn.addEventListener('click', deselectCharge);

    // Splash Screen Logic
    const splashOverlay = document.getElementById('splash-overlay');
    const splashOkBtn = document.getElementById('splash-ok-btn');
    const helpBtn = document.getElementById('help-btn');

    if (splashOverlay && splashOkBtn) {
        splashOkBtn.addEventListener('click', () => {
            splashOverlay.classList.add('hidden');
        });
    }

    if (helpBtn && splashOverlay) {
        helpBtn.addEventListener('click', () => {
            splashOverlay.classList.remove('hidden');
        });
    }

    // Start loop
    requestAnimationFrame(loop);
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}

// Logic
function addCharge(x, y, q) {
    if (charges.length >= 20) {
        alert("Maximum of 20 particles allowed.");
        return;
    }
    const id = Date.now() + Math.random();
    // Assign next available alphabet label
    // If charges have labels, find the max char code and increment. Or just re-label all? 
    // Best to just assign based on length if no deletions, but with deletions, we might want to fill gaps or append.
    // Let's simple append: A, B, C... 
    // Actually, to keep it clean let's re-calculate labels dynamically or just assign based on current count + index logic?
    // Let's just assign based on index in array effectively, but since we delete, let's allow "gaps" but try to pick first available?
    // Simplest reliable way for "reference" is A, B, C based on creation order or simple index.
    // Let's use simple index-based approach for stability during drag? No, better unique per charge.

    // Find first unused label
    const usedLabels = new Set(charges.map(c => c.label));
    let label = 'A';
    for (let i = 0; i < 26 * 2; i++) {
        let candidate = String.fromCharCode(65 + i); // A, B, C...
        if (!usedLabels.has(candidate)) {
            label = candidate;
            break;
        }
    }

    charges.push({
        id: id,
        label: label,
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        q: q,
        opacity: 0, // Start invisible for fade-in
        isFixed: true
    });

    const color = q > 0 ? '#f87171' : '#60a5fa';

    // Trigger Effects
    implode(x, y, color);
    spawnRipple(x, y, color);

    // Auto select new charge
    selectCharge(charges[charges.length - 1]);
}

function selectCharge(charge) {
    selectedCharge = charge;
    updatePanelUI();
    chargePanel.classList.add('active');
}

function deselectCharge() {
    selectedCharge = null;
    chargePanel.classList.remove('active');
    distancePanel.style.display = 'none'; // Hide distance table
}

function deleteSelectedCharge() {
    if (!selectedCharge) return;

    // Trigger Effects
    explode(selectedCharge.x, selectedCharge.y, selectedCharge.q > 0 ? '#f87171' : '#60a5fa');

    // Remove
    charges = charges.filter(c => c !== selectedCharge);
    deselectCharge();
    // Reset trash UI
    trashBin.classList.remove('drag-over');
}

function getDistanceScale() {
    // Returns Factor: 1 Grid Unit = X meters
    switch (gridUnit) {
        case 'mm': return 0.001;
        case 'cm': return 0.01;
        case 'm': return 1.0;
        default: return 1.0; // Assume m
    }
}

function getChargeScale() {
    // Returns Factor: 1 Slider Unit = X Coulombs
    switch (chargeUnit) {
        case 'nC': return 1e-9;
        case 'uC': return 1e-6;
        case 'mC': return 1e-3;
        case 'C': return 1.0;
        default: return 1e-6; // Assume uC
    }
}

function updatePanelUI() {
    if (!selectedCharge) return;
    chargeSlider.value = selectedCharge.q;
    chargeNumberInfo.value = selectedCharge.q;
    chargeNumberInfo.style.color = selectedCharge.q > 0 ? 'var(--positive)' : (selectedCharge.q < 0 ? 'var(--negative)' : 'var(--text-muted)');

    // Always show force data for selected charge
    forceDisplayGroup.style.display = 'block';
    const { fx, fy, mag } = calculatePhysicalForce(selectedCharge);

    const formatForce = (val) => {
        const abs = Math.abs(val);
        if (abs === 0) return "0.0 N";
        if (abs < 0.01 || abs > 1000) {
            return val.toExponential(2) + " N";
        }
        return val.toFixed(2) + " N";
    };

    forceXVal.textContent = formatForce(fx);
    forceYVal.textContent = formatForce(fy);

    // Update fixed/dynamic toggle
    fixedDynamicToggle.checked = !selectedCharge.isFixed;
    stateLabel.textContent = selectedCharge.isFixed ? 'Static' : 'Dynamic';

    // Update position inputs
    const originX = width / 2;
    const originY = height / 2;
    posXInput.value = ((selectedCharge.x - originX) / GRID_SPACING).toFixed(1);
    posYInput.value = (-(selectedCharge.y - originY) / GRID_SPACING).toFixed(1);

    // Update velocity inputs
    // Display as simple units? The physics uses raw pixel/step. 
    // Let's just expose the raw values for now, but maybe flipped Y for intuition (Up is +)
    velXInput.value = (selectedCharge.vx).toFixed(1);
    velYInput.value = (-selectedCharge.vy).toFixed(1);

    // Update Potential Energy
    let totalU = 0;
    const q1 = selectedCharge.q * getChargeScale();
    const dScale = getDistanceScale() / GRID_SPACING;

    charges.forEach(other => {
        if (other === selectedCharge) return;
        const dx = (other.x - selectedCharge.x) * dScale;
        const dy = (other.y - selectedCharge.y) * dScale;
        const r = Math.hypot(dx, dy);
        if (r > 1e-6) {
            const q2 = other.q * getChargeScale();
            totalU += (COULOMB_K * q1 * q2) / r;
        }
    });

    const formatEnergy = (val) => {
        const abs = Math.abs(val);
        if (abs === 0) return "0.00 J";
        if (abs < 0.01 || abs > 1e6) return val.toExponential(2) + " J";
        return val.toFixed(4) + " J";
    };
    energyVal.textContent = formatEnergy(totalU);

    updateDistanceTable();
}

function updateDistanceTable() {
    if (!selectedCharge) {
        distancePanel.style.display = 'none';
        return;
    }
    distancePanel.style.display = 'block';

    // Clear
    distanceTableBody.innerHTML = '';

    const distScale = getDistanceScale();

    charges.forEach(other => {
        if (other === selectedCharge) return;

        const dx_px = other.x - selectedCharge.x;
        const dy_px = other.y - selectedCharge.y;
        const r_px = Math.hypot(dx_px, dy_px);

        // Use Grid Units
        const dx_val = dx_px / GRID_SPACING; // Keep raw sign for direction? "Distance" implies mag, "displacement" implies sign. dx/dy should probably be signed coordinates.
        const dy_val = - (dy_px / GRID_SPACING); // Flip Y because screen Y is down
        const dist_val = r_px / GRID_SPACING;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

        tr.innerHTML = `
            <td style="padding: 4px; font-weight: bold; color: ${other.q > 0 ? '#f87171' : (other.q < 0 ? '#60a5fa' : '#94a3b8')}">${other.label}</td>
            <td style="padding: 4px;">${dx_val.toFixed(2)}${gridUnit}</td>
            <td style="padding: 4px;">${dy_val.toFixed(2)}${gridUnit}</td>
            <td style="padding: 4px;">${dist_val.toFixed(2)}${gridUnit}</td>
        `;
        distanceTableBody.appendChild(tr);
    });
}

// --------------------------------------------------------------------------
// PARTICLES (SPARKS & RIPPLES)
// --------------------------------------------------------------------------
function explode(x, y, color) {
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        sparks.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: color,
            decay: Math.random() * 0.02 + 0.01,
            type: 'explode'
        });
    }
}

function implode(x, y, color) {
    for (let i = 0; i < 50; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 60; // Start away
        const startX = x + Math.cos(angle) * dist;
        const startY = y + Math.sin(angle) * dist;

        sparks.push({
            x: startX,
            y: startY,
            life: 1.0,
            color: color,
            targetX: x,
            targetY: y,
            startX: startX,
            startY: startY,
            progress: 0,
            speed: 0.02 + Math.random() * 0.03, // Lerp speed
            type: 'implode'
        });
    }
}

function spawnRipple(x, y, color) {
    sparks.push({
        x: x,
        y: y,
        life: 1.0,
        radius: 10,
        color: color,
        type: 'ripple'
    });
}

function updateSparks() {
    for (let i = sparks.length - 1; i >= 0; i--) {
        let p = sparks[i];

        if (p.type === 'implode') {
            // Easing (Ease Out / Lerp)
            p.progress += p.speed;

            // Ease Out Cubic: 1 - pow(1 - x, 3)
            let t = 1 - Math.pow(1 - p.progress, 3);

            p.x = p.startX + (p.targetX - p.startX) * t;
            p.y = p.startY + (p.targetY - p.startY) * t;

            // Fade out slightly as they arrive (optional, maybe keep solid)
            // p.life = 1.0 - t; 

            if (p.progress >= 1) {
                sparks.splice(i, 1);
                continue;
            }
        } else if (p.type === 'ripple') {
            p.radius += 3; // Expansion speed
            p.life -= 0.03; // Fade out

            if (p.life <= 0) {
                sparks.splice(i, 1);
            }
        } else {
            // Explode
            p.x += p.vx;
            p.y += p.vy;
            p.vx += (Math.random() - 0.5) * 0.5;
            p.vy += (Math.random() - 0.5) * 0.5;
            p.life -= p.decay;

            if (p.life <= 0) {
                sparks.splice(i, 1);
            }
        }
    }
}

function updateChargeFades() {
    charges.forEach(c => {
        if (c.opacity < 1) {
            c.opacity = Math.min(1, c.opacity + 0.02); // Slower Fade in to match implosion
        }
    });
}

function drawSparks() {
    ctx.globalCompositeOperation = 'lighter'; // Additive blending for glow

    sparks.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        if (p.type === 'ripple') {
            ctx.globalAlpha = p.life * 0.5;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else { // Particles
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
}

// --------------------------------------------------------------------------
// PHYSICS & RENDERING
// --------------------------------------------------------------------------

function calculatePhysicalForce(target) {
    let Fx = 0;
    let Fy = 0;

    const distScale = getDistanceScale(); // meters per 40px
    const qScale = getChargeScale(); // Coulombs per unit

    charges.forEach(source => {
        if (source === target) return;

        let dx_px = target.x - source.x;
        let dy_px = target.y - source.y;
        let dist_px = Math.sqrt(dx_px * dx_px + dy_px * dy_px);

        if (dist_px < 1) return; // Singularity protection

        // Convert to physical units
        // Distance in meters: (pixel distance / grid spacing) * unit scale
        let r_m = (dist_px / GRID_SPACING) * distScale;

        // Charges in Coulombs
        let q1_C = target.q * qScale;
        let q2_C = source.q * qScale;

        // F = k * q1 * q2 / r^2
        let F_mag = (COULOMB_K * Math.abs(q1_C * q2_C)) / (r_m * r_m);

        // Direction
        let isRepulsive = (target.q * source.q) > 0;
        let dirSign = isRepulsive ? 1 : -1;

        Fx += dirSign * F_mag * (dx_px / dist_px);
        Fy += dirSign * F_mag * (dy_px / dist_px);
    });

    return { fx: Fx, fy: Fy, mag: Math.sqrt(Fx * Fx + Fy * Fy) };
}

function calculateVisualForce(target) {
    // Keeps the visual arrows consistent regardless of units selected
    // Uses the abstract K = 5000 and raw values
    let Fx = 0;
    let Fy = 0;

    charges.forEach(source => {
        if (source === target) return;

        let dx = target.x - source.x;
        let dy = target.y - source.y;
        let r2 = dx * dx + dy * dy;
        let r = Math.sqrt(r2);

        if (r < 1) return;

        let F_mag = (VISUAL_K * target.q * source.q) / r2;
        Fx += F_mag * (dx / r);
        Fy += F_mag * (dy / r);
    });

    return { fx: Fx, fy: Fy, mag: Math.sqrt(Fx * Fx + Fy * Fy) };
}

function loop(timestamp) {
    requestAnimationFrame(loop);

    const elapsed = timestamp - lastTime;
    if (elapsed < FPS_INTERVAL) return;

    lastTime = timestamp - (elapsed % FPS_INTERVAL);

    updateSparks();
    updateChargeFades();

    if (isRunning) {
        updatePhysics();
    }

    draw();
    // Update UI numbers continuously if dragging, running, or just selected
    if (selectedCharge && (isDraggingCharge || isRunning)) updatePanelUI();
    // Update Distance Table if selected
    if (selectedCharge) updateDistanceTable();
}

function updatePhysics() {
    const dt = simSpeed; // Simulation step
    const DAMPING = 0.98; // Basic damping to prevent infinite energy gain from numerical errors
    const MASS = 1.0;

    handleCollisions();

    charges.forEach(c => {
        if (c.isFixed || c === selectedCharge) {
            c.vx = 0;
            c.vy = 0;
            return;
        }

        const { fx, fy } = calculatePhysicalForce(c);

        // Simple Euler Integration
        // a = F / m
        const ax = fx / MASS;
        const ay = fy / MASS;

        // Since F refers to real units, we need to map ax/ay back to pixel-space/step-space
        // But for a dynamic simulation that "feels" good, we might want to scale these forces for the visual context
        // Let's use a visual physics constant for the movement if the real one is too stiff/fast
        const visualForceScale = 0.0001;

        c.vx = (c.vx + ax * visualForceScale * dt) * DAMPING;
        c.vy = (c.vy + ay * visualForceScale * dt) * DAMPING;

        c.x += c.vx * dt;
        c.y += c.vy * dt;

        // Wall Collisions
        if (c.x < CHARGE_RADIUS) {
            c.x = CHARGE_RADIUS;
            c.vx *= -0.5;
        } else if (c.x > width - CHARGE_RADIUS) {
            c.x = width - CHARGE_RADIUS;
            c.vx *= -0.5;
        }
        if (c.y < CHARGE_RADIUS) {
            c.y = CHARGE_RADIUS;
            c.vy *= -0.5;
        } else if (c.y > height - CHARGE_RADIUS) {
            c.y = height - CHARGE_RADIUS;
            c.vy *= -0.5;
        }
    });
}

function handleCollisions() {
    const threshold = CHARGE_RADIUS * 2;

    for (let i = 0; i < charges.length; i++) {
        for (let j = i + 1; j < charges.length; j++) {
            const c1 = charges[i];
            const c2 = charges[j];

            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const dist = Math.hypot(dx, dy);

            if (dist < threshold) {
                // If they are unlike charges or one is neutral, they stick (merge)
                if (c1.q * c2.q < 0 || (c1.q === 0 && c2.q !== 0) || (c2.q === 0 && c1.q !== 0)) {
                    // Check if either is being dragged
                    if (c1 === selectedCharge && isDraggingCharge) continue;
                    if (c2 === selectedCharge && isDraggingCharge) continue;

                    mergeCharges(i, j);
                    return handleCollisions(); // Recurse since array changed
                }
            }
        }
    }
}

function mergeCharges(idx1, idx2) {
    const c1 = charges[idx1];
    const c2 = charges[idx2];

    const newQ = c1.q + c2.q;
    const newX = (c1.x + c2.x) / 2;
    const newY = (c1.y + c2.y) / 2;
    const newVx = (c1.vx + c2.vx) / 2;
    const newVy = (c1.vy + c2.vy) / 2;
    const newIsFixed = c1.isFixed && c2.isFixed;

    // Create effects
    implode(newX, newY, newQ > 0 ? '#f87171' : (newQ < 0 ? '#60a5fa' : '#94a3b8'));
    spawnRipple(newX, newY, '#fff');

    // Remove old charges
    const high = Math.max(idx1, idx2);
    const low = Math.min(idx1, idx2);

    if (selectedCharge === c1 || selectedCharge === c2) {
        deselectCharge();
    }

    charges.splice(high, 1);
    charges.splice(low, 1);

    // Add new charge
    const id = Date.now() + Math.random();
    const usedLabels = new Set(charges.map(c => c.label));
    let label = 'A';
    for (let k = 0; k < 26 * 2; k++) {
        let candidate = String.fromCharCode(65 + k);
        if (!usedLabels.has(candidate)) {
            label = candidate;
            break;
        }
    }

    charges.push({
        id: id,
        label: label,
        x: newX,
        y: newY,
        vx: newVx,
        vy: newVy,
        q: newQ,
        opacity: 1,
        isFixed: newIsFixed
    });
}

function draw() {
    // Clear
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color');
    ctx.fillRect(0, 0, width, height);

    // Draw Axes if enabled
    if (showAxes) {
        drawAxes();
    }

    // Draw Equipotentials if enabled
    if (showEquipotentials) {
        drawEquipotentials();
    }

    // Draw Vector Field
    drawVectorField();

    // Draw Network Forces if enabled
    if (showForces) {
        drawNetForces();
    }

    // Draw Charges
    charges.forEach(c => drawCharge(c));

    // Draw Sparks & Ripples
    drawSparks();
}

function drawVectorField() {
    ctx.lineWidth = 1.5;

    for (let x = GRID_SPACING / 2; x < width; x += GRID_SPACING) {
        for (let y = GRID_SPACING / 2; y < height; y += GRID_SPACING) {

            let Ex = 0;
            let Ey = 0;

            for (let c of charges) {
                let dx = x - c.x;
                let dy = y - c.y;
                let r2 = dx * dx + dy * dy;
                let r = Math.sqrt(r2);

                if (r < 10) continue;

                // Visual Field Calculation (Unit Independent)
                // Use opacity to fade in field influence if charge is spawning
                let alpha = c.opacity !== undefined ? c.opacity : 1;
                let E = ((VISUAL_K * c.q) / r2) * alpha;

                Ex += E * (dx / r);
                Ey += E * (dy / r);
            }

            let magnitude = Math.sqrt(Ex * Ex + Ey * Ey);

            if (magnitude > 0.5) {
                let angle = Math.atan2(Ey, Ex);
                let visualLen, color;

                if (useFixedLength) {
                    visualLen = 20;
                    let intensity = Math.min(magnitude / 5, 1);
                    let hue = Math.max(0, 240 - (intensity * 240));
                    color = `hsla(${hue}, 80%, 60%, 0.8)`;
                } else {
                    visualLen = Math.min(magnitude * 5, MAX_ARROW_LENGTH);
                    let opacity = Math.min(magnitude / 2, 1);
                    color = `rgba(56, 189, 248, ${opacity})`;
                }

                ctx.strokeStyle = color;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                drawArrow(ctx, visualLen);

                ctx.restore();
            }
        }
    }
}

function calculatePotential(x, y) {
    let V = 0;
    for (const c of charges) {
        const dx = x - c.x;
        const dy = y - c.y;
        const r = Math.hypot(dx, dy);
        if (r < 5) continue;
        const alpha = c.opacity !== undefined ? c.opacity : 1;
        V += (VISUAL_K * c.q / r) * alpha;
    }
    return V;
}

function drawEquipotentials() {
    if (charges.length === 0) return;

    // Use a grid-based approach to draw contour lines (Marching Squares-ish)
    const step = 20;
    const levels = [40, 80, 160, 320, 640, 1280, 2560];
    const allLevels = [...levels.map(l => -l), ...levels];

    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += step) {
        for (let y = 0; y < height; y += step) {
            const v00 = calculatePotential(x, y);
            const v10 = calculatePotential(x + step, y);
            const v01 = calculatePotential(x, y + step);
            const v11 = calculatePotential(x + step, y + step);

            allLevels.forEach(level => {
                const b00 = v00 > level;
                const b10 = v10 > level;
                const b01 = v01 > level;
                const b11 = v11 > level;

                let points = [];

                if (b00 !== b10) points.push({ x: x + step * (level - v00) / (v10 - v00), y: y });
                if (b10 !== b11) points.push({ x: x + step, y: y + step * (level - v10) / (v11 - v10) });
                if (b11 !== b01) points.push({ x: x + step * (level - v01) / (v11 - v01), y: y + step });
                if (b01 !== b00) points.push({ x: x, y: y + step * (level - v00) / (v01 - v00) });

                if (points.length >= 2) {
                    // Match charge colors but with lower opacity
                    ctx.strokeStyle = level > 0 ? 'rgba(248, 113, 113, 0.4)' : 'rgba(96, 165, 250, 0.4)';
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i++) {
                        ctx.lineTo(points[i].x, points[i].y);
                    }
                    ctx.stroke();
                }
            });
        }
    }
}

function drawNetForces() {
    charges.forEach(target => {
        // Use Visual Calculation for arrow length to keep it sane
        const { fx, fy, mag } = calculateVisualForce(target);

        // Apply fade
        let alpha = target.opacity !== undefined ? target.opacity : 1;

        if (mag > 0.1) {
            let angle = Math.atan2(fy, fx);
            ctx.lineWidth = 3;

            // Main Force Vector (Yellow)
            let visualLen = Math.min(mag * 3, 100);

            ctx.save();
            ctx.translate(target.x, target.y);
            ctx.globalAlpha = alpha;

            // 1. Draw Component Vectors for Selected Charge ONLY
            if (target === selectedCharge) {
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]); // Dashed
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * alpha})`; // Transparent White

                // X Component
                let visFx = Math.sign(fx) * Math.min(Math.abs(fx) * 3, 100);
                if (Math.abs(visFx) > 2) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(visFx, 0);
                    ctx.stroke();
                }

                // Y Component
                let visFy = Math.sign(fy) * Math.min(Math.abs(fy) * 3, 100);
                if (Math.abs(visFy) > 2) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, visFy);
                    ctx.stroke();
                }

                // Reset context for main vector
                ctx.setLineDash([]);
                ctx.lineWidth = 3;
            }

            // 2. Draw Main Net Force Vector
            ctx.rotate(angle);
            ctx.strokeStyle = '#facc15'; // Yellow
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(visualLen, 0);
            ctx.lineTo(visualLen - 8, -6);
            ctx.moveTo(visualLen, 0);
            ctx.lineTo(visualLen - 8, 6);
            ctx.stroke();

            ctx.restore();
        }
    });
}

function drawAxes() {
    const originX = width / 2;
    const originY = height / 2;
    const color = 'rgba(255, 255, 255, 0.15)';
    const textColor = 'rgba(255, 255, 255, 0.4)';

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    // Grid lines (vertical)
    for (let x = originX % GRID_SPACING; x < width; x += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    // Grid lines (horizontal)
    for (let y = originY % GRID_SPACING; y < height; y += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Main Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;

    // X-Axis
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();

    // Y-Axis
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Origin Mark
    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText('(0,0)', originX + 5, originY - 5);
}

function drawArrow(ctx, len) {
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.lineTo(len / 2 - 4, -3);
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(len / 2 - 4, 3);
    ctx.stroke();
}

function drawCharge(c) {
    const isSelected = selectedCharge === c;
    const isPositive = c.q > 0;
    const isNeutral = c.q === 0;

    let color = isNeutral ? '#94a3b8' : (isPositive ? '#f87171' : '#60a5fa');
    let glowColor = isNeutral ? 'rgba(148, 163, 184, 0.5)' : (isPositive ? 'rgba(248, 113, 113, 0.6)' : 'rgba(96, 165, 250, 0.6)');

    ctx.save();
    ctx.translate(c.x, c.y);

    // Apply Fade In Opacity
    ctx.globalAlpha = c.opacity !== undefined ? c.opacity : 1;

    // Glow
    let gradient = ctx.createRadialGradient(0, 0, CHARGE_RADIUS, 0, 0, CHARGE_RADIUS * 3);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, CHARGE_RADIUS * 3, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, CHARGE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Selection ring
    if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, CHARGE_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Sign
    ctx.fillStyle = isNeutral ? '#0f172a' : '#fff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isNeutral ? '0' : (isPositive ? '+' : '−'), 0, 1);

    // Draw Label (A, B, C...)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    // Draw outside, top right
    ctx.globalAlpha = 1.0; // Ensure label is visible
    ctx.fillText(c.label || '', 18, -18);

    // Lock Icon for Static
    if (c.isFixed) {
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('🔒', 32, -18);
    }

    // Velocity Vector
    const vMag = Math.hypot(c.vx, c.vy);
    if (vMag > 0.1) {
        const vAngle = Math.atan2(c.vy, c.vx);
        const vLen = Math.min(vMag * 10, 60); // Scale factor 10, max 60px

        ctx.save();
        ctx.rotate(vAngle);
        ctx.strokeStyle = '#10b981'; // Emerald-500
        ctx.lineWidth = 4; // Thicker

        // Start from edge (radius is 15)
        // drawArrow draws centered (-len/2 to +len/2). To start tail at "Radius + 2", we must translate center to "Radius + 2 + len/2"
        ctx.translate(CHARGE_RADIUS + 2 + vLen / 2, 0);

        drawArrow(ctx, vLen);
        ctx.restore();
    }

    ctx.restore();
}



// --------------------------------------------------------------------------
// INTERACTION HANDLERS
// --------------------------------------------------------------------------

function onMouseDown(e) {
    const { x, y } = getPos(e);

    // Check if clicked a charge
    for (let i = charges.length - 1; i >= 0; i--) {
        let c = charges[i];
        let dist = Math.hypot(x - c.x, y - c.y);

        if (dist < CHARGE_RADIUS + 5) {
            selectCharge(c);
            isDraggingCharge = true;
            dragOffset.x = x - c.x;
            dragOffset.y = y - c.y;
            return;
        }
    }

    // If clicked empty space
    if (selectedCharge) {
        deselectCharge();
    }
}

function onMouseMove(e) {
    if (isDraggingCharge && selectedCharge) {
        const { x, y } = getPos(e);
        selectedCharge.x = x - dragOffset.x;
        selectedCharge.y = y - dragOffset.y;

        // Trash Check
        checkTrashBinHover(selectedCharge);

        selectedCharge.x = Math.max(CHARGE_RADIUS, Math.min(width - CHARGE_RADIUS, selectedCharge.x));
        selectedCharge.y = Math.max(CHARGE_RADIUS, Math.min(height - CHARGE_RADIUS, selectedCharge.y));

        // Don't call draw() here since loop() handles it
    }
}

function onMouseUp(e) {
    if (isDraggingCharge && selectedCharge) {
        if (checkTrashBinHover(selectedCharge)) {
            // Check if actually dropping ON the bin
            if (trashBin.classList.contains('drag-over')) {
                deleteSelectedCharge();
            }
        }
        trashBin.classList.remove('drag-over');
    }
    isDraggingCharge = false;
}

function checkTrashBinHover(charge) {
    // Get bin center
    const r = trashBin.getBoundingClientRect();
    const binCenterX = r.left + r.width / 2;
    const binCenterY = r.top + r.height / 2;

    // Check distance between charge center and bin center
    const dist = Math.hypot(charge.x - binCenterX, charge.y - binCenterY);

    // Threshold: bin radius + charge radius + buffer
    const threshold = (r.width / 2) + CHARGE_RADIUS + 10;

    if (dist < threshold) {
        trashBin.classList.add('drag-over');
        return true;
    } else {
        trashBin.classList.remove('drag-over');
        return false;
    }
}

function onTouchStart(e) {
    if (e.touches.length === 1) {
        onMouseDown(e.touches[0]);
    }
}

function onTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        onMouseMove(e.touches[0]);
    }
}

function getPos(e) {
    return {
        x: e.clientX,
        y: e.clientY
    };
}

// Boot
init();
