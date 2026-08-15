// Weighted user mix (§11). Tổng = 100.
export const MIX = [
  { name: 'dashboard', weight: 35, kind: 'list' },
  { name: 'task_read', weight: 20, kind: 'list' },
  { name: 'task_write', weight: 10, kind: 'crud' },
  { name: 'chat', weight: 10, kind: 'crud' },
  { name: 'notifications', weight: 8, kind: 'list' },
  { name: 'calendar', weight: 7, kind: 'list' },
  { name: 'email', weight: 5, kind: 'list' },
  { name: 'documents', weight: 3, kind: 'list' },
  { name: 'admin', weight: 2, kind: 'heavy' },
];

export function pickAction(rng = Math.random()) {
  let acc = 0;
  const r = rng * 100;
  for (const a of MIX) {
    acc += a.weight;
    if (r <= acc) return a;
  }
  return MIX[0];
}
