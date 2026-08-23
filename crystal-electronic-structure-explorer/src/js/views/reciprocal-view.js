// src/js/views/reciprocal-view.js
import { generateBrillouinZone } from '../physics/brillouin-zone.js';
import { fractionalToNormalizedCartesianReciprocal } from '../physics/coordinates.js';

export class ReciprocalView {
  constructor(containerId, state) {
    this.container = document.getElementById(containerId);
    this.state = state;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    this.bzMesh = null;
    this.bzLines = null;
    this.specialPointsGroup = null;
    this.kPathLine = null;
    this.kIndicator = null;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedPointMesh = null;
    this.highlightedSegmentLine = null;
    this.kPathLabelsGroup = null;
    
    this.init();
    
    this.state.subscribe((s, eventType) => {
      if (eventType === 'DATA_LOADED') {
        this.renderBrillouinZone();
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
        this.updateVisibility();
      }
    });
  }

  init() {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 300;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141720); // dark-theme

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(4, 3, 4);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 15;
    this.controls.minDistance = 1.5;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 3);
    this.scene.add(dirLight);

    // Groups
    this.specialPointsGroup = new THREE.Group();
    this.scene.add(this.specialPointsGroup);

    // Active K Indicator (Red sphere)
    const kGeom = new THREE.SphereGeometry(0.06, 16, 16);
    const kMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.kIndicator = new THREE.Mesh(kGeom, kMat);
    this.scene.add(this.kIndicator);

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

  renderBrillouinZone() {
    if (!this.state.material) return;

    // Clear old elements
    if (this.bzMesh) this.scene.remove(this.bzMesh);
    if (this.bzLines) this.scene.remove(this.bzLines);
    if (this.kPathLine) this.scene.remove(this.kPathLine);
    while (this.specialPointsGroup.children.length > 0) {
      this.specialPointsGroup.remove(this.specialPointsGroup.children[0]);
    }

    this.selectedPointMesh = null;

    // Compute BZ from Reciprocal Vectors
    const bVecs = this.state.material.reciprocalVectors;
    const bzData = generateBrillouinZone(bVecs);

    // Scale down coordinates slightly for rendering comfort (values near 1.0)
    // Let's normalize by 2pi/a which is the reciprocal factor
    const factor = 2 * Math.PI / this.state.material.latticeConstant;
    const scaleFactor = 1 / factor; // maps 2pi/a to 1.0 unit in 3D scene

    const vertices = bzData.vertices.map(v => new THREE.Vector3(v[0] * scaleFactor, v[1] * scaleFactor, v[2] * scaleFactor));

    // 1. Create BZ Polyhedron Mesh (triangulated)
    const geom = new THREE.BufferGeometry();
    const positions = [];
    
    bzData.faces.forEach(face => {
      // Triangulate face (polygon with face.length vertices)
      // Standard fan triangulation: (v0, v1, v2), (v0, v2, v3), etc.
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
      color: 0x2e3547,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 30
    });
    this.bzMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.bzMesh);

    // 2. Create BZ Edge Lines
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
    const lineMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 });
    this.bzLines = new THREE.LineSegments(lineGeom, lineMat);
    this.scene.add(this.bzLines);

    // 3. Create High-Symmetry Points
    const spGeom = new THREE.SphereGeometry(0.04, 16, 16);
    
    // High-symmetry coordinates registry
    const hsPoints = {
      "G": [0.0, 0.0, 0.0],
      "L": [0.5, 0.5, 0.5],
      "X": [0.5, 0.0, 0.5],
      "U": [0.625, 0.25, 0.625],
      "K": [0.375, 0.375, 0.75],
      "W": [0.5, 0.25, 0.75]
    };

    const spMaterialNormal = new THREE.MeshBasicMaterial({ color: 0x06b6d4 }); // Cyan

    for (const [name, frac] of Object.entries(hsPoints)) {
      const cartNorm = fractionalToNormalizedCartesianReciprocal(frac);
      
      const mesh = new THREE.Mesh(spGeom, spMaterialNormal.clone());
      mesh.position.set(cartNorm[0], cartNorm[1], cartNorm[2]);
      
      mesh.userData = {
        name: name,
        frac: frac,
        cartNormalized: cartNorm,
        cartPhysical: cartNorm.map(val => val * factor) // multiply by 2pi/a
      };
      
      this.specialPointsGroup.add(mesh);
      
      // Render text label next to the sphere
      const labelText = name === 'G' ? 'Γ' : name;
      const sprite = this.createTextSprite(labelText, '#38bdf8'); // light blue
      sprite.position.set(cartNorm[0], cartNorm[1] + 0.08, cartNorm[2]);
      this.specialPointsGroup.add(sprite);
    }

    // 4. Create k-Path line segments
    if (this.state.bands) {
      const pathPositions = [];
      this.state.bands.branches.forEach(branch => {
        const kpoints = branch.kpointsCartesian; // Already in units of 2pi/a
        for (let i = 0; i < kpoints.length - 1; i++) {
          pathPositions.push(kpoints[i][0], kpoints[i][1], kpoints[i][2]);
          pathPositions.push(kpoints[i+1][0], kpoints[i+1][1], kpoints[i+1][2]);
        }
      });

      const pathGeom = new THREE.BufferGeometry();
      pathGeom.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
      const pathMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, linewidth: 3 }); // Purple
      this.kPathLine = new THREE.LineSegments(pathGeom, pathMat);
      this.scene.add(this.kPathLine);
    }

    // 5. Create path segment labels Group (Lambda, Delta, Sigma)
    if (this.kPathLabelsGroup) this.scene.remove(this.kPathLabelsGroup);
    this.kPathLabelsGroup = new THREE.Group();
    this.scene.add(this.kPathLabelsGroup);

    // Lambda (midpoint of L to G)
    const lambdaSprite = this.createTextSprite('Λ', '#fb923c');
    lambdaSprite.position.set(0.25, 0.25 + 0.05, 0.25);
    this.kPathLabelsGroup.add(lambdaSprite);

    // Delta (midpoint of G to X)
    const deltaSprite = this.createTextSprite('Δ', '#fb923c');
    deltaSprite.position.set(0.0, 0.5 + 0.05, 0.0);
    this.kPathLabelsGroup.add(deltaSprite);

    // Sigma (midpoint of K to G)
    const sigmaSprite = this.createTextSprite('Σ', '#fb923c');
    sigmaSprite.position.set(0.375, 0.375 + 0.05, 0.0);
    this.kPathLabelsGroup.add(sigmaSprite);

    // Initial visibility state update
    this.updateVisibility();

    // Reset camera target
    this.controls.target.set(0, 0, 0);
  }

  updateActiveKIndicator() {
    if (!this.state.physics.activeK || !this.kIndicator) return;
    const activeK = this.state.physics.activeK;
    const cart = activeK.cartesian; // in units of 2pi/a
    this.kIndicator.position.set(cart[0], cart[1], cart[2]);
  }

  updateVisibility() {
    const showBZ = this.state.presentation.showBZBoundary;
    if (this.bzMesh) this.bzMesh.visible = showBZ;
    if (this.bzLines) this.bzLines.visible = showBZ;

    const showKPath = this.state.presentation.showKPath;
    if (this.kPathLine) this.kPathLine.visible = showKPath;
    if (this.kPathLabelsGroup) this.kPathLabelsGroup.visible = showKPath;

    const showPts = this.state.presentation.showSpecialPoints;
    if (this.specialPointsGroup) this.specialPointsGroup.visible = showPts;
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

  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.specialPointsGroup.children);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      this.selectSpecialPoint(clickedMesh);
    }
  }

  selectSpecialPoint(mesh) {
    // Reset previous selection colors
    if (this.selectedPointMesh) {
      this.selectedPointMesh.material.color.setHex(0x06b6d4);
    }

    this.selectedPointMesh = mesh;
    // Highlight in Orange
    mesh.material.color.setHex(0xf59e0b);

    const name = mesh.userData.name;
    const frac = mesh.userData.frac;
    const cartNorm = mesh.userData.cartNormalized;
    const cartPhys = mesh.userData.cartPhysical;

    // Detailed description based on point
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

    // Find matching point distance on the path to update the state
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

  updateSegmentHighlight() {
    if (this.highlightedSegmentLine) {
      this.scene.remove(this.highlightedSegmentLine);
      this.highlightedSegmentLine = null;
    }

    const seg = this.state.physics.activePathSegment;
    if (!seg) return;

    // Define coords in units of 2pi/a
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

    // Draw cylinder represent thick line
    const geom = new THREE.CylinderGeometry(0.025, 0.025, length, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b }); // Orange
    const mesh = new THREE.Mesh(geom, mat);

    mesh.position.copy(p1).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

    this.highlightedSegmentLine = mesh;
    this.scene.add(this.highlightedSegmentLine);
  }
}
