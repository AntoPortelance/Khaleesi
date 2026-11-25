import { api } from './api.js';
import { ChecklistView } from './checklist.js';
import { ControlView } from './control.js';
import { DataView } from './data.js';
import { editDevice, removeDevice, setupEditor } from './editor.js';
import { connectEvents } from './events.js';
import { State } from './state.js';
import { TabBar } from './tabs.js';

const byId = (id) => document.getElementById(id);
const VIEWS = ['control', 'data', 'checklist'];
const STALE_CHECK_MS = 500;

const state = new State();

function showMessage(text) {
  const message = byId('app-message');
  message.textContent = text;
  message.hidden = !text;
}

/** Runs a request; a refusal is shown at the top of the page instead of being thrown. */
async function attempt(action) {
  showMessage('');
  try {
    return (await action()) ?? true;
  } catch (failure) {
    showMessage(failure.status ? failure.message : 'The server cannot be reached.');
    return null;
  }
}

const control = new ControlView(state, {
  attempt,
  onSettings: (deviceId) => editDevice(state, deviceId),
  onRemove: (deviceId) => removeDevice(state, deviceId, attempt),
});
const data = new DataView(state);
const checklist = new ChecklistView(state, { attempt });
const tabBar = new TabBar(state, { onSelect: selectTab, attempt });
const editor = setupEditor(state, control, { attempt });

function selectTab(tabId) {
  if (!state.tab(tabId)) return;
  state.activeTabId = tabId;
  // The tab is kept in the address, so a reload or a shared link opens the same tab.
  window.history.replaceState(null, '', `#tab=${tabId}`);
  showMessage('');
  renderAll();
}

function renderAll() {
  tabBar.render();
  const tab = state.activeTab();
  for (const view of VIEWS) byId(`view-${view}`).hidden = tab?.type !== view;
  if (!tab) return;
  if (tab.type !== 'control' && state.editing) editor.setEditing(false);
  if (tab.type === 'control') {
    control.show(tab.id);
    control.render();
  } else if (tab.type === 'data') {
    data.render();
  } else {
    checklist.show(tab.id);
  }
}

function renderLive() {
  const tab = state.activeTab();
  byId('simulated').hidden = !(state.live.simulated && state.live.isReceiving());
  if (tab?.type === 'control') control.renderLive();
  else if (tab?.type === 'data') data.renderLive();
}

function applyEvent(event) {
  if (event.type === 'sensor_readings') {
    state.live.update(event);
    renderLive();
    return;
  }
  if (event.type === 'emergency_stop') {
    const banner = byId('stop-banner');
    const time = new Date(event.at).toLocaleTimeString();
    banner.textContent = `Emergency stop by ${event.by} at ${time}: every actuator was returned to its default state. Click to close.`;
    banner.hidden = false;
    return;
  }
  if (event.type === 'pid_changed') {
    if (event.tab_id === control.tabId) control.refreshPid();
    return;
  }
  const changed = state.apply(event);
  if (changed === 'tabs' || changed === 'devices' || changed === 'types') renderAll();
  else if (changed === 'steps' && state.activeTab()?.type === 'checklist') checklist.render();
}

async function loadEverything() {
  const [tabs, devices, sensorTypes] = await Promise.all([
    api.listTabs(),
    api.listDevices(),
    api.listSensorTypes(),
  ]);
  const checklists = tabs.filter((tab) => tab.type === 'checklist');
  const lists = await Promise.all(checklists.map((tab) => api.listSteps(tab.id)));
  const steps = new Map(checklists.map((tab, index) => [tab.id, lists[index]]));
  return { tabs, devices, sensorTypes, steps };
}

function showConnection(online) {
  state.online = online;
  const status = byId('connection-status');
  status.dataset.online = String(online);
  status.textContent = online ? 'Connected' : 'Disconnected';
  byId('connection-banner').hidden = online;
  byId('emergency-stop').disabled = !online;
}

function setupEmergencyStop() {
  byId('emergency-stop').addEventListener('click', async () => {
    const result = await attempt(() => api.emergencyStop());
    if (!result) showMessage('The emergency stop failed. Use the physical emergency stop.');
  });
  byId('stop-banner').addEventListener('click', (event) => {
    event.currentTarget.hidden = true;
  });
}

async function start() {
  const { username } = await api.me();
  state.username = username;
  byId('user-name').textContent = username;
  byId('logout').addEventListener('click', async () => {
    await api.logout();
    window.location.assign('/login');
  });
  setupEmergencyStop();

  const fromAddress = /^#tab=(.+)$/.exec(window.location.hash)?.[1];
  if (fromAddress) state.activeTabId = decodeURIComponent(fromAddress);

  // Events received while the full state loads are replayed on top of it, so that a
  // change made during the load is not overwritten by the older snapshot.
  let pendingEvents = null;
  let generation = 0;

  async function resynchronize() {
    const current = ++generation;
    pendingEvents = [];
    try {
      const snapshot = await loadEverything();
      if (current !== generation) return;
      state.load(snapshot);
      showConnection(true);
      control.tabId = null;
      renderAll();
      pendingEvents.forEach(applyEvent);
      pendingEvents = null;
    } catch {
      if (current === generation) connection.reconnect();
    }
  }

  const connection = connectEvents({
    onOpen: resynchronize,
    onClose: () => {
      generation += 1;
      pendingEvents = null;
      showConnection(false);
      renderAll();
      // A refused connection may mean the session expired; a 401 leads to the sign-in page.
      api.me().catch(() => {});
    },
    onEvent: (event) => {
      if (pendingEvents) pendingEvents.push(event);
      else applyEvent(event);
    },
  });

  // Values turn grey when no reading arrived for 2 s, even if the server goes quiet.
  window.setInterval(renderLive, STALE_CHECK_MS);
}

start();
