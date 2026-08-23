// src/js/views/split-dual-view.js
//
// Renders two independent Three.js scenes side-by-side:
//   Left  → real-space crystal structure
//   Right → reciprocal-space Brillouin zone
//
// Rotating either viewport mirrors the rotation to the other in real-time.

import { generateBrillouinZone } from '../physics/brillouin-zone.js';
import { fractionalToNormalizedCartesianReciprocal, conventionalToCartesianReal } from '../physics/coordinates.js';

export class SplitDualView {
  constructor(crystalContainerId, bzContainerId, state) {
    this.state = state;

    // ── Container elements ────────────────────────────────────────────────────
    this.crystalContainer = document.getElementById(crystalContainerId);
    this.bzContainer      = document.getElementById(bzContainerId);

    // ── Crystal scene objects ─────────────────────────────────────────────────
    this.crystalScene    = null;
    this.crystalCamera   = null;
    this.crystalRenderer = null;
    this.crystalControls = null;

    this.crystalGroup  = null;   // root group
    this.atomsGroup    = null;
    this.bondsGroup    = null;
    this.outlineGroup  = null;
    this.selectedAtomMesh = null;

    // ── BZ scene objects ──────────────────────────────────────────────────────
    this.bzScene    = null;
    this.bzCamera   = null;
    this.bzRenderer = null;
    this.bzControls = null;

    this.bzGroup          = null;   // root group
    this.bzMesh           = null;
    this.bzLines          = null;
    this.specialPointsGroup = null;
    this.kPathLine        = null;
    this.kPathLabelsGroup = null;
    this.kIndicator       = null;
    this.highlightedSegmentLine = null;
    this.selectedPointMesh      = null;

    // ── Shared interaction helpers ────────────────────────────────────────────
    this.raycaster = new THREE.Raycaster();
    this.mouse     = new THREE.Vector2();

    // Sync-lock prevents the two controls' change-handlers from calling each other
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
    const W = this.crystalContainer.clientWidth  || 600;
    const H = this.crystalContainer.clientHeight || 450;

    // Scene
    this.crystalScene = new THREE.Scene();
    this.crystalScene.background = new THREE.Color(0x141720);

    // Camera
    this.crystalCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    this.crystalCamera.position.set(4, 3, 5);

    // Renderer
    this.crystalRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.crystalRenderer.setSize(W, H);
    this.crystalRenderer.setPixelRatio(window.devicePixelRatio);
    this.crystalContainer.appendChild(this.crystalRenderer.domElement);

    // Controls
    this.crystalControls = new THREE.OrbitControls(this.crystalCamera, this.crystalRenderer.domElement);
    this.crystalControls.enableDamping = true;
    this.crystalControls.dampingFactor = 0.05;
    this.crystalControls.maxDistance   = 20;
    this.crystalControls.minDistance   = 2.0;

    // Lights
    const ambL = new THREE.AmbientLight(0xffffff, 0.6);
    this.crystalScene.add(ambL);
    const dirL1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirL1.position.set(5, 8, 5);
    this.crystalScene.add(dirL1);
    const dirL2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirL2.position.set(-5, -3, -5);
    this.crystalScene.add(dirL2);

    // Groups
    this.crystalGroup = new THREE.Group();
    this.crystalScene.add(this.crystalGroup);
    this.atomsGroup   = new THREE.Group();
    this.bondsGroup   = new THREE.Group();
    this.outlineGroup = new THREE.Group();
    this.crystalGroup.add(this.atomsGroup, this.bondsGroup, this.outlineGroup);

    // Events
    window.addEventListener('resize', () => this._onResize());
    this.crystalRenderer.domElement.addEventListener('pointerdown', (e) => this._onCrystalPointerDown(e));

    // Sync crystal → BZ
    this.crystalControls.addEventListener('change', () => {
      if (this._syncing) return;
      this._syncing = true;
      this._syncCameraFromTo(this.crystalCamera, this.crystalControls, this.bzCamera, this.bzControls);
      this._syncing = false;
    });
  }

  _initBZ() {
    const W = this.bzContainer.clientWidth  || 600;
    const H = this.bzContainer.clientHeight || 450;

    // Scene
    this.bzScene = new THREE.Scene();
    this.bzScene.background = new THREE.Color(0x141720);

    // Camera — same initial position so both start aligned
    this.bzCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    this.bzCamera.position.set(4, 3, 5);

    // Renderer
    this.bzRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.bzRenderer.setSize(W, H);
    this.bzRenderer.setPixelRatio(window.devicePixelRatio);
    this.bzContainer.appendChild(this.bzRenderer.domElement);

    // Controls
    this.bzControls = new THREE.OrbitControls(this.bzCamera, this.bzRenderer.domElement);
    this.bzControls.enableDamping = true;
    this.bzControls.dampingFactor = 0.05;
    this.bzControls.maxDistance   = 20;
    this.bzControls.minDistance   = 2.0;

    // Lights
    const ambL = new THREE.AmbientLight(0xffffff, 0.6);
    this.bzScene.add(ambL);
    const dirL1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirL1.position.set(5, 8, 5);
    this.bzScene.add(dirL1);
    const dirL2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirL2.position.set(-5, -3, -5);
    this.bzScene.add(dirL2);

    // Groups
    this.bzGroup          = new THREE.Group();
    this.bzScene.add(this.bzGroup);
    this.specialPointsGroup = new THREE.Group();
    this.bzGroup.add(this.specialPointsGroup);

    // Active-K indicator (red sphere)
    const kGeom = new THREE.SphereGeometry(0.06, 16, 16);
    const kMat  = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.kIndicator = new THREE.Mesh(kGeom, kMat);
    this.bzGroup.add(this.kIndicator);

    // Events
    this.bzRenderer.domElement.addEventListener('pointerdown', (e) => this._onBZPointerDown(e));

    // Sync BZ → crystal
    this.bzControls.addEventListener('change', () => {
      if (this._syncing) return;
      this._syncing = true;
      this._syncCameraFromTo(this.bzCamera, this.bzControls, this.crystalCamera, this.crystalControls);
      this._syncing = false;
    });
  }

  // ─── Rotation sync ────────────────────────────────────────────────────────
  // Copies the spherical orbit state (position relative to target) from src → dst.
  _syncCameraFromTo(srcCamera, srcControls, dstCamera, dstControls) {
    // Use the quaternion of the src camera to orient the dst camera.
    // We also copy the distance (zoom) so the views stay consistent.
    const srcPos    = srcCamera.position.clone();
    const srcTarget = srcControls.target.clone();
    const offset    = srcPos.clone().sub(srcTarget);   // vector from target to camera

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
      if (eventType === 'DATA_LOADED') {
        this.renderStructure();
        this.renderBrillouinZone();
      }
      if (eventType === 'CELL_TYPE_CHANGED' || eventType === 'BONDS_VISIBILITY_CHANGED') {
        this.renderStructure();
      }
      if (eventType === 'K_CHANGED') {
        this.updateActiveKIndicator();
      }
      if (eventType === 'PATH_SEGMENT_CHANGED') {
        this.updateSegmentHighlight();
      }
      if (
        eventType === 'BZ_VISIBILITY_CHANGED' ||
        eventType === 'KPATH_VISIBILITY_CHANGED' ||
        eventType === 'SPECIAL_POINTS_VISIBILITY_CHANGED'
      ) {
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
    if (!this.state.material) return;

    // Clear previous meshes
    [this.atomsGroup, this.bondsGroup, this.outlineGroup].forEach(g => {
      while (g.children.length > 0) g.remove(g.children[0]);
    });
    this.selectedAtomMesh = null;

    const cellMode = this.state.presentation.showCellType;
    const a        = this.state.material.latticeConstant;
    const atomsList = cellMode === 'conventional'
      ? this.state.material.conventionalAtoms
      : this.state.material.primitiveAtoms;

    const sphereGeom  = new THREE.SphereGeometry(0.3, 32, 32);
    const matA        = new THREE.MeshPhongMaterial({ color: 0x06b6d4, shininess: 80 }); // cyan
    const matB        = new THREE.MeshPhongMaterial({ color: 0x8b5cf6, shininess: 80 }); // purple
    const offset      = a / 2;

    atomsList.forEach((atom, idx) => {
      let cartPos;
      let isSublatticeA = true;

      if (cellMode === 'conventional') {
        cartPos = conventionalToCartesianReal(atom.pos, a);
        const sum = atom.pos.reduce((s, v) => s + v, 0);
        isSublatticeA = (Math.abs(sum % 0.5) < 1e-4);
      } else {
        const pv = this.state.material.primitiveVectors;
        const f  = atom.pos;
        cartPos = [
          f[0]*pv[0][0] + f[1]*pv[1][0] + f[2]*pv[2][0],
          f[0]*pv[0][1] + f[1]*pv[1][1] + f[2]*pv[2][1],
          f[0]*pv[0][2] + f[1]*pv[1][2] + f[2]*pv[2][2],
        ];
        isSublatticeA = (idx < 8);
      }

      const mesh = new THREE.Mesh(sphereGeom, isSublatticeA ? matA : matB);
      mesh.position.set(cartPos[0] - offset, cartPos[1] - offset, cartPos[2] - offset);
      mesh.userData = {
        type: 'atom', index: idx,
        isSublatticeA, fracPos: atom.pos, cartPos, weight: atom.weight
      };
      this.atomsGroup.add(mesh);
    });

    // Outline box / parallelopiped
    if (cellMode === 'conventional') {
      const boxGeom = new THREE.BoxGeometry(a, a, a);
      const edges   = new THREE.EdgesGeometry(boxGeom);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 });
      this.outlineGroup.add(new THREE.LineSegments(edges, lineMat));
    } else {
      const pv     = this.state.material.primitiveVectors;
      const off    = a / 2;
      const verts  = [
        [0,0,0], pv[0], pv[1], pv[2],
        [pv[0][0]+pv[1][0], pv[0][1]+pv[1][1], pv[0][2]+pv[1][2]],
        [pv[1][0]+pv[2][0], pv[1][1]+pv[2][1], pv[1][2]+pv[2][2]],
        [pv[2][0]+pv[0][0], pv[2][1]+pv[0][1], pv[2][2]+pv[0][2]],
        [pv[0][0]+pv[1][0]+pv[2][0], pv[0][1]+pv[1][1]+pv[2][1], pv[0][2]+pv[1][2]+pv[2][2]],
      ].map(v => new THREE.Vector3(v[0]-off, v[1]-off, v[2]-off));

      const pairs = [[0,1],[0,2],[0,3],[1,4],[1,6],[2,4],[2,5],[3,5],[3,6],[7,4],[7,5],[7,6]];
      const pos   = [];
      for (const [a,b] of pairs) {
        pos.push(verts[a].x, verts[a].y, verts[a].z, verts[b].x, verts[b].y, verts[b].z);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.outlineGroup.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x475569 })));
    }

    if (this.state.presentation.showBonds) this._renderBonds(cellMode, a);

    this.crystalControls.target.set(0, 0, 0);
  }

  _renderBonds(cellMode, a) {
    const offset     = a / 2;
    const bondRadius = 0.06;
    const bondMat    = new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 10 });

    const dVectors = [
      [ 0.25,  0.25,  0.25],
      [-0.25, -0.25,  0.25],
      [-0.25,  0.25, -0.25],
      [ 0.25, -0.25, -0.25],
    ];

    this.atomsGroup.children.forEach(atomMesh => {
      if (!atomMesh.userData.isSublatticeA) return;
      const pA = atomMesh.userData.fracPos;
      const cA = atomMesh.position;

      dVectors.forEach(dv => {
        if (cellMode !== 'conventional') return;
        const pB          = [pA[0]+dv[0], pA[1]+dv[1], pA[2]+dv[2]];
        const cBUnshifted = conventionalToCartesianReal(pB, a);
        const cB          = new THREE.Vector3(cBUnshifted[0]-offset, cBUnshifted[1]-offset, cBUnshifted[2]-offset);
        const dir         = new THREE.Vector3().subVectors(cB, cA);
        const len         = dir.length();
        const cyl         = new THREE.Mesh(new THREE.CylinderGeometry(bondRadius, bondRadius, len, 8), bondMat);
        cyl.position.copy(cA).addScaledVector(dir, 0.5);
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
        this.bondsGroup.add(cyl);
      });
    });

    if (cellMode === 'primitive') {
      const interiorMesh = this.atomsGroup.children.find(m => !m.userData.isSublatticeA);
      if (interiorMesh) {
        const cB = interiorMesh.position;
        this.atomsGroup.children.forEach(cornerMesh => {
          if (!cornerMesh.userData.isSublatticeA) return;
          const cA  = cornerMesh.position;
          const dir = new THREE.Vector3().subVectors(cB, cA);
          const len = dir.length();
          if (Math.abs(len - 2.352) < 0.1) {
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bondRadius, bondRadius, len, 8), bondMat);
            cyl.position.copy(cA).addScaledVector(dir, 0.5);
            cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
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
    if (!this.state.material) return;

    // Clear previous objects
    if (this.bzMesh)           this.bzGroup.remove(this.bzMesh);
    if (this.bzLines)          this.bzGroup.remove(this.bzLines);
    if (this.kPathLine)        this.bzGroup.remove(this.kPathLine);
    if (this.kPathLabelsGroup) this.bzGroup.remove(this.kPathLabelsGroup);
    while (this.specialPointsGroup.children.length > 0)
      this.specialPointsGroup.remove(this.specialPointsGroup.children[0]);
    this.selectedPointMesh = null;

    const bVecs      = this.state.material.reciprocalVectors;
    const bzData     = generateBrillouinZone(bVecs);
    const factor     = 2 * Math.PI / this.state.material.latticeConstant;
    const scaleFactor = 1 / factor;

    const vertices = bzData.vertices.map(v =>
      new THREE.Vector3(v[0]*scaleFactor, v[1]*scaleFactor, v[2]*scaleFactor)
    );

    // BZ solid (translucent)
    const positions = [];
    bzData.faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) {
        const v0 = vertices[face[0]], v1 = vertices[face[i]], v2 = vertices[face[i+1]];
        positions.push(v0.x,v0.y,v0.z, v1.x,v1.y,v1.z, v2.x,v2.y,v2.z);
      }
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: 0x334155, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, depthWrite: false, shininess: 30
    });
    mat.userData.baseOpacity = 0.25;
    this.bzMesh = new THREE.Mesh(geom, mat);
    this.bzGroup.add(this.bzMesh);

    // BZ wireframe
    const linePos = [];
    bzData.faces.forEach(face => {
      const len = face.length;
      for (let i = 0; i < len; i++) {
        const v1 = vertices[face[i]], v2 = vertices[face[(i+1)%len]];
        linePos.push(v1.x,v1.y,v1.z, v2.x,v2.y,v2.z);
      }
    });
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.bzLines = new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 }));
    this.bzGroup.add(this.bzLines);

    // High-symmetry special points
    const spGeom  = new THREE.SphereGeometry(0.04, 16, 16);
    const hsPoints = {
      G: [0.0,0.0,0.0], L: [0.5,0.5,0.5], X: [0.5,0.0,0.5],
      U: [0.625,0.25,0.625], K: [0.375,0.375,0.75], W: [0.5,0.25,0.75],
    };
    const spMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    for (const [name, frac] of Object.entries(hsPoints)) {
      const cartNorm = fractionalToNormalizedCartesianReciprocal(frac);
      const mesh = new THREE.Mesh(spGeom, spMat.clone());
      mesh.position.set(cartNorm[0], cartNorm[1], cartNorm[2]);
      mesh.userData = {
        name, frac, cartNormalized: cartNorm,
        cartPhysical: cartNorm.map(v => v * factor)
      };
      this.specialPointsGroup.add(mesh);

      const label = name === 'G' ? 'Γ' : name;
      const sprite = this._createTextSprite(label, '#38bdf8');
      sprite.position.set(cartNorm[0], cartNorm[1] + 0.08, cartNorm[2]);
      this.specialPointsGroup.add(sprite);
    }

    // k-path line
    if (this.state.bands) {
      const pathPos = [];
      this.state.bands.branches.forEach(branch => {
        const kp = branch.kpointsCartesian;
        for (let i = 0; i < kp.length - 1; i++) {
          pathPos.push(kp[i][0],kp[i][1],kp[i][2], kp[i+1][0],kp[i+1][1],kp[i+1][2]);
        }
      });
      const pathGeom = new THREE.BufferGeometry();
      pathGeom.setAttribute('position', new THREE.Float32BufferAttribute(pathPos, 3));
      this.kPathLine = new THREE.LineSegments(pathGeom, new THREE.LineBasicMaterial({ color: 0xc084fc, linewidth: 3 }));
      this.bzGroup.add(this.kPathLine);
    }

    // Symmetry-path labels
    this.kPathLabelsGroup = new THREE.Group();
    this.bzGroup.add(this.kPathLabelsGroup);
    [
      { label: 'Λ', pos: [0.25, 0.30, 0.25] },
      { label: 'Δ', pos: [0.0,  0.55, 0.0 ] },
      { label: 'Σ', pos: [0.375, 0.43, 0.0] },
    ].forEach(({ label, pos }) => {
      const sp = this._createTextSprite(label, '#fb923c');
      sp.position.set(...pos);
      this.kPathLabelsGroup.add(sp);
    });

    this._applyBZVisibility();
    this.bzControls.target.set(0, 0, 0);
  }

  _applyBZVisibility() {
    const showBZ  = this.state.presentation.showBZBoundary;
    const showKP  = this.state.presentation.showKPath;
    const showSP  = this.state.presentation.showSpecialPoints;

    if (this.bzMesh)           this.bzMesh.visible  = showBZ;
    if (this.bzLines)          this.bzLines.visible = showBZ;
    if (this.kPathLine)        this.kPathLine.visible        = showKP;
    if (this.kPathLabelsGroup) this.kPathLabelsGroup.visible = showKP;
    if (this.specialPointsGroup) this.specialPointsGroup.visible = showSP;
  }

  // ─── Active-K indicator ───────────────────────────────────────────────────
  updateActiveKIndicator() {
    if (!this.state.physics.activeK || !this.kIndicator) return;
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
    if (!seg) return;

    const coordsMap = {
      lambda: [[0.5,0.5,0.5], [0.0,0.0,0.0]],
      delta:  [[0.0,0.0,0.0], [0.0,1.0,0.0]],
      sigma:  [[0.75,0.75,0.0],[0.0,0.0,0.0]],
    };
    const pts = coordsMap[seg];
    if (!pts) return;

    const p1  = new THREE.Vector3(...pts[0]);
    const p2  = new THREE.Vector3(...pts[1]);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, len, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    mesh.position.copy(p1).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());

    this.highlightedSegmentLine = mesh;
    this.bzGroup.add(mesh);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTERACTION — CRYSTAL VIEWPORT
  // ═══════════════════════════════════════════════════════════════════════════

  _onCrystalPointerDown(event) {
    const rect = this.crystalRenderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left)  / rect.width)  *  2 - 1;
    this.mouse.y = ((event.clientY - rect.top)   / rect.height) * -2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.crystalCamera);
    const hits = this.raycaster.intersectObjects(this.atomsGroup.children);
    if (hits.length > 0) this._selectAtom(hits[0].object);
  }

  _selectAtom(mesh) {
    if (this.selectedAtomMesh) {
      const isA = this.selectedAtomMesh.userData.isSublatticeA;
      this.selectedAtomMesh.material.color.setHex(isA ? 0x06b6d4 : 0x8b5cf6);
    }
    this.selectedAtomMesh = mesh;
    mesh.material.color.setHex(0xef4444);

    const { index: idx, fracPos: frac, cartPos: cart, isSublatticeA: isA, weight } = mesh.userData;
    const el = document.getElementById('selection-details-content');
    if (el) {
      el.innerHTML = `
        <strong>Atom Index #${idx} (Silicon)</strong><br>
        Sublattice Bravais Site: Sublattice ${isA ? 'A' : 'B'}<br>
        Fractional Position: [${frac.map(v => v.toFixed(3)).join(', ')}]<br>
        Cartesian Position: [${cart.map(v => v.toFixed(3)).join(', ')}] Å<br>
        Conventional Cell Occupancy Weight: ${weight} (Corner: 1/8, Face: 1/2)<br>
        Coordination: Tetrahedrally bonded to 4 nearest neighbours at 2.35 Å.
      `;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTERACTION — BZ VIEWPORT
  // ═══════════════════════════════════════════════════════════════════════════

  _onBZPointerDown(event) {
    const rect = this.bzRenderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left)  / rect.width)  *  2 - 1;
    this.mouse.y = ((event.clientY - rect.top)   / rect.height) * -2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.bzCamera);
    const targets = this.specialPointsGroup.children.filter(c => c.isMesh);
    const hits    = this.raycaster.intersectObjects(targets);
    if (hits.length > 0) this._selectSpecialPoint(hits[0].object);
  }

  _selectSpecialPoint(mesh) {
    if (this.selectedPointMesh) this.selectedPointMesh.material.color.setHex(0x38bdf8);
    this.selectedPointMesh = mesh;
    mesh.material.color.setHex(0xf59e0b);

    const { name, frac, cartNormalized: cartNorm, cartPhysical: cartPhys } = mesh.userData;
    const descMap = {
      G: 'The &Gamma; (Gamma) point — center of the first BZ. VBM of Silicon is here.',
      X: 'The X point — center of the square faces, along &langle;100&rangle; directions.',
      L: 'The L point — center of the hexagonal faces, along &langle;111&rangle; directions.',
      K: 'The K point — edge where two hexagonal faces meet, along &langle;110&rangle;.',
      U: 'The U point — on the BZ boundary, between X and L.',
      W: 'The W point — corner vertex of the truncated octahedron boundary.',
    };

    const labelName = name === 'G' ? '&Gamma;' : name;
    const el = document.getElementById('selection-details-content');
    if (el) {
      el.innerHTML = `
        <strong>High-Symmetry Point (${labelName})</strong><br>
        Type: Reciprocal Boundary Point<br>
        Fractional Reciprocal: [${frac.map(v => v.toFixed(3)).join(', ')}]<br>
        Normalized Cartesian: [${cartNorm.map(v => v.toFixed(3)).join(', ')}] (units of 2&pi;/a)<br>
        Physical Cartesian: [${cartPhys.map(v => v.toFixed(3)).join(', ')}] Å⁻¹<br>
        Meaning: ${descMap[name] || 'Symmetric point on BZ boundary.'}
      `;
    }

    // Move band-diagram cursor to this k-point
    if (this.state.bands) {
      let foundS = null;
      for (const branch of this.state.bands.branches) {
        for (let i = 0; i < branch.kpoints.length; i++) {
          const kp = branch.kpoints[i];
          const d  = Math.sqrt(
            Math.pow(kp[0]-frac[0],2) + Math.pow(kp[1]-frac[1],2) + Math.pow(kp[2]-frac[2],2)
          );
          if (d < 1e-4) { foundS = branch.distances[i]; break; }
        }
        if (foundS !== null) break;
      }
      if (foundS !== null) this.state.setPathDistance(foundS);
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

  _createTextSprite(text, colorStr = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width  = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font          = 'bold 60px sans-serif';
    ctx.fillStyle     = colorStr;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(text, 64, 64);

    const tex     = new THREE.CanvasTexture(canvas);
    const matSpr  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite  = new THREE.Sprite(matSpr);
    sprite.scale.set(0.35, 0.35, 1.0);
    return sprite;
  }
}
