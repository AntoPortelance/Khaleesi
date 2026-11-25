import { api } from './api.js';
import { openActuatorDialog, openSensorDialog, openTypeDialog } from './dialogs.js';

const byId = (id) => document.getElementById(id);
const DRAG_THRESHOLD_PX = 3;
const clamp = (value) => Math.min(1, Math.max(0, value));

function updateDevice(state, deviceId, changes) {
  return state.isSensor(deviceId)
    ? api.updateSensor(deviceId, changes)
    : api.updateActuator(deviceId, changes);
}

/** The layout tools of control tabs: P&ID image, adding, configuring, and moving devices. */
export function setupEditor(state, view, { attempt }) {
  const toggle = byId('edit-toggle');
  const tools = byId('tools');
  const collapse = byId('tools-collapse');

  function setEditing(editing) {
    state.editing = editing;
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.lastElementChild.textContent = editing ? 'Done editing' : 'Edit layout';
    byId('pid-viewport').classList.toggle('editing', editing);
    tools.hidden = !editing;
    view.render();
  }

  toggle.addEventListener('click', () => setEditing(!state.editing));
  collapse.addEventListener('click', () => {
    const collapsed = tools.classList.toggle('collapsed');
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute(
      'aria-label',
      collapsed ? 'Show the layout tools' : 'Hide the layout tools',
    );
    collapse.textContent = collapsed ? '‹' : '›';
  });

  byId('pid-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) await attempt(() => api.uploadPid(view.tabId, file));
  });

  // New devices line up along the top of the P&ID instead of piling onto one another.
  function placement() {
    const count = state.devicesOn(view.tabId).length;
    return { tab_id: view.tabId, x: 0.08 + (count % 10) * 0.09, y: 0.06 };
  }

  async function added(created) {
    if (created) view.card.pin(created.id);
  }

  byId('add-actuator').addEventListener('click', async () =>
    added(await openActuatorDialog({ placement: placement() })),
  );
  byId('add-sensor').addEventListener('click', async () =>
    added(await openSensorDialog({ state, placement: placement() })),
  );
  byId('add-type').addEventListener('click', () => openTypeDialog());

  setupDragging(state, view, attempt);
  return { setEditing };
}

/** Opens the settings of a device from its card. */
export function editDevice(state, deviceId) {
  const device = state.device(deviceId);
  if (!device) return;
  if (state.isSensor(deviceId)) openSensorDialog({ state, sensor: device });
  else openActuatorDialog({ actuator: device });
}

export async function removeDevice(state, deviceId, attempt) {
  const device = state.device(deviceId);
  if (!device || !window.confirm(`Remove ${device.name}?`)) return;
  const remove = state.isSensor(deviceId) ? api.deleteSensor : api.deleteActuator;
  await attempt(() => remove(deviceId));
}

function setupDragging(state, view, attempt) {
  const canvas = byId('pid-canvas');
  let drag = null;

  function restorePosition({ id, marker }) {
    const device = state.device(id);
    if (device) view.updateMarker(marker, device);
  }

  view.markers.addEventListener('pointerdown', (event) => {
    const marker = event.target.closest('.marker');
    if (!state.editing || !marker || event.button !== 0) return;
    marker.setPointerCapture(event.pointerId);
    drag = {
      marker,
      id: marker.dataset.id,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  });

  view.markers.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;

    const box = canvas.getBoundingClientRect();
    drag.moved = true;
    view.card.hoverEnd();
    drag.x = clamp((event.clientX - box.left) / box.width);
    drag.y = clamp((event.clientY - box.top) / box.height);
    drag.marker.style.left = `${drag.x * 100}%`;
    drag.marker.style.top = `${drag.y * 100}%`;
    view.card.place();
  });

  view.markers.addEventListener('pointerup', async () => {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (!finished.moved) return;
    // The click that follows a drag must not open the card.
    view.suppressClick = true;

    const position = { x: finished.x, y: finished.y };
    const saved = await attempt(() => updateDevice(state, finished.id, position));
    if (!saved) restorePosition(finished);
  });

  view.markers.addEventListener('pointercancel', () => {
    if (!drag) return;
    restorePosition(drag);
    drag = null;
  });
}
