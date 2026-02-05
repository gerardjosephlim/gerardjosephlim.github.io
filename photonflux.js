class Photon {
    constructor() {
        this.reset();
    }

    reset(width, height, spawnYRange) {
        this.x = -10;
        const minY = spawnYRange ? spawnYRange.min : 0;
        const maxY = spawnYRange ? spawnYRange.max : height || 600;
        this.y = minY + Math.random() * (maxY - minY);
        this.vx = 200 + Math.random() * 100;
        this.vy = 0;
        this.size = 2;
        this.active = true;
    }

    update(dt, width) {
        this.x += this.vx * dt;
        if (this.x > width) {
            this.active = false;
        }
    }

    draw(ctx) {
        // Draw tail
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x - 15, this.y);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - 15, this.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.size * 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Draw head
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();

        // Add a subtle glow to the head
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

const photonPool = {
    pool: [],
    get() {
        if (this.pool.length > 0) return this.pool.pop();
        return new Photon();
    },
    release(photon) {
        photon.active = false;
        this.pool.push(photon);
    }
};

class SolarPanel {
    constructor(x, y, length) {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = 0; // Degrees
        this.thickness = 8;
    }

    getNormals() {
        const rad = (this.angle * Math.PI) / 180;
        // Panel endpoints relative to center
        const dx = (this.length / 2) * Math.sin(rad);
        const dy = -(this.length / 2) * Math.cos(rad);

        return {
            x1: this.x - dx,
            y1: this.y - dy,
            x2: this.x + dx,
            y2: this.y + dy
        };
    }

    draw(ctx) {
        const { x1, y1, x2, y2 } = this.getNormals();

        // Draw normal vector
        const rad = (this.angle * Math.PI) / 180;
        const nx = Math.cos(rad) * 50;
        const ny = Math.sin(rad) * 50;

        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + nx, this.y + ny);
        ctx.strokeStyle = '#4cc9f0';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw normal arrow head
        ctx.save();
        ctx.translate(this.x + nx, this.y + ny);
        ctx.rotate(rad);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        ctx.fillStyle = '#4cc9f0';
        ctx.fill();
        ctx.restore();

        // Draw angle visualization
        const arcRadius = 70;

        // Horizontal reference line (flux direction)
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + arcRadius + 20, this.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.setLineDash([2, 5]);
        ctx.stroke();

        if (this.angle > 0) {
            // Angle Arc
            ctx.beginPath();
            ctx.arc(this.x, this.y, arcRadius, 0, rad);
            ctx.strokeStyle = '#4cc9f0';
            ctx.setLineDash([]);
            ctx.stroke();

            // Label
            const midAngle = rad / 2;
            const labelX = this.x + (arcRadius + 20) * Math.cos(midAngle);
            const labelY = this.y + (arcRadius + 20) * Math.sin(midAngle);

            ctx.fillStyle = '#4cc9f0';
            ctx.font = '14px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`θ = ${this.angle}°`, labelX, labelY);
        }

        // Draw panel
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = this.thickness;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#334155';
        ctx.stroke();

        // Shiny panel surface
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        // Effective area visualization (vertical projection)
        const fluxVal = parseInt(fluxSlider.value);
        if (fluxVal > 0) {
            const { x1, y1, x2, y2 } = this.getNormals();
            const topY = Math.min(y1, y2);
            const bottomY = Math.max(y1, y2);
            const projX = this.x + 150; // Distance to the right

            // Dashed connecting lines
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(projX, y1);
            ctx.moveTo(x2, y2);
            ctx.lineTo(projX, y2);
            ctx.strokeStyle = 'rgba(76, 201, 240, 0.3)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1;
            ctx.stroke();

            // Projection line (Effective Area)
            ctx.beginPath();
            ctx.moveTo(projX, topY);
            ctx.lineTo(projX, bottomY);
            ctx.strokeStyle = '#ffd700'; // Gold color to match flux
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#ffd700';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Draw label to the right of the projection line
            ctx.save();
            ctx.translate(projX + 15, (topY + bottomY) / 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillText("Effective Area", 0, 0);
            ctx.restore();
        }

        ctx.lineWidth = 1;
    }

    checkCollision(photon) {
        // Simple line segment collision
        const { x1, y1, x2, y2 } = this.getNormals();

        // Photon path in this frame
        // (xPrev, yPrev) to (photon.x, photon.y)
        // For simplicity, we check if the photon is within a small distance of the line
        // and if it "passed through" it.

        // A better way: check distance to segment
        const dist = this.distToSegment(photon.x, photon.y, x1, y1, x2, y2);

        if (dist < 10) { // Collision threshold
            // Only absorb if coming from the "front" (relative to normal)
            // Normal vector is (cos(angle), sin(angle))
            // Photon velocity is (vx, 0)
            // Dot product should be negative for "facing each other"
            const rad = (this.angle * Math.PI) / 180;
            const nx = Math.cos(rad);
            const photonVx = photon.vx;

            // If the photon is moving right (vx > 0) and the panel normal has a leftward component (nx < 0),
            // or if the photon would hit the surface.
            // Actually, for flux, we just care if it hits the surface.
            return true;
        }
        return false;
    }

    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2);
    }
}

class AmmeterSpark {
    constructor(container) {
        this.container = container;
        this.el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.el.setAttribute("r", "1.5");
        this.el.classList.add("ammeter-spark");
        this.container.appendChild(this.el);
        this.reset();
        this.opacity = 0;
    }

    reset() {
        // Sparks spawn along the ammeter arc: center (50, 50), radius 40, angle -180 to 0
        // We slightly narrow the angle to avoid spawning behind the bezel
        const angle = -Math.PI * 0.95 + Math.random() * (Math.PI * 0.9);
        this.x = 50 + Math.cos(angle) * 40;
        this.y = 50 + Math.sin(angle) * 40;

        // Velocity points outwards from the center + some randomness
        const speed = 80 + Math.random() * 40;
        this.vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 30;
        this.vy = Math.sin(angle) * speed + (Math.random() - 0.5) * 30;

        this.life = 0.8 + Math.random() * 0.6;
        this.maxLife = this.life;
        this.opacity = 1;
    }

    update(dt, active) {
        if (this.opacity <= 0) {
            if (active) this.reset();
            else return;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 80 * dt; // Gravity
        this.life -= dt;
        this.opacity = Math.max(0, this.life / this.maxLife);

        this.el.setAttribute("cx", this.x);
        this.el.setAttribute("cy", this.y);
        this.el.style.opacity = this.opacity;
    }
}

const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');
const fluxSlider = document.getElementById('fluxSlider');
const tiltSlider = document.getElementById('tiltSlider');
const fluxValueDisp = document.getElementById('fluxValue');
const tiltValueDisp = document.getElementById('tiltValue');
const absorptionDisp = document.getElementById('absorptionRate');
const theoreticalFluxDisp = document.getElementById('theoreticalFlux');
const lightbulb = document.getElementById('lightbulb');
const bulbGlow = document.getElementById('bulbGlow');
const ammeterNeedle = document.getElementById('ammeterNeedle');
const lightningGroup = document.getElementById('lightningGroup');
const sparkGroup = document.getElementById('sparkGroup');
const introModal = document.getElementById('introModal');
const startButton = document.getElementById('startButton');
const helpButton = document.getElementById('helpButton');

startButton.addEventListener('click', () => {
    introModal.classList.add('hidden');
});

helpButton.addEventListener('click', () => {
    introModal.classList.remove('hidden');
});

let width, height;
let photons = [];
let panel;
let lastTime = 0;
let spawnTimer = 0;
let absorbedCount = 0;
let timeWindow = 0;
let absorptionBuffer = []; // {time: number, count: number}
const ROLLING_WINDOW_SEC = 5;

function resize() {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
    panel = new SolarPanel(width * 0.7, height / 2, 200);
}

window.addEventListener('resize', resize);
resize();

// Pre-allocate photons
for (let i = 0; i < 500; i++) photonPool.pool.push(new Photon());

const FPS_LIMIT = 60;
const FRAME_MIN_TIME = 1000 / FPS_LIMIT;
let lastFrameTime = 0;
let numericalDisplayTimer = 0;

// Ammeter sparks setup
const sparks = [];
for (let i = 0; i < 10; i++) sparks.push(new AmmeterSpark(sparkGroup));

function update(time) {
    // FPS Limiting
    if (time - lastFrameTime < FRAME_MIN_TIME) {
        requestAnimationFrame(update);
        return;
    }
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    lastFrameTime = time;

    const flux = parseInt(fluxSlider.value);
    const tilt = parseInt(tiltSlider.value);

    fluxValueDisp.textContent = flux;
    tiltValueDisp.textContent = tilt + '°';
    panel.angle = tilt;

    // Spawn photons within a narrower vertical span
    if (flux > 0) {
        spawnTimer += dt;
        const spawnInterval = 1 / flux;
        const spawnYRange = {
            min: panel.y - panel.length * 0.75,
            max: panel.y + panel.length * 0.75
        };

        while (spawnTimer > spawnInterval) {
            const p = photonPool.get();
            p.reset(width, height, spawnYRange);
            photons.push(p);
            spawnTimer -= spawnInterval;
        }
    }

    // Update and collide
    for (let i = photons.length - 1; i >= 0; i--) {
        const p = photons[i];
        p.update(dt, width);

        if (panel.checkCollision(p)) {
            p.active = false;
            absorbedCount++;
        }

        if (!p.active) {
            photons.splice(i, 1);
            photonPool.release(p);
        }
    }

    // Rolling absorption metrics
    timeWindow += dt;
    numericalDisplayTimer += dt;

    if (timeWindow >= 0.1) { // High-frequency sampling for smooth animation
        absorptionBuffer.push({ time: time / 1000, count: absorbedCount });
        absorbedCount = 0;
        timeWindow = 0;

        // Clean up old entries
        const now = time / 1000;
        absorptionBuffer = absorptionBuffer.filter(entry => now - entry.time <= ROLLING_WINDOW_SEC);

        // Calculate average
        const totalAbsorbed = absorptionBuffer.reduce((sum, entry) => sum + entry.count, 0);
        // The window might be smaller than ROLLING_WINDOW_SEC during startup
        const actualWindow = Math.min(ROLLING_WINDOW_SEC, now - (absorptionBuffer[0]?.time || now));
        const rollingAbsorption = actualWindow > 0 ? totalAbsorbed / actualWindow : 0;

        // Theoretical flux calculation
        const rad = (tilt * Math.PI) / 180;
        const spawnHeight = panel.length * 1.5;
        const expected = flux * Math.cos(rad) * (panel.length / spawnHeight);

        // Throttle numerical display updates to 0.5s
        if (numericalDisplayTimer >= 0.5) {
            absorptionDisp.textContent = rollingAbsorption.toFixed(1);
            theoreticalFluxDisp.textContent = expected.toFixed(1);
            numericalDisplayTimer = 0;
        }

        // Update high-frequency visual indicators (smooth needle/glow)
        const intensity = Math.min(rollingAbsorption / 100, 1); // Respecting the 100 limit
        lightbulb.style.color = intensity > 0.1 ? '#ffd700' : 'var(--text-secondary)';
        bulbGlow.style.opacity = intensity;
        bulbGlow.style.transform = `scale(${0.5 + intensity * 1.0})`; // User's manual edit preserved

        // Ammeter needle rotation: -90deg to 90deg
        const needleAngle = -90 + intensity * 180;
        ammeterNeedle.style.transform = `rotate(${needleAngle}deg)`;

        // Lightning effect for high intensity
        if (intensity > 0.5) {
            lightningGroup.classList.add('active');
        } else {
            lightningGroup.classList.remove('active');
        }

        // Sparks for critical intensity (>70%)
        const sparksActive = intensity > 0.70;
        sparks.forEach(s => s.update(dt, sparksActive));
    }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    // Draw capture window projection (visual aid)
    // The visual aid should match the new spawn height
    const flux = parseInt(fluxSlider.value);
    if (flux > 0) {
        const spawnHeight = panel.length * 1.5; // This matches the spawnYRange height

        // Background capture area
        ctx.fillStyle = 'rgba(76, 201, 240, 0.05)';
        ctx.fillRect(0, panel.y - spawnHeight / 2, panel.x, spawnHeight);

        ctx.strokeStyle = 'rgba(76, 201, 240, 0.1)';
        ctx.setLineDash([10, 10]);
        ctx.strokeRect(0, panel.y - spawnHeight / 2, panel.x, spawnHeight);
        ctx.setLineDash([]);
    }

    // Draw photons
    photons.forEach(p => p.draw(ctx));

    // Draw panel
    panel.draw(ctx);
}

requestAnimationFrame(update);
