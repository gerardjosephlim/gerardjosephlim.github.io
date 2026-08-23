// src/js/views/combined-view.js
import { generateBrillouinZone } from '../physics/brillouin-zone.js';
import { fractionalToNormalizedCartesianReciprocal, conventionalToCartesianReal } from '../physics/coordinates.js';

export class Combined3DView {
  constructor(containerId, state) {
    this.container = document.getElementById(containerId);
    this.state = state;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // Root Groups
    this.crystalGroup = null;
    this.reciprocalGroup = null;
    
    // Crystal meshes
    this.atomsGroup = null;
    this.bondsGroup = null;
    this.outlineGroup = null; // matches crystal-view name
    this.selectedAtomMesh = null;
    
    // Reciprocal meshes
    this.bzMesh = null;
    this.bzLines = null;
    this.specialPointsGroup = null;
    this.kPathLine = null;
    this.kPathLabelsGroup = null;
    this.kIndicator = null;
    this.highlightedSegmentLine = null;
    this.selectedPointMesh = null;
    
    this.blendWeight = 0.5; // default overlaid
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.init();
    
    // Subscribe to state changes
    this.state.subscribe((s, eventType) => {
      if (eventType === 'DATA_LOADED') {
        this.renderStructure();
        this.renderBrillouinZone();
        this.setBlendWeight(this.blendWeight);
      }
      if (eventType === 'CELL_TYPE_CHANGED' || eventType === 'BONDS_VISIBILITY_CHANGED') {
        this.renderStructure();
        this.setBlendWeight(this.blendWeight);
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
        this.setBlendWeight(this.blendWeight);
      }
    });
  }

  init() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 450;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141720); // Dark theme background

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(4, 3, 5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 2.0;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(5, 8, 5);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-5, -3, -5);
    this.scene.add(dirLight2);

    // Root Groups
    this.crystalGroup = new THREE.Group();
    this.reciprocalGroup = new THREE.Group();
    this.scene.add(this.crystalGroup);
    this.scene.add(this.reciprocalGroup);

    // Setup subgroups
    this.atomsGroup = new THREE.Group();
    this.bondsGroup = new THREE.Group();
    this.outlineGroup = new THREE.Group();
    this.crystalGroup.add(this.atomsGroup);
    this.crystalGroup.add(this.bondsGroup);
    this.crystalGroup.add(this.outlineGroup);

    this.specialPointsGroup = new THREE.Group();
    this.reciprocalGroup.add(this.specialPointsGroup);

    // Active K Indicator (Red sphere)
    const kGeom = new THREE.SphereGeometry(0.06, 16, 16);
    const kMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.kIndicator = new THREE.Mesh(kGeom, kMat);
    this.reciprocalGroup.add(this.kIndicator);

    // Event Listeners
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // --- Real-Space Rendering Logic (verbatim from crystal-view) ---
  renderStructure() {
    if (!this.state.material) return;

    // Clear previous elements
    while(this.atomsGroup.children.length > 0) this.atomsGroup.remove(this.atomsGroup.children[0]);
    while(this.bondsGroup.children.length > 0) this.bondsGroup.remove(this.bondsGroup.children[0]);
    while(this.outlineGroup.children.length > 0) this.outlineGroup.remove(this.outlineGroup.children[0]);

    this.selectedAtomMesh = null;

    const cellMode = this.state.presentation.showCellType; // 'conventional' or 'primitive'
    const a = this.state.material.latticeConstant;
    
    // Choose appropriate atoms list
    const atomsList = cellMode === 'conventional' 
      ? this.state.material.conventionalAtoms 
      : this.state.material.primitiveAtoms;

    // Geometry helpers
    const sphereGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    
    // Color scheme based on sublattice
    const materialA = new THREE.MeshPhongMaterial({ color: 0x06b6d4, shininess: 80 }); // Cyan
    const materialB = new THREE.MeshPhongMaterial({ color: 0x8b5cf6, shininess: 80 }); // Purple
    
    // Add atoms
    atomsList.forEach((atom, idx) => {
      let cartPos;
      let isSublatticeA = true;
      
      if (cellMode === 'conventional') {
        cartPos = conventionalToCartesianReal(atom.pos, a);
        const sum = atom.pos.reduce((s, val) => s + val, 0);
        isSublatticeA = (Math.abs(sum % 0.5) < 1e-4);
      } else {
        const pVecs = this.state.material.primitiveVectors;
        const frac = atom.pos;
        cartPos = [
          frac[0] * pVecs[0][0] + frac[1] * pVecs[1][0] + frac[2] * pVecs[2][0],
          frac[0] * pVecs[0][1] + frac[1] * pVecs[1][1] + frac[2] * pVecs[2][1],
          frac[0] * pVecs[0][2] + frac[1] * pVecs[1][2] + frac[2] * pVecs[2][2]
        ];
        isSublatticeA = (idx < 8);
      }

      // Shift crystal centered around scene origin (x - a/2, y - a/2, z - a/2)
      const offset = a / 2;
      const mesh = new THREE.Mesh(sphereGeometry, isSublatticeA ? materialA : materialB);
      mesh.position.set(cartPos[0] - offset, cartPos[1] - offset, cartPos[2] - offset);
      
      mesh.userData = {
        type: 'atom',
        index: idx,
        isSublatticeA: isSublatticeA,
        fracPos: atom.pos,
        cartPos: cartPos,
        weight: atom.weight
      };

      this.atomsGroup.add(mesh);
    });

    // Add outline box
    if (cellMode === 'conventional') {
      const boxGeom = new THREE.BoxGeometry(a, a, a);
      const edges = new THREE.EdgesGeometry(boxGeom);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 });
      const boxWire = new THREE.LineSegments(edges, lineMat);
      this.outlineGroup.add(boxWire);
    } else {
      const pVecs = this.state.material.primitiveVectors;
      const offset = a / 2;
      const vertices = [
        [0, 0, 0],
        pVecs[0],
        pVecs[1],
        pVecs[2],
        [pVecs[0][0] + pVecs[1][0], pVecs[0][1] + pVecs[1][1], pVecs[0][2] + pVecs[1][2]],
        [pVecs[1][0] + pVecs[2][0], pVecs[1][1] + pVecs[2][1], pVecs[1][2] + pVecs[2][2]],
        [pVecs[2][0] + pVecs[0][0], pVecs[2][1] + pVecs[0][1], pVecs[2][2] + pVecs[0][2]],
        [pVecs[0][0] + pVecs[1][0] + pVecs[2][0], pVecs[0][1] + pVecs[1][1] + pVecs[2][1], pVecs[0][2] + pVecs[1][2] + pVecs[2][2]]
      ].map(v => new THREE.Vector3(v[0] - offset, v[1] - offset, v[2] - offset));

      const lineIndices = [
        [0, 1], [0, 2], [0, 3],
        [1, 4], [1, 6],
        [2, 4], [2, 5],
        [3, 5], [3, 6],
        [7, 4], [7, 5], [7, 6]
      ];

      const lineGeom = new THREE.BufferGeometry();
      const positions = [];
      for (const pair of lineIndices) {
        positions.push(vertices[pair[0]].x, vertices[pair[0]].y, vertices[pair[0]].z);
        positions.push(vertices[pair[1]].x, vertices[pair[1]].y, vertices[pair[1]].z);
      }
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 });
      const parallelopiped = new THREE.LineSegments(lineGeom, lineMat);
      this.outlineGroup.add(parallelopiped);
    }

    // Add bonds
    if (this.state.presentation.showBonds) {
      this.renderBonds(cellMode, a);
    }

    this.controls.target.set(0, 0, 0);
  }

  renderBonds(cellMode, a) {
    const offset = a / 2;
    const bondRadius = 0.06;
    const bondMaterial = new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 10 });
    
    const dVectors = [
      [0.25, 0.25, 0.25],
      [-0.25, -0.25, 0.25],
      [-0.25, 0.25, -0.25],
      [0.25, -0.25, -0.25]
    ];

    this.atomsGroup.children.forEach(atomMesh => {
      if (!atomMesh.userData.isSublatticeA) return;

      const pA = atomMesh.userData.fracPos;
      const cA = atomMesh.position;

      dVectors.forEach(dv => {
        let pB;
        if (cellMode === 'conventional') {
          pB = [pA[0] + dv[0], pA[1] + dv[1], pA[2] + dv[2]];
        } else {
          return;
        }

        const cB_unshifted = conventionalToCartesianReal(pB, a);
        const cB = new THREE.Vector3(cB_unshifted[0] - offset, cB_unshifted[1] - offset, cB_unshifted[2] - offset);
        
        const direction = new THREE.Vector3().subVectors(cB, cA);
        const length = direction.length();
        
        const cylinderGeom = new THREE.CylinderGeometry(bondRadius, bondRadius, length, 8);
        const cylinderMesh = new THREE.Mesh(cylinderGeom, bondMaterial);
        
        cylinderMesh.position.copy(cA).addScaledVector(direction, 0.5);
        cylinderMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        
        this.bondsGroup.add(cylinderMesh);
      });
    });

    if (cellMode === 'primitive') {
      const interiorMesh = this.atomsGroup.children.find(mesh => !mesh.userData.isSublatticeA);
      if (interiorMesh) {
        const cB = interiorMesh.position;
        this.atomsGroup.children.forEach(cornerMesh => {
          if (!cornerMesh.userData.isSublatticeA) return;
          const cA = cornerMesh.position;
          
          const direction = new THREE.Vector3().subVectors(cB, cA);
          const length = direction.length();
          
          if (Math.abs(length - 2.352) < 0.1) {
            const cylinderGeom = new THREE.CylinderGeometry(bondRadius, bondRadius, length, 8);
            const cylinderMesh = new THREE.Mesh(cylinderGeom, bondMaterial);
            cylinderMesh.position.copy(cA).addScaledVector(direction, 0.5);
            cylinderMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
            this.bondsGroup.add(cylinderMesh);
          }
        });
      }
    }
  }

  // --- Reciprocal-Space Rendering Logic ---
  renderBrillouinZone() {
    if (!this.state.material) return;

    if (this.bzMesh) this.reciprocalGroup.remove(this.bzMesh);
    if (this.bzLines) this.reciprocalGroup.remove(this.bzLines);
    if (this.kPathLine) this.reciprocalGroup.remove(this.kPathLine);
    if (this.kPathLabelsGroup) this.reciprocalGroup.remove(this.kPathLabelsGroup);
    while (this.specialPointsGroup.children.length > 0) this.specialPointsGroup.remove(this.specialPointsGroup.children[0]);

    this.selectedPointMesh = null;

    const bVecs = this.state.material.reciprocalVectors;
    const bzData = generateBrillouinZone(bVecs);

    const factor = 2 * Math.PI / this.state.material.latticeConstant;
    const scaleFactor = 1 / factor;

    const vertices = bzData.vertices.map(v => new THREE.Vector3(v[0] * scaleFactor, v[1] * scaleFactor, v[2] * scaleFactor));

    const geom = new THREE.BufferGeometry();
    const positions = [];
    
    bzData.faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) {
        const v0 = vertices[face[0]];
        const v1 = vertices[face[i]];
        const v2 = vertices[face[i + 1]];
        positions.push(v0.x, v0.y, v0.z);
        positions.push(v1.x, v1.y, v1.z);
        positions.push(v2.x, v2.y, v2.z);
      }
    });

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 30
    });
    mat.userData.baseOpacity = 0.25;
    this.bzMesh = new THREE.Mesh(geom, mat);
    this.reciprocalGroup.add(this.bzMesh);

    const linePositions = [];
    bzData.faces.forEach(face => {
      const len = face.length;
      for (let i = 0; i < len; i++) {
        const v1 = vertices[face[i]];
        const v2 = vertices[face[(i + 1) % len]];
        linePositions.push(v1.x, v1.y, v1.z);
        linePositions.push(v2.x, v2.y, v2.z);
      }
    });

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 });
    this.bzLines = new THREE.LineSegments(lineGeom, lineMat);
    this.reciprocalGroup.add(this.bzLines);

    const spGeom = new THREE.SphereGeometry(0.04, 16, 16);
    const hsPoints = {
      "G": [0.0, 0.0, 0.0],
      "L": [0.5, 0.5, 0.5],
      "X": [0.5, 0.0, 0.5],
      "U": [0.625, 0.25, 0.625],
      "K": [0.375, 0.375, 0.75],
      "W": [0.5, 0.25, 0.75]
    };

    const spMaterialNormal = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    for (const [name, frac] of Object.entries(hsPoints)) {
      const cartNorm = fractionalToNormalizedCartesianReciprocal(frac);
      
      const mesh = new THREE.Mesh(spGeom, spMaterialNormal.clone());
      mesh.position.set(cartNorm[0], cartNorm[1], cartNorm[2]);
      
      mesh.userData = {
        name: name,
        frac: frac,
        cartNormalized: cartNorm,
        cartPhysical: cartNorm.map(val => val * factor)
      };
      
      this.specialPointsGroup.add(mesh);
      
      const labelText = name === 'G' ? 'Γ' : name;
      const sprite = this.createTextSprite(labelText, '#38bdf8');
      sprite.position.set(cartNorm[0], cartNorm[1] + 0.08, cartNorm[2]);
      this.specialPointsGroup.add(sprite);
    }

    if (this.state.bands) {
      const pathPositions = [];
      this.state.bands.branches.forEach(branch => {
        const kpoints = branch.kpointsCartesian;
        for (let i = 0; i < kpoints.length - 1; i++) {
          pathPositions.push(kpoints[i][0], kpoints[i][1], kpoints[i][2]);
          pathPositions.push(kpoints[i+1][0], kpoints[i+1][1], kpoints[i+1][2]);
        }
      });

      const pathGeom = new THREE.BufferGeometry();
      pathGeom.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
      const pathMat = new THREE.LineBasicMaterial({ color: 0xc084fc, linewidth: 3 });
      this.kPathLine = new THREE.LineSegments(pathGeom, pathMat);
      this.reciprocalGroup.add(this.kPathLine);
    }

    this.kPathLabelsGroup = new THREE.Group();
    this.reciprocalGroup.add(this.kPathLabelsGroup);

    const lambdaSprite = this.createTextSprite('Λ', '#fb923c');
    lambdaSprite.position.set(0.25, 0.25 + 0.05, 0.25);
    this.kPathLabelsGroup.add(lambdaSprite);

    const deltaSprite = this.createTextSprite('Δ', '#fb923c');
    deltaSprite.position.set(0.0, 0.5 + 0.05, 0.0);
    this.kPathLabelsGroup.add(deltaSprite);

    const sigmaSprite = this.createTextSprite('Σ', '#fb923c');
    sigmaSprite.position.set(0.375, 0.375 + 0.05, 0.0);
    this.kPathLabelsGroup.add(sigmaSprite);
  }

  updateActiveKIndicator() {
    if (!this.state.physics.activeK || !this.kIndicator) return;
    const activeK = this.state.physics.activeK;
    const cart = activeK.cartesian;
    this.kIndicator.position.set(cart[0], cart[1], cart[2]);
  }

  updateSegmentHighlight() {
    if (this.highlightedSegmentLine) {
      this.reciprocalGroup.remove(this.highlightedSegmentLine);
      this.highlightedSegmentLine = null;
    }

    const seg = this.state.physics.activePathSegment;
    if (!seg) return;

    const coordsMap = {
      lambda: [[0.5, 0.5, 0.5], [0.0, 0.0, 0.0]],
      delta: [[0.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
      sigma: [[0.75, 0.75, 0.0], [0.0, 0.0, 0.0]]
    };

    const pts = coordsMap[seg];
    if (!pts) return;

    const p1 = new THREE.Vector3(pts[0][0], pts[0][1], pts[0][2]);
    const p2 = new THREE.Vector3(pts[1][0], pts[1][1], pts[1][2]);

    const direction = new THREE.Vector3().subVectors(p2, p1);
    const length = direction.length();

    const geom = new THREE.CylinderGeometry(0.025, 0.025, length, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const mesh = new THREE.Mesh(geom, mat);

    mesh.position.copy(p1).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

    this.highlightedSegmentLine = mesh;
    this.reciprocalGroup.add(this.highlightedSegmentLine);
    this.setBlendWeight(this.blendWeight);
  }

  // --- Cross-Fade Blending ---
  setBlendWeight(w) {
    this.blendWeight = w;
    
    let crystalOpacity = 1.0;
    let reciprocalOpacity = 1.0;
    
    if (w <= 0.5) {
      crystalOpacity = 1.0;
      reciprocalOpacity = w * 2.0; 
    } else {
      crystalOpacity = (1.0 - w) * 2.0; 
      reciprocalOpacity = 1.0;
    }

    // Blend Crystal Group
    this.crystalGroup.visible = (crystalOpacity > 0.001);
    if (this.crystalGroup.visible) {
      this.crystalGroup.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          const base = child.userData.baseOpacity !== undefined ? child.userData.baseOpacity : 1.0;
          child.material.opacity = crystalOpacity * base;
        }
        if (child.isLine && child.material) {
          child.material.transparent = true;
          child.material.opacity = crystalOpacity;
        }
      });
    }

    // Blend Reciprocal Group
    this.reciprocalGroup.visible = (reciprocalOpacity > 0.001);
    if (this.reciprocalGroup.visible) {
      const showBZ = this.state.presentation.showBZBoundary;
      if (this.bzMesh) this.bzMesh.visible = showBZ;
      if (this.bzLines) this.bzLines.visible = showBZ;

      const showKPath = this.state.presentation.showKPath;
      if (this.kPathLine) this.kPathLine.visible = showKPath;
      if (this.kPathLabelsGroup) this.kPathLabelsGroup.visible = showKPath;

      const showPts = this.state.presentation.showSpecialPoints;
      if (this.specialPointsGroup) this.specialPointsGroup.visible = showPts;
      
      this.reciprocalGroup.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          const base = child.userData.baseOpacity !== undefined ? child.userData.baseOpacity : 1.0;
          child.material.opacity = reciprocalOpacity * base;
        }
        if (child.isLine && child.material) {
          child.material.transparent = true;
          child.material.opacity = reciprocalOpacity;
        }
        if (child.isSprite && child.material) {
          child.material.transparent = true;
          child.material.opacity = reciprocalOpacity;
        }
      });
    }
  }

  // --- Interaction & Selections ---
  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = [];
    if (this.crystalGroup.visible) {
      targets.push(...this.atomsGroup.children);
    }
    if (this.reciprocalGroup.visible && this.specialPointsGroup.visible) {
      targets.push(...this.specialPointsGroup.children.filter(c => c.isMesh));
    }

    const intersects = this.raycaster.intersectObjects(targets);
    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      if (clickedMesh.userData.type === 'atom') {
        this.selectAtom(clickedMesh);
      } else if (clickedMesh.userData.name) {
        this.selectSpecialPoint(clickedMesh);
      }
    }
  }

  selectAtom(mesh) {
    if (this.selectedAtomMesh) {
      const isSubA = this.selectedAtomMesh.userData.isSublatticeA;
      this.selectedAtomMesh.material.color.setHex(isSubA ? 0x06b6d4 : 0x8b5cf6);
    }

    this.selectedAtomMesh = mesh;
    mesh.material.color.setHex(0xef4444);

    const idx = mesh.userData.index;
    const frac = mesh.userData.fracPos;
    const cart = mesh.userData.cartPos;
    const isSubA = mesh.userData.isSublatticeA;
    const weight = mesh.userData.weight;

    const detailContainer = document.getElementById('selection-details-content');
    if (detailContainer) {
      detailContainer.innerHTML = `
        <strong>Atom Index #${idx} (Silicon)</strong><br>
        Sublattice Bravais Site: Sublattice ${isSubA ? 'A' : 'B'}<br>
        Fractional Position: [${frac.map(v => v.toFixed(3)).join(', ')}]<br>
        Cartesian Position: [${cart.map(v => v.toFixed(3)).join(', ')}] Å<br>
        Conventional Cell Occupancy Weight: ${weight} (Corner site contribution: 1/8, Face center: 1/2)<br>
        Coordination: Tetrahedrally bonded to 4 nearest neighbors at 2.35 Å.
      `;
    }
  }

  selectSpecialPoint(mesh) {
    if (this.selectedPointMesh) {
      this.selectedPointMesh.material.color.setHex(0x38bdf8);
    }

    this.selectedPointMesh = mesh;
    mesh.material.color.setHex(0xf59e0b);

    const name = mesh.userData.name;
    const frac = mesh.userData.frac;
    const cartNorm = mesh.userData.cartNormalized;
    const cartPhys = mesh.userData.cartPhysical;

    const descMap = {
      "G": "The &Gamma; (Gamma) point. It lies exactly at the center of the first Brillouin zone. In Silicon, the valence band maximum (VBM) occurs here.",
      "X": "The X point. It lies at the center of the square faces of the truncated octahedron BZ boundary, in the &langle;100&rangle; directions.",
      "L": "The L point. It lies at the center of the hexagonal faces of the BZ boundary, in the &langle;111&rangle; directions.",
      "K": "The K point. It lies on the edges of the BZ where two hexagonal faces intersect, along the &langle;110&rangle; directions.",
      "U": "The U point. It lies on the BZ boundary, along the path connecting X and L points.",
      "W": "The W point. It is a corner vertex of the truncated octahedron polyhedron boundary."
    };

    const labelName = name === 'G' ? '&Gamma;' : name;

    const detailContainer = document.getElementById('selection-details-content');
    if (detailContainer) {
      detailContainer.innerHTML = `
        <strong>High-Symmetry Point (${labelName})</strong><br>
        Type: Reciprocal Boundary Point<br>
        Fractional Reciprocal: [${frac.map(v => v.toFixed(3)).join(', ')}]<br>
        Normalized Cartesian: [${cartNorm.map(v => v.toFixed(3)).join(', ')}] (units of 2&pi;/a)<br>
        Physical Cartesian: [${cartPhys.map(v => v.toFixed(3)).join(', ')}] Å⁻¹<br>
        Meaning: ${descMap[name] || 'Symmetric point on Brillouin Zone Boundary.'}
      `;
    }

    if (this.state.bands) {
      let foundS = null;
      for (const branch of this.state.bands.branches) {
        for (let i = 0; i < branch.kpoints.length; i++) {
          const kp = branch.kpoints[i];
          const dist = Math.sqrt(
            Math.pow(kp[0] - frac[0], 2) +
            Math.pow(kp[1] - frac[1], 2) +
            Math.pow(kp[2] - frac[2], 2)
          );
          if (dist < 1e-4) {
            foundS = branch.distances[i];
            break;
          }
        }
        if (foundS !== null) break;
      }
      
      if (foundS !== null) {
        this.state.setPathDistance(foundS);
      }
    }
  }

  createTextSprite(text, colorStr = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = colorStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.35, 0.35, 1.0);
    return sprite;
  }
}
