import { api } from './api.js';

const byId = (id) => document.getElementById(id);
const DRAG_THRESHOLD_PX = 3;
const clamp = (value) => Math.min(1, Math.max(0, value));

const SENSOR_KINDS = ['analog', 'digital'];

function updateDevice(view, id, changes) {
  return view.sensors.has(id) ? api.updateSensor(id, changes) : api.updateActuator(id, changes);
}

/** Wires the layout tools: P&ID image, adding, renaming, removing, and dragging devices. */
export function setupEditor(view) {
  async function attempt(action) {
    view.clearError();
    try {
      return await action();
    } catch (failure) {
      view.showError(view.describeFailure(failure));
      return null;
    }
  }

  const toggle = byId('edit-toggle');
  toggle.addEventListener('click', () => {
    const editing = !view.editing;
    view.setEditing(editing);
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.textContent = editing ? 'Done editing' : 'Edit layout';
    byId('edit-tools').hidden = !editing;
  });

  byId('pid-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) await attempt(() => api.uploadPid(file));
  });

  byId('edit-tools').addEventListener('submit', async (event) => {
    event.preventDefault();
    const nameInput = byId('new-name');
    // New devices line up along the top instead of piling onto one another.
    const x = 0.1 + (view.allDevices().length % 9) * 0.1;
    const device = { name: nameInput.value, kind: byId('new-kind').value, x, y: 0.1 };
    const add = SENSOR_KINDS.includes(device.kind) ? api.addSensor : api.addActuator;
    const created = await attempt(() => add(device));
    if (created) {
      nameInput.value = '';
      view.selectedId = created.id;
      view.render();
    }
  });

  byId('detail-edit').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { selectedId, rename } = view;
    await attempt(() => updateDevice(view, selectedId, { name: rename.value }));
    rename.blur();
  });

  byId('detail-delete').addEventListener('click', async () => {
    const device = view.deviceById(view.selectedId);
    if (device && window.confirm(`Remove ${device.name}?`)) {
      const remove = view.sensors.has(device.id) ? api.deleteSensor : api.deleteActuator;
      await attempt(() => remove(device.id));
    }
  });

  setupDragging(view, attempt);
}

function setupDragging(view, attempt) {
  let drag = null;

  function restorePosition({ id, marker }) {
    const device = view.deviceById(id);
    if (device) view.updateMarker(marker, device);
  }

  view.markers.addEventListener('pointerdown', (event) => {
    const marker = event.target.closest('.marker');
    if (!view.editing || !marker) return;
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

    const stage = view.stage.getBoundingClientRect();
    drag.moved = true;
    drag.x = clamp((event.clientX - stage.left) / stage.width);
    drag.y = clamp((event.clientY - stage.top) / stage.height);
    drag.marker.style.left = `${drag.x * 100}%`;
    drag.marker.style.top = `${drag.y * 100}%`;
  });

  view.markers.addEventListener('pointerup', async () => {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (!finished.moved) return;

    const position = { x: finished.x, y: finished.y };
    const saved = await attempt(() => updateDevice(view, finished.id, position));
    if (!saved) restorePosition(finished);
  });

  view.markers.addEventListener('pointercancel', () => {
    if (!drag) return;
    restorePosition(drag);
    drag = null;
  });
}
