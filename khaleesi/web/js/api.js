export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function describeError(detail) {
  if (typeof detail === 'string') return detail;
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

export const api = {
  login: (username, password) => sendJson('POST', '/api/auth/login', { username, password }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  listActuators: () => request('/api/actuators'),
  addActuator: (actuator) => sendJson('POST', '/api/actuators', actuator),
  updateActuator: (id, changes) => sendJson('PATCH', `/api/actuators/${id}`, changes),
  deleteActuator: (id) => request(`/api/actuators/${id}`, { method: 'DELETE' }),
  commandActuator: (id, target) => sendJson('POST', `/api/actuators/${id}/command`, { target }),
  uploadPid: (file) => request('/api/bench/pid', { method: 'PUT', body: file }),
};
