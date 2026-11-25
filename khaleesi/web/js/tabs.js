import { api } from './api.js';
import { openTabDialog } from './dialogs.js';

const byId = (id) => document.getElementById(id);

const ICONS = {
  control: 'M3 5h14v10H3zM7 5v10M3 10h4',
  data: 'M3 16h14M5 13l3-4 3 2 4-6',
  checklist: 'M4 5l2 2 3-3M4 11l2 2 3-3M11 6h6M11 12h6',
};
const DEFAULT_NAMES = { control: 'Control', data: 'Live data', checklist: 'Checklist' };

function icon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', ICONS[type]);
  svg.append(path);
  return svg;
}

/** Closes a menu when the user clicks elsewhere or presses Escape. */
function dismissable(menu, onClose) {
  function close(event) {
    if (event.type === 'keydown' && event.key !== 'Escape') return;
    if (event.type === 'pointerdown' && menu.contains(event.target)) return;
    menu.hidden = true;
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', close, true);
    onClose?.();
  }
  document.addEventListener('pointerdown', close, true);
  document.addEventListener('keydown', close, true);
}

/** The row of tabs: switching, adding, renaming, moving, and deleting tabs. */
export class TabBar {
  constructor(state, { onSelect, attempt }) {
    this.state = state;
    this.onSelect = onSelect;
    this.attempt = attempt;
    this.nav = byId('tabs');
    this.menu = byId('tab-menu');
    this.menuTabId = null;

    this.nav.addEventListener('click', (event) => {
      const more = event.target.closest('.tab-more');
      const tab = event.target.closest('.tab');
      if (more) this.openMenu(more.dataset.id, more);
      else if (tab) this.onSelect(tab.dataset.id);
    });
    this.nav.addEventListener('contextmenu', (event) => {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      event.preventDefault();
      this.openMenu(tab.dataset.id, tab);
    });
    this.nav.addEventListener('dblclick', (event) => {
      const tab = event.target.closest('.tab');
      if (tab) this.rename(tab.dataset.id);
    });
    this.menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-action]');
      if (!item) return;
      this.menu.hidden = true;
      this.act(item.dataset.action, this.menuTabId);
    });
    this.setupAddMenu();
  }

  setupAddMenu() {
    const button = byId('tab-add');
    const menu = byId('tab-add-menu');
    button.addEventListener('click', () => {
      if (!menu.hidden) return;
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      dismissable(menu, () => button.setAttribute('aria-expanded', 'false'));
    });
    menu.addEventListener('click', async (event) => {
      const item = event.target.closest('[data-type]');
      if (!item) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      const { type } = item.dataset;
      const created = await openTabDialog({
        title: `New ${type} tab`,
        name: DEFAULT_NAMES[type],
        save: (name) => api.addTab({ name, type }),
      });
      if (created) this.onSelect(created.id);
    });
  }

  render() {
    const { tabs, activeTabId } = this.state;
    this.nav.replaceChildren(
      ...tabs.map((tab) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'tab-wrapper';
        const button = document.createElement('button');
        button.className = 'tab';
        button.setAttribute('role', 'tab');
        button.dataset.id = tab.id;
        button.dataset.type = tab.type;
        button.setAttribute('aria-selected', String(tab.id === activeTabId));
        button.title = 'Double-click to rename, right-click for more';
        const label = document.createElement('span');
        label.textContent = tab.name;
        button.append(icon(tab.type), label);

        const more = document.createElement('button');
        more.className = 'tab-more';
        more.dataset.id = tab.id;
        more.setAttribute('aria-label', `Options for ${tab.name}`);
        more.textContent = '⋯';
        wrapper.append(button, more);
        return wrapper;
      }),
    );
  }

  openMenu(tabId, anchor) {
    const tab = this.state.tab(tabId);
    if (!tab) return;
    const position = this.state.tabs.indexOf(tab);
    this.menuTabId = tabId;
    this.menu.querySelector('[data-action="left"]').disabled = position === 0;
    this.menu.querySelector('[data-action="right"]').disabled =
      position === this.state.tabs.length - 1;
    this.menu.querySelector('[data-action="delete"]').disabled = this.state.tabs.length === 1;

    const box = anchor.getBoundingClientRect();
    this.menu.style.left = `${box.left}px`;
    this.menu.style.top = `${box.bottom + 4}px`;
    this.menu.hidden = false;
    dismissable(this.menu);
  }

  async act(action, tabId) {
    const tab = this.state.tab(tabId);
    if (!tab) return;
    const position = this.state.tabs.indexOf(tab);
    if (action === 'rename') {
      await this.rename(tabId);
    } else if (action === 'left' || action === 'right') {
      const target = position + (action === 'left' ? -1 : 1);
      await this.attempt(() => api.updateTab(tabId, { position: target }));
    } else if (action === 'delete' && window.confirm(this.describeDeletion(tab))) {
      await this.attempt(() => api.deleteTab(tabId));
    }
  }

  async rename(tabId) {
    const tab = this.state.tab(tabId);
    if (!tab) return;
    await openTabDialog({
      title: 'Rename tab',
      name: tab.name,
      save: (name) => api.updateTab(tabId, { name }),
    });
  }

  describeDeletion(tab) {
    if (tab.type === 'control') {
      const count = this.state.devicesOn(tab.id).length;
      const devices = count === 1 ? '1 device' : `${count} devices`;
      return `Delete “${tab.name}” with its P&ID and ${devices}? This cannot be undone.`;
    }
    if (tab.type === 'checklist') {
      return `Delete “${tab.name}” and its steps? This cannot be undone.`;
    }
    return `Delete “${tab.name}”?`;
  }
}
