const { execSync } = require('child_process');
try {
  execSync('npm run build', { stdio: 'pipe' });
  console.log("Success");
} catch (e) {
  console.log("ERROR OUTPUT:", e.stdout.toString() + e.stderr.toString());
}
