# Coordinate Systems and Transformations

This document describes the coordinate systems and transformation functions used in the explorer, with worked examples for Silicon.

---

## 1. Real Space Coordinate Systems

### 1.1 Conventional Fractional Coordinates
Coordinates are expressed as a triple $(x_f, y_f, z_f)$ where $x_f, y_f, z_f \in [0, 1)$ represent fractions of the conventional cubic unit cell axes.

### 1.2 Cartesian Coordinates (Å)
Real-space physical coordinates in Angstroms ($x, y, z$).
Conversion from conventional fractional:
$$
\mathbf{r}_{\text{Cart}} = (x_f \cdot a, \ y_f \cdot a, \ z_f \cdot a)
$$
*Example (Silicon basis site B)*:
*   Conventional fractional: $\mathbf{r}_B = (0.25, 0.25, 0.25)$
*   Lattice constant $a = 5.431\ \text{Å}$
*   Cartesian: $\mathbf{r}_{\text{Cart}} = (1.35775, 1.35775, 1.35775)\ \text{Å}$

### 1.3 Primitive Fractional Coordinates
Coordinates relative to the primitive lattice vectors $\mathbf{a}_1, \mathbf{a}_2, \mathbf{a}_3$.
$$
\mathbf{r}_{\text{Cart}} = u_1 \mathbf{a}_1 + u_2 \mathbf{a}_2 + u_3 \mathbf{a}_3
$$
For FCC primitive vectors:
$$
\mathbf{r}_{\text{Cart}} = u_1 \frac{a}{2}(0,1,1) + u_2 \frac{a}{2}(1,0,1) + u_3 \frac{a}{2}(1,1,0)
$$
Solving for conventional fractional coordinates $(x_f, y_f, z_f)$:
$$
x_f = \frac{1}{2}(u_2 + u_3), \quad y_f = \frac{1}{2}(u_1 + u_3), \quad z_f = \frac{1}{2}(u_1 + u_2)
$$

---

## 2. Reciprocal Space Coordinate Systems

### 2.1 Reciprocal Fractional Coordinates
Expressed as $(h, k, l)$ representing coefficients of the primitive reciprocal lattice vectors $\mathbf{b}_1, \mathbf{b}_2, \mathbf{b}_3$:
$$
\mathbf{k} = h \mathbf{b}_1 + k \mathbf{b}_2 + l \mathbf{b}_3
$$

### 2.2 Normalized Cartesian Reciprocal Coordinates (units of $2\pi/a$)
Reciprocal wavevectors normalized to dimensionless components $(\tilde{k}_x, \tilde{k}_y, \tilde{k}_z)$ where:
$$
\tilde{\mathbf{k}} = \mathbf{k} \cdot \frac{a}{2\pi}
$$
Given the FCC reciprocal vectors in units of $2\pi/a$:
*   $\tilde{\mathbf{b}}_1 = (-1, 1, 1)$
*   $\tilde{\mathbf{b}}_2 = (1, -1, 1)$
*   $\tilde{\mathbf{b}}_3 = (1, 1, -1)$

The conversion is:
$$
\tilde{\mathbf{k}} = h (-1, 1, 1) + k (1, -1, 1) + l (1, 1, -1)
$$
$$
\tilde{k}_x = -h + k + l, \quad \tilde{k}_y = h - k + l, \quad \tilde{k}_z = h + k - l
$$

### 2.3 Physical Cartesian Reciprocal Coordinates ($\text{Å}^{-1}$)
Reciprocal wavevectors in units of inverse Angstroms:
$$
\mathbf{k}_{\text{Cart}} = \tilde{\mathbf{k}} \cdot \frac{2\pi}{a}
$$
For $a = 5.431\ \text{Å}$, the scaling factor is:
$$
\frac{2\pi}{a} \approx 1.1569\ \text{Å}^{-1}
$$

---

## 3. Worked Reciprocal Examples

### 3.1 Gamma point ($\Gamma$)
*   Fractional Reciprocal: $(0, 0, 0)$
*   Normalized Cartesian: $(0, 0, 0)$
*   Physical Cartesian: $(0, 0, 0)\ \text{Å}^{-1}$

### 3.2 L point
*   Fractional Reciprocal: $(0.5, 0.5, 0.5)$
*   Normalized Cartesian:
    *   $\tilde{k}_x = -0.5 + 0.5 + 0.5 = 0.5$
    *   $\tilde{k}_y = 0.5 - 0.5 + 0.5 = 0.5$
    *   $\tilde{k}_z = 0.5 + 0.5 - 0.5 = 0.5$
    *   $\tilde{\mathbf{k}} = (0.5, 0.5, 0.5)$
*   Physical Cartesian: $\mathbf{k}_{\text{Cart}} = (0.5785, 0.5785, 0.5785)\ \text{Å}^{-1}$
*   Distance $|L - \Gamma| = \sqrt{0.5^2 + 0.5^2 + 0.5^2} \frac{2\pi}{a} = 0.8660 \frac{2\pi}{a} \approx 1.002\ \text{Å}^{-1}$.

### 3.3 X point
*   Fractional Reciprocal: $(0.5, 0.0, 0.5)$
*   Normalized Cartesian:
    *   $\tilde{k}_x = -0.5 + 0.0 + 0.5 = 0.0$
    *   $\tilde{k}_y = 0.5 - 0.0 + 0.5 = 1.0$
    *   $\tilde{k}_z = 0.5 + 0.0 - 0.5 = 0.0$
    *   $\tilde{\mathbf{k}} = (0.0, 1.0, 0.0)$
*   Physical Cartesian: $\mathbf{k}_{\text{Cart}} = (0.0, 1.1569, 0.0)\ \text{Å}^{-1}$
*   Distance $|\Gamma - X| = 1.0000 \frac{2\pi}{a} \approx 1.157\ \text{Å}^{-1}$.
