import { renderHook, waitFor } from '@testing-library/react';
import { useOffplanMapData } from '../useOffplanMapData';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

jest.mock('@/propel/lib/callPropelRoute');
const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;

const point = { externalId: 1, name: 'Aristo', lat: 25.2, lon: 55.27, districtId: '120', districtName: 'Dubai South', priceFromAed: 498000, unitCount: 14, isLaunch: false, status: 'available', handover: '2027-10-02', developerName: 'OKSA', developerSlug: 'oksa' };

test('loads points and builds byId + district clusters', async () => {
  mockCall.mockResolvedValueOnce({ ok: true, data: { points: [point], total: 1 } } as never);
  const { result } = renderHook(() => useOffplanMapData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points).toHaveLength(1);
  expect(result.current.byId.get(1)?.name).toBe('Aristo');
  expect(result.current.clusters[0].districtName).toBe('Dubai South');
  expect(mockCall).toHaveBeenCalledWith('/offplan/browse', { action: 'mapPoints', params: {} });
});

test('sets error when the route returns null (feature off / auth)', async () => {
  mockCall.mockResolvedValueOnce(null as never);
  const { result } = renderHook(() => useOffplanMapData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeTruthy();
  expect(result.current.points).toHaveLength(0);
});
