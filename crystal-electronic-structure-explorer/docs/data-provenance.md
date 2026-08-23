# Data Provenance

This document details the source, calculation parameters, and processing methodology of the Silicon electronic band structure and crystal structure datasets.

---

## 1. Raw Data Source

The primary source for the crystal structure and electronic band structure is the **Materials Project database** for Silicon.

*   **Material ID**: `mp-149`
*   **Formula**: Si
*   **Space Group**: $Fd\bar{3}m$ (No. 227 - Diamond Cubic)
*   **Retrieval Date**: 2026-08-23

---

## 2. Calculation Parameters (PBE DFT)

The electronic eigenvalues were computed using standard Density Functional Theory (DFT) with the following parameters:
*   **Exchange-Correlation Functional**: GGA-PBE (Generalized Gradient Approximation of Perdew-Burke-Ernzerhof).
*   **Core Treatment**: Projector Augmented Wave (PAW) pseudopotentials.
*   **Energy Reference**: Valence Band Maximum (VBM) is shifted to $0.0\ \text{eV}$.

---

## 3. Band Gap Analysis

*   **Calculated Band Gap ($E_g^{\text{calc}}$)**: $0.612\ \text{eV}$
*   **Band Gap Type**: Indirect
*   **Valence Band Maximum (VBM) Location**: $\Gamma$ point, $k_{\text{frac}} = (0, 0, 0)$
*   **Conduction Band Minimum (CBM) Location**: Along the $\Delta$ line (path $\Gamma \rightarrow X$), specifically at fractional primitive reciprocal coordinates $k_{\text{frac}} = (0, 0.425, 0.425)$ (which maps to normalized Cartesian coordinates $(0, 0.85, 0)$).
*   **Experimental Band Gap ($E_g^{\text{exp}}$)**: $\approx 1.12\ \text{eV}$ near room temperature (300 K).

### DFT Gap Underestimation Note:
Standard semilocal exchange-correlation functionals like PBE systematically underestimate band gaps of semiconductors due to the lack of self-energy correction and derivative discontinuity in the functional.

---

## 4. Teaching Path Reconstruction

The pedagogical teaching path is assembled from the raw line-mode calculations of `mp-149` by isolating, reordering, and reversing segments where necessary to form the continuous path and explicit discontinuity:
$$
L \xrightarrow{\Lambda} \Gamma \xrightarrow{\Delta} X \rightarrow U \quad \parallel \quad K \rightarrow \Gamma
$$

### Reversal Logic:
To represent $L \rightarrow \Gamma$ instead of the raw $\Gamma \rightarrow L$, the data-preparation script:
1.  Reversed the order of the k-point coordinates.
2.  Reversed the corresponding energy eigenvalues for all 8 bands.
3.  Reversed the associated path distance coordinates.
Similar reversal was applied to the $U \rightarrow X$ raw segment to obtain $X \rightarrow U$.

### Discontinuity Handling:
The discontinuity at $U \parallel K$ is preserved. The physical distance between $U$ and $K$ is *not* added to the horizontal axis cumulative path length. Instead, the plot horizontal coordinate is shifted by a visual gap of $0.1 \times \frac{2\pi}{a}$ to indicate the break, and the client-side cursor jumps from $U$ to $K$ when crossed.

---

## 5. Dynamic Scissor Correction

To bridge the gap between calculated DFT bands and experimental reality for educational purposes, an optional **Scissor-Corrected Teaching View** is implemented.
The correction factor is computed dynamically:
$$
\Delta E_{\text{scissor}} = E_g^{\text{exp}} - E_g^{\text{calc}} = 1.12\ \text{eV} - 0.612\ \text{eV} = 0.508\ \text{eV}
$$

When enabled in the UI, the correction shifts all conduction bands (bands 4 to 7) upwards rigidly:
$$
E_{n,\text{corrected}}(\mathbf{k}) = E_n(\mathbf{k}) + \Delta E_{\text{scissor}} \quad \text{for } n \ge 4
$$
Valence bands (bands 0 to 3) remain unchanged.
