const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  const assetsDir = path.join(__dirname, '../public/assets');
  const isProd = process.argv.includes('--prod');
  
  // Clean existing assets
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '../src/js/app.js'),
        path.join(__dirname, '../src/css/main.css')
      ],
      bundle: true,
      minify: isProd,
      sourcemap: !isProd,
      outdir: assetsDir,
      entryNames: isProd ? '[name].[hash]' : '[name]',
      metafile: true,
    });

    // Extract the generated filenames
    const outputs = Object.keys(result.metafile.outputs);
    
    const jsFile = outputs.find(f => f.endsWith('.js'));
    const cssFile = outputs.find(f => f.endsWith('.css'));
    
    const relativeJsFile = path.basename(jsFile);
    const relativeCssFile = path.basename(cssFile);

    // Save manifest file for PHP to read
    const manifest = {
      'app.js': `/assets/${relativeJsFile}`,
      'main.css': `/assets/${relativeCssFile}`
    };
    
    fs.writeFileSync(
      path.join(assetsDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log(`Successfully built ${isProd ? 'production' : 'development'} assets.`);
    console.log(`JS: ${relativeJsFile}`);
    console.log(`CSS: ${relativeCssFile}`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
