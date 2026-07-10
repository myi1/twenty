import { groupByProject, filterProjectsByQuery } from '../browseTransforms';
import type { OffplanUnit } from '../types';

const unit = (over: Partial<OffplanUnit>): OffplanUnit => ({
  externalId: 1, projectId: '7417', projectName: 'Aristo', developerName: 'OKSA',
  districtId: '120', districtName: 'Dubai South', price: 498000, pricePerSqft: 1615,
  squareFt: 308, layoutName: 'Studio', floor: '1', status: 'available', ...over,
});

describe('groupByProject', () => {
  it('collapses units to one project with from-price + unit count', () => {
    const projects = groupByProject([
      unit({ externalId: 1, price: 499000 }),
      unit({ externalId: 2, price: 498000 }),
      unit({ externalId: 3, projectId: '6982', projectName: 'Curve', price: 519000 }),
    ]);
    const aristo = projects.find((p) => p.projectId === '7417')!;
    expect(aristo.fromPriceAed).toBe(498000);
    expect(aristo.unitCount).toBe(2);
    expect(aristo.anchorUnit.externalId).toBe(2); // cheapest anchors
  });
});

describe('filterProjectsByQuery', () => {
  it('matches project / developer / district substring, case-insensitive', () => {
    const projects = groupByProject([unit({}), unit({ externalId: 9, projectId: '6982', projectName: 'Curve', developerName: 'GFS', districtName: 'Industrial' })]);
    expect(filterProjectsByQuery(projects, 'oksa').map((p) => p.projectId)).toEqual(['7417']);
    expect(filterProjectsByQuery(projects, 'industrial').map((p) => p.projectId)).toEqual(['6982']);
    expect(filterProjectsByQuery(projects, '').length).toBe(2);
  });
});
