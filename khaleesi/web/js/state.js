import { LiveValues } from './live.js';

const byId = (items) => new Map(items.map((item) => [item.id, item]));

/** Everything the server sent, kept up to date by its events. Views only read it. */
export class State {
  constructor() {
    this.username = '';
    this.online = false;
    this.editing = false;
    this.tabs = [];
    this.activeTabId = null;
    this.actuators = new Map();
    this.sensors = new Map();
    this.sensorTypes = [];
    this.steps = new Map();
    this.live = new LiveValues();
  }

  load({ tabs, devices, sensorTypes, steps }) {
    this.tabs = tabs;
    this.actuators = byId(devices.actuators);
    this.sensors = byId(devices.sensors);
    this.sensorTypes = sensorTypes;
    this.steps = steps;
    if (!this.tab(this.activeTabId)) this.activeTabId = tabs[0]?.id ?? null;
  }

  tab(tabId) {
    return this.tabs.find((tab) => tab.id === tabId) ?? null;
  }

  activeTab() {
    return this.tab(this.activeTabId);
  }

  device(deviceId) {
    return this.actuators.get(deviceId) ?? this.sensors.get(deviceId) ?? null;
  }

  isSensor(deviceId) {
    return this.sensors.has(deviceId);
  }

  devicesOn(tabId) {
    const onTab = (device) => device.tab_id === tabId;
    return [
      ...[...this.actuators.values()].filter(onTab),
      ...[...this.sensors.values()].filter(onTab),
    ];
  }

  sensorType(typeId) {
    return this.sensorTypes.find((sensorType) => sensorType.id === typeId) ?? null;
  }

  /** Applies a server event and returns what it changed: "tabs", "devices", "steps", or null. */
  apply(event) {
    switch (event.type) {
      case 'tab_added':
        this.tabs.push(event.tab);
        return 'tabs';
      case 'tab_updated':
        this.tabs = event.order
          .map((tabId) => (tabId === event.tab.id ? event.tab : this.tab(tabId)))
          .filter(Boolean)
          .map((tab, position) => ({ ...tab, position }));
        return 'tabs';
      case 'tab_removed':
        this.removeTab(event.id);
        return 'tabs';
      case 'actuator_added':
      case 'actuator_updated':
        this.actuators.set(event.actuator.id, event.actuator);
        return 'devices';
      case 'sensor_added':
      case 'sensor_updated':
        this.sensors.set(event.sensor.id, event.sensor);
        return 'devices';
      case 'actuator_removed':
        this.actuators.delete(event.id);
        return 'devices';
      case 'sensor_removed':
        this.sensors.delete(event.id);
        this.live.forget(event.id);
        return 'devices';
      case 'sensor_type_added':
        this.sensorTypes.push(event.sensor_type);
        return 'types';
      case 'step_added':
        this.stepsOf(event.step.tab_id).push(event.step);
        return 'steps';
      case 'step_updated':
        this.updateStep(event.step, event.order);
        return 'steps';
      case 'steps_reset':
        this.steps.set(
          event.tab_id,
          this.stepsOf(event.tab_id).map((step) => ({
            ...step,
            checked_by: null,
            checked_at: null,
          })),
        );
        return 'steps';
      case 'step_removed':
        this.steps.set(
          event.tab_id,
          this.stepsOf(event.tab_id).filter((step) => step.id !== event.id),
        );
        return 'steps';
      default:
        return null;
    }
  }

  stepsOf(tabId) {
    if (!this.steps.has(tabId)) this.steps.set(tabId, []);
    return this.steps.get(tabId);
  }

  updateStep(step, order) {
    const known = byId(this.stepsOf(step.tab_id));
    known.set(step.id, step);
    this.steps.set(step.tab_id, order.map((stepId) => known.get(stepId)).filter(Boolean));
  }

  removeTab(tabId) {
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);
    for (const devices of [this.actuators, this.sensors]) {
      for (const [deviceId, device] of devices) {
        if (device.tab_id === tabId) devices.delete(deviceId);
      }
    }
    this.steps.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = this.tabs[0]?.id ?? null;
  }
}
