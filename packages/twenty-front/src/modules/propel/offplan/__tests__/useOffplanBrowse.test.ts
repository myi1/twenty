import { renderHook, act, waitFor } from '@testing-library/react';
import { useOffplanBrowse } from '../useOffplanBrowse';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

jest.mock('@/propel/lib/callPropelRoute');
const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;
const point = (id: number, lon: number, price: number) => ({ externalId: id, name: `P${id}`, lat: 25.2, lon, districtId: '120', districtName: 'DS', priceFromAed: price, unitCount: 5, isLaunch: false, status: 'available', handover: '2027-10-02', developerName: 'D', developerSlug: 'd' });

test('matched reflects filters; visible reflects the viewport', async () => {
  mockCall.mockResolvedValueOnce({ ok: true, data: { points: [point(1, 55.27, 400000), point(2, 55.27, 900000), point(3, 56.0, 500000)], total: 3 } } as never);
  const { result } = renderHook(() => useOffplanBrowse());
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => result.current.setFilters((f) => ({ ...f, maxPriceAed: 500000 })));
  expect(result.current.matched.map((p) => p.externalId).sort()).toEqual([1, 3]);

  act(() => result.current.setBounds({ west: 55.0, south: 25.0, east: 55.5, north: 25.4 }));
  expect(result.current.visible.map((p) => p.externalId)).toEqual([1]); // 3 is out of bounds, 2 is over budget
  expect(result.current.visibleCount).toBe(1);
});
