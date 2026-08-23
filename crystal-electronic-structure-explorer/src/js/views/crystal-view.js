// src/js/views/crystal-view.js
import { conventionalToCartesianReal } from '../physics/coordinates.js';

export class CrystalView {
  constructor(containerId, state) {
    this.container = document.getElementById(containerId);
    this.state = state;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.atomsGroup = null;
    this.bondsGroup = null;
    this.outlineGroup = null;
    
    this.selectedAtomMesh = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.init();
    
    // Subscribe to state changes
    this.state.subscribe((s, eventType) => {
      if (eventType === 'DATA_LOADED' || eventType === 'CELL_TYPE_CHANGED' || eventType === 'BONDS_VISIBILITY_CHANGED') {
        this.renderStructure();
      }
    });
  }

  init() {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 300;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141720); // match dark-theme

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(8, 6, 8);

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
    this.controls.minDistance = 3;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(5, 10, 7);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-5, -5, -5);
    this.scene.add(dirLight2);

    // Groups
    this.atomsGroup = new THREE.Group();
    this.bondsGroup = new THREE.Group();
    this.outlineGroup = new THREE.Group();
    
    this.scene.add(this.atomsGroup);
    this.scene.add(this.bondsGroup);
    this.scene.add(this.outlineGroup);

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
      // For conventional cell, we display conventional fractional coords scaled by a
      // For primitive cell, we display primitive coordinates in cartesian space
      let cartPos;
      let isSublatticeA = true;
      
      if (cellMode === 'conventional') {
        cartPos = conventionalToCartesianReal(atom.pos, a);
        // Sublattice A if fractional coords sum to integers/half integers, 
        // Sublattice B has coordinates with 0.25 or 0.75
        const sum = atom.pos.reduce((s, val) => s + val, 0);
        isSublatticeA = (Math.abs(sum % 0.5) < 1e-4);
      } else {
        // Primitive cell rendering:
        // Atom positions are given in primitive coordinates in the JSON.
        // We transform them to Cartesian using primitive lattice vectors
        const pVecs = this.state.material.primitiveVectors;
        const frac = atom.pos;
        cartPos = [
          frac[0] * pVecs[0][0] + frac[1] * pVecs[1][0] + frac[2] * pVecs[2][0],
          frac[0] * pVecs[0][1] + frac[1] * pVecs[1][1] + frac[2] * pVecs[2][1],
          frac[0] * pVecs[0][2] + frac[1] * pVecs[1][2] + frac[2] * pVecs[2][2]
        ];
        
        // In primitive cell list, the last element is the sublattice B interior atom
        isSublatticeA = (idx < 8);
      }

      // Shift crystal centered around scene origin (x - a/2, y - a/2, z - a/2)
      const offset = a / 2;
      const mesh = new THREE.Mesh(sphereGeometry, isSublatticeA ? materialA : materialB);
      mesh.position.set(cartPos[0] - offset, cartPos[1] - offset, cartPos[2] - offset);
      
      // Store metadata on the mesh for selection/raycasting
      mesh.userData = {
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
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2e3547, linewidth: 2 });
      const boxWire = new THREE.LineSegments(edges, lineMat);
      this.outlineGroup.add(boxWire);
    } else {
      // Primitive cell outline is a parallelopiped defined by primitive vectors
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

      // Draw 12 lines of the parallelopiped
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
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2e3547 });
      const parallelopiped = new THREE.LineSegments(lineGeom, lineMat);
      this.outlineGroup.add(parallelopiped);
    }

    // Add bonds
    if (this.state.presentation.showBonds) {
      this.renderBonds(cellMode, a);
    }

    // Adjust camera to look at the center
    this.controls.target.set(0, 0, 0);
  }

  renderBonds(cellMode, a) {
    const offset = a / 2;
    const bondRadius = 0.06;
    const bondMaterial = new THREE.MeshPhongMaterial({ color: 0x2e3547, shininess: 10 });
    
    // Nearest neighbor displacements in diamond conventional units
    const dVectors = [
      [0.25, 0.25, 0.25],
      [-0.25, -0.25, 0.25],
      [-0.25, 0.25, -0.25],
      [0.25, -0.25, -0.25]
    ];

    // To prevent rendering duplicate bonds, we only project from Sublattice A atoms
    this.atomsGroup.children.forEach(atomMesh => {
      if (!atomMesh.userData.isSublatticeA) return;

      const pA = atomMesh.userData.fracPos;
      const cA = atomMesh.position; // already shifted

      // 4 neighbors in infinite crystal
      dVectors.forEach(dv => {
        // coordinate of neighbor
        let pB;
        if (cellMode === 'conventional') {
          pB = [pA[0] + dv[0], pA[1] + dv[1], pA[2] + dv[2]];
        } else {
          // For primitive cell, we work in primitive basis translations.
          // In primitive basis, Atom B is translated by the basis offset.
          // For Simplicity, we check Euclidean distance from this atom to all other atoms in primitive cell,
          // and if distance is close to 2.352 Å, we render the bond.
          // For boundary bonds in primitive cell, we can also evaluate primitive translations.
          return;
        }

        const cB_unshifted = conventionalToCartesianReal(pB, a);
        const cB = new THREE.Vector3(cB_unshifted[0] - offset, cB_unshifted[1] - offset, cB_unshifted[2] - offset);
        
        // Draw cylinder from cA to cB
        const direction = new THREE.Vector3().subVectors(cB, cA);
        const length = direction.length();
        
        const cylinderGeom = new THREE.CylinderGeometry(bondRadius, bondRadius, length, 8);
        const cylinderMesh = new THREE.Mesh(cylinderGeom, bondMaterial);
        
        // Rotate cylinder to point from cA to cB
        cylinderMesh.position.copy(cA).addScaledVector(direction, 0.5);
        
        const up = new THREE.Vector3(0, 1, 0);
        cylinderMesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
        
        this.bondsGroup.add(cylinderMesh);
      });
    });

    // Special primitive cell bond rendering
    if (cellMode === 'primitive') {
      const pVecs = this.state.material.primitiveVectors;
      // In primitive cell mode, we draw bonds between the 8 corners (sublattice A) 
      // and the single interior atom at primitive coords (0.25, 0.25, 0.25)
      const interiorMesh = this.atomsGroup.children.find(mesh => !mesh.userData.isSublatticeA);
      if (interiorMesh) {
        const cB = interiorMesh.position;
        this.atomsGroup.children.forEach(cornerMesh => {
          if (!cornerMesh.userData.isSublatticeA) return;
          const cA = cornerMesh.position;
          
          const direction = new THREE.Vector3().subVectors(cB, cA);
          const length = direction.length();
          
          // Check if it is a nearest neighbor bond (approx 2.352 Å)
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

  onPointerDown(event) {
    // Raycasting to select atoms
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.atomsGroup.children);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      this.selectAtom(clickedMesh);
    }
  }

  selectAtom(mesh) {
    // Reset previous selection colors
    if (this.selectedAtomMesh) {
      this.selectedAtomMesh.material.color.setHex(this.selectedAtomMesh.userData.isSublatticeA ? 0x06b6d4 : 0x8b5cf6);
    }

    this.selectedAtomMesh = mesh;
    // Highlight selection in red
    mesh.material.color.setHex(0xef4444);

    // Display metadata in details panel
    const uData = mesh.userData;
    const detailContainer = document.getElementById('selection-details-content');
    if (detailContainer) {
      detailContainer.innerHTML = `
        <strong>Silicon Atom (Selected)</strong><br>
        Lattice Sublattice: ${uData.isSublatticeA ? 'A (Cyan)' : 'B (Purple)'}<br>
        Fractional Position: [${uData.fracPos.map(v => v.toFixed(3)).join(', ')}]<br>
        Cartesian Position: [${uData.cartPos.map(v => v.toFixed(3)).join(', ')}] Å<br>
        Occupancy Weight: ${uData.weight} (${uData.weight === 0.125 ? 'Corner, shared by 8 cells' : uData.weight === 0.5 ? 'Face-center, shared by 2 cells' : 'Interior site'})<br>
        Coordination Number: 4 (Tetrahedral bonds)<br>
        Nearest Neighbor Bond Distance: ~2.352 Å
      `;
    }
  }
}
