import { renderHook, waitFor } from '@testing-library/react';
import { useOffplanMapAreas } from '../useOffplanMapAreas';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

jest.mock('@/propel/lib/callPropelRoute');
const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;

beforeEach(() => mockCall.mockReset());

const area = (id: string) => ({
  districtId: id,
  name: `District ${id}`,
  color: '#7CFC00',
  geometry: { type: 'Polygon' as const, coordinates: [[[55.1, 25.1], [55.2, 25.1], [55.2, 25.2], [55.1, 25.1]]] },
});

test('pages through the area set (offset/limit) and concatenates', async () => {
  mockCall
    .mockResolvedValueOnce({ ok: true, data: { areas: [area('1')], total: 2, nextOffset: 60, hasMore: true } } as never)
    .mockResolvedValueOnce({ ok: true, data: { areas: [area('2')], total: 2, nextOffset: 120, hasMore: false } } as never);
  const { result } = renderHook(() => useOffplanMapAreas());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.areas).toHaveLength(2);
  expect(result.current.areas.map((a) => a.districtId)).toEqual(['1', '2']);
  expect(mockCall).toHaveBeenNthCalledWith(1, '/offplan/browse', { action: 'areas', params: { offset: 0, limit: 60 } });
  expect(mockCall).toHaveBeenNthCalledWith(2, '/offplan/browse', { action: 'areas', params: { offset: 60, limit: 60 } });
  expect(mockCall).toHaveBeenCalledTimes(2);
});

test('stops after a single page when hasMore is false', async () => {
  mockCall.mockResolvedValueOnce({ ok: true, data: { areas: [area('1')], total: 1, nextOffset: 60, hasMore: false } } as never);
  const { result } = renderHook(() => useOffplanMapAreas());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.areas).toHaveLength(1);
  expect(mockCall).toHaveBeenCalledTimes(1);
});

test('resolves to empty (never errors) when the route is off / fails', async () => {
  mockCall.mockResolvedValueOnce(null as never);
  const { result } = renderHook(() => useOffplanMapAreas());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.areas).toEqual([]);
});

test('keeps already-fetched pages if a later page fails mid-loop', async () => {
  mockCall
    .mockResolvedValueOnce({ ok: true, data: { areas: [area('1')], total: 3, nextOffset: 60, hasMore: true } } as never)
    .mockResolvedValueOnce({ ok: false, error: 'boom' } as never);
  const { result } = renderHook(() => useOffplanMapAreas());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.areas.map((a) => a.districtId)).toEqual(['1']);
});
