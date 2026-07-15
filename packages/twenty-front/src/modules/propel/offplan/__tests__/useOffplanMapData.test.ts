import { renderHook, waitFor } from '@testing-library/react';
import { useOffplanMapData } from '../useOffplanMapData';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

jest.mock('@/propel/lib/callPropelRoute');
const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;

beforeEach(() => mockCall.mockReset());

const point = { externalId: 1, name: 'Aristo', lat: 25.2, lon: 55.27, districtId: '120', districtName: 'Dubai South', priceFromAed: 498000, unitCount: 14, isLaunch: false, status: 'available', handover: '2027-10-02', developerName: 'OKSA', developerSlug: 'oksa' };

const point2 = { ...point, externalId: 2, name: 'Orla', districtId: '121', districtName: 'Palm Jumeirah' };

test('pages through the point set (offset/limit) and concatenates', async () => {
  mockCall
    .mockResolvedValueOnce({ ok: true, data: { points: [point], total: 2, nextOffset: 120, hasMore: true } } as never)
    .mockResolvedValueOnce({ ok: true, data: { points: [point2], total: 2, nextOffset: 240, hasMore: false } } as never);
  const { result } = renderHook(() => useOffplanMapData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points).toHaveLength(2);
  expect(result.current.byId.get(1)?.name).toBe('Aristo');
  expect(result.current.byId.get(2)?.name).toBe('Orla');
  // first page requested at offset 0, second at the server's nextOffset
  expect(mockCall).toHaveBeenNthCalledWith(1, '/offplan/browse', { action: 'mapPoints', params: { offset: 0, limit: 120 } });
  expect(mockCall).toHaveBeenNthCalledWith(2, '/offplan/browse', { action: 'mapPoints', params: { offset: 120, limit: 120 } });
  expect(mockCall).toHaveBeenCalledTimes(2);
});

test('stops after a single page when hasMore is false', async () => {
  mockCall.mockResolvedValueOnce({ ok: true, data: { points: [point], total: 1, nextOffset: 120, hasMore: false } } as never);
  const { result } = renderHook(() => useOffplanMapData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points).toHaveLength(1);
  expect(mockCall).toHaveBeenCalledTimes(1);
});

test('sets error when the route returns null (feature off / auth)', async () => {
  mockCall.mockResolvedValueOnce(null as never);
  const { result } = renderHook(() => useOffplanMapData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeTruthy();
  expect(result.current.points).toHaveLength(0);
});
