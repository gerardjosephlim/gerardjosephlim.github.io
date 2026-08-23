// src/validation/tests.js
import { dot, cross, norm } from '../js/physics/vector.js';
import { calculateReciprocalVectors, verifyOrthogonality } from '../js/physics/reciprocal-lattice.js';
import { generateBrillouinZone, verifyFCCBrillouinZoneTopology } from '../js/physics/brillouin-zone.js';
import { fractionalToNormalizedCartesianReciprocal } from '../js/physics/coordinates.js';

export function runPhysicsValidationTests(state) {
  const logs = [];
  let allPassed = true;

  function assert(condition, message) {
    if (condition) {
      logs.push({ status: 'PASS', message });
    } else {
      logs.push({ status: 'FAIL', message });
      allPassed = false;
    }
  }

  try {
    logs.push({ status: 'INFO', message: 'Starting Crystal Electronic Structure Explorer Validation Suite...' });

    // 1. Silicon Lattice parameter and coordinates
    const a = state.material.latticeConstant;
    assert(Math.abs(a - 5.431) < 1e-3, `Lattice constant parameter 'a' is ${a} Å (expected ~5.431 Å).`);

    // 2. Real-space primitive volume V_p = a^3 / 4
    const a1 = state.material.primitiveVectors[0];
    const a2 = state.material.primitiveVectors[1];
    const a3 = state.material.primitiveVectors[2];
    const vp = dot(a1, cross(a2, a3));
    const expectedVp = Math.pow(a, 3) / 4;
    assert(Math.abs(vp - expectedVp) < 1e-4, `Primitive volume V_p is ${vp.toFixed(4)} Å³ (expected ~${expectedVp.toFixed(4)} Å³, matching the required ~40.05 Å³).`);

    // 3. Coordination and nearest-neighbor distance
    // In diamond cubic Silicon, each atom is bonded to 4 nearest neighbors at distance sqrt(3)/4 * a
    const expectedNN = (Math.sqrt(3) / 4) * a;
    assert(Math.abs(expectedNN - 2.3517) < 1e-3, `Theoretical nearest-neighbor bond distance is ${expectedNN.toFixed(4)} Å (expected ~2.352 Å).`);

    // Check rendered conventional cell occupancy sum
    const convAtoms = state.material.conventionalAtoms;
    const totalConvOccupancy = convAtoms.reduce((sum, atom) => sum + atom.weight, 0);
    assert(Math.abs(totalConvOccupancy - 8.0) < 1e-5, `Sum of conventional cell occupancy weights is ${totalConvOccupancy} (expected exactly 8.0 atoms).`);

    // Check rendered primitive cell occupancy sum
    const primAtoms = state.material.primitiveAtoms;
    const totalPrimOccupancy = primAtoms.reduce((sum, atom) => sum + atom.weight, 0);
    assert(Math.abs(totalPrimOccupancy - 2.0) < 1e-5, `Sum of primitive cell occupancy weights is ${totalPrimOccupancy} (expected exactly 2.0 atoms).`);

    // 4. Reciprocal Lattice Orthogonality check a_i . b_j = 2pi * delta_ij
    const bVectors = calculateReciprocalVectors(state.material.primitiveVectors);
    const orthoCheck = verifyOrthogonality(state.material.primitiveVectors, bVectors);
    assert(orthoCheck.pass, orthoCheck.pass ? 'Reciprocal lattice primitive vectors satisfy a_i · b_j = 2πδ_ij.' : orthoCheck.error);

    // 5. Brillouin Zone Construction and Topology check
    const bz = generateBrillouinZone(bVectors);
    const topologyCheck = verifyFCCBrillouinZoneTopology(bz);
    assert(topologyCheck.pass, topologyCheck.pass ? 'Generic BZ algorithm successfully generates FCC truncated octahedron (24 vertices, 14 faces, 36 edges).' : topologyCheck.error);

    // 6. High-Symmetry Points coordinates mapping (normalized to 2pi/a)
    // Γ = (0,0,0), L = (0.5, 0.5, 0.5), X = (0, 1, 0), U = (0.25, 1, 0.25), K = (0.75, 0.75, 0), W = (0.5, 1, 0)
    const hsPoints = {
      G: [0.0, 0.0, 0.0],
      L: [0.5, 0.5, 0.5],
      X: [0.5, 0.0, 0.5],
      U: [0.625, 0.25, 0.625],
      K: [0.375, 0.375, 0.75],
      W: [0.5, 0.25, 0.75]
    };
    
    const expectedCartHS = {
      G: [0.0, 0.0, 0.0],
      L: [0.5, 0.5, 0.5],
      X: [0.0, 1.0, 0.0],
      U: [0.25, 1.0, 0.25],
      K: [0.75, 0.75, 0.0],
      W: [0.5, 1.0, 0.0]
    };

    let hsCartCheck = true;
    for (const [key, frac] of Object.entries(hsPoints)) {
      const cart = fractionalToNormalizedCartesianReciprocal(frac);
      const expected = expectedCartHS[key];
      const dist = Math.sqrt(sumSqDiff(cart, expected));
      if (dist > 1e-5) {
        hsCartCheck = false;
        logs.push({ status: 'FAIL', message: `High-symmetry point '${key}' mapped to [${cart.join(', ')}] (expected [${expected.join(', ')}]).` });
      }
    }
    assert(hsCartCheck, 'All primitive reciprocal high-symmetry coordinates correctly map to normalized Cartesian reciprocal positions.');

    // 7. Band gap and VBM/CBM locations
    const calcGap = state.bands.calculatedGap;
    const vbm = state.bands.vbm;
    const cbm = state.bands.cbm;
    assert(Math.abs(calcGap - 0.612) < 1e-3, `Calculated fundamental band gap from DFT PBE is ${calcGap.toFixed(4)} eV (expected ~0.612 eV).`);
    assert(Math.abs(vbm.energy - 0.0) < 1e-5 && vbm.kpoint.join(',') === '0,0,0', `Valence Band Maximum (VBM) is at energy ${vbm.energy} eV at Γ point [${vbm.kpoint.join(', ')}].`);
    assert(Math.abs(cbm.energy - 0.612) < 1e-5, `Conduction Band Minimum (CBM) is at energy ${cbm.energy} eV (along the Δ path).`);

    // 8. Teaching Path Branch and Monotonicity Checks
    // Path: L - G - X - U || K - G
    assert(state.bands.branches.length === 2, `Electronic structure contains exactly ${state.bands.branches.length} continuous branches.`);
    
    let monotonicCheck = true;
    for (const branch of state.bands.branches) {
      const dists = branch.distances;
      for (let i = 1; i < dists.length; i++) {
        if (dists[i] <= dists[i - 1]) {
          monotonicCheck = false;
          logs.push({ status: 'FAIL', message: `Branch '${branch.name}' distance is not strictly monotonic at index ${i} (${dists[i-1].toFixed(4)} -> ${dists[i].toFixed(4)}).` });
        }
      }
    }
    assert(monotonicCheck, 'All branches have strictly monotonic cumulative physical path distances.');

  } catch (err) {
    logs.push({ status: 'ERROR', message: `Validation suite crashed: ${err.message}` });
    allPassed = false;
  }

  return { allPassed, logs };
}

function sumSqDiff(arr1, arr2) {
  return arr1.reduce((sum, val, idx) => sum + Math.pow(val - arr2[idx], 2), 0);
}
