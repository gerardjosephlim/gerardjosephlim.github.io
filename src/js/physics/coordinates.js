// src/js/physics/coordinates.js
import { scale, add } from './vector.js';

/**
 * Transforms fractional coordinates relative to conventional cubic cell to real Cartesian coordinates (in Angstroms).
 * For cubic cells, conventional coordinates simply scale by lattice constant 'a'.
 */
export function conventionalToCartesianReal(fracCoord, a) {
  return scale(fracCoord, a);
}

/**
 * Transforms fractional coordinates relative to primitive lattice vectors to real Cartesian coordinates (in Angstroms).
 * primitiveVectors is a 3x3 array (row vectors).
 */
export function primitiveToCartesianReal(fracCoord, primitiveVectors) {
  const [f1, f2, f3] = fracCoord;
  const [a1, a2, a3] = primitiveVectors;
  return [
    f1 * a1[0] + f2 * a2[0] + f3 * a3[0],
    f1 * a1[1] + f2 * a2[1] + f3 * a3[1],
    f1 * a1[2] + f2 * a2[2] + f3 * a3[2]
  ];
}

/**
 * Transforms reciprocal fractional coordinates (coefficients of primitive reciprocal vectors b1, b2, b3)
 * into normalized Cartesian reciprocal coordinates (in units of 2pi/a).
 * 
 * Using our FCC primitive vectors convention:
 * b1 = 2pi/a * [-1, 1, 1]
 * b2 = 2pi/a * [1, -1, 1]
 * b3 = 2pi/a * [1, 1, -1]
 * 
 * Normalized Cartesian coordinates:
 * k_normalized = h*[-1,1,1] + k*[1,-1,1] + l*[1,1,-1]
 */
export function fractionalToNormalizedCartesianReciprocal(fracCoord) {
  const [h, k, l] = fracCoord;
  return [
    -h + k + l,
    h - k + l,
    h + k - l
  ];
}

/**
 * Transforms reciprocal fractional coordinates to Cartesian reciprocal coordinates in physical units (1/Angstrom).
 * reciprocalVectors is a 3x3 array [b1, b2, b3] (each in 1/Angstrom).
 */
export function fractionalToPhysicalCartesianReciprocal(fracCoord, reciprocalVectors) {
  const [h, k, l] = fracCoord;
  const [b1, b2, b3] = reciprocalVectors;
  return [
    h * b1[0] + k * b2[0] + l * b3[0],
    h * b1[1] + k * b2[1] + l * b3[1],
    h * b1[2] + k * b2[2] + l * b3[2]
  ];
}
