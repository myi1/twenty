import { useCallback, useEffect, useRef, useState } from 'react';

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { EDITABLE_LANE_OBJECTS } from '@/propel/lib/settingsHubConfig';
import {
  type CustomFieldMutationResponse,
  type CustomFieldObject,
  type CustomFieldsListResponse,
} from '@/propel/types/settingsHub';

// Data plane for the Custom Fields tab — add / rename / remove a field on one of
// the lane objects, IN-APP, surviving deploys. A Mantine port of the legacy
// app-sandbox CustomFieldsPanel, reusing the SAME, UNCHANGED gated CRM route:
//   • LIST   → callPropelRoute('/settings/custom-fields', {})
//             → { ok, objects:[{nameSingular,label,fields,…}], canEdit }
//   • CREATE → { create:{ object, label, type } }
//   • RENAME → { rename:{ object, fieldId, label } }
//   • REMOVE → { remove:{ object, fieldId } }
// Field CRUD is a /metadata operation server-side; the route enforces Manager/Admin
// AND the acting user's DATA_MODEL settings permission, surfacing the server's
// permission error verbatim (needsDataModelPermission) when the user lacks it.

type Phase = 'loading' | 'idle' | 'error';

export const useCustomFields = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [objects, setObjects] = useState<CustomFieldObject[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [activeObject, setActiveObject] = useState<string>(
    EDITABLE_LANE_OBJECTS[0].nameSingular,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const res = await callPropelRoute<CustomFieldsListResponse>(
      '/settings/custom-fields',
      {},
    );
    if (!res || !res.ok) {
      setError(res?.error ?? 'Could not load fields.');
      setPhase('error');
      return;
    }
    setObjects(res.objects ?? []);
    setCanEdit(Boolean(res.canEdit));
    setPhase('idle');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Run one create/rename/remove mutation. Returns the response so the caller can
  // react (clear the add-form on success, exit rename mode, etc.). On success the
  // list is reloaded so the new/renamed/removed field is reflected from server truth.
  const run = useCallback(
    async (
      body: Record<string, unknown>,
    ): Promise<CustomFieldMutationResponse | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await callPropelRoute<CustomFieldMutationResponse>(
          '/settings/custom-fields',
          body,
        );
        if (!res || !res.ok) {
          setError(
            res?.needsDataModelPermission === true
              ? `${res?.error ?? 'Action failed.'} (You may need the Data-model settings permission in Twenty.)`
              : (res?.error ?? 'Action failed.'),
          );
          return res;
        }
        await load();
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [load],
  );

  const createField = useCallback(
    (object: string, label: string, type: string) =>
      run({ create: { object, label: label.trim(), type } }),
    [run],
  );
  const renameField = useCallback(
    (object: string, fieldId: string, label: string) =>
      run({ rename: { object, fieldId, label } }),
    [run],
  );
  const removeField = useCallback(
    (object: string, fieldId: string) =>
      run({ remove: { object, fieldId } }),
    [run],
  );

  const current = objects.find((o) => o.nameSingular === activeObject);

  return {
    phase,
    error,
    objects,
    canEdit,
    activeObject,
    setActiveObject,
    current,
    busy,
    reload: load,
    createField,
    renameField,
    removeField,
  };
};
