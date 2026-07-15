import type { OffplanUnit, OffplanProject } from './types';

// Collapse the flat unit list into one entry per project (the catalog returns every
// UNIT as a row). The cheapest unit anchors the card + drawer + pitch.
export function groupByProject(units: OffplanUnit[]): OffplanProject[] {
  const byProject = new Map<string, OffplanUnit[]>();
  for (const u of units) {
    if (!u.projectId) continue;
    const list = byProject.get(u.projectId);
    if (list) list.push(u);
    else byProject.set(u.projectId, [u]);
  }
  const projects: OffplanProject[] = [];
  for (const list of byProject.values()) {
    const sorted = [...list].sort((a, b) => a.price - b.price);
    const anchor = sorted[0];
    const layouts = [...new Set(list.map((u) => u.layoutName).filter(Boolean))];
    const sqfts = list.map((u) => u.squareFt).filter((n) => n > 0);
    projects.push({
      projectId: anchor.projectId,
      projectName: anchor.projectName,
      developerName: anchor.developerName,
      districtId: anchor.districtId,
      districtName: anchor.districtName,
      fromPriceAed: anchor.price,
      unitCount: list.length,
      layouts,
      minSquareFt: sqfts.length ? Math.min(...sqfts) : 0,
      maxSquareFt: sqfts.length ? Math.max(...sqfts) : 0,
      anchorUnit: anchor,
    });
  }
  return projects.sort((a, b) => a.fromPriceAed - b.fromPriceAed);
}

// Client-side free-text filter over project / developer / district name.
export function filterProjectsByQuery(projects: OffplanProject[], q: string): OffplanProject[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return projects;
  return projects.filter(
    (p) =>
      p.projectName.toLowerCase().includes(needle) ||
      p.developerName.toLowerCase().includes(needle) ||
      p.districtName.toLowerCase().includes(needle),
  );
}
