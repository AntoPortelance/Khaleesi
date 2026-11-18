import { api } from './api.js';
import { ControlView } from './control.js';
import { setupEditor } from './editor.js';
import { connectEvents } from './events.js';
import { setupSensorDialog } from './sensor-dialog.js';

const byId = (id) => document.getElementById(id);

function setupTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const other of tabs) {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        byId(`tab-${other.dataset.tab}`).hidden = !selected;
      }
    });
  }
}

function showConnection(online) {
  const status = byId('connection-status');
  status.dataset.online = String(online);
  status.textContent = online ? 'Connected' : 'Disconnected';
  byId('connection-banner').hidden = online;
}

async function start() {
  setupTabs();
  const { username } = await api.me();
  byId('user-name').textContent = username;
  byId('logout').addEventListener('click', async () => {
    await api.logout();
    window.location.assign('/login');
  });

  const view = new ControlView();
  setupEditor(view);
  setupSensorDialog(view);

  // Events received while the full state loads are replayed on top of it, so that a
  // change made during the load is not overwritten by the older snapshot.
  let pendingEvents = null;
  let generation = 0;

  async function resynchronize() {
    const current = ++generation;
    pendingEvents = [];
    try {
      const devices = await api.listDevices();
      if (current !== generation) return;
      view.replaceAll(devices);
      view.refreshPid();
      pendingEvents.forEach((event) => view.applyEvent(event));
      pendingEvents = null;
      view.setOnline(true);
      showConnection(true);
    } catch {
      if (current === generation) connection.reconnect();
    }
  }

  const connection = connectEvents({
    onOpen: resynchronize,
    onClose: () => {
      generation += 1;
      pendingEvents = null;
      view.setOnline(false);
      showConnection(false);
      // A refused connection may mean the session expired; a 401 leads to the sign-in page.
      api.me().catch(() => {});
    },
    onEvent: (event) => {
      if (pendingEvents) pendingEvents.push(event);
      else view.applyEvent(event);
    },
  });
}

start();
