import { api } from './api.js';
import { formatTime } from './format.js';

const byId = (id) => document.getElementById(id);

/** Checklist tabs: steps ticked before a test, shared live between screens. */
export class ChecklistView {
  constructor(state, { attempt }) {
    this.state = state;
    this.attempt = attempt;
    this.tabId = null;
    this.editingId = null;
    this.list = byId('steps');

    byId('step-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = byId('step-text');
      const text = input.value.trim();
      if (!text) return;
      const created = await this.attempt(() => api.addStep(this.tabId, text));
      if (created) input.value = '';
      input.focus();
    });
    byId('steps-reset').addEventListener('click', async () => {
      if (window.confirm('Untick every step of this checklist?')) {
        await this.attempt(() => api.resetSteps(this.tabId));
      }
    });
    this.list.addEventListener('change', (event) => {
      const box = event.target.closest('.step-check');
      if (!box) return;
      const stepId = box.closest('li').dataset.id;
      this.attempt(() => api.updateStep(stepId, { checked: box.checked }));
    });
    this.list.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (action) this.act(action.dataset.action, action.closest('li').dataset.id);
    });
  }

  show(tabId) {
    this.tabId = tabId;
    this.render();
  }

  render() {
    const tab = this.state.tab(this.tabId);
    if (!tab) return;
    const steps = this.state.stepsOf(this.tabId);
    const done = steps.filter((step) => step.checked_by).length;
    byId('checklist-title').textContent = tab.name;
    byId('checklist-count').textContent = `${done} / ${steps.length} steps`;
    byId('checklist-bar').style.width = steps.length ? `${(done / steps.length) * 100}%` : '0';
    byId('steps-empty').hidden = steps.length > 0;
    byId('steps-reset').disabled = done === 0;
    this.list.replaceChildren(...steps.map((step, index) => this.createStep(step, index, steps)));
  }

  createStep(step, index, steps) {
    const item = document.createElement('li');
    item.dataset.id = step.id;
    item.classList.toggle('done', Boolean(step.checked_by));

    const label = document.createElement('label');
    label.className = 'step-label';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'step-check';
    box.checked = Boolean(step.checked_by);
    box.disabled = !this.state.online;
    label.append(box, step.id === this.editingId ? this.createEditor(step) : step.text);

    const who = document.createElement('small');
    who.className = 'step-who';
    who.textContent = step.checked_by ? `${step.checked_by}, ${formatTime(step.checked_at)}` : '';

    const actions = document.createElement('span');
    actions.className = 'step-actions';
    actions.append(
      this.actionButton('up', '↑', 'Move up', index === 0),
      this.actionButton('down', '↓', 'Move down', index === steps.length - 1),
      this.actionButton('edit', '✎', 'Edit'),
      this.actionButton('delete', '✕', 'Delete'),
    );
    item.append(label, who, actions);
    return item;
  }

  /** The step's text becomes a field: Enter saves, Escape cancels. */
  createEditor(step) {
    const input = document.createElement('input');
    input.className = 'step-edit';
    input.value = step.text;
    input.maxLength = 200;
    input.setAttribute('aria-label', 'Step text');
    const finish = async (save) => {
      if (this.editingId !== step.id) return;
      this.editingId = null;
      const text = input.value.trim();
      if (save && text && text !== step.text) {
        await this.attempt(() => api.updateStep(step.id, { text }));
      }
      this.render();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    // Clicking the field must not tick the step through its label.
    input.addEventListener('click', (event) => event.preventDefault());
    return input;
  }

  actionButton(action, symbol, label, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button icon-button-small';
    button.dataset.action = action;
    button.textContent = symbol;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = disabled;
    return button;
  }

  async act(action, stepId) {
    const steps = this.state.stepsOf(this.tabId);
    const index = steps.findIndex((step) => step.id === stepId);
    if (index < 0) return;
    if (action === 'up' || action === 'down') {
      const position = index + (action === 'up' ? -1 : 1);
      await this.attempt(() => api.updateStep(stepId, { position }));
    } else if (action === 'edit') {
      this.editingId = stepId;
      this.render();
      this.list.querySelector('.step-edit')?.focus();
    } else if (action === 'delete' && window.confirm(`Delete “${steps[index].text}”?`)) {
      await this.attempt(() => api.deleteStep(stepId));
    }
  }
}
