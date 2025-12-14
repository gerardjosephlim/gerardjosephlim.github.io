import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Physics Engine ---

class LLGPhysics {
    constructor() {
        this.m = new THREE.Vector3(1, 0, 0).normalize();
        this.H = new THREE.Vector3(0, 0, 1);
        this.alpha = 0.1;
        this.gamma = 1.0;
        this.time = 0;
    }

    // Calculates dm/dt = -gamma/(1+alpha^2) * [ mxH + alpha(mx(mxH)) ]
    dmdt(m, t) {
        const mxH = new THREE.Vector3().crossVectors(m, this.H);
        const mxmxH = new THREE.Vector3().crossVectors(m, mxH);

        const prefactor = -this.gamma / (1 + this.alpha * this.alpha);

        const term1 = mxH.clone();
        const term2 = mxmxH.clone().multiplyScalar(this.alpha);

        return term1.add(term2).multiplyScalar(prefactor);
    }

    // Return torque vectors for visualization
    getTorques() {
        const mxH = new THREE.Vector3().crossVectors(this.m, this.H);
        const mxmxH = new THREE.Vector3().crossVectors(this.m, mxH);

        // Precession term (conservative torque): -gamma * (m x H)
        // Note: the (1+a^2) factor scales both, but usually we visualize the components roughly.
        // Let's visualize the actual dmdt components contributing to motion.
        const prefactor = -this.gamma / (1 + this.alpha * this.alpha);

        const precessionTorque = mxH.clone().multiplyScalar(prefactor);
        const dampingTorque = mxmxH.clone().multiplyScalar(prefactor * this.alpha);

        return { precession: precessionTorque, damping: dampingTorque };
    }

    solveRK45(dt) {
        const m = this.m.clone();

        // k1
        const k1 = this.dmdt(m, this.time);

        // k2
        const m2 = m.clone().add(k1.clone().multiplyScalar(dt * 0.2));
        const k2 = this.dmdt(m2, this.time + dt * 0.2);

        // k3
        const m3 = m.clone().add(k1.clone().multiplyScalar(dt * 3 / 40)).add(k2.clone().multiplyScalar(dt * 9 / 40));
        const k3 = this.dmdt(m3, this.time + dt * 0.3);

        // k4
        const m4 = m.clone().add(k1.clone().multiplyScalar(dt * 44 / 45)).add(k2.clone().multiplyScalar(dt * -56 / 15)).add(k3.clone().multiplyScalar(dt * 32 / 9));
        const k4 = this.dmdt(m4, this.time + dt * 0.8);

        // k5
        const m5 = m.clone().add(k1.clone().multiplyScalar(dt * 19372 / 6561))
            .add(k2.clone().multiplyScalar(dt * -25360 / 2187))
            .add(k3.clone().multiplyScalar(dt * 64448 / 6561))
            .add(k4.clone().multiplyScalar(dt * -212 / 729));
        const k5 = this.dmdt(m5, this.time + dt * 8 / 9);

        // k6
        const m6 = m.clone().add(k1.clone().multiplyScalar(dt * 9017 / 3168))
            .add(k2.clone().multiplyScalar(dt * -355 / 33))
            .add(k3.clone().multiplyScalar(dt * 46732 / 5247))
            .add(k4.clone().multiplyScalar(dt * 49 / 176))
            .add(k5.clone().multiplyScalar(dt * -5103 / 18656));
        const k6 = this.dmdt(m6, this.time + dt);

        const delta = new THREE.Vector3()
            .add(k1.multiplyScalar(35 / 384))
            .add(k3.multiplyScalar(500 / 1113))
            .add(k4.multiplyScalar(125 / 192))
            .add(k5.multiplyScalar(-2187 / 6784))
            .add(k6.multiplyScalar(11 / 84))
            .multiplyScalar(dt);

        this.m.add(delta);
        this.m.normalize();
        this.time += dt;
        return this.m;
    }
}

// --- Visualizer ---

class Visualizer {
    constructor(container) {
        this.scene = new THREE.Scene();
        this.showTrace = true;
        this.showForces = false;
        this.showGrid = true;

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(2.5, 1.5, 2.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false; // Disable panning as requested

        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 2);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        const blueLight = new THREE.PointLight(0x0088ff, 2);
        blueLight.position.set(-5, -2, -5);
        this.scene.add(blueLight);

        this.createObjects();
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    // Helper to create Text Sprite
    createTextSprite(text, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; // Higher res
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'Bold 48px Arial'; // Large font
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, 64, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.3, 0.15, 1);
        sprite.renderOrder = 999; // Always on top
        return sprite;
    }

    createObjects() {
        // --- Sphere Grid (Dual Tone) ---
        const sphereGeo = new THREE.SphereGeometry(1, 48, 48);

        // Front - Brighter
        const frontMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            side: THREE.FrontSide
        });
        this.sphereFront = new THREE.Mesh(sphereGeo, frontMat);
        this.scene.add(this.sphereFront);

        // Back - Darker
        const backMat = new THREE.MeshBasicMaterial({
            color: 0x888888, // Greyer
            wireframe: true,
            transparent: true,
            opacity: 0.05, // More transparent
            side: THREE.BackSide
        });
        this.sphereBack = new THREE.Mesh(sphereGeo, backMat);
        this.scene.add(this.sphereBack);

        // --- Axes ---
        // X - Red
        const xMat = new THREE.LineBasicMaterial({ color: 0xff3366 });
        const xGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, 0, 0)]);
        this.xAxis = new THREE.Line(xGeo, xMat);
        this.scene.add(this.xAxis);
        this.xLabel = this.createTextSprite("X", "#ff3366");
        this.xLabel.position.set(1.3, 0, 0);
        this.scene.add(this.xLabel);

        // Y - Green
        const yMat = new THREE.LineBasicMaterial({ color: 0x00ff88 });
        const yGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.2, 0)]);
        this.yAxis = new THREE.Line(yGeo, yMat);
        this.scene.add(this.yAxis);
        this.yLabel = this.createTextSprite("Y", "#00ff88");
        this.yLabel.position.set(0, 1.3, 0);
        this.scene.add(this.yLabel);

        // Z - Blue
        const zMat = new THREE.LineBasicMaterial({ color: 0x0088ff });
        const zGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.2)]);
        this.zAxis = new THREE.Line(zGeo, zMat);
        this.scene.add(this.zAxis);
        this.zLabel = this.createTextSprite("Z", "#0088ff");
        this.zLabel.position.set(0, 0, 1.3);
        this.scene.add(this.zLabel);

        // --- Spin M ---
        this.spinColor = 0xcaff70; // Yellow-Green
        this.spinArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            this.spinColor,
            0.15,
            0.1
        );
        this.scene.add(this.spinArrow);

        this.mLabel = this.createTextSprite("m", "#caff70");
        this.scene.add(this.mLabel);

        // --- Field H (displayed as B) ---
        this.fieldColor = 0xff0000;
        this.fieldArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 0),
            0,
            this.fieldColor,
            0.15,
            0.1
        );
        this.scene.add(this.fieldArrow);

        this.bLabel = this.createTextSprite("B", "#ff0000"); // User asked for "B" instead of "H"
        this.scene.add(this.bLabel);

        // --- Forces ---
        this.precessionArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0, 0xffff00, 0.1, 0.08); // Yellow
        this.scene.add(this.precessionArrow);

        this.dampingArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0, 0x00ffff, 0.1, 0.08); // Cyan
        this.scene.add(this.dampingArrow);

        this.tLabelP = this.createTextSprite("Tp", "#ffff00"); // Torque Precession
        this.tLabelD = this.createTextSprite("Td", "#00ffff"); // Torque Damping
        this.scene.add(this.tLabelP);
        this.scene.add(this.tLabelD);

        // Initially hide Text
        this.tLabelP.visible = false;
        this.tLabelD.visible = false;

        // --- Trace ---
        this.trailPoints = [];
        this.trailMaxPoints = 800;
        const trailGeo = new THREE.BufferGeometry();
        const trailMat = new THREE.LineBasicMaterial({ color: this.spinColor, transparent: true, opacity: 0.6 });
        this.trail = new THREE.Line(trailGeo, trailMat);
        this.scene.add(this.trail);
    }

    update(m, H, torques) {
        // Spin
        this.spinArrow.setDirection(m);
        this.mLabel.position.copy(m).multiplyScalar(1.1); // Label at tip + offset

        // Field (B)
        const hLen = H.length();
        if (hLen > 0.001) {
            this.fieldArrow.visible = true;
            this.bLabel.visible = true;
            const dir = H.clone().normalize();
            this.fieldArrow.setDirection(dir);
            const len = Math.min(hLen, 1.5);
            this.fieldArrow.setLength(len, 0.15, 0.1);
            this.bLabel.position.copy(dir).multiplyScalar(len + 0.1);
        } else {
            this.fieldArrow.visible = false;
            this.bLabel.visible = false;
        }

        // Trace
        if (this.showTrace) {
            this.trail.visible = true;
            this.trailPoints.push(m.clone());
            if (this.trailPoints.length > this.trailMaxPoints) {
                this.trailPoints.shift();
            }
            const points = this.trailPoints.map(v => v);
            this.trail.geometry.setFromPoints(points);
        } else {
            this.trail.visible = false;
        }

        // Grid
        this.sphereFront.visible = this.showGrid;
        this.sphereBack.visible = this.showGrid;

        // Forces
        if (this.showForces && torques) {
            const origin = m.clone();
            const pLen = torques.precession.length();
            const dLen = torques.damping.length();

            if (pLen > 0.001) {
                this.precessionArrow.visible = true;
                this.tLabelP.visible = true;
                this.precessionArrow.position.copy(origin);
                const pDir = torques.precession.clone().normalize();
                this.precessionArrow.setDirection(pDir);
                const drawnLen = Math.min(pLen * 5, 0.8);
                this.precessionArrow.setLength(drawnLen, 0.1, 0.08);
                this.tLabelP.position.copy(origin).add(pDir.multiplyScalar(drawnLen + 0.1));
            } else {
                this.precessionArrow.visible = false;
                this.tLabelP.visible = false;
            }

            if (dLen > 0.001) {
                this.dampingArrow.visible = true;
                this.tLabelD.visible = true;
                this.dampingArrow.position.copy(origin);
                const dDir = torques.damping.clone().normalize();
                this.dampingArrow.setDirection(dDir);
                const drawnLen = Math.min(dLen * 10, 0.8);
                this.dampingArrow.setLength(drawnLen, 0.1, 0.08);
                this.tLabelD.position.copy(origin).add(dDir.multiplyScalar(drawnLen + 0.1));
            } else {
                this.dampingArrow.visible = false;
                this.tLabelD.visible = false;
            }

        } else {
            this.precessionArrow.visible = false;
            this.dampingArrow.visible = false;
            this.tLabelP.visible = false;
            this.tLabelD.visible = false;
        }
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- Plotter ---

class Plotter {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = { x: [], y: [], z: [] };
        // Increase resolution for retina displays
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
        this.maxPoints = 300;
    }

    addPoint(m) {
        this.data.x.push(m.x);
        this.data.y.push(m.y);
        this.data.z.push(m.z);

        if (this.data.x.length > this.maxPoints) {
            this.data.x.shift();
            this.data.y.shift();
            this.data.z.shift();
        }
    }

    reset() {
        this.data = { x: [], y: [], z: [] };
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw zero line
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();

        this.drawSeries(this.data.x, "#ff3366"); // Mx red
        this.drawSeries(this.data.y, "#00ff88"); // My green
        this.drawSeries(this.data.z, "#0088ff"); // Mz blue
    }

    drawSeries(data, color) {
        if (data.length < 2) return;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();

        const stepX = this.width / (this.maxPoints - 1);

        for (let i = 0; i < data.length; i++) {
            const x = i * stepX;
            // Map [-1, 1] to [height, 0] (y is inverted in canvas)
            const y = (1 - data[i]) / 2 * this.height;

            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }
}

// --- Main Controller ---

const physics = new LLGPhysics();
const viz = new Visualizer(document.getElementById('canvas-container'));
const plotter = new Plotter('plot-canvas');

// UI Elements
const alphaInput = document.getElementById('alpha');
const gammaInput = document.getElementById('gamma');
const hxInput = document.getElementById('hx');
const hyInput = document.getElementById('hy');
const hzInput = document.getElementById('hz');
const dtInput = document.getElementById('dt');

const m0xInput = document.getElementById('m0x');
const m0yInput = document.getElementById('m0y');
const m0zInput = document.getElementById('m0z');

const showTraceInput = document.getElementById('show-trace');
const showForcesInput = document.getElementById('show-forces');
const showGridInput = document.getElementById('show-grid');

const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const timeDisplay = document.getElementById('time-display');
const magDisplay = document.getElementById('mag-display');

let isRunning = false;

// Event Listeners
function updateParams() {
    physics.alpha = parseFloat(alphaInput.value);
    physics.gamma = parseFloat(gammaInput.value);
    physics.H.set(
        parseFloat(hxInput.value),
        parseFloat(hyInput.value),
        parseFloat(hzInput.value)
    );

    // Update visualizer state directly for toggles
    viz.showTrace = showTraceInput.checked;
    viz.showForces = showForcesInput.checked;
    viz.showGrid = showGridInput.checked;
}

// Update Initial Magnetization & Sync Live
function updateInitialM() {
    // Only update if not running, to allow setting initial state live
    if (!isRunning) {
        const m0 = new THREE.Vector3(
            parseFloat(m0xInput.value),
            parseFloat(m0yInput.value),
            parseFloat(m0zInput.value)
        );
        if (m0.lengthSq() === 0) m0.set(1, 0, 0);
        m0.normalize();

        physics.m.copy(m0);
        viz.trailPoints = [];
        viz.trail.geometry.setFromPoints([]); // Clear Trace on M change

        // Update display
        magDisplay.textContent = `[${physics.m.x.toFixed(2)}, ${physics.m.y.toFixed(2)}, ${physics.m.z.toFixed(2)}]`;
    }
}

// Listeners
[alphaInput, gammaInput, hxInput, hyInput, hzInput].forEach(el => {
    el.addEventListener('input', updateParams);
});

[m0xInput, m0yInput, m0zInput].forEach(el => {
    el.addEventListener('input', updateInitialM);
});

[showTraceInput, showForcesInput, showGridInput].forEach(el => {
    el.addEventListener('change', updateParams);
});

// Start Toggle
startBtn.addEventListener('click', () => {
    isRunning = !isRunning;
    startBtn.textContent = isRunning ? "Pause Simulation" : "Start Simulation";
    if (isRunning) {
        // Ensure params are fresh
        updateParams();
    }
});

// Reset
resetBtn.addEventListener('click', () => {
    isRunning = false;
    startBtn.textContent = "Start Simulation";

    // Explicit read
    updateInitialM();

    physics.time = 0;
    viz.trailPoints = [];
    viz.trail.geometry.setFromPoints([]);
    plotter.reset();

    updateParams();
    timeDisplay.textContent = "0.00";
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);

    if (isRunning) {
        const dt = parseFloat(dtInput.value);
        physics.solveRK45(dt);
        plotter.addPoint(physics.m);
    }

    const torques = physics.getTorques();
    viz.update(physics.m, physics.H, torques);
    viz.render();

    if (isRunning) {
        plotter.draw();
        timeDisplay.textContent = physics.time.toFixed(2);
        magDisplay.textContent = `[${physics.m.x.toFixed(2)}, ${physics.m.y.toFixed(2)}, ${physics.m.z.toFixed(2)}]`;
    }
}

// Init
updateParams();
updateInitialM(); // Set initial state
animate();
