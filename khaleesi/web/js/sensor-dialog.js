import { api } from './api.js';

const byId = (id) => document.getElementById(id);

/**
 * The "Add sensor" dialog. The server stores a sensor's name, signal (analog or digital), and
 * position; renaming, moving, and removing use the same tools as actuators.
 */
export function setupSensorDialog(view) {
  const dialog = byId('sensor-dialog');
  const form = byId('sensor-form');
  const error = byId('sensor-error');
  const submit = byId('sensor-submit');

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
    form.elements.name.closest('.field').classList.toggle('invalid', Boolean(text));
  }

  byId('add-sensor').addEventListener('click', () => {
    form.reset();
    showError('');
    dialog.showModal();
    form.elements.name.focus();
  });

  byId('sensor-cancel').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      showError('Enter a name.');
      form.elements.name.focus();
      return;
    }

    submit.disabled = true;
    // New devices line up along the top, like actuators, to be dragged onto their symbol.
    const x = 0.1 + (view.allDevices().length % 9) * 0.1;
    try {
      const created = await api.addSensor({ name, kind: form.elements.kind.value, x, y: 0.1 });
      dialog.close();
      view.selectedId = created.id;
      view.render();
    } catch (failure) {
      showError(view.describeFailure(failure));
    } finally {
      submit.disabled = false;
    }
  });
}
