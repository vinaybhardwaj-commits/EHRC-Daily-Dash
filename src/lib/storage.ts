import fs from 'fs';
import path from 'path';
import { DaySnapshot, DepartmentData } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DAYS_DIR = path.join(DATA_DIR, 'days');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries');

function ensureDirs() {
  [DATA_DIR, DAYS_DIR, SUMMARIES_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

export function getDayPath(date: string): string {
  return path.join(DAYS_DIR, `${date}.json`);
}

export function saveDaySnapshot(snapshot: DaySnapshot): void {
  ensureDirs();
  fs.writeFileSync(getDayPath(snapshot.date), JSON.stringify(snapshot, null, 2));
}

export function loadDaySnapshot(date: string): DaySnapshot | null {
  const p = getDayPath(date);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function listAvailableDays(): string[] {
  ensureDirs();
  return fs.readdirSync(DAYS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

export function upsertDepartmentData(date: string, deptData: DepartmentData): DaySnapshot {
  ensureDirs();
  let snapshot = loadDaySnapshot(date);
  if (!snapshot) {
    snapshot = { date, departments: [], huddleSummaries: [], updatedAt: new Date().toISOString() };
  }
  const idx = snapshot.departments.findIndex(d => d.slug === deptData.slug);
  if (idx >= 0) {
    snapshot.departments[idx] = deptData;
  } else {
    snapshot.departments.push(deptData);
  }
  snapshot.updatedAt = new Date().toISOString();
  saveDaySnapshot(snapshot);
  return snapshot;
}

export function saveSummaryFile(date: string, filename: string, content: Buffer): string {
  ensureDirs();
  const dateDir = path.join(SUMMARIES_DIR, date);
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
  const filePath = path.join(dateDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function getSummaryFilePath(date: string, filename: string): string {
  return path.join(SUMMARIES_DIR, date, filename);
}
