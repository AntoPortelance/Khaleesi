import { api } from './api.js';
import {
  COMMAND_LABELS,
  KIND_LABELS,
  STATE_LABELS,
  describeReading,
  formatInput,
  formatRange,
  formatTime,
  formatValue,
} from './format.js';
import { Zoom } from './zoom.js';

const byId = (id) => document.getElementById(id);
const HOVER_DELAY_MS = 500;
const CARD_GAP_PX = 14;

/** Draws the devices of the active control tab on its P&ID, with their live values. */
export class ControlView {
  constructor(state, { attempt, onSettings, onRemove }) {
    this.state = state;
    this.attempt = attempt;
    this.pendingId = null;
    this.tabId = null;

    this.markers = byId('markers');
    this.image = byId('pid-image');
    this.empty = byId('pid-empty');
    this.zoom = new Zoom({ onChange: () => this.card.place() });
    this.card = new DeviceCard(this, { onSettings, onRemove });

    this.image.addEventListener('load', () => this.showImage(true));
    this.image.addEventListener('error', () => {
      this.showImage(false);
      this.zoom.setEmptyAspect();
    });
    this.markers.addEventListener('click', (event) => {
      const marker = event.target.closest('.marker');
      if (marker && !this.suppressClick) this.card.pin(marker.dataset.id);
      this.suppressClick = false;
    });
    this.markers.addEventListener('pointerover', (event) => {
      const marker = event.target.closest('.marker');
      if (marker) this.card.hoverStart(marker.dataset.id);
    });
    this.markers.addEventListener('pointerout', (event) => {
      const marker = event.target.closest('.marker');
      if (marker && !marker.contains(event.relatedTarget)) this.card.hoverEnd();
    });
  }

  show(tabId) {
    if (tabId === this.tabId) return;
    this.tabId = tabId;
    this.card.close();
    this.refreshPid();
    this.render();
  }

  showImage(loaded) {
    this.image.hidden = !loaded;
    this.empty.hidden = loaded;
  }

  refreshPid() {
    if (!this.tabId) return;
    this.image.src = `${api.pidUrl(this.tabId)}?v=${Date.now()}`;
  }

  markerFor(deviceId) {
    return this.markers.querySelector(`[data-id="${CSS.escape(deviceId)}"]`);
  }

  render() {
    const devices = this.state.devicesOn(this.tabId);
    const existing = new Map([...this.markers.children].map((node) => [node.dataset.id, node]));
    for (const device of devices) {
      let marker = existing.get(device.id);
      if (marker) existing.delete(device.id);
      else marker = this.createMarker(device.id);
      this.updateMarker(marker, device);
    }
    existing.forEach((stale) => stale.remove());
    this.card.refresh();
  }

  /** Called about 10 times per second: only sensor values change. */
  renderLive() {
    for (const device of this.state.devicesOn(this.tabId)) {
      if (!this.state.isSensor(device.id)) continue;
      const marker = this.markerFor(device.id);
      if (marker) this.updateMarker(marker, device);
    }
    this.card.refreshLive();
  }

  createMarker(deviceId) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.dataset.id = deviceId;
    const name = document.createElement('span');
    name.className = 'marker-name';
    const value = document.createElement('span');
    value.className = 'marker-value';
    marker.append(name, value);
    this.markers.append(marker);
    return marker;
  }

  updateMarker(marker, device) {
    const isSensor = this.state.isSensor(device.id);
    marker.dataset.category = isSensor ? 'sensor' : 'actuator';
    marker.style.left = `${device.x * 100}%`;
    marker.style.top = `${device.y * 100}%`;
    marker.setAttribute('aria-pressed', String(device.id === this.card.pinnedId));
    marker.firstChild.textContent = device.name;
    if (isSensor) {
      const reading = this.state.live.get(device.id);
      marker.dataset.tone = describeReading(reading).tone;
      marker.lastChild.textContent = formatValue(device, reading?.value);
    } else {
      marker.dataset.state = device.state;
      marker.lastChild.textContent = device.state;
    }
  }

  async sendCommand(actuatorId, target) {
    this.pendingId = actuatorId;
    this.card.refresh();
    // The displayed state changes when the server's event arrives, once stored.
    await this.attempt(() => api.commandActuator(actuatorId, target));
    this.pendingId = null;
    this.card.refresh();
  }
}

/**
 * The details of one device, in a small card above it. Pointing at a device for half a second
 * shows the card; clicking keeps it open, with the commands, until closed.
 */
class DeviceCard {
  constructor(view, { onSettings, onRemove }) {
    this.view = view;
    this.state = view.state;
    this.pinnedId = null;
    this.hoveredId = null;
    this.waitingId = null;
    this.timer = null;

    this.node = byId('card');
    this.commands = byId('card-commands');
    byId('card-close').addEventListener('click', () => this.close());
    byId('card-settings').addEventListener('click', () => onSettings(this.pinnedId));
    byId('card-remove').addEventListener('click', () => onRemove(this.pinnedId));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.pinnedId && !document.querySelector('dialog[open]')) {
        this.close();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.pinnedId || this.node.contains(event.target)) return;
      if (event.target.closest('.marker, dialog, .zoom')) return;
      this.close();
    });
    window.addEventListener('resize', () => this.place());
  }

  shownId() {
    return this.hoveredId ?? this.pinnedId;
  }

  hoverStart(deviceId) {
    // Live values replace the text under the pointer, which repeats pointerover events: only
    // the first one for a device starts the delay.
    if (deviceId === this.waitingId || deviceId === this.hoveredId) return;
    window.clearTimeout(this.timer);
    this.waitingId = deviceId;
    this.timer = window.setTimeout(() => {
      this.waitingId = null;
      this.hoveredId = deviceId === this.pinnedId ? null : deviceId;
      this.refresh();
    }, HOVER_DELAY_MS);
  }

  hoverEnd() {
    window.clearTimeout(this.timer);
    this.waitingId = null;
    if (this.hoveredId) {
      this.hoveredId = null;
      this.refresh();
    }
  }

  pin(deviceId) {
    window.clearTimeout(this.timer);
    this.waitingId = null;
    this.hoveredId = null;
    this.pinnedId = this.pinnedId === deviceId ? null : deviceId;
    this.view.render();
  }

  close() {
    window.clearTimeout(this.timer);
    this.waitingId = null;
    this.hoveredId = null;
    this.pinnedId = null;
    this.view.render();
  }

  refresh() {
    for (const key of ['pinnedId', 'hoveredId']) {
      const device = this.state.device(this[key]);
      if (!device || device.tab_id !== this.view.tabId) this[key] = null;
    }
    const device = this.state.device(this.shownId());
    this.node.hidden = !device;
    if (!device) return;

    const pinned = device.id === this.pinnedId && !this.hoveredId;
    this.node.classList.toggle('card-pinned', pinned);
    byId('card-name').textContent = device.name;
    byId('card-close').hidden = !pinned;
    if (this.state.isSensor(device.id)) this.showSensor(device);
    else this.showActuator(device, pinned);
    byId('card-edit').hidden = !(pinned && this.state.editing);
    this.place();
  }

  refreshLive() {
    const device = this.state.device(this.shownId());
    if (device && this.state.isSensor(device.id)) this.showSensor(device);
  }

  showActuator(actuator, pinned) {
    this.setTag('');
    const value = byId('card-value');
    value.textContent = actuator.state;
    value.dataset.tone = actuator.state === 'OPEN' || actuator.state === 'EXTENDED' ? 'ok' : 'idle';
    this.setFacts([
      ['Type', KIND_LABELS[actuator.kind]],
      ['Input', formatInput(actuator)],
      ['Default state', STATE_LABELS[actuator.default_state]],
      [
        'Last command',
        actuator.updated_at
          ? `${actuator.updated_by}, ${formatTime(actuator.updated_at)}`
          : 'None yet',
      ],
    ]);

    const showCommands = pinned && !this.state.editing;
    this.commands.hidden = !showCommands;
    if (!showCommands) return;
    this.commands.replaceChildren(
      ...actuator.allowed_states.map((target) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = COMMAND_LABELS[target];
        button.disabled =
          !this.state.online || this.view.pendingId !== null || actuator.state === target;
        button.addEventListener('click', () => this.view.sendCommand(actuator.id, target));
        return button;
      }),
    );
  }

  showSensor(sensor) {
    const reading = this.state.live.get(sensor.id);
    const { tone, tag } = describeReading(reading);
    this.setTag(tag, tone);
    const value = byId('card-value');
    value.textContent = formatValue(sensor, reading?.value);
    value.dataset.tone = tone;
    this.commands.hidden = true;

    const sensorType = this.state.sensorType(sensor.type);
    const facts = [
      ['Type', `${sensorType?.label ?? 'No type'}, ${KIND_LABELS[sensor.kind].toLowerCase()}`],
    ];
    if (sensor.kind === 'analog') facts.push(['Normal range', formatRange(sensor)]);
    facts.push(['Input', formatInput(sensor)]);
    if (sensor.formula) facts.push(['Formula', sensor.formula]);
    facts.push(['Last reading', reading ? formatTime(reading.measuredAt) : 'None yet']);
    this.setFacts(facts);
  }

  setTag(text, tone = '') {
    const tag = byId('card-tag');
    tag.textContent = text;
    tag.dataset.tone = tone;
    tag.hidden = !text;
  }

  setFacts(facts) {
    byId('card-facts').replaceChildren(
      ...facts.flatMap(([label, value]) => {
        const term = document.createElement('dt');
        const detail = document.createElement('dd');
        term.textContent = label;
        detail.textContent = value;
        return [term, detail];
      }),
    );
  }

  /** Puts the card above its device, or below it when there is no room above. */
  place() {
    const marker = this.node.hidden ? null : this.view.markerFor(this.shownId());
    if (!marker) return;
    const target = marker.getBoundingClientRect();
    const frame = byId('pid-viewport').getBoundingClientRect();
    // A device scrolled out of the zoomed P&ID takes its card with it.
    const visible =
      target.bottom > frame.top &&
      target.top < frame.bottom &&
      target.right > frame.left &&
      target.left < frame.right;
    this.node.style.visibility = visible ? 'visible' : 'hidden';

    const card = this.node.getBoundingClientRect();
    const centre = target.left + target.width / 2;
    const left = Math.min(Math.max(8, centre - card.width / 2), window.innerWidth - card.width - 8);
    const above = target.top - CARD_GAP_PX - card.height;
    const below = above < 8;
    this.node.classList.toggle('card-below', below);
    this.node.style.left = `${left}px`;
    this.node.style.top = `${below ? target.bottom + CARD_GAP_PX : above}px`;
    this.node.style.setProperty('--arrow', `${centre - left}px`);
  }
}
