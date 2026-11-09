import { api } from './api.js';

const byId = (id) => document.getElementById(id);

const KIND_LABELS = { valve: 'Valve', cylinder: 'Cylinder' };
const COMMAND_LABELS = { OPEN: 'Open', CLOSED: 'Close', EXTENDED: 'Extend', RETRACTED: 'Retract' };

/** Holds the actuators shown on screen and draws the P&ID and the detail panel. */
export class ControlView {
  constructor() {
    this.actuators = new Map();
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

  replaceAll(actuators) {
    this.actuators = new Map(actuators.map((actuator) => [actuator.id, actuator]));
    if (!this.actuators.has(this.selectedId)) this.selectedId = null;
    this.render();
  }

  applyEvent(event) {
    if (event.type === 'actuator_added' || event.type === 'actuator_updated') {
      this.actuators.set(event.actuator.id, event.actuator);
      this.render();
    } else if (event.type === 'actuator_removed') {
      this.actuators.delete(event.id);
      if (this.selectedId === event.id) this.selectedId = null;
      this.render();
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
    for (const actuator of this.actuators.values()) {
      let marker = existing.get(actuator.id);
      if (marker) {
        existing.delete(actuator.id);
      } else {
        marker = this.createMarker(actuator.id);
      }
      this.updateMarker(marker, actuator);
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

  updateMarker(marker, actuator) {
    marker.dataset.state = actuator.state;
    marker.setAttribute('aria-pressed', String(actuator.id === this.selectedId));
    marker.style.left = `${actuator.x * 100}%`;
    marker.style.top = `${actuator.y * 100}%`;
    marker.firstChild.textContent = actuator.name;
    marker.lastChild.textContent = actuator.state;
  }

  renderDetail() {
    const actuator = this.actuators.get(this.selectedId);
    byId('detail-empty').hidden = Boolean(actuator);
    byId('detail-body').hidden = !actuator;
    if (!actuator) return;

    byId('detail-name').textContent = actuator.name;
    byId('detail-kind').textContent = KIND_LABELS[actuator.kind];
    byId('detail-state').textContent = actuator.state;
    byId('detail-updated').textContent = actuator.updated_at
      ? `${actuator.updated_by}, ${new Date(actuator.updated_at).toLocaleTimeString()}`
      : 'None yet';

    byId('detail-edit').hidden = !this.editing;
    if (document.activeElement !== this.rename) this.rename.value = actuator.name;

    this.commands.hidden = this.editing;
    this.commands.replaceChildren(
      ...actuator.allowed_states.map((target) => this.createCommandButton(actuator, target)),
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
