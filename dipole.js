const canvas = document.getElementById('atomCanvas');
const ctx = canvas.getContext('2d');
const eFieldInput = document.getElementById('efield');
const splashOverlay = document.getElementById('splashOverlay');
const startBtn = document.getElementById('startBtn');
const helpBtn = document.getElementById('helpBtn');

let width, height;

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}

window.addEventListener('resize', resize);
resize();

// UI Interactivity
startBtn.addEventListener('click', () => {
    splashOverlay.classList.add('hidden');
});

helpBtn.addEventListener('click', () => {
    splashOverlay.classList.remove('hidden');
});

function drawAtom(centerX, centerY, size, fieldStrength) {
    // Scale factors for visual effect
    const shiftScale = 1.0;
    const deformationScale = 0.5;

    // Nucleus shifts WITH the field (Positive charge)
    const nucleusX = centerX + fieldStrength * shiftScale * 0.5;

    // Orbital shifts AGAINST the field (Negative charge)
    const orbitalX = centerX - fieldStrength * shiftScale * 0.5;

    const baseRadius = size * 0.35;

    // Deform orbital
    const stretchX = Math.abs(fieldStrength) * deformationScale * (size / 200);
    const radiusX = baseRadius + stretchX;
    const radiusY = Math.max(5, baseRadius - (stretchX * 0.5));

    // Draw Orbital (Blue, translucent, distorted)
    const gradient = ctx.createRadialGradient(orbitalX, centerY, 0, orbitalX, centerY, Math.max(radiusX, radiusY));
    gradient.addColorStop(0, 'rgba(77, 148, 255, 0.4)'); // --negative
    gradient.addColorStop(0.7, 'rgba(77, 148, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(77, 148, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(orbitalX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Orbital Outline
    ctx.strokeStyle = 'rgba(77, 148, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Orbital Sign (-)
    ctx.fillStyle = 'white';
    ctx.font = '14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('-', orbitalX, centerY);

    // Dipole Moment Vector (P)
    if (Math.abs(fieldStrength) > 0) {
        const dx = nucleusX - orbitalX;
        const dy = 0;
        const angle = Math.atan2(dy, dx);

        const offset = size * 0.1;
        const startX = orbitalX + Math.cos(angle) * offset;
        const startY = centerY + Math.sin(angle) * offset;
        const endX = nucleusX - Math.cos(angle) * offset;
        const endY = centerY - Math.sin(angle) * offset;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > offset * 2.5) {
            drawArrow(ctx, startX, startY, endX, endY, '#38bdf8'); // --primary

            // Label P
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'italic 13px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const labelX = (startX + endX) / 2;
            const labelY = centerY - 5;
            ctx.fillText('P', labelX, labelY);
        }
    }

    // Draw Nucleus
    const nucleusRadius = size * 0.08;
    ctx.fillStyle = '#ff4d4d'; // --positive
    ctx.shadowColor = 'rgba(255, 77, 77, 0.5)';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(nucleusX, centerY, nucleusRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Nucleus Sign (+)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', nucleusX, centerY);
}

// FPS Control
let lastTime = 0;
const fps = 30;
const fpsInterval = 1000 / fps;

function draw(timestamp) {
    requestAnimationFrame(draw);

    const elapsed = timestamp - lastTime;
    if (elapsed < fpsInterval) return;

    lastTime = timestamp - (elapsed % fpsInterval);

    ctx.clearRect(0, 0, width, height);

    const fieldStrength = parseInt(eFieldInput.value) || 0;

    // Grid settings
    const cols = 4;
    const rows = 4;
    const padding = 20;

    const hSpacingFactor = 1.3;
    const vSpacingFactor = 0.8;

    const availableWidth = width - 2 * padding;
    const availableHeight = height - 2 * padding;

    const maxAtomSizeW = availableWidth / (cols * hSpacingFactor);
    const maxAtomSizeH = availableHeight / (rows * vSpacingFactor);
    const atomSize = Math.min(maxAtomSizeW, maxAtomSizeH) * 0.8;

    const cellWidth = atomSize * hSpacingFactor;
    const cellHeight = atomSize * vSpacingFactor;

    const startX = padding + (availableWidth - cols * cellWidth) / 2;
    const startY = padding + (availableHeight - rows * cellHeight) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const centerX = startX + c * cellWidth + cellWidth / 2;
            const centerY = startY + r * cellHeight + cellHeight / 2;
            drawAtom(centerX, centerY, atomSize, fieldStrength);
        }
    }

    // Draw Capacitor Plates
    const plateWidth = 10;
    const plateHeight = rows * cellHeight + padding;
    const plateY = startY + (rows * cellHeight - plateHeight) / 2;
    const plateSeparation = 50;

    const leftPlateX = startX - padding - plateWidth - plateSeparation;
    const rightPlateX = startX + cols * cellWidth + padding + plateSeparation;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(leftPlateX, plateY, plateWidth, plateHeight);
    ctx.fillRect(rightPlateX, plateY, plateWidth, plateHeight);

    if (Math.abs(fieldStrength) > 0) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const leftSign = fieldStrength > 0 ? '+' : '-';
        const rightSign = fieldStrength > 0 ? '-' : '+';
        const absField = Math.abs(fieldStrength);

        const maxSigns = Math.floor(plateHeight / 20);
        const minSigns = 2;
        let numSigns = minSigns;
        if (absField > 0) {
            const t = absField / 100;
            numSigns = Math.floor(minSigns + t * (maxSigns - minSigns));
        }

        for (let i = 0; i < numSigns; i++) {
            const y = plateY + (i + 0.5) * (plateHeight / numSigns);
            ctx.fillText(leftSign, leftPlateX - 25, y);
            ctx.fillText(rightSign, rightPlateX + plateWidth + 25, y);
        }

        // sigma_D labels
        const sigmaD = '\u03C3\u1D30';
        let leftInnerLabel = (fieldStrength > 0 ? '-' : '+') + sigmaD;
        let rightInnerLabel = (fieldStrength > 0 ? '+' : '-') + sigmaD;

        ctx.font = 'italic 16px serif';
        const numLabels = Math.ceil((Math.abs(fieldStrength) / 100) * 10);

        for (let i = 0; i < numLabels; i++) {
            const y = plateY + (i + 0.5) * (plateHeight / numLabels);
            ctx.fillText(leftInnerLabel, leftPlateX + plateWidth + 35, y);
            ctx.fillText(rightInnerLabel, rightPlateX - 35, y);
        }

        // Vectors
        const vectorY_E0 = 60;
        const vectorCenterX = width / 2;
        const vectorLength = 40 + (Math.abs(fieldStrength) / 100) * 160;

        let startX_E0 = vectorCenterX - (fieldStrength > 0 ? vectorLength / 2 : -vectorLength / 2);
        let endX_E0 = vectorCenterX + (fieldStrength > 0 ? vectorLength / 2 : -vectorLength / 2);

        drawArrow(ctx, startX_E0, vectorY_E0, endX_E0, vectorY_E0, '#38bdf8');
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 16px "Inter", sans-serif';
        ctx.fillText('E₀', vectorCenterX, vectorY_E0 - 20);
    }
}

function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headLength = 10;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 7), toY - headLength * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 7), toY - headLength * Math.sin(angle + Math.PI / 7));
    ctx.fill();
}

requestAnimationFrame(draw);
