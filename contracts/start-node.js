import { spawn } from 'child_process';
import http from 'http';

console.log("Starting Hardhat node...");
const nodeProcess = spawn('npx', ['hardhat', 'node', '--hostname', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true
});

function checkPort() {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 8545,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.write(JSON.stringify({ jsonrpc: '2.0', method: 'web3_clientVersion', params: [], id: 1 }));
    req.end();
  });
}

async function start() {
  let ready = false;
  console.log("Waiting for RPC port (8545) to become active...");
  for (let i = 0; i < 30; i++) {
    ready = await checkPort();
    if (ready) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (!ready) {
    console.error("Hardhat node failed to start in 30 seconds.");
    process.exit(1);
  }
  
  console.log("Hardhat node is ready! Deploying contracts...");
  const deployProcess = spawn('npx', ['hardhat', 'run', 'scripts/deploy.ts', '--network', 'localhost'], {
    stdio: 'inherit',
    shell: true
  });
  
  deployProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Contract deployment failed with exit code ${code}`);
    } else {
      console.log("Contracts deployed successfully! Node is running...");
    }
  });
}

start();
