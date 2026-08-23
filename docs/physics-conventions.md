# Physics Conventions

This document outlines the crystallographic, mathematical, and physical conventions used in the Crystal Electronic Structure Explorer.

---

## 1. Real-Space Lattice Vectors

The reference material is Silicon in the diamond cubic structure. The underlying Bravais lattice is Face-Centered Cubic (FCC).

The conventional cubic lattice vectors are:
$$
\mathbf{u}_1 = a(1, 0, 0), \quad \mathbf{u}_2 = a(0, 1, 0), \quad \mathbf{u}_3 = a(0, 0, 1)
$$
where $a$ is the lattice constant. For Silicon, we use:
$$
a = 5.431\ \text{Å}
$$

The primitive lattice vectors are chosen following the standard FCC convention (e.g., as used in ASE and Setyawan-Curtarolo):
$$
\mathbf{a}_1 = \frac{a}{2}(0, 1, 1), \quad \mathbf{a}_2 = \frac{a}{2}(1, 0, 1), \quad \mathbf{a}_3 = \frac{a}{2}(1, 1, 0)
$$

The volume of the primitive cell is:
$$
V_p = \mathbf{a}_1 \cdot (\mathbf{a}_2 \times \mathbf{a}_3) = \frac{a^3}{4} \approx 40.05\ \text{Å}^3
$$

---

## 2. Atomic Basis

The diamond cubic structure is constructed by placing a two-atom basis at each FCC Bravais lattice site:
*   **Atom A**: $\mathbf{r}_A = (0, 0, 0)$
*   **Atom B**: $\mathbf{r}_B = (\frac{1}{4}, \frac{1}{4}, \frac{1}{4})$ (in conventional fractional coordinates).

This results in 8 atoms per conventional cubic unit cell.

---

## 3. Reciprocal Space primitive Vectors

The primitive reciprocal lattice vectors $\mathbf{b}_1, \mathbf{b}_2, \mathbf{b}_3$ are mathematically derived to satisfy the orthogonality condition:
$$
\mathbf{a}_i \cdot \mathbf{b}_j = 2\pi \delta_{ij}
$$

Using the cyclic relation:
$$
\mathbf{b}_i = 2\pi \frac{\mathbf{a}_j \times \mathbf{a}_k}{\mathbf{a}_1 \cdot (\mathbf{a}_2 \times \mathbf{a}_3)}
$$
we obtain the primitive reciprocal vectors for the FCC lattice:
$$
\mathbf{b}_1 = \frac{2\pi}{a}(-1, 1, 1), \quad \mathbf{b}_2 = \frac{2\pi}{a}(1, -1, 1), \quad \mathbf{b}_3 = \frac{2\pi}{a}(1, 1, -1)
$$

The reciprocal lattice of FCC is a Body-Centered Cubic (BCC) lattice.

---

## 4. First Brillouin Zone Construction

The first Brillouin zone (BZ) is defined as the Wigner-Seitz cell of the reciprocal lattice.
For FCC, this polyhedron is a **truncated octahedron** consisting of:
*   **14 faces**: 6 square faces (on planes $k_i = \pm 1.0 \frac{2\pi}{a}$) and 8 hexagonal faces (on planes $\pm k_x \pm k_y \pm k_z = 1.5 \frac{2\pi}{a}$).
*   **24 vertices**: Permutations of $(\pm 1.0, \pm 0.5, 0.0)$ in units of $\frac{2\pi}{a}$.
*   **36 edges**: Each edge has length $\sqrt{0.5} \frac{2\pi}{a} \approx 0.707 \frac{2\pi}{a}$.

---

## 5. High-Symmetry Points

Special points are defined in fractional reciprocal coordinates with respect to the primitive basis $\mathbf{b}_1, \mathbf{b}_2, \mathbf{b}_3$:

| Point | Primitive Reciprocal Fractional Coordinate | Normalized Cartesian Coordinate (units of $2\pi/a$) | Description |
| :---: | :---: | :---: | :---: |
| $\Gamma$ | $(0, 0, 0)$ | $(0, 0, 0)$ | Center of the Brillouin Zone |
| $L$ | $(\frac{1}{2}, \frac{1}{2}, \frac{1}{2})$ | $(0.5, 0.5, 0.5)$ | Hexagonal face center |
| $X$ | $(\frac{1}{2}, 0, \frac{1}{2})$ | $(0.0, 1.0, 0.0)$ | Square face center |
| $U$ | $(\frac{5}{8}, \frac{1}{4}, \frac{5}{8})$ | $(0.25, 1.0, 0.25)$ | Boundary point near $X$ |
| $K$ | $(\frac{3}{8}, \frac{3}{8}, \frac{3}{4})$ | $(0.75, 0.75, 0.0)$ | Joint between two hexagonal faces |
| $W$ | $(\frac{1}{2}, \frac{1}{4}, \frac{3}{4})$ | $(0.5, 1.0, 0.0)$ | Polyhedron vertex |

---

## 6. Symmetry Directions and Lines

Standard notations describe paths along symmetry directions:
*   $\Delta$ (Delta): Direction $\Gamma \rightarrow X$, corresponding to the $\langle 100 \rangle$ crystal family.
*   $\Lambda$ (Lambda): Direction $\Gamma \rightarrow L$, corresponding to the $\langle 111 \rangle$ crystal family.
*   $\Sigma$ (Sigma): Direction $\Gamma \rightarrow K$, corresponding to the $\langle 110 \rangle$ crystal family.
