const form = document.querySelector('form');
const input = document.querySelector('#dashboard');
const error = document.querySelector('#error');

function dashboardUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new Error('Use HTTPS, or HTTP on localhost for testing.');
  }
  return url.href;
}

chrome.storage.local.get('dashboard').then(({ dashboard }) => {
  if (!dashboard) return;
  try {
    input.value = dashboardUrl(dashboard);
    // Keep options accessible after configuring the automatic new-tab redirect.
    if (location.search !== '?configure') location.replace(input.value);
  } catch (e) { error.textContent = e.message; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const dashboard = dashboardUrl(input.value);
    await chrome.storage.local.set({ dashboard });
    location.replace(dashboard);
  } catch (e) { error.textContent = e.message; }
});
