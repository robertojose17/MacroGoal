/** Encrypted-storage journal protocol. No network calls and no automatic replay. */
export type GoalJournalOperation = 'save' | 'restart';
export type GoalJournalEntry = {
  version: 1; project: string; owner: string; requestId: string; operation: GoalJournalOperation;
  input: unknown; payload: unknown; status: 'pending' | 'resolved' | 'rejected'; rejectionCode?: '40001' | '22023' | '42501';
};
export type GoalRequestJournal = {
  readonly project: string;
  load(owner: string): Promise<GoalJournalEntry | null>;
  prepare(entry: GoalJournalEntry): Promise<void>;
  resolve(owner: string, requestId: string): Promise<void>;
  reject(owner: string, requestId: string, code: '40001' | '22023' | '42501'): Promise<void>;
  clear(owner: string, requestId: string): Promise<void>;
};
export type JournalStorage = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(): never { throw new Error('goal_journal_unavailable'); }
const locks = new Set<string>();
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) { const n = char.codePointAt(0); if (n === undefined) fail(); bytes += n <= 0x7f ? 1 : n <= 0x7ff ? 2 : n <= 0xffff ? 3 : 4; }
  return bytes;
}
function chunks(value: string): string[] {
  const result: string[] = []; let current = '', size = 0;
  for (const char of value) { const bytes = utf8Length(char); if (size + bytes > 1200) { result.push(current); current = ''; size = 0; } current += char; size += bytes; }
  if (current) result.push(current);
  if (!result.length || result.length > 128) fail();
  return result;
}
function parseEntry(value: unknown, project: string, owner: string): GoalJournalEntry {
  if (!object(value) || Object.keys(value).some(key => !['version','project','owner','requestId','operation','input','payload','status','rejectionCode'].includes(key)) || value.version !== 1 || value.project !== project || value.owner !== owner || !uuid(value.requestId) ||
    (value.operation !== 'save' && value.operation !== 'restart') || !object(value.input) || !object(value.payload) || !['pending','resolved','rejected'].includes(String(value.status))) fail();
  if (value.status === 'rejected' && !['40001','22023','42501'].includes(String(value.rejectionCode))) fail();
  if (value.status !== 'rejected' && value.rejectionCode !== undefined) fail();
  return {version:1,project,owner,requestId:value.requestId,operation:value.operation,input:value.input,payload:value.payload,
    status:value.status === 'resolved' ? 'resolved' : value.status === 'rejected' ? 'rejected' : 'pending',
    ...(value.rejectionCode === '40001' || value.rejectionCode === '22023' || value.rejectionCode === '42501' ? {rejectionCode:value.rejectionCode} : {})};
}
type Manifest = { version: 1; generation: string; count: number; checksum: string };
function parseManifest(raw: string): Manifest {
  let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!object(value) || Object.keys(value).some(key => !['version','generation','count','checksum'].includes(key)) || value.version !== 1 || !uuid(value.generation) || typeof value.count !== 'number' || !Number.isInteger(value.count) || value.count < 1 || value.count > 128 || typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum)) fail();
  return {version:1,generation:value.generation,count:value.count,checksum:value.checksum};
}
export function createGoalRequestJournal(options: { project: string; storage: JournalStorage; digest: (value: string) => Promise<string>; newGeneration: () => string }): GoalRequestJournal {
  const {project,storage,digest,newGeneration} = options;
  if (!/^[a-z0-9-]{6,80}$/.test(project)) fail();
  const prefix = (owner: string) => { if (!uuid(owner)) fail(); return `accepted_goal_v1.${project}.${owner}`; };
  async function read(owner: string): Promise<{entry: GoalJournalEntry; manifest: Manifest} | null> {
    const key = prefix(owner), raw = await storage.get(key + '.head');
    if (raw === null) return null;
    const manifest = parseManifest(raw); let content = '';
    for (let i = 0; i < manifest.count; i++) { const part = await storage.get(`${key}.${manifest.generation}.${i}`); if (part === null || utf8Length(part) > 1200) fail(); content += part; }
    if (await digest(content) !== manifest.checksum) fail();
    if (await storage.get(key + '.head') !== raw) fail();
    let value: unknown; try { value = JSON.parse(content); } catch { return fail(); }
    return {entry:parseEntry(value,project,owner),manifest};
  }
  async function locked<T>(owner: string, fn: () => Promise<T>): Promise<T> {
    const key = prefix(owner); if (locks.has(key)) throw new Error('goal_journal_busy'); locks.add(key);
    try { return await fn(); } finally { locks.delete(key); }
  }
  async function write(entry: GoalJournalEntry, previous: Manifest | null): Promise<void> {
    parseEntry(entry,project,entry.owner);
    const key = prefix(entry.owner), generation = newGeneration(); if (!uuid(generation)) fail();
    const content = JSON.stringify(entry), parts = chunks(content), checksum = await digest(content);
    if (!/^[a-f0-9]{64}$/.test(checksum)) fail();
    for (let i = 0; i < parts.length; i++) await storage.set(`${key}.${generation}.${i}`,parts[i]);
    // Publishing this manifest is the commit point. A crash from here onward
    // is treated as potentially submitted, even if the RPC had not started.
    await storage.set(key + '.head', JSON.stringify({version:1,generation,count:parts.length,checksum}));
    const verified = await read(entry.owner);
    if (!verified || JSON.stringify(verified.entry) !== content) fail();
    if (previous && previous.generation !== generation) {
      // Cleanup cannot turn a verified commit into a failed request. Orphaned
      // encrypted fragments contain no runnable request without its manifest.
      for (let i = 0; i < previous.count; i++) await storage.remove(`${key}.${previous.generation}.${i}`).catch(() => {});
    }
  }
  return {
    project,
    async load(owner) { return (await read(owner))?.entry ?? null; },
    async prepare(entry) { await locked(entry.owner, async () => { if (entry.status !== 'pending' || await read(entry.owner)) throw new Error('goal_journal_pending'); await write(entry,null); }); },
    async resolve(owner,requestId) { await locked(owner, async () => { const saved = await read(owner); if (!saved || saved.entry.requestId !== requestId || saved.entry.status === 'rejected') fail(); const next = {...saved.entry,status:'resolved' as const}; delete next.rejectionCode; await write(next,saved.manifest); }); },
    async reject(owner,requestId,code) { await locked(owner, async () => { const saved = await read(owner); if (!saved || saved.entry.requestId !== requestId || saved.entry.status !== 'pending') fail(); await write({...saved.entry,status:'rejected',rejectionCode:code},saved.manifest); }); },
    async clear(owner,requestId) { await locked(owner, async () => { const saved = await read(owner); if (!saved) return; if (saved.entry.requestId !== requestId || saved.entry.status === 'pending') fail(); const key = prefix(owner); await storage.remove(key+'.head'); for (let i=0;i<saved.manifest.count;i++) await storage.remove(`${key}.${saved.manifest.generation}.${i}`).catch(()=>{}); }); },
  };
}
