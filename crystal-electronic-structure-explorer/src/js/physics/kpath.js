// src/js/physics/kpath.js

/**
 * Finds the correct branch, kpoint index, and interpolation factor 't' 
 * for a given cumulative path distance 's'.
 * 
 * Returns: {
 *   branchIndex: number,
 *   kIndex: number,           // Index of the starting point of the segment
 *   t: number,                // Interpolation parameter [0, 1]
 *   discontinuity: boolean    // True if at a boundary/discontinuity
 * }
 */
export function findPathCoordinatesForDistance(s, branches) {
  // Loop through branches to find which branch 's' falls into
  for (let bIdx = 0; bIdx < branches.length; bIdx++) {
    const branch = branches[bIdx];
    const distances = branch.distances;
    const sStart = distances[0];
    const sEnd = distances[distances.length - 1];
    
    if (s >= sStart && s <= sEnd) {
      // Find the specific segment inside this branch
      for (let i = 0; i < distances.length - 1; i++) {
        const d1 = distances[i];
        const d2 = distances[i + 1];
        if (s >= d1 && s <= d2) {
          const denom = d2 - d1;
          const t = denom === 0 ? 0 : (s - d1) / denom;
          return {
            branchIndex: bIdx,
            kIndex: i,
            t: t,
            discontinuity: false
          };
        }
      }
    }
    
    // Check if s falls in the gap between this branch and the next
    if (bIdx < branches.length - 1) {
      const nextBranch = branches[bIdx + 1];
      const nextStart = nextBranch.distances[0];
      if (s > sEnd && s < nextStart) {
        return {
          branchIndex: bIdx,
          kIndex: distances.length - 1,
          t: 1.0,
          discontinuity: true
        };
      }
    }
  }
  
  // Return boundary values if out of bounds
  if (s < branches[0].distances[0]) {
    return { branchIndex: 0, kIndex: 0, t: 0.0, discontinuity: false };
  }
  
  const lastBIdx = branches.length - 1;
  const lastBranch = branches[lastBIdx];
  return {
    branchIndex: lastBIdx,
    kIndex: lastBranch.distances.length - 2,
    t: 1.0,
    discontinuity: false
  };
}

/**
 * Interpolates a k-point coordinate (fractional or Cartesian) between two points.
 */
export function interpolateKPoint(k1, k2, t) {
  return [
    k1[0] + (k2[0] - k1[0]) * t,
    k1[1] + (k2[1] - k1[1]) * t,
    k1[2] + (k2[2] - k1[2]) * t
  ];
}

/**
 * Interpolates all band energies for a given position along the path.
 * Returns an array of energies (one per band).
 */
export function interpolateEnergies(branch, kIndex, t) {
  const energies = branch.energies; // Array of arrays (bandIndex -> kpointIndex)
  const numBands = energies.length;
  const interpolated = [];
  
  for (let b = 0; b < numBands; b++) {
    const e1 = energies[b][kIndex];
    const e2 = energies[b][kIndex + 1];
    interpolated.push(e1 + (e2 - e1) * t);
  }
  
  return interpolated;
}

/**
 * Calculates the total path length (excluding discontinuities/gaps)
 * and the visual plot length (including discontinuities).
 */
export function getPathMetadata(branches) {
  let totalPhysicalLength = 0;
  
  for (const branch of branches) {
    const dists = branch.distances;
    totalPhysicalLength += (dists[dists.length - 1] - dists[0]);
  }
  
  return {
    totalPhysicalLength,
    numBranches: branches.length
  };
}
