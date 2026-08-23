// src/js/app.js
import { AppState } from './state.js';
import { runPhysicsValidationTests } from '../validation/tests.js';
import { Combined3DView } from './views/combined-view.js';
import { BandView } from './views/band-view.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Crystal Electronic Structure Explorer bootstrapping...');
  
  const state = new AppState();
  
  // Elements
  const materialSelect = document.getElementById('material-select');
  const toggleConventional = document.getElementById('toggle-conventional');
  const togglePrimitive = document.getElementById('toggle-primitive');
  const toggleBonds = document.getElementById('toggle-bonds');
  const toggleScissor = document.getElementById('toggle-scissor');
  const gapDisplay = document.getElementById('calculated-gap-display');
  const tourStepIndicator = document.getElementById('tour-step-indicator');
  const tourDescription = document.getElementById('guided-tour-description');
  const prevStepBtn = document.getElementById('prev-step');
  const nextStepBtn = document.getElementById('next-step');
  const resetCameraBtn = document.getElementById('reset-camera');
  const toggleThemeBtn = document.getElementById('toggle-theme');
  const toggleBZ = document.getElementById('toggle-bz');
  const toggleKPath = document.getElementById('toggle-kpath');
  const toggleSymmetryPts = document.getElementById('toggle-symmetry-pts');
  const closeDebugBtn = document.getElementById('close-debug');
  const debugDashboard = document.getElementById('debug-dashboard');
  const validationList = document.getElementById('validation-list');

  // Load Material
  await state.loadMaterialData('silicon');

  // Instantiate Views
  const combinedView = new Combined3DView('combined-canvas', state);
  const bandView = new BandView('band-canvas', state);

  // Trigger initial rendering
  combinedView.renderStructure();
  combinedView.renderBrillouinZone();
  bandView.renderBands();

  // Blend Slider
  const blendSlider = document.getElementById('blend-slider');
  if (blendSlider) {
    // Initial blend
    combinedView.setBlendWeight(parseFloat(blendSlider.value));
    blendSlider.addEventListener('input', (e) => {
      combinedView.setBlendWeight(parseFloat(e.target.value));
    });
  }

  // Set initial display
  gapDisplay.textContent = `Calculated Gap: ${state.bands.calculatedGap.toFixed(3)} eV`;

  // Define Guided Tour Steps (Stage 1 to 15)
  const tourSteps = [
    { title: "Stage 1 — Silicon Atom and Bonding", text: "Silicon is a Group 14 element with 4 valence electrons. In the bulk crystal, each silicon atom shares its electrons by forming covalent bonds with four nearest neighbors in a tetrahedral coordination structure." },
    { title: "Stage 2 — Diamond Cubic Structure", text: "Silicon crystallizes in the diamond cubic structure. The conventional unit cell consists of two interpenetrating FCC sublattices shifted by (1/4, 1/4, 1/4) of the cell dimension, containing a total of 8 atoms." },
    { title: "Stage 3 — Bravais Lattice + Basis", text: "Mathematically, the diamond structure is defined as a Face-Centered Cubic (FCC) Bravais lattice with a two-atom basis: Si at (0,0,0) and Si at (1/4, 1/4, 1/4) in fractional conventional coordinates." },
    { title: "Stage 4 — Conventional vs Primitive Cell", text: "The conventional cubic cell (8 atoms, volume a³) clearly displays the cubic symmetry. The primitive cell (2 atoms, volume a³/4) is the smallest repeating unit that can translate to span the entire lattice." },
    { title: "Stage 5 — Primitive Vectors", text: "The primitive real-space lattice vectors are: a₁ = a/2(0,1,1), a₂ = a/2(1,0,1), a₃ = a/2(1,1,0). These vectors define the translation symmetry of the FCC lattice." },
    { title: "Stage 6 — Reciprocal Vectors", text: "From the real-space primitive vectors, we construct the reciprocal lattice primitive vectors: b₁ = 2π/a(-1,1,1), b₂ = 2π/a(1,-1,1), b₃ = 2π/a(1,1,-1)." },
    { title: "Stage 7 — Reciprocal Lattice", text: "The reciprocal lattice of an FCC real-space lattice is a Body-Centered Cubic (BCC) lattice. Reciprocal lattice points represent the Fourier components of the periodic crystal potential." },
    { title: "Stage 8 — First Brillouin Zone", text: "The first Brillouin zone is the Wigner-Seitz cell of the reciprocal lattice. For the FCC lattice, this forms a truncated octahedron with 14 faces (6 squares and 8 hexagons), 24 vertices, and 36 edges." },
    { title: "Stage 9 — Special Points", text: "Due to lattice symmetry, certain reciprocal coordinates are highly symmetric. Key points include Γ (origin), X (square face center), L (hexagonal face center), K (edge intersection), U, and W." },
    { title: "Stage 10 — Symmetry Lines", text: "Paths connecting these special points represent symmetry directions. Click to highlight: <span class='interactive-segment-link' data-seg='delta'>&Delta; (&Gamma; to X)</span>, <span class='interactive-segment-link' data-seg='lambda'>&Lambda; (&Gamma; to L)</span>, or <span class='interactive-segment-link' data-seg='sigma'>&Sigma; (&Gamma; to K)</span>." },
    { title: "Stage 11 — Select k-path", text: "Instead of mapping all 3D k-points, we sample eigenvalues along a closed high-symmetry path. Our teaching path is L → Γ → X → U and K → Γ." },
    { title: "Stage 12 — Flatten the k-path", text: "We plot the physical Cartesian distance along the 3D k-path segments as a continuous 1D horizontal axis on our electronic band diagram." },
    { title: "Stage 13 — Introduce E_n(k)", text: "At each wavevector k, the electron's quantum states are solutions to the Schrödinger equation, yielding discrete energies E_n(k) split into valence (filled) and conduction (empty) bands." },
    { title: "Stage 14 — Explore Band Structure", text: "Drag the cursor along the band diagram. Watch the red indicator trace the corresponding wavevector k inside the 3D Brillouin zone. Observe the gap between the filled valence bands and empty conduction bands." },
    { title: "Stage 15 — Indirect Gap", text: "Silicon is an indirect bandgap semiconductor. Its valence band maximum (VBM) is at Γ, but its conduction band minimum (CBM) occurs along the Δ line (~85% towards X). The different k-values mean transition requires a phonon (lattice vibration)." }
  ];

  // Update Tour Step UI
  function updateTourUI() {
    const step = state.presentation.teachingStep;
    tourStepIndicator.textContent = `Stage ${step + 1} / ${tourSteps.length}`;
    tourDescription.innerHTML = `<strong>${tourSteps[step].title}</strong><p>${tourSteps[step].text}</p>`;
    
    prevStepBtn.disabled = step === 0;
    nextStepBtn.disabled = step === tourSteps.length - 1;

    // Reset active path segment by default
    state.setActivePathSegment(null);

    // If step is 9 (Stage 10), bind interactive links
    if (step === 9) {
      const links = tourDescription.querySelectorAll('.interactive-segment-link');
      links.forEach(link => {
        link.style.color = 'var(--accent-orange)';
        link.style.textDecoration = 'underline';
        link.style.cursor = 'pointer';
        link.style.fontWeight = '600';
        
        link.addEventListener('click', () => {
          const seg = link.getAttribute('data-seg');
          state.setActivePathSegment(seg);
        });
      });
    }
  }

  // State Change Listener
  state.subscribe((s, eventType) => {
    console.log(`State updated: ${eventType}`);
    
    if (eventType === 'K_CHANGED') {
      const activeK = s.physics.activeK;
      // In Phase 1, we log the coordinates of the active K to console or details
      const detailContainer = document.getElementById('selection-details-content');
      if (detailContainer) {
        detailContainer.innerHTML = `
          <strong>Active Wavevector (k)</strong><br>
          Segment: ${s.bands.branches[activeK.branchIndex].name}<br>
          Fractional: [${activeK.fractional.map(v => v.toFixed(3)).join(', ')}]<br>
          Cartesian (normalized 2&pi;/a): [${activeK.cartesian.map(v => v.toFixed(3)).join(', ')}]<br>
          Cumulative distance: ${activeK.s.toFixed(3)} Å⁻¹<br>
          Discontinuity: ${activeK.discontinuity ? 'YES (Jumping U &rarr; K)' : 'NO'}<br>
          Active Band Energies:<br>
          ${activeK.energies.map((e, idx) => `Band ${idx}: ${e.toFixed(3)} eV`).join('<br>')}
        `;
      }
    }
    
    if (eventType === 'SCISSOR_CHANGED') {
      const currentGap = s.physics.scissorEnabled ? s.bands.experimentalGap : s.bands.calculatedGap;
      gapDisplay.textContent = `${s.physics.scissorEnabled ? 'Scissor-Corrected' : 'Calculated'} Gap: ${currentGap.toFixed(3)} eV`;
    }

    if (eventType === 'TOUR_STEP_CHANGED') {
      updateTourUI();
    }
  });

  // Event Listeners for UI toggles
  toggleConventional.addEventListener('change', (e) => {
    if (e.target.checked) {
      togglePrimitive.checked = false;
      state.setCellType('conventional');
    }
  });

  togglePrimitive.addEventListener('change', (e) => {
    if (e.target.checked) {
      toggleConventional.checked = false;
      state.setCellType('primitive');
    }
  });

  toggleBonds.addEventListener('change', (e) => {
    state.setBondsVisible(e.target.checked);
  });

  toggleScissor.addEventListener('change', (e) => {
    state.setScissorEnabled(e.target.checked);
  });

  if (toggleBZ) {
    toggleBZ.addEventListener('change', (e) => {
      state.setBZBoundaryVisible(e.target.checked);
    });
  }
  if (toggleKPath) {
    toggleKPath.addEventListener('change', (e) => {
      state.setKPathVisible(e.target.checked);
    });
  }
  if (toggleSymmetryPts) {
    toggleSymmetryPts.addEventListener('change', (e) => {
      state.setSpecialPointsVisible(e.target.checked);
    });
  }

  prevStepBtn.addEventListener('click', () => {
    const step = state.presentation.teachingStep;
    if (step > 0) state.setTeachingStep(step - 1);
  });

  nextStepBtn.addEventListener('click', () => {
    const step = state.presentation.teachingStep;
    if (step < tourSteps.length - 1) state.setTeachingStep(step + 1);
  });

  resetCameraBtn.addEventListener('click', () => {
    console.log('Reset camera triggered');
    if (combinedView.controls) combinedView.controls.reset();
  });

  toggleThemeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme');
  });

  // Tab switching logic
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });

  // Close Debug overlay
  if (closeDebugBtn && debugDashboard) {
    closeDebugBtn.addEventListener('click', () => {
      debugDashboard.style.display = 'none';
    });
  }

  // Initialize UI Text
  updateTourUI();

  // Run Physics Validation Suite if debug=1 is set
  if (debugDashboard && validationList) {
    const testResult = runPhysicsValidationTests(state);
    validationList.innerHTML = '';
    
    testResult.logs.forEach(log => {
      const li = document.createElement('li');
      li.className = `log-${log.status.toLowerCase()}`;
      li.innerHTML = `<strong>[${log.status}]</strong> ${log.message}`;
      validationList.appendChild(li);
    });

    if (testResult.allPassed) {
      const summary = document.createElement('li');
      summary.className = 'log-pass log-summary';
      summary.innerHTML = '<strong>[SUCCESS] All physical and mathematical validations passed successfully!</strong>';
      validationList.appendChild(summary);
    } else {
      const summary = document.createElement('li');
      summary.className = 'log-fail log-summary';
      summary.innerHTML = '<strong>[FAILURE] One or more validations failed. Check the logs above.</strong>';
      validationList.appendChild(summary);
    }
  }

  // Trigger initial set K change log
  state.setPathDistance(state.bands.branches[0].distances[0], true);
});
