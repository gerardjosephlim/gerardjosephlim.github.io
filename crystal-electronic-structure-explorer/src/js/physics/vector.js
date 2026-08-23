// src/js/physics/vector.js

export function add(v1, v2) {
  return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

export function sub(v1, v2) {
  return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
}

export function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(v1, v2) {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function cross(v1, v2) {
  return [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ];
}

export function norm(v) {
  return Math.sqrt(dot(v, v));
}

export function normalize(v) {
  const n = norm(v);
  if (n === 0) return [0, 0, 0];
  return scale(v, 1 / n);
}

export function det3x3(m) {
  // m is a 3x3 matrix as array of row vectors: [row0, row1, row2]
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

export function invert3x3(m) {
  const d = det3x3(m);
  if (Math.abs(d) < 1e-12) {
    throw new Error('Matrix is singular and cannot be inverted.');
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

export function matrixVectorMultiply(m, v) {
  // m is 3x3, v is 3D vector
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}
