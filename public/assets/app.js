(() => {
  // src/js/physics/kpath.js
  function findPathCoordinatesForDistance(s, branches) {
    for (let bIdx = 0; bIdx < branches.length; bIdx++) {
      const branch = branches[bIdx];
      const distances = branch.distances;
      const sStart = distances[0];
      const sEnd = distances[distances.length - 1];
      if (s >= sStart && s <= sEnd) {
        for (let i = 0; i < distances.length - 1; i++) {
          const d1 = distances[i];
          const d2 = distances[i + 1];
          if (s >= d1 && s <= d2) {
            const denom = d2 - d1;
            const t = denom === 0 ? 0 : (s - d1) / denom;
            return {
              branchIndex: bIdx,
              kIndex: i,
              t,
              discontinuity: false
            };
          }
        }
      }
      if (bIdx < branches.length - 1) {
        const nextBranch = branches[bIdx + 1];
        const nextStart = nextBranch.distances[0];
        if (s > sEnd && s < nextStart) {
          return {
            branchIndex: bIdx,
            kIndex: distances.length - 1,
            t: 1,
            discontinuity: true
          };
        }
      }
    }
    if (s < branches[0].distances[0]) {
      return { branchIndex: 0, kIndex: 0, t: 0, discontinuity: false };
    }
    const lastBIdx = branches.length - 1;
    const lastBranch = branches[lastBIdx];
    return {
      branchIndex: lastBIdx,
      kIndex: lastBranch.distances.length - 2,
      t: 1,
      discontinuity: false
    };
  }
  function interpolateKPoint(k1, k2, t) {
    return [
      k1[0] + (k2[0] - k1[0]) * t,
      k1[1] + (k2[1] - k1[1]) * t,
      k1[2] + (k2[2] - k1[2]) * t
    ];
  }
  function interpolateEnergies(branch, kIndex, t) {
    const energies = branch.energies;
    const numBands = energies.length;
    const interpolated = [];
    for (let b = 0; b < numBands; b++) {
      const e1 = energies[b][kIndex];
      const e2 = energies[b][kIndex + 1];
      interpolated.push(e1 + (e2 - e1) * t);
    }
    return interpolated;
  }

  // src/js/state.js
  var AppState = class {
    constructor() {
      this.material = null;
      this.bands = null;
      this.physics = {
        activeK: {
          branchIndex: 0,
          kIndex: 0,
          t: 0,
          fractional: [0, 0, 0],
          cartesian: [0, 0, 0],
          // in units of 2pi/a
          s: 0,
          // cumulative path distance in Å^-1
          discontinuity: false,
          energies: []
          // interpolated energies at current k
        },
        activeBand: null,
        energyReference: "VBM",
        // VBM or Fermi
        scissorEnabled: false,
        // off by default
        activePathSegment: null
        // null, 'lambda', 'delta', 'sigma'
      };
      this.presentation = {
        viewMode: "split",
        // split, crystal, reciprocal, bands
        showBonds: true,
        showCellType: "conventional",
        // conventional, primitive
        showBZBoundary: true,
        showKPath: true,
        showSpecialPoints: true,
        teachingStep: 0,
        isPlayingTour: false
      };
      this.listeners = [];
    }
    // Subscribe to state updates
    subscribe(callback) {
      this.listeners.push(callback);
      return () => {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
      };
    }
    // Notify all subscribers of state changes
    notify(changeType) {
      for (const listener of this.listeners) {
        listener(this, changeType);
      }
    }
    // Initialize data from PHP endpoints
    async loadMaterialData(materialId) {
      try {
        const apiBase = window.location.protocol === "file:" ? "http://localhost:8000" : "";
        const structRes = await fetch(`${apiBase}/api/material.php?id=${materialId}`);
        if (!structRes.ok)
          throw new Error(`HTTP error loading structure: ${structRes.status}`);
        this.material = await structRes.json();
        const bandsRes = await fetch(`${apiBase}/api/bands.php?material=${materialId}`);
        if (!bandsRes.ok)
          throw new Error(`HTTP error loading bands: ${bandsRes.status}`);
        this.bands = await bandsRes.json();
        this.setPathDistance(this.bands.branches[0].distances[0], false);
        this.notify("DATA_LOADED");
      } catch (e) {
        console.error("Failed to load material data:", e);
        throw e;
      }
    }
    // Set the active k position by specifying the path distance 's' (in Å^-1)
    setPathDistance(s, triggerNotify = true) {
      if (!this.bands)
        return;
      const coord = findPathCoordinatesForDistance(s, this.bands.branches);
      const branch = this.bands.branches[coord.branchIndex];
      const k1 = branch.kpoints[coord.kIndex];
      const k2 = coord.kIndex < branch.kpoints.length - 1 ? branch.kpoints[coord.kIndex + 1] : k1;
      const fracK = interpolateKPoint(k1, k2, coord.t);
      const kc1 = branch.kpointsCartesian[coord.kIndex];
      const kc2 = coord.kIndex < branch.kpointsCartesian.length - 1 ? branch.kpointsCartesian[coord.kIndex + 1] : kc1;
      const cartK = interpolateKPoint(kc1, kc2, coord.t);
      const baseEnergies = interpolateEnergies(branch, coord.kIndex, coord.t);
      let finalEnergies = [...baseEnergies];
      if (this.physics.scissorEnabled) {
        const calcGap = this.bands.calculatedGap;
        const targetGap = this.bands.experimentalGap;
        const deltaScissor = targetGap - calcGap;
        for (let b = 4; b < finalEnergies.length; b++) {
          finalEnergies[b] += deltaScissor;
        }
      }
      this.physics.activeK = {
        branchIndex: coord.branchIndex,
        kIndex: coord.kIndex,
        t: coord.t,
        fractional: fracK,
        cartesian: cartK,
        s,
        discontinuity: coord.discontinuity,
        energies: finalEnergies
      };
      if (triggerNotify) {
        this.notify("K_CHANGED");
      }
    }
    setScissorEnabled(enabled) {
      this.physics.scissorEnabled = enabled;
      this.setPathDistance(this.physics.activeK.s, false);
      this.notify("SCISSOR_CHANGED");
    }
    setViewMode(mode) {
      this.presentation.viewMode = mode;
      this.notify("VIEW_MODE_CHANGED");
    }
    setCellType(type) {
      this.presentation.showCellType = type;
      this.notify("CELL_TYPE_CHANGED");
    }
    setBondsVisible(visible) {
      this.presentation.showBonds = visible;
      this.notify("BONDS_VISIBILITY_CHANGED");
    }
    setTeachingStep(step) {
      this.presentation.teachingStep = step;
      this.notify("TOUR_STEP_CHANGED");
    }
    setActivePathSegment(segment) {
      this.physics.activePathSegment = segment;
      this.notify("PATH_SEGMENT_CHANGED");
    }
    setBZBoundaryVisible(visible) {
      this.presentation.showBZBoundary = visible;
      this.notify("BZ_VISIBILITY_CHANGED");
    }
    setKPathVisible(visible) {
      this.presentation.showKPath = visible;
      this.notify("KPATH_VISIBILITY_CHANGED");
    }
    setSpecialPointsVisible(visible) {
      this.presentation.showSpecialPoints = visible;
      this.notify("SPECIAL_POINTS_VISIBILITY_CHANGED");
    }
  };

  // src/js/physics/vector.js
  function add(v1, v2) {
    return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
  }
  function sub(v1, v2) {
    return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
  }
  function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }
  function dot(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  }
  function cross(v1, v2) {
    return [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ];
  }
  function norm(v) {
    return Math.sqrt(dot(v, v));
  }
  function normalize(v) {
    const n = norm(v);
    if (n === 0)
      return [0, 0, 0];
    return scale(v, 1 / n);
  }
  function det3x3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  function invert3x3(m) {
    const d = det3x3(m);
    if (Math.abs(d) < 1e-12) {
      throw new Error("Matrix is singular and cannot be inverted.");
    }
    const invDet = 1 / d;
    return [
      [
        (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet,
        (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet,
        (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet
      ],
      [
        (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet,
        (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet,
        (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet
      ],
      [
        (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet,
        (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet,
        (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet
      ]
    ];
  }
  function matrixVectorMultiply(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  // src/js/physics/reciprocal-lattice.js
  function calculateReciprocalVectors(primitiveVectors) {
    const [a1, a2, a3] = primitiveVectors;
    const a2_cross_a3 = cross(a2, a3);
    const vp = dot(a1, a2_cross_a3);
    if (Math.abs(vp) < 1e-6) {
      throw new Error("Real space primitive vectors must span a non-zero volume.");
    }
    const b1 = scale(cross(a2, a3), 2 * Math.PI / vp);
    const b2 = scale(cross(a3, a1), 2 * Math.PI / vp);
    const b3 = scale(cross(a1, a2), 2 * Math.PI / vp);
    return [b1, b2, b3];
  }
  function verifyOrthogonality(primitiveVectors, reciprocalVectors, tolerance = 1e-5) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dotProd = dot(primitiveVectors[i], reciprocalVectors[j]);
        const expected = i === j ? 2 * Math.PI : 0;
        if (Math.abs(dotProd - expected) > tolerance) {
          return {
            pass: false,
            error: `Orthogonality failed: a[${i + 1}] . b[${j + 1}] = ${dotProd.toFixed(6)} (expected ${expected.toFixed(6)})`
          };
        }
      }
    }
    return { pass: true };
  }

  // src/js/physics/brillouin-zone.js
  function generateBrillouinZone(reciprocalVectors) {
    const [b1, b2, b3] = reciprocalVectors;
    const gPoints = [];
    const maxRange = 2;
    for (let h = -maxRange; h <= maxRange; h++) {
      for (let k = -maxRange; k <= maxRange; k++) {
        for (let l = -maxRange; l <= maxRange; l++) {
          if (h === 0 && k === 0 && l === 0)
            continue;
          const g = [
            h * b1[0] + k * b2[0] + l * b3[0],
            h * b1[1] + k * b2[1] + l * b3[1],
            h * b1[2] + k * b2[2] + l * b3[2]
          ];
          gPoints.push(g);
        }
      }
    }
    gPoints.sort((gA, gB) => norm(gA) - norm(gB));
    const numPlanesToKeep = Math.min(30, gPoints.length);
    const planes = [];
    for (let i = 0; i < numPlanesToKeep; i++) {
      const g = gPoints[i];
      const len = norm(g);
      planes.push({
        normal: normalize(g),
        distance: 0.5 * len,
        g
      });
    }
    const candidates = [];
    const tol = 1e-4;
    for (let i = 0; i < planes.length; i++) {
      for (let j = i + 1; j < planes.length; j++) {
        for (let k = j + 1; k < planes.length; k++) {
          const p1 = planes[i];
          const p2 = planes[j];
          const p3 = planes[k];
          const m = [p1.normal, p2.normal, p3.normal];
          const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
          if (Math.abs(det) < 1e-6)
            continue;
          try {
            const mInv = invert3x3(m);
            const x = matrixVectorMultiply(mInv, [p1.distance, p2.distance, p3.distance]);
            let isValid = true;
            for (let pIdx = 0; pIdx < planes.length; pIdx++) {
              if (pIdx === i || pIdx === j || pIdx === k)
                continue;
              const plane = planes[pIdx];
              const proj = dot(x, plane.normal);
              if (proj > plane.distance + tol) {
                isValid = false;
                break;
              }
            }
            if (isValid) {
              candidates.push(x);
            }
          } catch (e) {
          }
        }
      }
    }
    const vertices = [];
    for (const c of candidates) {
      let isDup = false;
      for (const v of vertices) {
        if (norm(sub(c, v)) < tol) {
          isDup = true;
          break;
        }
      }
      if (!isDup) {
        vertices.push(c);
      }
    }
    const faces = [];
    for (const p of planes) {
      const faceVertexIndices = [];
      for (let vIdx = 0; vIdx < vertices.length; vIdx++) {
        const v = vertices[vIdx];
        const proj = dot(v, p.normal);
        if (Math.abs(proj - p.distance) < tol) {
          faceVertexIndices.push(vIdx);
        }
      }
      if (faceVertexIndices.length >= 3) {
        const faceCenter = faceVertexIndices.reduce(
          (sum, idx) => add(sum, vertices[idx]),
          [0, 0, 0]
        ).map((val) => val / faceVertexIndices.length);
        const v0 = vertices[faceVertexIndices[0]];
        const u1 = normalize(sub(v0, faceCenter));
        const u2 = normalize(cross(p.normal, u1));
        faceVertexIndices.sort((idxA, idxB) => {
          const dA = sub(vertices[idxA], faceCenter);
          const dB = sub(vertices[idxB], faceCenter);
          const angleA = Math.atan2(dot(dA, u2), dot(dA, u1));
          const angleB = Math.atan2(dot(dB, u2), dot(dB, u1));
          return angleA - angleB;
        });
        faces.push(faceVertexIndices);
      }
    }
    return { vertices, faces };
  }
  function verifyFCCBrillouinZoneTopology(bzResult) {
    const { vertices, faces } = bzResult;
    const numVertices = vertices.length;
    const numFaces = faces.length;
    if (numVertices !== 24 || numFaces !== 14) {
      return {
        pass: false,
        error: `Expected 24 vertices and 14 faces for FCC BZ, got ${numVertices} vertices and ${numFaces} faces.`
      };
    }
    let squares = 0;
    let hexagons = 0;
    let edgesCount = 0;
    const edgeSet = /* @__PURE__ */ new Set();
    for (const f of faces) {
      const len = f.length;
      if (len === 4)
        squares++;
      else if (len === 6)
        hexagons++;
      else {
        return {
          pass: false,
          error: `Unexpected face with ${len} edges in FCC BZ.`
        };
      }
      for (let i = 0; i < len; i++) {
        const idx1 = Math.min(f[i], f[(i + 1) % len]);
        const idx2 = Math.max(f[i], f[(i + 1) % len]);
        edgeSet.add(`${idx1}-${idx2}`);
      }
    }
    edgesCount = edgeSet.size;
    if (squares !== 6 || hexagons !== 8 || edgesCount !== 36) {
      return {
        pass: false,
        error: `Expected 6 square faces, 8 hexagonal faces, and 36 edges. Got ${squares} squares, ${hexagons} hexagons, and ${edgesCount} edges.`
      };
    }
    const euler = numVertices - edgesCount + numFaces;
    if (euler !== 2) {
      return {
        pass: false,
        error: `Euler characteristic failed: V - E + F = ${euler} (expected 2)`
      };
    }
    return { pass: true };
  }

  // src/js/physics/coordinates.js
  function conventionalToCartesianReal(fracCoord, a) {
    return scale(fracCoord, a);
  }
  function fractionalToNormalizedCartesianReciprocal(fracCoord) {
    const [h, k, l] = fracCoord;
    return [
      -h + k + l,
      h - k + l,
      h + k - l
    ];
  }

  // src/validation/tests.js
  function runPhysicsValidationTests(state) {
    const logs = [];
    let allPassed = true;
    function assert(condition, message) {
      if (condition) {
        logs.push({ status: "PASS", message });
      } else {
        logs.push({ status: "FAIL", message });
        allPassed = false;
      }
    }
    try {
      logs.push({ status: "INFO", message: "Starting Crystal Electronic Structure Explorer Validation Suite..." });
      const a = state.material.latticeConstant;
      assert(Math.abs(a - 5.431) < 1e-3, `Lattice constant parameter 'a' is ${a} \xC5 (expected ~5.431 \xC5).`);
      const a1 = state.material.primitiveVectors[0];
      const a2 = state.material.primitiveVectors[1];
      const a3 = state.material.primitiveVectors[2];
      const vp = dot(a1, cross(a2, a3));
      const expectedVp = Math.pow(a, 3) / 4;
      assert(Math.abs(vp - expectedVp) < 1e-4, `Primitive volume V_p is ${vp.toFixed(4)} \xC5\xB3 (expected ~${expectedVp.toFixed(4)} \xC5\xB3, matching the required ~40.05 \xC5\xB3).`);
      const expectedNN = Math.sqrt(3) / 4 * a;
      assert(Math.abs(expectedNN - 2.3517) < 1e-3, `Theoretical nearest-neighbor bond distance is ${expectedNN.toFixed(4)} \xC5 (expected ~2.352 \xC5).`);
      const convAtoms = state.material.conventionalAtoms;
      const totalConvOccupancy = convAtoms.reduce((sum, atom) => sum + atom.weight, 0);
      assert(Math.abs(totalConvOccupancy - 8) < 1e-5, `Sum of conventional cell occupancy weights is ${totalConvOccupancy} (expected exactly 8.0 atoms).`);
      const primAtoms = state.material.primitiveAtoms;
      const totalPrimOccupancy = primAtoms.reduce((sum, atom) => sum + atom.weight, 0);
      assert(Math.abs(totalPrimOccupancy - 2) < 1e-5, `Sum of primitive cell occupancy weights is ${totalPrimOccupancy} (expected exactly 2.0 atoms).`);
      const bVectors = calculateReciprocalVectors(state.material.primitiveVectors);
      const orthoCheck = verifyOrthogonality(state.material.primitiveVectors, bVectors);
      assert(orthoCheck.pass, orthoCheck.pass ? "Reciprocal lattice primitive vectors satisfy a_i \xB7 b_j = 2\u03C0\u03B4_ij." : orthoCheck.error);
      const bz = generateBrillouinZone(bVectors);
      const topologyCheck = verifyFCCBrillouinZoneTopology(bz);
      assert(topologyCheck.pass, topologyCheck.pass ? "Generic BZ algorithm successfully generates FCC truncated octahedron (24 vertices, 14 faces, 36 edges)." : topologyCheck.error);
      const hsPoints = {
        G: [0, 0, 0],
        L: [0.5, 0.5, 0.5],
        X: [0.5, 0, 0.5],
        U: [0.625, 0.25, 0.625],
        K: [0.375, 0.375, 0.75],
        W: [0.5, 0.25, 0.75]
      };
      const expectedCartHS = {
        G: [0, 0, 0],
        L: [0.5, 0.5, 0.5],
        X: [0, 1, 0],
        U: [0.25, 1, 0.25],
        K: [0.75, 0.75, 0],
        W: [0.5, 1, 0]
      };
      let hsCartCheck = true;
      for (const [key, frac] of Object.entries(hsPoints)) {
        const cart = fractionalToNormalizedCartesianReciprocal(frac);
        const expected = expectedCartHS[key];
        const dist = Math.sqrt(sumSqDiff(cart, expected));
        if (dist > 1e-5) {
          hsCartCheck = false;
          logs.push({ status: "FAIL", message: `High-symmetry point '${key}' mapped to [${cart.join(", ")}] (expected [${expected.join(", ")}]).` });
        }
      }
      assert(hsCartCheck, "All primitive reciprocal high-symmetry coordinates correctly map to normalized Cartesian reciprocal positions.");
      const calcGap = state.bands.calculatedGap;
      const vbm = state.bands.vbm;
      const cbm = state.bands.cbm;
      assert(Math.abs(calcGap - 0.612) < 1e-3, `Calculated fundamental band gap from DFT PBE is ${calcGap.toFixed(4)} eV (expected ~0.612 eV).`);
      assert(Math.abs(vbm.energy - 0) < 1e-5 && vbm.kpoint.join(",") === "0,0,0", `Valence Band Maximum (VBM) is at energy ${vbm.energy} eV at \u0393 point [${vbm.kpoint.join(", ")}].`);
      assert(Math.abs(cbm.energy - 0.612) < 1e-5, `Conduction Band Minimum (CBM) is at energy ${cbm.energy} eV (along the \u0394 path).`);
      assert(state.bands.branches.length === 2, `Electronic structure contains exactly ${state.bands.branches.length} continuous branches.`);
      let monotonicCheck = true;
      for (const branch of state.bands.branches) {
        const dists = branch.distances;
        for (let i = 1; i < dists.length; i++) {
          if (dists[i] <= dists[i - 1]) {
            monotonicCheck = false;
            logs.push({ status: "FAIL", message: `Branch '${branch.name}' distance is not strictly monotonic at index ${i} (${dists[i - 1].toFixed(4)} -> ${dists[i].toFixed(4)}).` });
          }
        }
      }
      assert(monotonicCheck, "All branches have strictly monotonic cumulative physical path distances.");
    } catch (err) {
      logs.push({ status: "ERROR", message: `Validation suite crashed: ${err.message}` });
      allPassed = false;
    }
    return { allPassed, logs };
  }
  function sumSqDiff(arr1, arr2) {
    return arr1.reduce((sum, val, idx) => sum + Math.pow(val - arr2[idx], 2), 0);
  }

  // src/js/views/split-dual-view.js
  var SplitDualView = class {
    constructor(crystalContainerId, bzContainerId, state) {
      this.state = state;
      this.crystalContainer = document.getElementById(crystalContainerId);
      this.bzContainer = document.getElementById(bzContainerId);
      this.crystalScene = null;
      this.crystalCamera = null;
      this.crystalRenderer = null;
      this.crystalControls = null;
      this.crystalGroup = null;
      this.atomsGroup = null;
      this.bondsGroup = null;
      this.outlineGroup = null;
      this.selectedAtomMesh = null;
      this.bzScene = null;
      this.bzCamera = null;
      this.bzRenderer = null;
      this.bzControls = null;
      this.bzGroup = null;
      this.bzMesh = null;
      this.bzLines = null;
      this.specialPointsGroup = null;
      this.kPathLine = null;
      this.kPathLabelsGroup = null;
      this.kIndicator = null;
      this.highlightedSegmentLine = null;
      this.selectedPointMesh = null;
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this._syncing = false;
      this._initCrystal();
      this._initBZ();
      this._startAnimationLoop();
      this._subscribeToState();
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  INITIALISATION
    // ═══════════════════════════════════════════════════════════════════════════
    _initCrystal() {
      const W = this.crystalContainer.clientWidth || 600;
      const H = this.crystalContainer.clientHeight || 450;
      this.crystalScene = new THREE.Scene();
      this.crystalScene.background = new THREE.Color(1316640);
      this.crystalCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      this.crystalCamera.position.set(4, 3, 5);
      this.crystalRenderer = new THREE.WebGLRenderer({ antialias: true });
      this.crystalRenderer.setSize(W, H);
      this.crystalRenderer.setPixelRatio(window.devicePixelRatio);
      this.crystalContainer.appendChild(this.crystalRenderer.domElement);
      this.crystalControls = new THREE.OrbitControls(this.crystalCamera, this.crystalRenderer.domElement);
      this.crystalControls.enableDamping = true;
      this.crystalControls.dampingFactor = 0.05;
      this.crystalControls.maxDistance = 20;
      this.crystalControls.minDistance = 2;
      const ambL = new THREE.AmbientLight(16777215, 0.6);
      this.crystalScene.add(ambL);
      const dirL1 = new THREE.DirectionalLight(16777215, 0.6);
      dirL1.position.set(5, 8, 5);
      this.crystalScene.add(dirL1);
      const dirL2 = new THREE.DirectionalLight(16777215, 0.3);
      dirL2.position.set(-5, -3, -5);
      this.crystalScene.add(dirL2);
      this.crystalGroup = new THREE.Group();
      this.crystalScene.add(this.crystalGroup);
      this.atomsGroup = new THREE.Group();
      this.bondsGroup = new THREE.Group();
      this.outlineGroup = new THREE.Group();
      this.crystalGroup.add(this.atomsGroup, this.bondsGroup, this.outlineGroup);
      window.addEventListener("resize", () => this._onResize());
      this.crystalRenderer.domElement.addEventListener("pointerdown", (e) => this._onCrystalPointerDown(e));
      this.crystalControls.addEventListener("change", () => {
        if (this._syncing)
          return;
        this._syncing = true;
        this._syncCameraFromTo(this.crystalCamera, this.crystalControls, this.bzCamera, this.bzControls);
        this._syncing = false;
      });
    }
    _initBZ() {
      const W = this.bzContainer.clientWidth || 600;
      const H = this.bzContainer.clientHeight || 450;
      this.bzScene = new THREE.Scene();
      this.bzScene.background = new THREE.Color(1316640);
      this.bzCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      this.bzCamera.position.set(4, 3, 5);
      this.bzRenderer = new THREE.WebGLRenderer({ antialias: true });
      this.bzRenderer.setSize(W, H);
      this.bzRenderer.setPixelRatio(window.devicePixelRatio);
      this.bzContainer.appendChild(this.bzRenderer.domElement);
      this.bzControls = new THREE.OrbitControls(this.bzCamera, this.bzRenderer.domElement);
      this.bzControls.enableDamping = true;
      this.bzControls.dampingFactor = 0.05;
      this.bzControls.maxDistance = 20;
      this.bzControls.minDistance = 2;
      const ambL = new THREE.AmbientLight(16777215, 0.6);
      this.bzScene.add(ambL);
      const dirL1 = new THREE.DirectionalLight(16777215, 0.6);
      dirL1.position.set(5, 8, 5);
      this.bzScene.add(dirL1);
      const dirL2 = new THREE.DirectionalLight(16777215, 0.3);
      dirL2.position.set(-5, -3, -5);
      this.bzScene.add(dirL2);
      this.bzGroup = new THREE.Group();
      this.bzScene.add(this.bzGroup);
      this.specialPointsGroup = new THREE.Group();
      this.bzGroup.add(this.specialPointsGroup);
      const kGeom = new THREE.SphereGeometry(0.06, 16, 16);
      const kMat = new THREE.MeshBasicMaterial({ color: 15680580 });
      this.kIndicator = new THREE.Mesh(kGeom, kMat);
      this.bzGroup.add(this.kIndicator);
      this.bzRenderer.domElement.addEventListener("pointerdown", (e) => this._onBZPointerDown(e));
      this.bzControls.addEventListener("change", () => {
        if (this._syncing)
          return;
        this._syncing = true;
        this._syncCameraFromTo(this.bzCamera, this.bzControls, this.crystalCamera, this.crystalControls);
        this._syncing = false;
      });
    }
    // ─── Rotation sync ────────────────────────────────────────────────────────
    // Copies the spherical orbit state (position relative to target) from src → dst.
    _syncCameraFromTo(srcCamera, srcControls, dstCamera, dstControls) {
      const srcPos = srcCamera.position.clone();
      const srcTarget = srcControls.target.clone();
      const offset = srcPos.clone().sub(srcTarget);
      const dstTarget = dstControls.target.clone();
      dstCamera.position.copy(dstTarget).add(offset);
      dstCamera.quaternion.copy(srcCamera.quaternion);
      dstControls.update();
    }
    // ─── Animation Loop ───────────────────────────────────────────────────────
    _startAnimationLoop() {
      const tick = () => {
        requestAnimationFrame(tick);
        this.crystalControls.update();
        this.bzControls.update();
        this.crystalRenderer.render(this.crystalScene, this.crystalCamera);
        this.bzRenderer.render(this.bzScene, this.bzCamera);
      };
      tick();
    }
    // ─── State subscriptions ──────────────────────────────────────────────────
    _subscribeToState() {
      this.state.subscribe((s, eventType) => {
        if (eventType === "DATA_LOADED") {
          this.renderStructure();
          this.renderBrillouinZone();
        }
        if (eventType === "CELL_TYPE_CHANGED" || eventType === "BONDS_VISIBILITY_CHANGED") {
          this.renderStructure();
        }
        if (eventType === "K_CHANGED") {
          this.updateActiveKIndicator();
        }
        if (eventType === "PATH_SEGMENT_CHANGED") {
          this.updateSegmentHighlight();
        }
        if (eventType === "BZ_VISIBILITY_CHANGED" || eventType === "KPATH_VISIBILITY_CHANGED" || eventType === "SPECIAL_POINTS_VISIBILITY_CHANGED") {
          this._applyBZVisibility();
        }
      });
    }
    // ─── Resize ───────────────────────────────────────────────────────────────
    _onResize() {
      {
        const W = this.crystalContainer.clientWidth;
        const H = this.crystalContainer.clientHeight;
        this.crystalCamera.aspect = W / H;
        this.crystalCamera.updateProjectionMatrix();
        this.crystalRenderer.setSize(W, H);
      }
      {
        const W = this.bzContainer.clientWidth;
        const H = this.bzContainer.clientHeight;
        this.bzCamera.aspect = W / H;
        this.bzCamera.updateProjectionMatrix();
        this.bzRenderer.setSize(W, H);
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  CRYSTAL STRUCTURE RENDERING
    // ═══════════════════════════════════════════════════════════════════════════
    renderStructure() {
      if (!this.state.material)
        return;
      [this.atomsGroup, this.bondsGroup, this.outlineGroup].forEach((g) => {
        while (g.children.length > 0)
          g.remove(g.children[0]);
      });
      this.selectedAtomMesh = null;
      const cellMode = this.state.presentation.showCellType;
      const a = this.state.material.latticeConstant;
      const atomsList = cellMode === "conventional" ? this.state.material.conventionalAtoms : this.state.material.primitiveAtoms;
      const sphereGeom = new THREE.SphereGeometry(0.3, 32, 32);
      const matA = new THREE.MeshPhongMaterial({ color: 440020, shininess: 80 });
      const matB = new THREE.MeshPhongMaterial({ color: 9133302, shininess: 80 });
      const offset = a / 2;
      atomsList.forEach((atom, idx) => {
        let cartPos;
        let isSublatticeA = true;
        if (cellMode === "conventional") {
          cartPos = conventionalToCartesianReal(atom.pos, a);
          const sum = atom.pos.reduce((s, v) => s + v, 0);
          isSublatticeA = Math.abs(sum % 0.5) < 1e-4;
        } else {
          const pv = this.state.material.primitiveVectors;
          const f = atom.pos;
          cartPos = [
            f[0] * pv[0][0] + f[1] * pv[1][0] + f[2] * pv[2][0],
            f[0] * pv[0][1] + f[1] * pv[1][1] + f[2] * pv[2][1],
            f[0] * pv[0][2] + f[1] * pv[1][2] + f[2] * pv[2][2]
          ];
          isSublatticeA = idx < 8;
        }
        const mesh = new THREE.Mesh(sphereGeom, isSublatticeA ? matA : matB);
        mesh.position.set(cartPos[0] - offset, cartPos[1] - offset, cartPos[2] - offset);
        mesh.userData = {
          type: "atom",
          index: idx,
          isSublatticeA,
          fracPos: atom.pos,
          cartPos,
          weight: atom.weight
        };
        this.atomsGroup.add(mesh);
      });
      if (cellMode === "conventional") {
        const boxGeom = new THREE.BoxGeometry(a, a, a);
        const edges = new THREE.EdgesGeometry(boxGeom);
        const lineMat = new THREE.LineBasicMaterial({ color: 4674921, linewidth: 2 });
        this.outlineGroup.add(new THREE.LineSegments(edges, lineMat));
      } else {
        const pv = this.state.material.primitiveVectors;
        const off = a / 2;
        const verts = [
          [0, 0, 0],
          pv[0],
          pv[1],
          pv[2],
          [pv[0][0] + pv[1][0], pv[0][1] + pv[1][1], pv[0][2] + pv[1][2]],
          [pv[1][0] + pv[2][0], pv[1][1] + pv[2][1], pv[1][2] + pv[2][2]],
          [pv[2][0] + pv[0][0], pv[2][1] + pv[0][1], pv[2][2] + pv[0][2]],
          [pv[0][0] + pv[1][0] + pv[2][0], pv[0][1] + pv[1][1] + pv[2][1], pv[0][2] + pv[1][2] + pv[2][2]]
        ].map((v) => new THREE.Vector3(v[0] - off, v[1] - off, v[2] - off));
        const pairs = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 6], [2, 4], [2, 5], [3, 5], [3, 6], [7, 4], [7, 5], [7, 6]];
        const pos = [];
        for (const [a2, b] of pairs) {
          pos.push(verts[a2].x, verts[a2].y, verts[a2].z, verts[b].x, verts[b].y, verts[b].z);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        this.outlineGroup.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 4674921 })));
      }
      if (this.state.presentation.showBonds)
        this._renderBonds(cellMode, a);
      this.crystalControls.target.set(0, 0, 0);
    }
    _renderBonds(cellMode, a) {
      const offset = a / 2;
      const bondRadius = 0.06;
      const bondMat = new THREE.MeshPhongMaterial({ color: 4674921, shininess: 10 });
      const dVectors = [
        [0.25, 0.25, 0.25],
        [-0.25, -0.25, 0.25],
        [-0.25, 0.25, -0.25],
        [0.25, -0.25, -0.25]
      ];
      this.atomsGroup.children.forEach((atomMesh) => {
        if (!atomMesh.userData.isSublatticeA)
          return;
        const pA = atomMesh.userData.fracPos;
        const cA = atomMesh.position;
        dVectors.forEach((dv) => {
          if (cellMode !== "conventional")
            return;
          const pB = [pA[0] + dv[0], pA[1] + dv[1], pA[2] + dv[2]];
          const cBUnshifted = conventionalToCartesianReal(pB, a);
          const cB = new THREE.Vector3(cBUnshifted[0] - offset, cBUnshifted[1] - offset, cBUnshifted[2] - offset);
          const dir = new THREE.Vector3().subVectors(cB, cA);
          const len = dir.length();
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bondRadius, bondRadius, len, 8), bondMat);
          cyl.position.copy(cA).addScaledVector(dir, 0.5);
          cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          this.bondsGroup.add(cyl);
        });
      });
      if (cellMode === "primitive") {
        const interiorMesh = this.atomsGroup.children.find((m) => !m.userData.isSublatticeA);
        if (interiorMesh) {
          const cB = interiorMesh.position;
          this.atomsGroup.children.forEach((cornerMesh) => {
            if (!cornerMesh.userData.isSublatticeA)
              return;
            const cA = cornerMesh.position;
            const dir = new THREE.Vector3().subVectors(cB, cA);
            const len = dir.length();
            if (Math.abs(len - 2.352) < 0.1) {
              const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bondRadius, bondRadius, len, 8), bondMat);
              cyl.position.copy(cA).addScaledVector(dir, 0.5);
              cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
              this.bondsGroup.add(cyl);
            }
          });
        }
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  BRILLOUIN ZONE RENDERING
    // ═══════════════════════════════════════════════════════════════════════════
    renderBrillouinZone() {
      if (!this.state.material)
        return;
      if (this.bzMesh)
        this.bzGroup.remove(this.bzMesh);
      if (this.bzLines)
        this.bzGroup.remove(this.bzLines);
      if (this.kPathLine)
        this.bzGroup.remove(this.kPathLine);
      if (this.kPathLabelsGroup)
        this.bzGroup.remove(this.kPathLabelsGroup);
      while (this.specialPointsGroup.children.length > 0)
        this.specialPointsGroup.remove(this.specialPointsGroup.children[0]);
      this.selectedPointMesh = null;
      const bVecs = this.state.material.reciprocalVectors;
      const bzData = generateBrillouinZone(bVecs);
      const factor = 2 * Math.PI / this.state.material.latticeConstant;
      const scaleFactor = 1 / factor;
      const vertices = bzData.vertices.map(
        (v) => new THREE.Vector3(v[0] * scaleFactor, v[1] * scaleFactor, v[2] * scaleFactor)
      );
      const positions = [];
      bzData.faces.forEach((face) => {
        for (let i = 1; i < face.length - 1; i++) {
          const v0 = vertices[face[0]], v1 = vertices[face[i]], v2 = vertices[face[i + 1]];
          positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        }
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.computeVertexNormals();
      const mat = new THREE.MeshPhongMaterial({
        color: 3359061,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
        shininess: 30
      });
      mat.userData.baseOpacity = 0.25;
      this.bzMesh = new THREE.Mesh(geom, mat);
      this.bzGroup.add(this.bzMesh);
      const linePos = [];
      bzData.faces.forEach((face) => {
        const len = face.length;
        for (let i = 0; i < len; i++) {
          const v1 = vertices[face[i]], v2 = vertices[face[(i + 1) % len]];
          linePos.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        }
      });
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
      this.bzLines = new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: 6583435, linewidth: 2 }));
      this.bzGroup.add(this.bzLines);
      const spGeom = new THREE.SphereGeometry(0.04, 16, 16);
      const hsPoints = {
        G: [0, 0, 0],
        L: [0.5, 0.5, 0.5],
        X: [0.5, 0, 0.5],
        U: [0.625, 0.25, 0.625],
        K: [0.375, 0.375, 0.75],
        W: [0.5, 0.25, 0.75]
      };
      const spMat = new THREE.MeshBasicMaterial({ color: 3718648 });
      for (const [name, frac] of Object.entries(hsPoints)) {
        const cartNorm = fractionalToNormalizedCartesianReciprocal(frac);
        const mesh = new THREE.Mesh(spGeom, spMat.clone());
        mesh.position.set(cartNorm[0], cartNorm[1], cartNorm[2]);
        mesh.userData = {
          name,
          frac,
          cartNormalized: cartNorm,
          cartPhysical: cartNorm.map((v) => v * factor)
        };
        this.specialPointsGroup.add(mesh);
        const label = name === "G" ? "\u0393" : name;
        const sprite = this._createTextSprite(label, "#38bdf8");
        sprite.position.set(cartNorm[0], cartNorm[1] + 0.08, cartNorm[2]);
        this.specialPointsGroup.add(sprite);
      }
      if (this.state.bands) {
        const pathPos = [];
        this.state.bands.branches.forEach((branch) => {
          const kp = branch.kpointsCartesian;
          for (let i = 0; i < kp.length - 1; i++) {
            pathPos.push(kp[i][0], kp[i][1], kp[i][2], kp[i + 1][0], kp[i + 1][1], kp[i + 1][2]);
          }
        });
        const pathGeom = new THREE.BufferGeometry();
        pathGeom.setAttribute("position", new THREE.Float32BufferAttribute(pathPos, 3));
        this.kPathLine = new THREE.LineSegments(pathGeom, new THREE.LineBasicMaterial({ color: 12616956, linewidth: 3 }));
        this.bzGroup.add(this.kPathLine);
      }
      this.kPathLabelsGroup = new THREE.Group();
      this.bzGroup.add(this.kPathLabelsGroup);
      [
        { label: "\u039B", pos: [0.25, 0.3, 0.25] },
        { label: "\u0394", pos: [0, 0.55, 0] },
        { label: "\u03A3", pos: [0.375, 0.43, 0] }
      ].forEach(({ label, pos }) => {
        const sp = this._createTextSprite(label, "#fb923c");
        sp.position.set(...pos);
        this.kPathLabelsGroup.add(sp);
      });
      this._applyBZVisibility();
      this.bzControls.target.set(0, 0, 0);
    }
    _applyBZVisibility() {
      const showBZ = this.state.presentation.showBZBoundary;
      const showKP = this.state.presentation.showKPath;
      const showSP = this.state.presentation.showSpecialPoints;
      if (this.bzMesh)
        this.bzMesh.visible = showBZ;
      if (this.bzLines)
        this.bzLines.visible = showBZ;
      if (this.kPathLine)
        this.kPathLine.visible = showKP;
      if (this.kPathLabelsGroup)
        this.kPathLabelsGroup.visible = showKP;
      if (this.specialPointsGroup)
        this.specialPointsGroup.visible = showSP;
    }
    // ─── Active-K indicator ───────────────────────────────────────────────────
    updateActiveKIndicator() {
      if (!this.state.physics.activeK || !this.kIndicator)
        return;
      const c = this.state.physics.activeK.cartesian;
      this.kIndicator.position.set(c[0], c[1], c[2]);
    }
    // ─── Highlighted symmetry-path segment ───────────────────────────────────
    updateSegmentHighlight() {
      if (this.highlightedSegmentLine) {
        this.bzGroup.remove(this.highlightedSegmentLine);
        this.highlightedSegmentLine = null;
      }
      const seg = this.state.physics.activePathSegment;
      if (!seg)
        return;
      const coordsMap = {
        lambda: [[0.5, 0.5, 0.5], [0, 0, 0]],
        delta: [[0, 0, 0], [0, 1, 0]],
        sigma: [[0.75, 0.75, 0], [0, 0, 0]]
      };
      const pts = coordsMap[seg];
      if (!pts)
        return;
      const p1 = new THREE.Vector3(...pts[0]);
      const p2 = new THREE.Vector3(...pts[1]);
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, len, 8),
        new THREE.MeshBasicMaterial({ color: 16096779 })
      );
      mesh.position.copy(p1).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      this.highlightedSegmentLine = mesh;
      this.bzGroup.add(mesh);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  INTERACTION — CRYSTAL VIEWPORT
    // ═══════════════════════════════════════════════════════════════════════════
    _onCrystalPointerDown(event) {
      const rect = this.crystalRenderer.domElement.getBoundingClientRect();
      this.mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      this.mouse.y = (event.clientY - rect.top) / rect.height * -2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.crystalCamera);
      const hits = this.raycaster.intersectObjects(this.atomsGroup.children);
      if (hits.length > 0)
        this._selectAtom(hits[0].object);
    }
    _selectAtom(mesh) {
      if (this.selectedAtomMesh) {
        const isA2 = this.selectedAtomMesh.userData.isSublatticeA;
        this.selectedAtomMesh.material.color.setHex(isA2 ? 440020 : 9133302);
      }
      this.selectedAtomMesh = mesh;
      mesh.material.color.setHex(15680580);
      const { index: idx, fracPos: frac, cartPos: cart, isSublatticeA: isA, weight } = mesh.userData;
      const el = document.getElementById("selection-details-content");
      if (el) {
        el.innerHTML = `
        <strong>Atom Index #${idx} (Silicon)</strong><br>
        Sublattice Bravais Site: Sublattice ${isA ? "A" : "B"}<br>
        Fractional Position: [${frac.map((v) => v.toFixed(3)).join(", ")}]<br>
        Cartesian Position: [${cart.map((v) => v.toFixed(3)).join(", ")}] \xC5<br>
        Conventional Cell Occupancy Weight: ${weight} (Corner: 1/8, Face: 1/2)<br>
        Coordination: Tetrahedrally bonded to 4 nearest neighbours at 2.35 \xC5.
      `;
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  INTERACTION — BZ VIEWPORT
    // ═══════════════════════════════════════════════════════════════════════════
    _onBZPointerDown(event) {
      const rect = this.bzRenderer.domElement.getBoundingClientRect();
      this.mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      this.mouse.y = (event.clientY - rect.top) / rect.height * -2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.bzCamera);
      const targets = this.specialPointsGroup.children.filter((c) => c.isMesh);
      const hits = this.raycaster.intersectObjects(targets);
      if (hits.length > 0)
        this._selectSpecialPoint(hits[0].object);
    }
    _selectSpecialPoint(mesh) {
      if (this.selectedPointMesh)
        this.selectedPointMesh.material.color.setHex(3718648);
      this.selectedPointMesh = mesh;
      mesh.material.color.setHex(16096779);
      const { name, frac, cartNormalized: cartNorm, cartPhysical: cartPhys } = mesh.userData;
      const descMap = {
        G: "The &Gamma; (Gamma) point \u2014 center of the first BZ. VBM of Silicon is here.",
        X: "The X point \u2014 center of the square faces, along &langle;100&rangle; directions.",
        L: "The L point \u2014 center of the hexagonal faces, along &langle;111&rangle; directions.",
        K: "The K point \u2014 edge where two hexagonal faces meet, along &langle;110&rangle;.",
        U: "The U point \u2014 on the BZ boundary, between X and L.",
        W: "The W point \u2014 corner vertex of the truncated octahedron boundary."
      };
      const labelName = name === "G" ? "&Gamma;" : name;
      const el = document.getElementById("selection-details-content");
      if (el) {
        el.innerHTML = `
        <strong>High-Symmetry Point (${labelName})</strong><br>
        Type: Reciprocal Boundary Point<br>
        Fractional Reciprocal: [${frac.map((v) => v.toFixed(3)).join(", ")}]<br>
        Normalized Cartesian: [${cartNorm.map((v) => v.toFixed(3)).join(", ")}] (units of 2&pi;/a)<br>
        Physical Cartesian: [${cartPhys.map((v) => v.toFixed(3)).join(", ")}] \xC5\u207B\xB9<br>
        Meaning: ${descMap[name] || "Symmetric point on BZ boundary."}
      `;
      }
      if (this.state.bands) {
        let foundS = null;
        for (const branch of this.state.bands.branches) {
          for (let i = 0; i < branch.kpoints.length; i++) {
            const kp = branch.kpoints[i];
            const d = Math.sqrt(
              Math.pow(kp[0] - frac[0], 2) + Math.pow(kp[1] - frac[1], 2) + Math.pow(kp[2] - frac[2], 2)
            );
            if (d < 1e-4) {
              foundS = branch.distances[i];
              break;
            }
          }
          if (foundS !== null)
            break;
        }
        if (foundS !== null)
          this.state.setPathDistance(foundS);
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  CAMERA RESET (called from app.js)
    // ═══════════════════════════════════════════════════════════════════════════
    resetCameras() {
      this.crystalControls.reset();
      this.bzControls.reset();
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    _createTextSprite(text, colorStr = "#ffffff") {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 128, 128);
      ctx.font = "bold 60px sans-serif";
      ctx.fillStyle = colorStr;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const matSpr = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(matSpr);
      sprite.scale.set(0.35, 0.35, 1);
      return sprite;
    }
  };

  // src/js/views/band-view.js
  var BandView = class {
    constructor(containerId, state) {
      this.container = document.getElementById(containerId);
      this.state = state;
      this.svg = null;
      this.padding = { top: 30, right: 20, bottom: 40, left: 45 };
      this.width = 0;
      this.height = 0;
      this.scaleX = null;
      this.scaleY = null;
      this.minY = -13;
      this.maxY = 6;
      this.isDragging = false;
      this.init();
      this.state.subscribe((s, eventType) => {
        if (eventType === "DATA_LOADED" || eventType === "SCISSOR_CHANGED" || eventType === "PATH_SEGMENT_CHANGED") {
          this.renderBands();
        }
        if (eventType === "K_CHANGED") {
          this.updateCursorPosition();
        }
      });
    }
    init() {
      this.width = this.container.clientWidth || 300;
      this.height = this.container.clientHeight || 300;
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.svg.setAttribute("width", "100%");
      this.svg.setAttribute("height", "100%");
      this.svg.style.cursor = "ew-resize";
      this.container.appendChild(this.svg);
      this.updateScales();
      this.svg.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      this.svg.addEventListener("pointermove", (e) => this.onPointerMove(e));
      window.addEventListener("pointerup", () => this.onPointerUp());
      window.addEventListener("resize", () => {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.updateScales();
        this.renderBands();
      });
    }
    updateScales() {
      if (!this.state.bands)
        return;
      const branches = this.state.bands.branches;
      const minX = branches[0].distances[0];
      const maxX = branches[branches.length - 1].distances[branches[branches.length - 1].distances.length - 1];
      this.scaleX = (x) => {
        return this.padding.left + (x - minX) / (maxX - minX) * (this.width - this.padding.left - this.padding.right);
      };
      this.invertX = (screenX) => {
        const frac = (screenX - this.padding.left) / (this.width - this.padding.left - this.padding.right);
        return minX + frac * (maxX - minX);
      };
      this.scaleY = (y) => {
        return this.padding.top + (this.maxY - y) / (this.maxY - this.minY) * (this.height - this.padding.top - this.padding.bottom);
      };
    }
    renderBands() {
      if (!this.state.bands)
        return;
      this.updateScales();
      this.svg.innerHTML = "";
      const branches = this.state.bands.branches;
      const a = this.state.material.latticeConstant;
      const factor = 2 * Math.PI / a;
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
        const highlight = this.createSVGElement("rect", {
          x: xStart,
          y: this.padding.top,
          width: xEnd - xStart,
          height: this.height - this.padding.top - this.padding.bottom,
          fill: "var(--accent-orange)",
          opacity: 0.12
        });
        this.svg.appendChild(highlight);
      }
      for (let e = this.minY; e <= this.maxY; e += 2) {
        if (e === 0)
          continue;
        const y = this.scaleY(e);
        const line = this.createSVGElement("line", {
          x1: this.padding.left,
          y1: y,
          x2: this.width - this.padding.right,
          y2: y,
          stroke: "var(--border-color)",
          "stroke-width": 1,
          "stroke-dasharray": "2,4"
        });
        this.svg.appendChild(line);
        const text = this.createSVGElement("text", {
          x: this.padding.left - 10,
          y: y + 4,
          "text-anchor": "end",
          fill: "var(--text-secondary)",
          "font-size": "0.75rem",
          "font-family": "var(--font-mono)"
        });
        text.textContent = `${e}`;
        this.svg.appendChild(text);
      }
      const hsTicks = [
        { label: "L", dist: branches[0].distances[0] },
        { label: "\u0393", dist: branches[0].distances[20] },
        // index of G
        { label: "X", dist: branches[0].distances[40] },
        // index of X
        { label: "U", dist: branches[0].distances[48] },
        // index of U
        { label: "K", dist: branches[1].distances[0] },
        { label: "\u0393", dist: branches[1].distances[20] }
      ];
      hsTicks.forEach((tick) => {
        const x = this.scaleX(tick.dist);
        const line = this.createSVGElement("line", {
          x1: x,
          y1: this.padding.top,
          x2: x,
          y2: this.height - this.padding.bottom,
          stroke: "var(--border-color)",
          "stroke-width": 1
        });
        this.svg.appendChild(line);
        const text = this.createSVGElement("text", {
          x,
          y: this.height - this.padding.bottom + 18,
          "text-anchor": "middle",
          fill: "var(--text-primary)",
          "font-size": "0.85rem",
          "font-weight": "600"
        });
        text.textContent = tick.label;
        this.svg.appendChild(text);
      });
      const segmentLabels = [
        { label: "\u039B", startDist: branches[0].distances[0], endDist: branches[0].distances[20] },
        { label: "\u0394", startDist: branches[0].distances[20], endDist: branches[0].distances[40] },
        { label: "\u03A3", startDist: branches[1].distances[0], endDist: branches[1].distances[20] }
      ];
      segmentLabels.forEach((seg) => {
        const xMid = this.scaleX((seg.startDist + seg.endDist) / 2);
        const text = this.createSVGElement("text", {
          x: xMid,
          y: this.padding.top - 8,
          "text-anchor": "middle",
          fill: "var(--accent-orange)",
          "font-size": "0.85rem",
          "font-weight": "600"
        });
        text.textContent = seg.label;
        this.svg.appendChild(text);
      });
      const xU = this.scaleX(branches[0].distances[branches[0].distances.length - 1]);
      const xK = this.scaleX(branches[1].distances[0]);
      const breakRect = this.createSVGElement("rect", {
        x: xU,
        y: this.padding.top,
        width: xK - xU,
        height: this.height - this.padding.top - this.padding.bottom,
        fill: "var(--bg-tertiary)",
        opacity: 0.5
      });
      this.svg.appendChild(breakRect);
      const breakLine1 = this.createSVGElement("line", {
        x1: xU + 3,
        y1: this.padding.top,
        x2: xU + 3,
        y2: this.height - this.padding.bottom,
        stroke: "var(--border-color)",
        "stroke-width": 1.5,
        "stroke-dasharray": "5,3"
      });
      const breakLine2 = this.createSVGElement("line", {
        x1: xK - 3,
        y1: this.padding.top,
        x2: xK - 3,
        y2: this.height - this.padding.bottom,
        stroke: "var(--border-color)",
        "stroke-width": 1.5,
        "stroke-dasharray": "5,3"
      });
      this.svg.appendChild(breakLine1);
      this.svg.appendChild(breakLine2);
      const yVBM = this.scaleY(0);
      const vbmLine = this.createSVGElement("line", {
        x1: this.padding.left,
        y1: yVBM,
        x2: this.width - this.padding.right,
        y2: yVBM,
        stroke: "var(--accent-cyan)",
        "stroke-width": 1.5
      });
      this.svg.appendChild(vbmLine);
      const vbmText = this.createSVGElement("text", {
        x: this.width - this.padding.right - 5,
        y: yVBM - 6,
        "text-anchor": "end",
        fill: "var(--accent-cyan)",
        "font-size": "0.7rem",
        "font-weight": "600"
      });
      vbmText.textContent = "VBM (0.0 eV)";
      this.svg.appendChild(vbmText);
      const calcGap = this.state.bands.calculatedGap;
      const targetGap = this.state.bands.experimentalGap;
      const currentGap = this.state.physics.scissorEnabled ? targetGap : calcGap;
      const yCBM = this.scaleY(currentGap);
      const cbmLine = this.createSVGElement("line", {
        x1: this.padding.left,
        y1: yCBM,
        x2: this.width - this.padding.right,
        y2: yCBM,
        stroke: "var(--accent-orange)",
        "stroke-width": 1.5,
        "stroke-dasharray": "4,4"
      });
      this.svg.appendChild(cbmLine);
      const cbmText = this.createSVGElement("text", {
        x: this.width - this.padding.right - 5,
        y: yCBM + 14,
        "text-anchor": "end",
        fill: "var(--accent-orange)",
        "font-size": "0.7rem",
        "font-weight": "600"
      });
      cbmText.textContent = `CBM (${currentGap.toFixed(3)} eV)`;
      this.svg.appendChild(cbmText);
      branches.forEach((branch) => {
        const distances = branch.distances;
        const numPoints = distances.length;
        for (let b = 0; b < 8; b++) {
          let rawEnergies = branch.energies[b];
          let energies = [...rawEnergies];
          if (this.state.physics.scissorEnabled && b >= 4) {
            const deltaScissor = targetGap - calcGap;
            energies = energies.map((e) => e + deltaScissor);
          }
          let pathD = `M ${this.scaleX(distances[0])} ${this.scaleY(energies[0])}`;
          for (let i = 1; i < numPoints; i++) {
            pathD += ` L ${this.scaleX(distances[i])} ${this.scaleY(energies[i])}`;
          }
          const isValence = b < 4;
          const curve = this.createSVGElement("path", {
            d: pathD,
            fill: "none",
            stroke: isValence ? "var(--accent-cyan)" : "var(--accent-purple)",
            "stroke-width": 2,
            opacity: 0.8
          });
          this.svg.appendChild(curve);
        }
      });
      const yAxisText = this.createSVGElement("text", {
        x: 15,
        y: 20,
        fill: "var(--text-primary)",
        "font-size": "0.8rem",
        "font-weight": "600"
      });
      yAxisText.textContent = "Energy (eV)";
      this.svg.appendChild(yAxisText);
      const xAxisText = this.createSVGElement("text", {
        x: this.width - this.padding.right,
        y: this.height - 10,
        "text-anchor": "end",
        fill: "var(--text-primary)",
        "font-size": "0.8rem",
        "font-weight": "600"
      });
      xAxisText.textContent = "Wavevector path (\xC5\u207B\xB9)";
      this.svg.appendChild(xAxisText);
      this.cursorGroup = this.createSVGElement("g", { id: "active-cursor-group" });
      this.svg.appendChild(this.cursorGroup);
      this.updateCursorPosition();
    }
    updateCursorPosition() {
      if (!this.state.physics.activeK || !this.scaleX || !this.cursorGroup)
        return;
      this.cursorGroup.innerHTML = "";
      const activeK = this.state.physics.activeK;
      const x = this.scaleX(activeK.s);
      const line = this.createSVGElement("line", {
        x1: x,
        y1: this.padding.top,
        x2: x,
        y2: this.height - this.padding.bottom,
        stroke: "var(--accent-red)",
        "stroke-width": 1.5,
        opacity: 0.9
      });
      this.cursorGroup.appendChild(line);
      activeK.energies.forEach((energy, idx) => {
        const y = this.scaleY(energy);
        const isValence = idx < 4;
        const circle = this.createSVGElement("circle", {
          cx: x,
          cy: y,
          r: 4.5,
          fill: "var(--bg-secondary)",
          stroke: isValence ? "var(--accent-cyan)" : "var(--accent-purple)",
          "stroke-width": 2
        });
        this.cursorGroup.appendChild(circle);
      });
      const labelBox = this.createSVGElement("rect", {
        x: Math.max(this.padding.left, Math.min(this.width - this.padding.right - 100, x - 50)),
        y: this.padding.top - 20,
        width: 110,
        height: 18,
        fill: "var(--bg-secondary)",
        stroke: "var(--border-color)",
        "stroke-width": 1,
        rx: 3
      });
      this.cursorGroup.appendChild(labelBox);
      const labelText = this.createSVGElement("text", {
        x: Math.max(this.padding.left, Math.min(this.width - this.padding.right - 100, x - 50)) + 55,
        y: this.padding.top - 7,
        "text-anchor": "middle",
        fill: "var(--accent-red)",
        "font-size": "0.65rem",
        "font-family": "var(--font-mono)"
      });
      labelText.textContent = `k = ${activeK.s.toFixed(3)} \xC5\u207B\xB9`;
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
      const minPlotX = this.padding.left;
      const maxPlotX = this.width - this.padding.right;
      const clampedX = Math.max(minPlotX, Math.min(maxPlotX, relativeX));
      const s = this.invertX(clampedX);
      this.state.setPathDistance(s);
    }
    createSVGElement(tag, attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
      }
      return el;
    }
  };

  // src/js/app.js
  async function bootstrap() {
    console.log("Crystal Electronic Structure Explorer bootstrapping...");
    const state = new AppState();
    const materialSelect = document.getElementById("material-select");
    const toggleConventional = document.getElementById("toggle-conventional");
    const togglePrimitive = document.getElementById("toggle-primitive");
    const toggleBonds = document.getElementById("toggle-bonds");
    const toggleScissor = document.getElementById("toggle-scissor");
    const gapDisplay = document.getElementById("calculated-gap-display");
    const tourStepIndicator = document.getElementById("tour-step-indicator");
    const tourDescription = document.getElementById("guided-tour-description");
    const prevStepBtn = document.getElementById("prev-step");
    const nextStepBtn = document.getElementById("next-step");
    const resetCameraBtn = document.getElementById("reset-camera");
    const toggleThemeBtn = document.getElementById("toggle-theme");
    const toggleBZ = document.getElementById("toggle-bz");
    const toggleKPath = document.getElementById("toggle-kpath");
    const toggleSymmetryPts = document.getElementById("toggle-symmetry-pts");
    const closeDebugBtn = document.getElementById("close-debug");
    const debugDashboard = document.getElementById("debug-dashboard");
    const validationList = document.getElementById("validation-list");
    await state.loadMaterialData("silicon");
    const splitView = new SplitDualView("crystal-canvas", "bz-canvas", state);
    const bandView = new BandView("band-canvas", state);
    splitView.renderStructure();
    splitView.renderBrillouinZone();
    bandView.renderBands();
    gapDisplay.textContent = `Calculated Gap: ${state.bands.calculatedGap.toFixed(3)} eV`;
    const tourSteps = [
      { title: "Stage 1 \u2014 Silicon Atom and Bonding", text: "Silicon is a Group 14 element with 4 valence electrons. In the bulk crystal, each silicon atom shares its electrons by forming covalent bonds with four nearest neighbors in a tetrahedral coordination structure." },
      { title: "Stage 2 \u2014 Diamond Cubic Structure", text: "Silicon crystallizes in the diamond cubic structure. The conventional unit cell consists of two interpenetrating FCC sublattices shifted by (1/4, 1/4, 1/4) of the cell dimension, containing a total of 8 atoms." },
      { title: "Stage 3 \u2014 Bravais Lattice + Basis", text: "Mathematically, the diamond structure is defined as a Face-Centered Cubic (FCC) Bravais lattice with a two-atom basis: Si at (0,0,0) and Si at (1/4, 1/4, 1/4) in fractional conventional coordinates." },
      { title: "Stage 4 \u2014 Conventional vs Primitive Cell", text: "The conventional cubic cell (8 atoms, volume a\xB3) clearly displays the cubic symmetry. The primitive cell (2 atoms, volume a\xB3/4) is the smallest repeating unit that can translate to span the entire lattice." },
      { title: "Stage 5 \u2014 Primitive Vectors", text: "The primitive real-space lattice vectors are: a\u2081 = a/2(0,1,1), a\u2082 = a/2(1,0,1), a\u2083 = a/2(1,1,0). These vectors define the translation symmetry of the FCC lattice." },
      { title: "Stage 6 \u2014 Reciprocal Vectors", text: "From the real-space primitive vectors, we construct the reciprocal lattice primitive vectors: b\u2081 = 2\u03C0/a(-1,1,1), b\u2082 = 2\u03C0/a(1,-1,1), b\u2083 = 2\u03C0/a(1,1,-1)." },
      { title: "Stage 7 \u2014 Reciprocal Lattice", text: "The reciprocal lattice of an FCC real-space lattice is a Body-Centered Cubic (BCC) lattice. Reciprocal lattice points represent the Fourier components of the periodic crystal potential." },
      { title: "Stage 8 \u2014 First Brillouin Zone", text: "The first Brillouin zone is the Wigner-Seitz cell of the reciprocal lattice. For the FCC lattice, this forms a truncated octahedron with 14 faces (6 squares and 8 hexagons), 24 vertices, and 36 edges." },
      { title: "Stage 9 \u2014 Special Points", text: "Due to lattice symmetry, certain reciprocal coordinates are highly symmetric. Key points include \u0393 (origin), X (square face center), L (hexagonal face center), K (edge intersection), U, and W." },
      { title: "Stage 10 \u2014 Symmetry Lines", text: "Paths connecting these special points represent symmetry directions. Click to highlight: <span class='interactive-segment-link' data-seg='delta'>&Delta; (&Gamma; to X)</span>, <span class='interactive-segment-link' data-seg='lambda'>&Lambda; (&Gamma; to L)</span>, or <span class='interactive-segment-link' data-seg='sigma'>&Sigma; (&Gamma; to K)</span>." },
      { title: "Stage 11 \u2014 Select k-path", text: "Instead of mapping all 3D k-points, we sample eigenvalues along a closed high-symmetry path. Our teaching path is L \u2192 \u0393 \u2192 X \u2192 U and K \u2192 \u0393." },
      { title: "Stage 12 \u2014 Flatten the k-path", text: "We plot the physical Cartesian distance along the 3D k-path segments as a continuous 1D horizontal axis on our electronic band diagram." },
      { title: "Stage 13 \u2014 Introduce E_n(k)", text: "At each wavevector k, the electron's quantum states are solutions to the Schr\xF6dinger equation, yielding discrete energies E_n(k) split into valence (filled) and conduction (empty) bands." },
      { title: "Stage 14 \u2014 Explore Band Structure", text: "Drag the cursor along the band diagram. Watch the red indicator trace the corresponding wavevector k inside the 3D Brillouin zone. Observe the gap between the filled valence bands and empty conduction bands." },
      { title: "Stage 15 \u2014 Indirect Gap", text: "Silicon is an indirect bandgap semiconductor. Its valence band maximum (VBM) is at \u0393, but its conduction band minimum (CBM) occurs along the \u0394 line (~85% towards X). The different k-values mean transition requires a phonon (lattice vibration)." }
    ];
    function updateTourUI() {
      const step = state.presentation.teachingStep;
      tourStepIndicator.textContent = `Stage ${step + 1} / ${tourSteps.length}`;
      tourDescription.innerHTML = `<strong>${tourSteps[step].title}</strong><p>${tourSteps[step].text}</p>`;
      prevStepBtn.disabled = step === 0;
      nextStepBtn.disabled = step === tourSteps.length - 1;
      state.setActivePathSegment(null);
      if (step === 9) {
        const links = tourDescription.querySelectorAll(".interactive-segment-link");
        links.forEach((link) => {
          link.style.color = "var(--accent-orange)";
          link.style.textDecoration = "underline";
          link.style.cursor = "pointer";
          link.style.fontWeight = "600";
          link.addEventListener("click", () => {
            const seg = link.getAttribute("data-seg");
            state.setActivePathSegment(seg);
          });
        });
      }
    }
    state.subscribe((s, eventType) => {
      console.log(`State updated: ${eventType}`);
      if (eventType === "K_CHANGED") {
        const activeK = s.physics.activeK;
        const detailContainer = document.getElementById("selection-details-content");
        if (detailContainer) {
          detailContainer.innerHTML = `
          <strong>Active Wavevector (k)</strong><br>
          Segment: ${s.bands.branches[activeK.branchIndex].name}<br>
          Fractional: [${activeK.fractional.map((v) => v.toFixed(3)).join(", ")}]<br>
          Cartesian (normalized 2&pi;/a): [${activeK.cartesian.map((v) => v.toFixed(3)).join(", ")}]<br>
          Cumulative distance: ${activeK.s.toFixed(3)} \xC5\u207B\xB9<br>
          Discontinuity: ${activeK.discontinuity ? "YES (Jumping U &rarr; K)" : "NO"}<br>
          Active Band Energies:<br>
          ${activeK.energies.map((e, idx) => `Band ${idx}: ${e.toFixed(3)} eV`).join("<br>")}
        `;
        }
      }
      if (eventType === "SCISSOR_CHANGED") {
        const currentGap = s.physics.scissorEnabled ? s.bands.experimentalGap : s.bands.calculatedGap;
        gapDisplay.textContent = `${s.physics.scissorEnabled ? "Scissor-Corrected" : "Calculated"} Gap: ${currentGap.toFixed(3)} eV`;
      }
      if (eventType === "TOUR_STEP_CHANGED") {
        updateTourUI();
      }
    });
    toggleConventional.addEventListener("change", (e) => {
      if (e.target.checked) {
        togglePrimitive.checked = false;
        state.setCellType("conventional");
      }
    });
    togglePrimitive.addEventListener("change", (e) => {
      if (e.target.checked) {
        toggleConventional.checked = false;
        state.setCellType("primitive");
      }
    });
    toggleBonds.addEventListener("change", (e) => {
      state.setBondsVisible(e.target.checked);
    });
    toggleScissor.addEventListener("change", (e) => {
      state.setScissorEnabled(e.target.checked);
    });
    if (toggleBZ) {
      toggleBZ.addEventListener("change", (e) => {
        state.setBZBoundaryVisible(e.target.checked);
      });
    }
    if (toggleKPath) {
      toggleKPath.addEventListener("change", (e) => {
        state.setKPathVisible(e.target.checked);
      });
    }
    if (toggleSymmetryPts) {
      toggleSymmetryPts.addEventListener("change", (e) => {
        state.setSpecialPointsVisible(e.target.checked);
      });
    }
    prevStepBtn.addEventListener("click", () => {
      const step = state.presentation.teachingStep;
      if (step > 0)
        state.setTeachingStep(step - 1);
    });
    nextStepBtn.addEventListener("click", () => {
      const step = state.presentation.teachingStep;
      if (step < tourSteps.length - 1)
        state.setTeachingStep(step + 1);
    });
    resetCameraBtn.addEventListener("click", () => {
      console.log("Reset camera triggered");
      splitView.resetCameras();
    });
    toggleThemeBtn.addEventListener("click", () => {
      document.body.classList.toggle("light-theme");
      document.body.classList.toggle("dark-theme");
    });
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.getAttribute("data-tab");
        document.querySelectorAll(".tab-content").forEach((content) => {
          content.classList.remove("active");
        });
        document.getElementById(`tab-${tabName}`).classList.add("active");
      });
    });
    if (closeDebugBtn && debugDashboard) {
      closeDebugBtn.addEventListener("click", () => {
        debugDashboard.style.display = "none";
      });
    }
    updateTourUI();
    if (debugDashboard && validationList) {
      const testResult = runPhysicsValidationTests(state);
      validationList.innerHTML = "";
      testResult.logs.forEach((log) => {
        const li = document.createElement("li");
        li.className = `log-${log.status.toLowerCase()}`;
        li.innerHTML = `<strong>[${log.status}]</strong> ${log.message}`;
        validationList.appendChild(li);
      });
      if (testResult.allPassed) {
        const summary = document.createElement("li");
        summary.className = "log-pass log-summary";
        summary.innerHTML = "<strong>[SUCCESS] All physical and mathematical validations passed successfully!</strong>";
        validationList.appendChild(summary);
      } else {
        const summary = document.createElement("li");
        summary.className = "log-fail log-summary";
        summary.innerHTML = "<strong>[FAILURE] One or more validations failed. Check the logs above.</strong>";
        validationList.appendChild(summary);
      }
    }
    state.setPathDistance(state.bands.branches[0].distances[0], true);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
//# sourceMappingURL=app.js.map
