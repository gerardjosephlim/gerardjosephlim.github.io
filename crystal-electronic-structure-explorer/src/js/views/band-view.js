// src/js/views/band-view.js

export class BandView {
  constructor(containerId, state) {
    this.container = document.getElementById(containerId);
    this.state = state;
    
    this.svg = null;
    this.padding = { top: 30, right: 20, bottom: 40, left: 45 };
    this.width = 0;
    this.height = 0;
    
    // Scale mappings
    this.scaleX = null;
    this.scaleY = null;
    this.minY = -13;
    this.maxY = 6;
    
    this.isDragging = false;
    
    this.init();
    
    this.state.subscribe((s, eventType) => {
      if (eventType === 'DATA_LOADED' || eventType === 'SCISSOR_CHANGED' || eventType === 'PATH_SEGMENT_CHANGED') {
        this.renderBands();
      }
      if (eventType === 'K_CHANGED') {
        this.updateCursorPosition();
      }
    });
  }

  init() {
    this.width = this.container.clientWidth || 300;
    this.height = this.container.clientHeight || 300;

    // Create SVG element
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.cursor = 'ew-resize';
    this.container.appendChild(this.svg);

    // Setup Scales
    this.updateScales();

    // Event Listeners for dragging
    this.svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
    
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.updateScales();
      this.renderBands();
    });
  }

  updateScales() {
    if (!this.state.bands) return;

    // Find min/max path distance
    const branches = this.state.bands.branches;
    const minX = branches[0].distances[0];
    const maxX = branches[branches.length - 1].distances[branches[branches.length - 1].distances.length - 1];

    // scale functions
    this.scaleX = (x) => {
      return this.padding.left + ((x - minX) / (maxX - minX)) * (this.width - this.padding.left - this.padding.right);
    };

    this.invertX = (screenX) => {
      const frac = (screenX - this.padding.left) / (this.width - this.padding.left - this.padding.right);
      return minX + frac * (maxX - minX);
    };

    this.scaleY = (y) => {
      return this.padding.top + ((this.maxY - y) / (this.maxY - this.minY)) * (this.height - this.padding.top - this.padding.bottom);
    };
  }

  renderBands() {
    if (!this.state.bands) return;

    this.updateScales();
    
    // Clear SVG
    this.svg.innerHTML = '';

    const branches = this.state.bands.branches;
    const a = this.state.material.latticeConstant;
    const factor = 2 * Math.PI / a;

    // Draw active path segment highlight
    const activeSeg = this.state.physics.activePathSegment;
    const segmentRanges = {
      lambda: [branches[0].distances[0], branches[0].distances[20]],
      delta: [branches[0].distances[20], branches[0].distances[40]],
      sigma: [branches[1].distances[0], branches[1].distances[20]]
    };
    if (activeSeg && segmentRanges[activeSeg]) {
      const [sStart, sEnd] = segmentRanges[activeSeg];
      const xStart = this.scaleX(sStart);
      const xEnd = this.scaleX(sEnd);
      const highlight = this.createSVGElement('rect', {
        x: xStart,
        y: this.padding.top,
        width: xEnd - xStart,
        height: this.height - this.padding.top - this.padding.bottom,
        fill: 'var(--accent-orange)',
        opacity: 0.12
      });
      this.svg.appendChild(highlight);
    }

    // Draw Grid Lines (horizontal energy ticks)
    for (let e = this.minY; e <= this.maxY; e += 2) {
      if (e === 0) continue; // draw VBM line separately
      const y = this.scaleY(e);
      const line = this.createSVGElement('line', {
        x1: this.padding.left,
        y1: y,
        x2: this.width - this.padding.right,
        y2: y,
        stroke: 'var(--border-color)',
        'stroke-width': 1,
        'stroke-dasharray': '2,4'
      });
      this.svg.appendChild(line);

      // Energy text label
      const text = this.createSVGElement('text', {
        x: this.padding.left - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-secondary)',
        'font-size': '0.75rem',
        'font-family': 'var(--font-mono)'
      });
      text.textContent = `${e}`;
      this.svg.appendChild(text);
    }

    // High symmetry point ticks and labels
    // Path: L (0.0) -> G (~1.002) -> X (~2.159) -> U (~2.568) || K (~2.684) -> G (~3.911)
    const hsTicks = [
      { label: 'L', dist: branches[0].distances[0] },
      { label: 'Γ', dist: branches[0].distances[20] }, // index of G
      { label: 'X', dist: branches[0].distances[40] }, // index of X
      { label: 'U', dist: branches[0].distances[48] }, // index of U
      { label: 'K', dist: branches[1].distances[0] },
      { label: 'Γ', dist: branches[1].distances[20] }
    ];

    hsTicks.forEach(tick => {
      const x = this.scaleX(tick.dist);
      
      // Vertical line
      const line = this.createSVGElement('line', {
        x1: x,
        y1: this.padding.top,
        x2: x,
        y2: this.height - this.padding.bottom,
        stroke: 'var(--border-color)',
        'stroke-width': 1
      });
      this.svg.appendChild(line);

      // Label text
      const text = this.createSVGElement('text', {
        x: x,
        y: this.height - this.padding.bottom + 18,
        'text-anchor': 'middle',
        fill: 'var(--text-primary)',
        'font-size': '0.85rem',
        'font-weight': '600'
      });
      text.textContent = tick.label;
      this.svg.appendChild(text);
    });

    // Draw path segment labels (Lambda, Delta, Sigma) above the chart
    const segmentLabels = [
      { label: 'Λ', startDist: branches[0].distances[0], endDist: branches[0].distances[20] },
      { label: 'Δ', startDist: branches[0].distances[20], endDist: branches[0].distances[40] },
      { label: 'Σ', startDist: branches[1].distances[0], endDist: branches[1].distances[20] }
    ];

    segmentLabels.forEach(seg => {
      const xMid = this.scaleX((seg.startDist + seg.endDist) / 2);
      const text = this.createSVGElement('text', {
        x: xMid,
        y: this.padding.top - 8,
        'text-anchor': 'middle',
        fill: 'var(--accent-orange)',
        'font-size': '0.85rem',
        'font-weight': '600'
      });
      text.textContent = seg.label;
      this.svg.appendChild(text);
    });

    // Draw the Discontinuity visual break (between U and K)
    const xU = this.scaleX(branches[0].distances[branches[0].distances.length - 1]);
    const xK = this.scaleX(branches[1].distances[0]);
    
    // Grey rectangle or hashed area between U and K
    const breakRect = this.createSVGElement('rect', {
      x: xU,
      y: this.padding.top,
      width: xK - xU,
      height: this.height - this.padding.top - this.padding.bottom,
      fill: 'var(--bg-tertiary)',
      opacity: 0.5
    });
    this.svg.appendChild(breakRect);

    // Hashed break lines
    const breakLine1 = this.createSVGElement('line', {
      x1: xU + 3,
      y1: this.padding.top,
      x2: xU + 3,
      y2: this.height - this.padding.bottom,
      stroke: 'var(--border-color)',
      'stroke-width': 1.5,
      'stroke-dasharray': '5,3'
    });
    const breakLine2 = this.createSVGElement('line', {
      x1: xK - 3,
      y1: this.padding.top,
      x2: xK - 3,
      y2: this.height - this.padding.bottom,
      stroke: 'var(--border-color)',
      'stroke-width': 1.5,
      'stroke-dasharray': '5,3'
    });
    this.svg.appendChild(breakLine1);
    this.svg.appendChild(breakLine2);

    // Draw VBM (Valence Band Maximum) line
    const yVBM = this.scaleY(0.0);
    const vbmLine = this.createSVGElement('line', {
      x1: this.padding.left,
      y1: yVBM,
      x2: this.width - this.padding.right,
      y2: yVBM,
      stroke: 'var(--accent-cyan)',
      'stroke-width': 1.5
    });
    this.svg.appendChild(vbmLine);

    const vbmText = this.createSVGElement('text', {
      x: this.width - this.padding.right - 5,
      y: yVBM - 6,
      'text-anchor': 'end',
      fill: 'var(--accent-cyan)',
      'font-size': '0.7rem',
      'font-weight': '600'
    });
    vbmText.textContent = 'VBM (0.0 eV)';
    this.svg.appendChild(vbmText);

    // Draw CBM (Conduction Band Minimum) line
    const calcGap = this.state.bands.calculatedGap;
    const targetGap = this.state.bands.experimentalGap;
    const currentGap = this.state.physics.scissorEnabled ? targetGap : calcGap;
    
    const yCBM = this.scaleY(currentGap);
    const cbmLine = this.createSVGElement('line', {
      x1: this.padding.left,
      y1: yCBM,
      x2: this.width - this.padding.right,
      y2: yCBM,
      stroke: 'var(--accent-orange)',
      'stroke-width': 1.5,
      'stroke-dasharray': '4,4'
    });
    this.svg.appendChild(cbmLine);

    const cbmText = this.createSVGElement('text', {
      x: this.width - this.padding.right - 5,
      y: yCBM + 14,
      'text-anchor': 'end',
      fill: 'var(--accent-orange)',
      'font-size': '0.7rem',
      'font-weight': '600'
    });
    cbmText.textContent = `CBM (${currentGap.toFixed(3)} eV)`;
    this.svg.appendChild(cbmText);

    // Render Band Curves
    // 4 Valence Bands (0-3, Cyan) and 4 Conduction Bands (4-7, Purple)
    branches.forEach(branch => {
      const distances = branch.distances;
      const numPoints = distances.length;
      
      for (let b = 0; b < 8; b++) {
        let rawEnergies = branch.energies[b];
        
        // Apply scissor correction to conduction bands (4-7)
        let energies = [...rawEnergies];
        if (this.state.physics.scissorEnabled && b >= 4) {
          const deltaScissor = targetGap - calcGap;
          energies = energies.map(e => e + deltaScissor);
        }

        // Build SVG path
        let pathD = `M ${this.scaleX(distances[0])} ${this.scaleY(energies[0])}`;
        for (let i = 1; i < numPoints; i++) {
          pathD += ` L ${this.scaleX(distances[i])} ${this.scaleY(energies[i])}`;
        }

        const isValence = b < 4;
        const curve = this.createSVGElement('path', {
          d: pathD,
          fill: 'none',
          stroke: isValence ? 'var(--accent-cyan)' : 'var(--accent-purple)',
          'stroke-width': 2.0,
          opacity: 0.8
        });
        this.svg.appendChild(curve);
      }
    });

    // Label Y-Axis
    const yAxisText = this.createSVGElement('text', {
      x: 15,
      y: 20,
      fill: 'var(--text-primary)',
      'font-size': '0.8rem',
      'font-weight': '600'
    });
    yAxisText.textContent = 'Energy (eV)';
    this.svg.appendChild(yAxisText);

    // Label X-Axis
    const xAxisText = this.createSVGElement('text', {
      x: this.width - this.padding.right,
      y: this.height - 10,
      'text-anchor': 'end',
      fill: 'var(--text-primary)',
      'font-size': '0.8rem',
      'font-weight': '600'
    });
    xAxisText.textContent = 'Wavevector path (Å⁻¹)';
    this.svg.appendChild(xAxisText);

    // Active Cursor Container (rendered on top of bands)
    this.cursorGroup = this.createSVGElement('g', { id: 'active-cursor-group' });
    this.svg.appendChild(this.cursorGroup);
    
    this.updateCursorPosition();
  }

  updateCursorPosition() {
    if (!this.state.physics.activeK || !this.scaleX || !this.cursorGroup) return;
    
    // Clear old cursor elements
    this.cursorGroup.innerHTML = '';

    const activeK = this.state.physics.activeK;
    const x = this.scaleX(activeK.s);

    // 1. Draw vertical cursor line
    const line = this.createSVGElement('line', {
      x1: x,
      y1: this.padding.top,
      x2: x,
      y2: this.height - this.padding.bottom,
      stroke: 'var(--accent-red)',
      'stroke-width': 1.5,
      opacity: 0.9
    });
    this.cursorGroup.appendChild(line);

    // 2. Draw circles at intersections
    activeK.energies.forEach((energy, idx) => {
      const y = this.scaleY(energy);
      const isValence = idx < 4;
      
      const circle = this.createSVGElement('circle', {
        cx: x,
        cy: y,
        r: 4.5,
        fill: 'var(--bg-secondary)',
        stroke: isValence ? 'var(--accent-cyan)' : 'var(--accent-purple)',
        'stroke-width': 2
      });
      
      this.cursorGroup.appendChild(circle);
    });

    // 3. Draw active K coordinate text indicator
    const labelBox = this.createSVGElement('rect', {
      x: Math.max(this.padding.left, Math.min(this.width - this.padding.right - 100, x - 50)),
      y: this.padding.top - 20,
      width: 110,
      height: 18,
      fill: 'var(--bg-secondary)',
      stroke: 'var(--border-color)',
      'stroke-width': 1,
      rx: 3
    });
    this.cursorGroup.appendChild(labelBox);

    const labelText = this.createSVGElement('text', {
      x: Math.max(this.padding.left, Math.min(this.width - this.padding.right - 100, x - 50)) + 55,
      y: this.padding.top - 7,
      'text-anchor': 'middle',
      fill: 'var(--accent-red)',
      'font-size': '0.65rem',
      'font-family': 'var(--font-mono)'
    });
    labelText.textContent = `k = ${activeK.s.toFixed(3)} Å⁻¹`;
    this.cursorGroup.appendChild(labelText);
  }

  // Pointer event handlers
  onPointerDown(e) {
    this.isDragging = true;
    this.svg.setPointerCapture(e.pointerId);
    this.handlePointerX(e.clientX);
  }

  onPointerMove(e) {
    if (this.isDragging) {
      this.handlePointerX(e.clientX);
    }
  }

  onPointerUp() {
    this.isDragging = false;
  }

  handlePointerX(clientX) {
    const rect = this.svg.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    
    // Clamp inside plot boundaries
    const minPlotX = this.padding.left;
    const maxPlotX = this.width - this.padding.right;
    const clampedX = Math.max(minPlotX, Math.min(maxPlotX, relativeX));
    
    // Convert to s coordinate (Å^-1)
    const s = this.invertX(clampedX);
    
    // Set in global state
    this.state.setPathDistance(s);
  }

  createSVGElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }
}
