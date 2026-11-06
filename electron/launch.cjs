const { spawn } = require('child_process');
const electronPath = require('electron');

delete process.env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('dev')) {
  process.env.NODE_ENV = 'development';
}

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
