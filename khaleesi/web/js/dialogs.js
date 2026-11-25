import { api } from './api.js';
import { STATE_LABELS } from './format.js';

const byId = (id) => document.getElementById(id);

const DEFAULT_STATES = { valve: ['CLOSED', 'OPEN'], cylinder: ['RETRACTED', 'EXTENDED'] };
const CHANNELS = {
  analog: { label: 'ADC channel', max: 7, hint: '0 to 7' },
  digital: { label: 'GPIO pin', max: 27, hint: '0 to 27' },
};
const NEW_TYPE = '__new__';

/** A value the browser refuses before asking the server, with the field to point at. */
class FormProblem extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function readNumber(form, field, { integer = false, label = field } = {}) {
  const text = form.elements[field].value.trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new FormProblem(field, `${label} must be ${integer ? 'a whole number' : 'a number'}.`);
  }
  return value;
}

function readName(form, field = 'name') {
  const name = form.elements[field].value.trim();
  if (!name) throw new FormProblem(field, 'Enter a name.');
  return name;
}

/**
 * Opens a dialog whose form is checked by `collect`, then sent by `save`. Errors stay in the
 * dialog, next to the field the server or the browser named. Resolves with what `save`
 * returned, or null if the dialog was cancelled.
 */
function runDialog(dialog, { title, submitLabel = 'Save', prepare, collect, save }) {
  const form = dialog.querySelector('form');
  const error = form.querySelector('.form-error');
  const submit = form.querySelector('[type="submit"]');

  function showError(message, field) {
    form.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
    error.textContent = message;
    error.hidden = !message;
    const input = field && form.elements[field];
    if (input?.closest) {
      input.closest('.field')?.classList.add('invalid');
      input.focus?.();
    }
  }

  form.reset();
  showError('');
  dialog.querySelector('.dialog-title').textContent = title;
  submit.textContent = submitLabel;
  prepare?.(form);

  return new Promise((resolve) => {
    let result = null;
    const controller = new AbortController();
    const { signal } = controller;

    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();
        let values;
        try {
          values = collect(form);
        } catch (problem) {
          if (!(problem instanceof FormProblem)) throw problem;
          showError(problem.message, problem.field);
          return;
        }
        submit.disabled = true;
        try {
          result = await save(values);
          dialog.close();
        } catch (failure) {
          // Server messages start with the field they are about, e.g. "pin: ...".
          const field = /^(\w+):/.exec(failure.message ?? '')?.[1];
          showError(failure.status ? failure.message : 'The server cannot be reached.', field);
        } finally {
          submit.disabled = false;
        }
      },
      { signal },
    );
    form.querySelector('[data-close]').addEventListener('click', () => dialog.close(), { signal });
    dialog.addEventListener(
      'close',
      () => {
        controller.abort();
        resolve(result);
      },
      { signal },
    );

    dialog.showModal();
    form.querySelector('input:not([type="radio"]):not(:disabled)')?.focus();
  });
}

// ------------------------------------------------------------------ tabs

export function openTabDialog({ title, name, save }) {
  return runDialog(byId('tab-dialog'), {
    title,
    prepare: (form) => {
      form.elements.name.value = name;
    },
    collect: (form) => readName(form),
    save,
  });
}

// ------------------------------------------------------------------ valves and cylinders

function renderDefaultStates(form, kind, selected) {
  const states = DEFAULT_STATES[kind];
  byId('actuator-defaults').replaceChildren(
    ...states.map((state) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'default_state';
      input.value = state;
      input.checked = state === (states.includes(selected) ? selected : states[0]);
      label.append(input, ` ${STATE_LABELS[state]}`);
      return label;
    }),
  );
}

/** Adds an actuator when `actuator` is null, otherwise changes its settings. */
export function openActuatorDialog({ actuator = null, placement = {} }) {
  const dialog = byId('actuator-dialog');
  const form = dialog.querySelector('form');
  const onKindChange = () => renderDefaultStates(form, form.elements.kind.value);

  return runDialog(dialog, {
    title: actuator ? `Settings of ${actuator.name}` : 'Add valve or cylinder',
    submitLabel: actuator ? 'Save' : 'Add',
    prepare: () => {
      const kind = actuator?.kind ?? 'valve';
      form.elements.kind.value = kind;
      for (const radio of form.querySelectorAll('[name="kind"]')) {
        // The type of an actuator is fixed once it exists.
        radio.disabled = Boolean(actuator);
        radio.onchange = onKindChange;
      }
      form.elements.name.value = actuator?.name ?? '';
      form.elements.pin.value = actuator?.pin ?? '';
      renderDefaultStates(form, kind, actuator?.default_state);
    },
    collect: () => {
      const values = {
        name: readName(form),
        pin: readNumber(form, 'pin', { integer: true, label: 'The GPIO pin' }),
        default_state: form.elements.default_state.value,
      };
      return actuator ? values : { ...values, kind: form.elements.kind.value, ...placement };
    },
    save: (values) =>
      actuator ? api.updateActuator(actuator.id, values) : api.addActuator(values),
  });
}

// ------------------------------------------------------------------ sensors

function fillTypeOptions(select, state, kind, selected) {
  const options = [new Option('None', '')];
  for (const sensorType of state.sensorTypes) {
    if (sensorType.signal === kind) options.push(new Option(sensorType.label, sensorType.id));
  }
  options.push(new Option('New type…', NEW_TYPE));
  select.replaceChildren(...options);
  select.value = state.sensorType(selected)?.signal === kind ? selected : '';
  select.dataset.previous = select.value;
}

function showSignal(form, kind) {
  const channel = CHANNELS[kind];
  byId('sensor-channel-label').textContent = `${channel.label} (${channel.hint})`;
  form.elements.channel.max = channel.max;
  form.querySelectorAll('.analog-only').forEach((node) => {
    node.hidden = kind !== 'analog';
  });
}

/** Adds a sensor when `sensor` is null, otherwise changes its settings. */
export function openSensorDialog({ state, sensor = null, placement = {} }) {
  const dialog = byId('sensor-dialog');
  const form = dialog.querySelector('form');
  const select = form.elements.type;

  function suggestFromType() {
    const sensorType = state.sensorType(select.value);
    if (!sensorType || sensorType.signal !== 'analog') return;
    // Suggestions only fill what the user has not typed yet.
    if (!form.elements.unit.value) form.elements.unit.value = sensorType.unit;
    if (!sensor) form.elements.decimals.value = sensorType.decimals;
  }

  async function onTypeChange() {
    if (select.value !== NEW_TYPE) {
      select.dataset.previous = select.value;
      suggestFromType();
      return;
    }
    const kind = form.elements.kind.value;
    const created = await openTypeDialog({ signal: kind });
    fillTypeOptions(select, state, kind, created?.id ?? select.dataset.previous);
    if (created) {
      // The server's event may arrive after the dialog closes: add the type right away.
      if (!state.sensorType(created.id)) state.sensorTypes.push(created);
      fillTypeOptions(select, state, kind, created.id);
      suggestFromType();
    }
  }

  return runDialog(dialog, {
    title: sensor ? `Settings of ${sensor.name}` : 'Add sensor',
    submitLabel: sensor ? 'Save' : 'Add',
    prepare: () => {
      const kind = sensor?.kind ?? 'analog';
      form.elements.kind.value = kind;
      for (const radio of form.querySelectorAll('[name="kind"]')) {
        // Analog and digital sensors are wired differently, so the signal is fixed.
        radio.disabled = Boolean(sensor);
        radio.onchange = () => {
          showSignal(form, radio.value);
          fillTypeOptions(select, state, radio.value, '');
        };
      }
      fillTypeOptions(select, state, kind, sensor?.type ?? '');
      select.onchange = onTypeChange;
      showSignal(form, kind);
      form.elements.name.value = sensor?.name ?? '';
      form.elements.channel.value = sensor?.channel ?? '';
      form.elements.formula.value = sensor?.formula ?? '';
      form.elements.unit.value = sensor?.unit ?? '';
      form.elements.decimals.value = sensor?.decimals ?? 2;
      form.elements.min.value = sensor?.min ?? '';
      form.elements.max.value = sensor?.max ?? '';
    },
    collect: () => {
      const kind = form.elements.kind.value;
      const values = {
        name: readName(form),
        type: select.value || null,
        channel: readNumber(form, 'channel', { integer: true, label: 'The channel' }),
      };
      if (kind === 'analog') {
        const min = readNumber(form, 'min', { label: 'The minimum' });
        const max = readNumber(form, 'max', { label: 'The maximum' });
        if (min !== null && max !== null && min >= max) {
          throw new FormProblem('max', 'The maximum must be greater than the minimum.');
        }
        Object.assign(values, {
          formula: form.elements.formula.value.trim(),
          unit: form.elements.unit.value.trim(),
          decimals: readNumber(form, 'decimals', { integer: true, label: 'Decimals' }) ?? 2,
          min,
          max,
        });
      }
      return sensor ? values : { ...values, kind, ...placement };
    },
    save: (values) => (sensor ? api.updateSensor(sensor.id, values) : api.addSensor(values)),
  });
}

// ------------------------------------------------------------------ sensor types

export function openTypeDialog({ signal = 'analog' } = {}) {
  const dialog = byId('type-dialog');
  const form = dialog.querySelector('form');
  const showSignalFields = () => {
    const analog = form.elements.signal.value === 'analog';
    form.querySelectorAll('.analog-only').forEach((node) => {
      node.hidden = !analog;
    });
  };

  return runDialog(dialog, {
    title: 'New sensor type',
    submitLabel: 'Add type',
    prepare: () => {
      form.elements.signal.value = signal;
      for (const radio of form.querySelectorAll('[name="signal"]')) {
        radio.onchange = showSignalFields;
      }
      showSignalFields();
    },
    collect: () => {
      const label = readName(form, 'label');
      const analog = form.elements.signal.value === 'analog';
      return {
        label,
        signal: form.elements.signal.value,
        unit: analog ? form.elements.unit.value.trim() : '',
        decimals: analog
          ? (readNumber(form, 'decimals', { integer: true, label: 'Decimals' }) ?? 2)
          : 0,
      };
    },
    save: (values) => api.addSensorType(values),
  });
}
