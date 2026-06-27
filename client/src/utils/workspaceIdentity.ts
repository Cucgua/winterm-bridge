export interface WorkspaceIconTone {
  backgroundColor: string;
  color: string;
}

const projectIconTones: WorkspaceIconTone[] = [
  { backgroundColor: '#d4145a', color: '#ffffff' },
  { backgroundColor: '#f08a00', color: '#ffffff' },
  { backgroundColor: '#118ab2', color: '#ffffff' },
  { backgroundColor: '#18a0a6', color: '#ffffff' },
  { backgroundColor: '#7353ea', color: '#ffffff' },
  { backgroundColor: '#f45d22', color: '#ffffff' },
];

const sessionIconTones: WorkspaceIconTone[] = [
  { backgroundColor: '#d22aa7', color: '#ffffff' },
  { backgroundColor: '#6647e8', color: '#ffffff' },
  { backgroundColor: '#f45d22', color: '#ffffff' },
  { backgroundColor: '#2bbf9a', color: '#ffffff' },
  { backgroundColor: '#0d84c6', color: '#ffffff' },
  { backgroundColor: '#ff9f1c', color: '#ffffff' },
];

function hashSeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getWorkspaceIconTone(kind: 'project' | 'session', seed: string): WorkspaceIconTone {
  const palette = kind === 'project' ? projectIconTones : sessionIconTones;
  return palette[hashSeed(seed || kind) % palette.length];
}
