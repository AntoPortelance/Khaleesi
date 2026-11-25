export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function describeError(detail) {
  if (typeof detail === 'string') return detail;
  // Pydantic reports a list of problems: the first one names the field.
  if (Array.isArray(detail) && detail[0]?.msg) {
    const field = detail[0].loc?.at(-1);
    return field ? `${field}: ${detail[0].msg}` : detail[0].msg;
  }
  return 'The request was rejected. Check the values and try again.';
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (response.status === 401 && !path.endsWith('/login')) {
    window.location.assign('/login');
    throw new ApiError(401, 'Authentication required');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, describeError(body.detail));
  }
  return response.status === 204 ? null : response.json();
}

function sendJson(method, path, body) {
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const id = (value) => encodeURIComponent(value);

export const api = {
  login: (username, password) => sendJson('POST', '/api/auth/login', { username, password }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),

  listTabs: () => request('/api/tabs'),
  addTab: (tab) => sendJson('POST', '/api/tabs', tab),
  updateTab: (tabId, changes) => sendJson('PATCH', `/api/tabs/${id(tabId)}`, changes),
  deleteTab: (tabId) => request(`/api/tabs/${id(tabId)}`, { method: 'DELETE' }),
  pidUrl: (tabId) => `/api/tabs/${id(tabId)}/pid`,
  uploadPid: (tabId, file) => request(`/api/tabs/${id(tabId)}/pid`, { method: 'PUT', body: file }),

  listDevices: () => request('/api/devices'),
  addSensor: (sensor) => sendJson('POST', '/api/sensors', sensor),
  updateSensor: (sensorId, changes) => sendJson('PATCH', `/api/sensors/${id(sensorId)}`, changes),
  deleteSensor: (sensorId) => request(`/api/sensors/${id(sensorId)}`, { method: 'DELETE' }),
  listSensorTypes: () => request('/api/sensor-types'),
  addSensorType: (sensorType) => sendJson('POST', '/api/sensor-types', sensorType),
  addActuator: (actuator) => sendJson('POST', '/api/actuators', actuator),
  updateActuator: (actuatorId, changes) =>
    sendJson('PATCH', `/api/actuators/${id(actuatorId)}`, changes),
  deleteActuator: (actuatorId) => request(`/api/actuators/${id(actuatorId)}`, { method: 'DELETE' }),
  commandActuator: (actuatorId, target) =>
    sendJson('POST', `/api/actuators/${id(actuatorId)}/command`, { target }),
  emergencyStop: () => request('/api/emergency-stop', { method: 'POST' }),

  listSteps: (tabId) => request(`/api/tabs/${id(tabId)}/steps`),
  addStep: (tabId, text) => sendJson('POST', `/api/tabs/${id(tabId)}/steps`, { text }),
  updateStep: (stepId, changes) => sendJson('PATCH', `/api/steps/${id(stepId)}`, changes),
  deleteStep: (stepId) => request(`/api/steps/${id(stepId)}`, { method: 'DELETE' }),
  resetSteps: (tabId) => request(`/api/tabs/${id(tabId)}/steps/reset`, { method: 'POST' }),
};
