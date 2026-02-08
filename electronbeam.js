/**
 * Electron Beam Simulator
 * Premium Liquid Glass Edition
 */

// --- Configuration & DOM ---
const CONFIG = {
    canvas: document.getElementById('simulationCanvas'),
    ctx: document.getElementById('simulationCanvas').getContext('2d'),
    phys: {
        timeStep: 0.2,
        baseSpeed: 3,
        fps: 30,
        magneticStrengthScale: 0.0005,
        electricStrengthScale: 200
    },
    dom: {
        emissionInput: document.getElementById('emissionRate'),
        emissionDisp: document.getElementById('emission-val'),
        energyInput: document.getElementById('beamEnergy'),
        energyDisp: document.getElementById('energy-val'),
        voltageInput: document.getElementById('plateVoltage'),
        voltageDisp: document.getElementById('voltage-val'),
        spreadInput: document.getElementById('beamSpread'),
        spreadDisp: document.getElementById('spread-val'),

        magnetPanel: document.getElementById('magnet-customizer'),
        magnetStrengthInput: document.getElementById('bFieldStrength'),
        magnetStrengthDisp: document.getElementById('b-field-val'),

        electricPanel: document.getElementById('electric-customizer'),
        electricVoltageInput: document.getElementById('eFieldVoltage'),
        electricVoltageDisp: document.getElementById('e-voltage-val'),
        electricGapInput: document.getElementById('eFieldGap'),
        electricGapDisp: document.getElementById('e-gap-val'),

        btnElectron: document.getElementById('btn-type-electron'),
        btnPositron: document.getElementById('btn-type-positron'),
        btnClear: document.getElementById('clear-particles-btn'),
        btnAddMagnet: document.getElementById('add-magnet-btn'),
        btnAddElectric: document.getElementById('add-electric-btn'),
        btnDeleteMagnet: document.getElementById('delete-magnet-btn'),
        btnResetMagnet: document.getElementById('reset-magnet-size-btn'),
        btnDeleteElectric: document.getElementById('delete-electric-btn'),

        splashOverlay: document.getElementById('splash-overlay'),
        btnGetStarted: document.getElementById('get-started-btn'),
        btnHelp: document.getElementById('help-btn')
    }
};

const ctx = CONFIG.ctx;
const canvas = CONFIG.canvas;

const state = {
    electrons: [],
    magnets: [],
    electricRegions: [],

    // Parameters
    beamEnergy: 100,
    plateVoltage: 2.0,
    emissionRate: 25,
    energySpread: 0.1,
    particleType: 'electron',

    // Selection & UI
    selectedMagnet: null,
    selectedElectric: null,
    isDragging: false,
    isResizing: false,
    dragOffsetX: 0,
    dragOffsetY: 0,

    // Layout
    plateX: 500,
    plateGapY: 0,
    plateGapSize: 80,

    // Timing
    lastFrameTime: 0,
    fpsInterval: 1000 / CONFIG.phys.fps,
    then: performance.now()
};

// --- Classes ---

class Electron {
    constructor(y, initialEnergy) {
        this.x = 0;
        this.y = y;
        this.dead = false;

        // Initial Velocity based on Beam Energy
        // v = const * sqrt(Energy)
        // Energy Spread now affects the Energy magnitude itself
        // New Energy = BaseEnergy * (1 + (random - 0.5) * spread)
        const spreadFactor = state.energySpread;
        const actualEnergy = initialEnergy * (1 + (Math.random() - 0.5) * spreadFactor);
        const vMag = CONFIG.phys.baseSpeed * Math.sqrt(Math.max(0, actualEnergy) / 100);

        // Slight natural angular spread (fixed small amount)
        const angle = (Math.random() - 0.5) * 0.05; // reduced natural spread

        this.vx = vMag * Math.cos(angle);
        this.vy = vMag * Math.sin(angle);

        this.passedPlate = false;

        // Aesthetic
        this.charge = state.particleType === 'positron' ? 1 : -1;
        if (this.charge === -1) {
            this.color = `hsl(${180 + Math.random() * 20}, 100%, 75%)`; // Blue/Cyan
        } else {
            this.color = `hsl(${0 + Math.random() * 20}, 100%, 65%)`;   // Red
        }
        this.trail = [];
    }

    update() {
        if (this.dead) return;

        // 1. Electric Field Acceleration (Initial Plate)
        if (this.x < state.plateX) {
            const chargeFactor = -this.charge;
            const accel = state.plateVoltage * 0.1 * chargeFactor;
            this.vx += accel * CONFIG.phys.timeStep;
        }

        // Check for Plate Collision
        if (!this.passedPlate && this.x >= state.plateX) {
            const distFromCenter = Math.abs(this.y - state.plateGapY);
            if (distFromCenter > state.plateGapSize / 2) {
                this.dead = true;
                this.x = state.plateX;
                return;
            } else {
                this.passedPlate = true;
            }
        }

        // 2. Magnetic Field Interaction (Lorentz B)
        let B_total = 0;
        for (const m of state.magnets) {
            if (m.contains(this.x, this.y)) {
                B_total += m.strength;
            }
        }

        if (Math.abs(B_total) > 0.001) {
            const chargeFactor = -this.charge;
            const ax = B_total * this.vy * CONFIG.phys.magneticStrengthScale * chargeFactor;
            const ay = -B_total * this.vx * CONFIG.phys.magneticStrengthScale * chargeFactor;

            this.vx += ax * CONFIG.phys.timeStep;
            this.vy += ay * CONFIG.phys.timeStep;
        }

        // 3. Electric Field Sections (Lorentz E)
        for (const er of state.electricRegions) {
            if (er.contains(this.x, this.y)) {
                const E_field = er.voltage / er.gap;
                const chargeFactor = -this.charge;
                const ay = -E_field * CONFIG.phys.electricStrengthScale * chargeFactor;
                this.vy += ay * CONFIG.phys.timeStep;
            }
        }

        // 4. Movement (No Damping)
        this.x += this.vx * CONFIG.phys.timeStep;
        this.y += this.vy * CONFIG.phys.timeStep;

        // 5. Bounds Check
        if (this.x > canvas.width || this.x < 0 || this.y < 0 || this.y > canvas.height) {
            this.dead = true;
        }

        // 6. Trail Smoothing
        // Limit trail length
        if (Math.random() < 0.5) {
            this.trail.push(this.x, this.y); // Push separate coordinates (flat array)
            if (this.trail.length > 80) { // 40 points * 2 coords
                this.trail.shift();
                this.trail.shift();
            }
        }
    }

    draw(ctx) {
        // Trail
        if (this.trail.length > 2) {
            ctx.beginPath();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4;
            ctx.moveTo(this.trail[0], this.trail[1]);
            for (let i = 2; i < this.trail.length; i += 2) {
                ctx.lineTo(this.trail[i], this.trail[i + 1]);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        // Particle - Optimized: No shadowBlur
        if (!this.dead) {
            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            // ctx.shadowColor = this.color; // Expensive
            // ctx.shadowBlur = 10;          // Expensive
            ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // ctx.shadowBlur = 0;
        }
    }
}

class MagneticRegion {
    constructor(x, y, strength = 0) {
        this.x = x;
        this.y = y;
        this.w = 150;
        this.h = 150;
        this.strength = strength;
    }

    contains(px, py) {
        return px >= this.x && px <= this.x + this.w &&
            py >= this.y && py <= this.y + this.h;
    }

    draw(ctx, isSelected) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.save();

        // Define color based on B-Field polarity
        // Positive (Out) = Blue, Negative (In) = Red
        let baseColor = '255, 255, 255'; // white default
        if (this.strength > 0) baseColor = '56, 189, 248'; // Primary (Blueish)
        if (this.strength < 0) baseColor = '255, 77, 77';  // Positive/Red (using Positive color for negative B-field to contrast)

        const alpha = Math.min(Math.abs(this.strength) / 500 * 0.5 + 0.1, 0.6);

        ctx.fillStyle = `rgba(${baseColor}, ${alpha})`;
        ctx.strokeStyle = `rgba(${baseColor}, 0.8)`;
        ctx.lineWidth = isSelected ? 3 : 1;

        // Glass rect
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeRect(this.x, this.y, this.w, this.h);

        // Field Indicators (Arrows)
        ctx.fillStyle = `rgba(${baseColor}, 0.8)`;
        ctx.strokeStyle = `rgba(${baseColor}, 0.8)`;
        ctx.lineWidth = 2;

        // Draw grid of arrows or circles
        const step = 40;
        for (let ix = this.x + 20; ix < this.x + this.w; ix += step) {
            for (let iy = this.y + 20; iy < this.y + this.h; iy += step) {
                if (Math.abs(this.strength) < 50) {
                    // Just a small dot if weak
                    ctx.beginPath();
                    ctx.arc(ix, iy, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (this.strength > 0) {
                    // OUT (Circle with dot)
                    ctx.beginPath();
                    ctx.arc(ix, iy, 6, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(ix, iy, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // IN (X)
                    const s = 4;
                    ctx.beginPath();
                    ctx.moveTo(ix - s, iy - s);
                    ctx.lineTo(ix + s, iy + s);
                    ctx.moveTo(ix + s, iy - s);
                    ctx.lineTo(ix - s, iy + s);
                    ctx.stroke();
                }
            }
        }

        // Selection Halo
        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
        }

        // Resize Handle (Bottom Right)
        if (isSelected) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x + this.w, this.y + this.h, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class ElectricRegion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 50; // Fixed width for plates? Or adjustable? Let's say fixed width, adjustable gap.
        this.h = 0;  // Height is determined by gap, but let's store gap size separately.

        this.voltage = 0; // kV
        this.gap = 100;   // pixels
    }

    contains(px, py) {
        // Active region is between the plates
        // Top plate at y - gap/2, Bottom at y + gap/2
        // Effective area: x to x+w, y-gap/2 to y+gap/2
        const topY = this.y - this.gap / 2;
        const botY = this.y + this.gap / 2;
        return px >= this.x && px <= this.x + this.w &&
            py >= topY && py <= botY;
    }

    draw(ctx, isSelected) {
        ctx.save();
        const topY = this.y - this.gap / 2;
        const botY = this.y + this.gap / 2;

        let color = '#fff';
        if (this.voltage > 0) color = '#ff4d4d'; // --positive
        if (this.voltage < 0) color = '#38bdf8'; // --primary

        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 15 : 5;

        // Top Plate
        ctx.beginPath();
        ctx.moveTo(this.x, topY);
        ctx.lineTo(this.x + this.w, topY);
        ctx.stroke();

        // Bottom Plate
        ctx.beginPath();
        ctx.moveTo(this.x, botY);
        ctx.lineTo(this.x + this.w, botY);
        ctx.stroke();

        // Field Lines (Visual only)
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([5, 5]);
        for (let i = 10; i < this.w; i += 10) {
            ctx.beginPath();
            ctx.moveTo(this.x + i, topY);
            ctx.lineTo(this.x + i, botY);
            ctx.stroke();
        }

        // Signs (+/-)
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.font = 'bold 16px var(--font-family)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;

        let topSign = '';
        let botSign = '';
        if (this.voltage > 0) { topSign = '+'; botSign = '-'; }
        if (this.voltage < 0) { topSign = '-'; botSign = '+'; }

        if (topSign) {
            ctx.fillText(topSign, this.x + this.w / 2, topY - 15);
            ctx.fillText(botSign, this.x + this.w / 2, botY + 15);
        }

        // Selection Halo
        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.x - 5, topY - 5, this.w + 10, (botY - topY) + 10);
        }

        ctx.restore();
    }
}

function loopOrdered(timestamp) {
    requestAnimationFrame(loopOrdered);

    const now = performance.now();
    const elapsed = now - state.then;

    if (elapsed > state.fpsInterval) {
        state.then = now - (elapsed % state.fpsInterval);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Fields
        for (const m of state.magnets) m.draw(ctx, state.selectedMagnet === m);
        for (const er of state.electricRegions) er.draw(ctx, state.selectedElectric === er);

        // 2. Scene
        drawPlate();
        drawSourceLabel();

        // 3. Electrons
        if (state.electrons.length < 10000) {
            const spawnCount = Math.ceil(state.emissionRate / 10);
            if (Math.random() < 0.8) {
                for (let k = 0; k < spawnCount; k++) {
                    if (state.electrons.length < 10000) {
                        state.electrons.push(new Electron(state.plateGapY + (Math.random() - 0.5) * 10, state.beamEnergy));
                    }
                }
            }
        }

        for (let i = state.electrons.length - 1; i >= 0; i--) {
            const e = state.electrons[i];
            e.update();
            e.draw(ctx);
            if (e.dead) state.electrons.splice(i, 1);
        }
    }
}

function drawSourceLabel() {
    ctx.save();
    const factor = (state.beamEnergy / 500) * (state.emissionRate / 100);
    const alpha = 0.4 + factor * 0.6;
    const blur = 5 + factor * 15;
    const glowColor = state.particleType === 'positron' ? '255, 50, 50' : '0, 243, 255';

    ctx.shadowColor = `rgba(${glowColor}, ${alpha})`;
    ctx.shadowBlur = blur;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.2})`;

    ctx.font = '600 16px var(--font-family)';
    ctx.textAlign = 'left';
    const sourceLabel = state.particleType === 'positron' ? "Positron Source" : "Electron Source";
    ctx.fillText(sourceLabel, 10, state.plateGapY - 40);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, state.plateGapY - 4, 30, 8);
    ctx.restore();
}

// Draw Plate Helper
function drawPlate() {
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;

    // Top
    ctx.beginPath();
    ctx.moveTo(state.plateX, 0);
    ctx.lineTo(state.plateX, state.plateGapY - state.plateGapSize / 2);
    ctx.stroke();

    // Bottom
    ctx.beginPath();
    ctx.moveTo(state.plateX, state.plateGapY + state.plateGapSize / 2);
    ctx.lineTo(state.plateX, canvas.height);
    ctx.stroke();

    ctx.restore();
}

// --- Interaction & Events ---

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.plateGapY = canvas.height / 2;
}
window.addEventListener('resize', resize);
resize();

// UI Controls
const btnClearParticles = document.getElementById('clear-particles-btn');
if (btnClearParticles) {
    btnClearParticles.onclick = () => {
        state.electrons = [];
    };
}

// Particle Type Toggle
const btnElectron = document.getElementById('btn-type-electron');
const btnPositron = document.getElementById('btn-type-positron');

function updateTypeButtons() {
    if (state.particleType === 'electron') {
        btnElectron.classList.add('active');
        btnElectron.style.opacity = '1.0';
        btnPositron.classList.remove('active');
        btnPositron.style.opacity = '0.5';
    } else {
        btnPositron.classList.add('active');
        btnPositron.style.opacity = '1.0';
        btnElectron.classList.remove('active');
        btnElectron.style.opacity = '0.5';
    }
}

if (btnElectron && btnPositron) {
    btnElectron.onclick = () => {
        state.particleType = 'electron';
        state.electrons = []; // Clear older particles
        updateTypeButtons();
    };
    btnPositron.onclick = () => {
        state.particleType = 'positron';
        state.electrons = []; // Clear older particles
        updateTypeButtons();
    };
}

const inputEmission = document.getElementById('emissionRate');
const dispEmission = document.getElementById('emission-val');
inputEmission.oninput = (e) => {
    state.emissionRate = parseInt(e.target.value);
    dispEmission.textContent = state.emissionRate;
};

const inputEnergy = document.getElementById('beamEnergy');
const dispEnergy = document.getElementById('energy-val');
inputEnergy.oninput = (e) => {
    state.beamEnergy = parseInt(e.target.value);
    dispEnergy.textContent = state.beamEnergy;
};

const inputVoltage = document.getElementById('plateVoltage');
const dispVoltage = document.getElementById('voltage-val');
inputVoltage.oninput = (e) => {
    state.plateVoltage = parseFloat(e.target.value);
    dispVoltage.textContent = state.plateVoltage.toFixed(1);
};

const btnAddMagnet = document.getElementById('add-magnet-btn');
btnAddMagnet.onclick = () => {
    // Smart Spawn: find localized spot
    const size = 150;
    const pos = findSafeSpawnLocation(size, size);

    const m = new MagneticRegion(pos.x, pos.y);
    state.magnets.push(m);
    selectMagnet(m);
};

function findSafeSpawnLocation(w, h) {
    // Try a few spots
    const candidates = [
        { x: state.plateX + 100, y: state.plateGapY - h / 2 },
        { x: state.plateX + 300, y: state.plateGapY - h / 2 },
        { x: state.plateX + 100, y: state.plateGapY - h / 2 - 160 },
        { x: state.plateX + 100, y: state.plateGapY - h / 2 + 160 },
    ];

    for (let pos of candidates) {
        if (!checkOverlap(pos.x, pos.y, w, h)) return pos;
    }
    // Fallback: random offset from first candidate
    return {
        x: state.plateX + 100 + Math.random() * 50,
        y: state.plateGapY - h / 2 + Math.random() * 50
    };
}

function checkOverlap(x, y, w, h) {
    const margin = 20;
    for (const m of state.magnets) {
        if (x < m.x + m.w + margin && x + w + margin > m.x &&
            y < m.y + m.h + margin && y + h + margin > m.y) return true;
    }
    for (const er of state.electricRegions) {
        // Electric regions have adaptable height, but let's approximate
        const eh = er.gap + 20;
        if (x < er.x + er.w + margin && x + w + margin > er.x &&
            y < er.y + eh + margin && y + h + margin > er.y) return true;
    }
    return false;
}

// Magnet Customizer UI
const magnetCustomizer = document.getElementById('magnet-customizer');
const inputBField = document.getElementById('bFieldStrength');
const dispBField = document.getElementById('b-field-val');
const btnDeleteMagnet = document.getElementById('delete-magnet-btn');

inputBField.oninput = (e) => {
    if (state.selectedMagnet) {
        state.selectedMagnet.strength = parseInt(e.target.value);
        dispBField.textContent = state.selectedMagnet.strength;
    }
};

btnDeleteMagnet.onclick = () => {
    if (state.selectedMagnet) {
        const idx = state.magnets.indexOf(state.selectedMagnet);
        if (idx > -1) state.magnets.splice(idx, 1);
        selectMagnet(null);
    }
};

function selectMagnet(m) {
    state.selectedMagnet = m;
    if (m) {
        magnetCustomizer.style.display = 'block';
        inputBField.value = m.strength;
        dispBField.textContent = m.strength;
    } else {
        magnetCustomizer.style.display = 'none';
    }
    // Deselect others
    if (m) selectElectric(null);
}

function selectElectric(er) {
    state.selectedElectric = er;
    const ui = document.getElementById('electric-customizer');
    const inputV = document.getElementById('eFieldVoltage');
    const inputG = document.getElementById('eFieldGap');
    const dispV = document.getElementById('e-voltage-val');
    const dispG = document.getElementById('e-gap-val');

    if (er) {
        ui.style.display = 'block';
        inputV.value = er.voltage;
        dispV.textContent = er.voltage;
        inputG.value = er.gap;
        dispG.textContent = er.gap;

        selectMagnet(null); // Deselect magnet
    } else {
        ui.style.display = 'none';
    }
}

// Additional UI Listeners
const inputSpread = document.getElementById('beamSpread');
if (inputSpread) {
    const dispSpread = document.getElementById('spread-val');
    inputSpread.oninput = (e) => {
        state.energySpread = parseFloat(e.target.value);
        dispSpread.textContent = state.energySpread;
    };
}

const btnMagnetReset = document.getElementById('reset-magnet-size-btn');
if (btnMagnetReset) {
    btnMagnetReset.onclick = () => {
        if (state.selectedMagnet) {
            state.selectedMagnet.w = 150;
            state.selectedMagnet.h = 150;
        }
    };
}

const btnAddElectric = document.getElementById('add-electric-btn');
if (btnAddElectric) {
    btnAddElectric.onclick = () => {
        // Smart Spawn
        const w = 50;
        const h = 150; // Approximated height check
        const pos = findSafeSpawnLocation(w, h);

        const er = new ElectricRegion(pos.x, state.plateGapY); // Keep Y centered on beam usually, but check X
        // Actually, findSafeSpawnLocation returns x,y. 
        // For E-plates, we probably want them centered on the beam Y-axis usually, or just shifted X.
        // Let's rely on X shift.

        const erFinal = new ElectricRegion(pos.x, state.plateGapY);
        state.electricRegions.push(erFinal);
        selectElectric(erFinal);
    };
}

const inputEVoltage = document.getElementById('eFieldVoltage');
if (inputEVoltage) {
    inputEVoltage.oninput = (e) => {
        if (state.selectedElectric) {
            state.selectedElectric.voltage = parseFloat(e.target.value);
            document.getElementById('e-voltage-val').textContent = state.selectedElectric.voltage;
        }
    };
}

const inputEGap = document.getElementById('eFieldGap');
if (inputEGap) {
    inputEGap.oninput = (e) => {
        if (state.selectedElectric) {
            state.selectedElectric.gap = parseInt(e.target.value);
            document.getElementById('e-gap-val').textContent = state.selectedElectric.gap;
        }
    };
}

const btnDelElectric = document.getElementById('delete-electric-btn');
if (btnDelElectric) {
    btnDelElectric.onclick = () => {
        if (state.selectedElectric) {
            const idx = state.electricRegions.indexOf(state.selectedElectric);
            if (idx > -1) state.electricRegions.splice(idx, 1);
            selectElectric(null);
        }
    };
}


// Canvas Interaction (Drag & Drop)
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if clicked a magnet
    // Iterate reverse to click top-most
    for (let i = state.magnets.length - 1; i >= 0; i--) {
        const m = state.magnets[i];
        if (m.contains(mx, my)) {
            selectMagnet(m);
            state.isDragging = true;
            state.dragOffsetX = mx - m.x;
            state.dragOffsetY = my - m.y;

            // Check Resize Handle (Bottom Right 10x10 area)
            const handleDist = Math.sqrt(Math.pow(mx - (m.x + m.w), 2) + Math.pow(my - (m.y + m.h), 2));
            if (handleDist < 15) {
                state.isResizing = true;
                // No drag offset needed for resize, using raw mouse delta
            }
            return;
        }
    }

    // Check if clicked Electric Region
    // Iterate reverse
    for (let i = state.electricRegions.length - 1; i >= 0; i--) {
        const er = state.electricRegions[i];
        if (er.contains(mx, my)) {
            selectElectric(er);
            state.isDragging = true;
            state.dragOffsetX = mx - er.x;
            state.dragOffsetY = my - er.y;
            return;
        }
    }

    // Clicked background -> deselect
    selectMagnet(null);
    selectElectric(null);
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (state.isResizing && state.selectedMagnet) {
        // Minimum size 50x50
        const newW = Math.max(50, mx - state.selectedMagnet.x);
        const newH = Math.max(50, my - state.selectedMagnet.y);
        state.selectedMagnet.w = newW;
        state.selectedMagnet.h = newH;
        return;
    }

    if (state.isDragging) {
        if (state.selectedMagnet) {
            state.selectedMagnet.x = mx - state.dragOffsetX;
            state.selectedMagnet.y = my - state.dragOffsetY;
        } else if (state.selectedElectric) {
            state.selectedElectric.x = mx - state.dragOffsetX;
            state.selectedElectric.y = my - state.dragOffsetY;
        }
    }
});

canvas.addEventListener('mouseup', () => {
    state.isDragging = false;
    state.isResizing = false;
});


// Splash Logic
const splashOverlay = document.getElementById('splash-overlay');
const btnGetStarted = document.getElementById('get-started-btn');
const btnHelp = document.getElementById('help-btn');

if (btnGetStarted) {
    btnGetStarted.onclick = () => {

        splashOverlay.classList.add('closing');
        // No need to add .closing to modal if we are just fading the overlay

        setTimeout(() => {
            splashOverlay.style.display = 'none';
            splashOverlay.classList.remove('closing');
        }, 300);
    };
}

if (btnHelp) {
    btnHelp.onclick = () => {
        splashOverlay.style.display = 'flex';
        setTimeout(() => {
            splashOverlay.style.opacity = '1';
        }, 10);
    };
}

// Start
requestAnimationFrame(loopOrdered);
