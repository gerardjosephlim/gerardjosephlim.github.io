# Crystal Electronic Structure Explorer

An interactive, scientifically rigorous, browser-based teaching application that connects three representations of crystalline solids:
1.  **Real-space crystal structure**
2.  **Reciprocal space / Brillouin zone**
3.  **Electronic band structure**

Silicon (`mp-149`) is the first fully implemented reference material. The core rendering and interaction architectures are generic and material-independent.

---

## 1. Directory Structure

The project has a strict separation between public web-facing assets and protected backend code/data:

*   `/app` - Protected PHP application controller and services.
*   `/data` - Protected local scientific JSON datasets (Silicon).
*   `/public` - Web-accessible root containing entry `index.php` and static assets.
*   `/src` - Source client-side JavaScript modules and stylesheets.
*   `/scripts` - Data preparation and asset building scripts.
*   `/docs` - Technical conventions and mathematical documentation.

---

## 2. Server-Side PHP Layer

PHP 8 is used as the server-side layer to handle configuration, material registry allowlisting, server-side data validation, and asset delivery via REST endpoints:
*   `/api/material.php?id=silicon` - Serves checked real-space crystallography structure.
*   `/api/bands.php?material=silicon` - Serves validated DFT-PBE band structure.

---

## 3. Client-Side Physics Modules

The client-side scientific logic is organized under `/src/js/physics/`:
*   `vector.js` - Lightweight 3D vector and matrix linear algebra.
*   `coordinates.js` - Transformations between fractional and Cartesian real/reciprocal coordinates.
*   `reciprocal-lattice.js` - Computes primitive reciprocal vectors and tests orthogonality.
*   `brillouin-zone.js` - Generic Wigner-Seitz cell generator using plane half-space intersections.
*   `kpath.js` - Handles path branches, distance mapping in $\text{Å}^{-1}$, and discontinuity jumps.

---

## 4. Run Locally

### 4.1 Prerequisites
*   **PHP 8.0+**
*   **Node.js v18+** and **npm**

### 4.2 Installation
Install the development dependencies (specifically `esbuild` for minifying JavaScript):
```bash
npm install
```

### 4.3 Running the Development Server
Start the local PHP server:
```bash
npm run dev:server
```
Then, open your browser and navigate to `http://localhost:8000`.

To run the app in **debug mode** with the **Physics Validation Dashboard** visible, append `?debug=1` to the URL:
`http://localhost:8000?debug=1`

### 4.4 Production Asset Bundling
To compile, bundle, and minify the ES module structure and generate hashed assets with a manifest for production deployment, run:
```bash
npm run build
```

---

## 5. Security & Browser Limits Disclaimer

As required by the security model of this application:
> The application uses PHP to protect server-side data, credentials, preparation logic, and non-public application components. Interactive WebGL rendering necessarily requires JavaScript to execute in the client browser. Production JavaScript is bundled and minified and source maps are not published, but client-side code should never be considered secret.
> 
> Security must be designed accordingly. Do not depend on client-side obfuscation to protect credentials or authorization logic; keep sensitive database checks and live API calls on the server.
