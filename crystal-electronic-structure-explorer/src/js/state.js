// src/js/state.js
import { findPathCoordinatesForDistance, interpolateKPoint, interpolateEnergies } from './physics/kpath.js';

export class AppState {
  constructor() {
    // Scientific State
    this.material = null; // Loaded from api/material.php
    this.bands = null;    // Loaded from api/bands.php
    
    this.physics = {
      activeK: {
        branchIndex: 0,
        kIndex: 0,
        t: 0.0,
        fractional: [0.0, 0.0, 0.0],
        cartesian: [0.0, 0.0, 0.0], // in units of 2pi/a
        s: 0.0,                      // cumulative path distance in Å^-1
        discontinuity: false,
        energies: []                 // interpolated energies at current k
      },
      activeBand: null,
      energyReference: 'VBM',       // VBM or Fermi
      scissorEnabled: false,        // off by default
      activePathSegment: null       // null, 'lambda', 'delta', 'sigma'
    };

    // Presentation State
    this.presentation = {
      viewMode: 'split',            // split, crystal, reciprocal, bands
      showBonds: true,
      showCellType: 'conventional', // conventional, primitive
      showBZBoundary: true,
      showKPath: true,
      showSpecialPoints: true,
      teachingStep: 0,
      isPlayingTour: false
    };

    // Listeners for state changes
    this.listeners = [];
  }

  // Subscribe to state updates
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
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
      const structRes = await fetch(`/api/material.php?id=${materialId}`);
      if (!structRes.ok) throw new Error(`HTTP error loading structure: ${structRes.status}`);
      this.material = await structRes.json();

      const bandsRes = await fetch(`/api/bands.php?material=${materialId}`);
      if (!bandsRes.ok) throw new Error(`HTTP error loading bands: ${bandsRes.status}`);
      this.bands = await bandsRes.json();

      // Reset active K to the start of the path
      this.setPathDistance(this.bands.branches[0].distances[0], false);
      
      this.notify('DATA_LOADED');
    } catch (e) {
      console.error('Failed to load material data:', e);
      throw e;
    }
  }

  // Set the active k position by specifying the path distance 's' (in Å^-1)
  setPathDistance(s, triggerNotify = true) {
    if (!this.bands) return;
    
    const coord = findPathCoordinatesForDistance(s, this.bands.branches);
    const branch = this.bands.branches[coord.branchIndex];
    
    const k1 = branch.kpoints[coord.kIndex];
    const k2 = coord.kIndex < branch.kpoints.length - 1 ? branch.kpoints[coord.kIndex + 1] : k1;
    const fracK = interpolateKPoint(k1, k2, coord.t);
    
    const kc1 = branch.kpointsCartesian[coord.kIndex];
    const kc2 = coord.kIndex < branch.kpointsCartesian.length - 1 ? branch.kpointsCartesian[coord.kIndex + 1] : kc1;
    const cartK = interpolateKPoint(kc1, kc2, coord.t);
    
    const baseEnergies = interpolateEnergies(branch, coord.kIndex, coord.t);
    
    // Apply dynamic scissor correction if enabled (applied only to conduction bands 4-7)
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
      s: s,
      discontinuity: coord.discontinuity,
      energies: finalEnergies
    };

    if (triggerNotify) {
      this.notify('K_CHANGED');
    }
  }

  setScissorEnabled(enabled) {
    this.physics.scissorEnabled = enabled;
    // Re-evaluate energies at current s
    this.setPathDistance(this.physics.activeK.s, false);
    this.notify('SCISSOR_CHANGED');
  }

  setViewMode(mode) {
    this.presentation.viewMode = mode;
    this.notify('VIEW_MODE_CHANGED');
  }

  setCellType(type) {
    this.presentation.showCellType = type;
    this.notify('CELL_TYPE_CHANGED');
  }

  setBondsVisible(visible) {
    this.presentation.showBonds = visible;
    this.notify('BONDS_VISIBILITY_CHANGED');
  }

  setTeachingStep(step) {
    this.presentation.teachingStep = step;
    this.notify('TOUR_STEP_CHANGED');
  }

  setActivePathSegment(segment) {
    this.physics.activePathSegment = segment;
    this.notify('PATH_SEGMENT_CHANGED');
  }

  setBZBoundaryVisible(visible) {
    this.presentation.showBZBoundary = visible;
    this.notify('BZ_VISIBILITY_CHANGED');
  }

  setKPathVisible(visible) {
    this.presentation.showKPath = visible;
    this.notify('KPATH_VISIBILITY_CHANGED');
  }

  setSpecialPointsVisible(visible) {
    this.presentation.showSpecialPoints = visible;
    this.notify('SPECIAL_POINTS_VISIBILITY_CHANGED');
  }
}
