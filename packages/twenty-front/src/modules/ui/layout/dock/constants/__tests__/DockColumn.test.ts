import {
  DOCK_COLUMN_GUTTER_PX,
  DOCK_COLUMN_RESERVED_PX,
  DOCK_COLUMN_RIGHT_PX,
  DOCK_PILL_SIZE_PX,
} from '../DockColumn';

describe('DockColumn', () => {
  it('reserves enough width to clear a collapsed pill at its default position', () => {
    // The invariant that matters: if someone makes the pill bigger or moves the column
    // further from the edge, the reserve has to grow with it — otherwise the composer's
    // Send button quietly slides back under the pills, which is the bug this exists for.
    expect(DOCK_COLUMN_RESERVED_PX).toBeGreaterThanOrEqual(
      DOCK_COLUMN_RIGHT_PX + DOCK_PILL_SIZE_PX,
    );
  });

  it('leaves a visible gap rather than butting the control against the pill', () => {
    expect(DOCK_COLUMN_GUTTER_PX).toBeGreaterThan(0);
    expect(DOCK_COLUMN_RESERVED_PX).toBe(
      DOCK_COLUMN_RIGHT_PX + DOCK_PILL_SIZE_PX + DOCK_COLUMN_GUTTER_PX,
    );
  });

  it('matches the docks own default right offset', () => {
    // DialerDock, WhatsAppDock and QuickNoteButton all default to right: 14. If that ever
    // changes in one of them, this constant is where the composer finds out.
    expect(DOCK_COLUMN_RIGHT_PX).toBe(14);
    expect(DOCK_PILL_SIZE_PX).toBe(44);
  });
});
