const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

// State
let charges = []; // {x, y, q, id, opacity}
let sparks = []; // {x, y, vx, vy, life, color, type, targetX, targetY, startX, startY}
let selectedCharge = null;
let isDraggingCharge = false;
let dragOffset = { x: 0, y: 0 };
let width, height;

// Visualization Config
let useFixedLength = false;
let showForces = false;

// Physics Config
const GRID_SPACING = 40;
const VISUAL_K = 5000; // For field arrow rendering only
const COULOMB_K = 8.99e9; // Real physics constant
const CHARGE_RADIUS = 15;
const MAX_ARROW_LENGTH = 30;

// Units State
let gridUnit = 'm'; // mm, cm, m
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
    const id = Date.now() + Math.random();
    charges.push({
        id: id,
        x: x,
        y: y,
        q: q,
        opacity: 0 // Start invisible for fade-in
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

function loop() {
    updateSparks();
    updateChargeFades();
    draw();
    // Update UI numbers continuously if dragging
    if (isDraggingCharge && showForces) updatePanelUI();
    requestAnimationFrame(loop);
}

function draw() {
    // Clear
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color');
    ctx.fillRect(0, 0, width, height);

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
