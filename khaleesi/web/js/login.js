import { api } from './api.js';

const form = document.getElementById('login-form');
const error = document.getElementById('login-error');
const submit = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  try {
    await api.login(form.username.value, form.password.value);
    window.location.assign('/');
  } catch (failure) {
    error.textContent = failure.status ? failure.message : 'The server cannot be reached.';
    error.hidden = false;
    form.password.value = '';
    submit.disabled = false;
  }
});

submit.disabled = false;
