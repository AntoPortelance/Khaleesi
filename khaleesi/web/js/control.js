import { api } from './api.js';

const byId = (id) => document.getElementById(id);

const KIND_LABELS = {
  valve: 'Valve',
  cylinder: 'Cylinder',
  analog: 'Analog sensor',
  digital: 'Digital sensor',
};
const COMMAND_LABELS = { OPEN: 'Open', CLOSED: 'Close', EXTENDED: 'Extend', RETRACTED: 'Retract' };
const NO_SENSOR_DATA = 'No data';

/** Holds the devices shown on screen and draws the P&ID and the detail panel. */
export class ControlView {
  constructor() {
    this.actuators = new Map();
    this.sensors = new Map();
    this.selectedId = null;
    this.pendingId = null;
    this.editing = false;
    this.online = false;

    this.stage = byId('pid-stage');
    this.markers = byId('markers');
    this.image = byId('pid-image');
    this.empty = byId('pid-empty');
    this.message = byId('control-message');
    this.rename = byId('detail-rename');
    this.commands = byId('detail-commands');

    this.image.addEventListener('load', () => this.showImage(true));
    this.image.addEventListener('error', () => this.showImage(false));
    this.markers.addEventListener('click', (event) => {
      const marker = event.target.closest('.marker');
      if (marker) this.select(marker.dataset.id);
    });
  }

  showImage(loaded) {
    this.image.hidden = !loaded;
    this.empty.hidden = loaded;
    this.stage.classList.toggle('has-image', loaded);
  }

  refreshPid() {
    this.image.src = `/api/bench/pid?v=${Date.now()}`;
  }

  showError(text) {
    this.message.textContent = text;
    this.message.hidden = false;
  }

  clearError() {
    this.message.hidden = true;
  }

  describeFailure(failure) {
    return failure.status ? failure.message : 'The server cannot be reached.';
  }

  deviceById(id) {
    return this.actuators.get(id) ?? this.sensors.get(id);
  }

  allDevices() {
    return [...this.actuators.values(), ...this.sensors.values()];
  }

  replaceAll({ actuators, sensors }) {
    const indexById = (devices) => new Map(devices.map((device) => [device.id, device]));
    this.actuators = indexById(actuators);
    this.sensors = indexById(sensors);
    if (!this.deviceById(this.selectedId)) this.selectedId = null;
    this.render();
  }

  removeDevice(devices, id) {
    devices.delete(id);
    if (this.selectedId === id) this.selectedId = null;
    this.render();
  }

  applyEvent(event) {
    if (event.type === 'actuator_added' || event.type === 'actuator_updated') {
      this.actuators.set(event.actuator.id, event.actuator);
      this.render();
    } else if (event.type === 'sensor_added' || event.type === 'sensor_updated') {
      this.sensors.set(event.sensor.id, event.sensor);
      this.render();
    } else if (event.type === 'actuator_removed') {
      this.removeDevice(this.actuators, event.id);
    } else if (event.type === 'sensor_removed') {
      this.removeDevice(this.sensors, event.id);
    } else if (event.type === 'pid_changed') {
      this.refreshPid();
    }
  }

  setOnline(online) {
    this.online = online;
    this.renderDetail();
  }

  setEditing(editing) {
    this.editing = editing;
    this.stage.classList.toggle('editing', editing);
    this.renderDetail();
  }

  select(id) {
    this.selectedId = id;
    this.clearError();
    this.render();
  }

  render() {
    this.renderMarkers();
    this.renderDetail();
  }

  renderMarkers() {
    const existing = new Map([...this.markers.children].map((node) => [node.dataset.id, node]));
    for (const device of this.allDevices()) {
      let marker = existing.get(device.id);
      if (marker) {
        existing.delete(device.id);
      } else {
        marker = this.createMarker(device.id);
      }
      this.updateMarker(marker, device);
    }
    existing.forEach((stale) => stale.remove());
  }

  createMarker(id) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.dataset.id = id;
    marker.append(document.createElement('span'), document.createElement('span'));
    marker.firstChild.className = 'marker-name';
    this.markers.append(marker);
    return marker;
  }

  updateMarker(marker, device) {
    const isSensor = this.sensors.has(device.id);
    marker.dataset.category = isSensor ? 'sensor' : 'actuator';
    marker.dataset.state = device.state ?? '';
    marker.setAttribute('aria-pressed', String(device.id === this.selectedId));
    marker.style.left = `${device.x * 100}%`;
    marker.style.top = `${device.y * 100}%`;
    marker.firstChild.textContent = device.name;
    marker.lastChild.textContent = isSensor ? NO_SENSOR_DATA : device.state;
  }

  renderDetail() {
    const device = this.deviceById(this.selectedId);
    byId('detail-empty').hidden = Boolean(device);
    byId('detail-body').hidden = !device;
    if (!device) return;

    const isSensor = this.sensors.has(device.id);
    byId('detail-name').textContent = device.name;
    byId('detail-kind').textContent = KIND_LABELS[device.kind];
    byId('detail-state-label').textContent = isSensor ? 'Value' : 'Commanded state';
    byId('detail-state').textContent = isSensor ? NO_SENSOR_DATA : device.state;
    byId('detail-updated-label').hidden = isSensor;
    byId('detail-updated').hidden = isSensor;
    byId('detail-updated').textContent = device.updated_at
      ? `${device.updated_by}, ${new Date(device.updated_at).toLocaleTimeString()}`
      : 'None yet';

    byId('detail-edit').hidden = !this.editing;
    if (document.activeElement !== this.rename) this.rename.value = device.name;

    this.commands.hidden = this.editing || isSensor;
    this.commands.replaceChildren(
      ...(device.allowed_states ?? []).map((target) => this.createCommandButton(device, target)),
    );
  }

  createCommandButton(actuator, target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = COMMAND_LABELS[target];
    button.disabled = !this.online || this.pendingId !== null || actuator.state === target;
    button.addEventListener('click', () => this.sendCommand(actuator.id, target));
    return button;
  }

  async sendCommand(id, target) {
    this.clearError();
    this.pendingId = id;
    this.renderDetail();
    try {
      // The displayed state changes when the server's event arrives, once stored.
      await api.commandActuator(id, target);
    } catch (failure) {
      this.showError(this.describeFailure(failure));
    } finally {
      this.pendingId = null;
      this.renderDetail();
    }
  }
}
