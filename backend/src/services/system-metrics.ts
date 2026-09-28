// backend/src/services/system-metrics.ts
import os from 'os';

interface SystemHealth {
  healthy: boolean;
  cpu: number;
  memory: number;
  eventLoopDelay: number;
  timestamp: number;
}

const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
const CPU_THRESHOLD = 80; // % usage
const MEMORY_THRESHOLD = 85; // % usage
const EVENT_LOOP_THRESHOLD = 100; // ms

let currentHealth: SystemHealth = {
  healthy: true,
  cpu: 0,
  memory: 0,
  eventLoopDelay: 0,
  timestamp: Date.now(),
};

// Measure event‑loop lag by comparing expected vs actual timeout
function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setTimeout(() => {
      const end = process.hrtime.bigint();
      const delayNs = Number(end - start - BigInt(1e9)); // subtract 1s expected
      resolve(Math.max(0, delayNs / 1e6)); // convert to ms
    }, 1000);
  });
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as any)[type];
    }
    totalIdle += cpu.times.idle;
  }
  return 100 - (totalIdle / totalTick) * 100;
}

function getMemoryUsage(): number {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return ((totalMem - freeMem) / totalMem) * 100;
}

async function updateHealth() {
  const cpu = getCpuUsage();
  const memory = getMemoryUsage();
  const eventLoopDelay = await measureEventLoopLag();

  const healthy =
    cpu < CPU_THRESHOLD &&
    memory < MEMORY_THRESHOLD &&
    eventLoopDelay < EVENT_LOOP_THRESHOLD;

  currentHealth = {
    healthy,
    cpu,
    memory,
    eventLoopDelay,
    timestamp: Date.now(),
  };
}

// Start periodic health updates
setInterval(updateHealth, HEALTH_CHECK_INTERVAL);
updateHealth(); // initial

export function getSystemHealth(): SystemHealth {
  return { ...currentHealth };
}

export function isSystemHealthy(): boolean {
  return currentHealth.healthy;
}