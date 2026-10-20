/**
 * MINERVA — Indian Mineral Resource Management Database
 * Production Authentication & Control Panel System
 */

// ============================================================================
// 1. Database Sample Records (Synchronized from 01 & 02 SQL Schema)
// ============================================================================
const MINES_DATA = [
  { name: 'CHILHATI', state: 'Chhattisgarh', district: 'Bilaspur', company: 'NUVaco Vista', mineral: 'Limestone', status: 'Active Concession' },
  { name: 'DALDALI', state: 'Chhattisgarh', district: 'Kabirdham', company: 'Mahavir Minerals', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'TATIJHARIYA', state: 'Chhattisgarh', district: 'Balrampur', company: 'Hindalco Industries Ltd.', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'SAMRI', state: 'Chhattisgarh', district: 'Balrampur', company: 'Hindalco Industries Ltd.', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'KUDAG', state: 'Chhattisgarh', district: 'Balrampur', company: 'Hindalco Industries Ltd.', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'ROHTAS QUARRY', state: 'Bihar', district: 'Rohtas', company: 'Dalmia Cement Bharat Limited', mineral: 'Limestone', status: 'Active Concession' },
  { name: 'SERENGDAG', state: 'Jharkhand', district: 'Gumla', company: 'Hindalco Industries Ltd.', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'PAKHAR', state: 'Jharkhand', district: 'Lohardaga', company: 'Hindalco Industries Ltd.', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'KURA', state: 'Jharkhand', district: 'Giridih', company: 'G.K Popat (lessee)', mineral: 'Graphite', status: 'Active Concession' },
  { name: 'NOAMUNDI', state: 'Jharkhand', district: 'West Singhbhum', company: 'Tata Steel Ltd.', mineral: 'Iron Ore', status: 'Active Concession' },
  { name: 'KIRIBURU', state: 'Jharkhand', district: 'West Singhbhum', company: 'Steel Authority of India Limited', mineral: 'Iron Ore', status: 'Active Concession' },
  { name: 'MEGHAHATUBURU', state: 'Jharkhand', district: 'West Singhbhum', company: 'Steel Authority of India Limited', mineral: 'Iron Ore', status: 'Active Concession' },
  { name: 'MOSABONI', state: 'Jharkhand', district: 'East Singhbhum', company: 'Hindustan Copper Limited', mineral: 'Copper Ore', status: 'Active Concession' },
  { name: 'PANCHPATMALI', state: 'Odisha', district: 'Koraput', company: 'NALCO', mineral: 'Bauxite', status: 'Active Concession' },
  { name: 'JODA EAST', state: 'Odisha', district: 'Keonjhar', company: 'Tata Steel Ltd.', mineral: 'Iron Ore', status: 'Active Concession' },
  { name: 'BARSAN', state: 'Odisha', district: 'Sundergarh', company: 'Steel Authority of India Limited', mineral: 'Iron Ore', status: 'Active Concession' },
  { name: 'GOTAN', state: 'Rajasthan', district: 'Jodhpur', company: 'Marwar Cement Ltd', mineral: 'Limestone', status: 'Active Concession' },
  { name: 'KAYAD', state: 'Rajasthan', district: 'Ajmer', company: 'HZL (Hindustan Zinc Ltd)', mineral: 'Lead Zinc Ore', status: 'Active Concession' },
];

// Valid credentials directory (persisted changes supported)
let VALID_CREDENTIALS = {
  'USR-1024': { pin: 'minerva@2026', role: 'Database Administrator', name: 'Joel George', fallbackPin: '1024' },
  'INS-4088': { pin: 'inspector@2026', role: 'Mining Lease Inspector', name: 'R. K. Sharma', fallbackPin: '4088' },
  'GEO-9921': { pin: 'surveyor@2026', role: 'Geological Field Surveyor', name: 'Ananya Sen', fallbackPin: '9921' },
};

// ============================================================================
// 2. Application State & DOM References
// ============================================================================
const state = {
  identifier: 'USR-1024',
  passcode: 'minerva@2026',
  rememberMe: true,
  showPassword: false,
  isLoading: false,
  errorMessage: '',
  currentUser: null,
};

// DOM Elements
const authView = document.getElementById('authView');
const dashboardView = document.getElementById('dashboardView');
const signInForm = document.getElementById('signInForm');
const identifierInput = document.getElementById('userIdentifier');
const passcodeInput = document.getElementById('securityPasscode');
const rememberCheckbox = document.getElementById('rememberWorkstation');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIcon = document.getElementById('eyeIcon');
const eyeOffIcon = document.getElementById('eyeOffIcon');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnLoading = document.getElementById('btnLoading');
const errorBanner = document.getElementById('errorBanner');
const errorMessageText = document.getElementById('errorMessageText');
const identifierWrapper = document.getElementById('identifierWrapper');
const passcodeWrapper = document.getElementById('passcodeWrapper');
const identifierError = document.getElementById('identifierError');
const passcodeError = document.getElementById('passcodeError');

// SSO & Modal Elements
const googleSsoBtn = document.getElementById('googleSsoBtn');
const govIdSsoBtn = document.getElementById('govIdSsoBtn');
const googleModal = document.getElementById('googleModal');
const closeGoogleBtn = document.getElementById('closeGoogleBtn');
const cancelGoogleBtn = document.getElementById('cancelGoogleBtn');
const govModal = document.getElementById('govModal');
const closeGovBtn = document.getElementById('closeGovBtn');
const cancelGovBtn = document.getElementById('cancelGovBtn');
const govProgressFill = document.getElementById('govProgressFill');
const govProgressText = document.getElementById('govProgressText');
const govInstantAuthBtn = document.getElementById('govInstantAuthBtn');

// Forgot PIN Elements
const forgotPinBtn = document.getElementById('forgotPinBtn');
const forgotPinModal = document.getElementById('forgotPinModal');
const closeForgotPinBtn = document.getElementById('closeForgotPinBtn');
const cancelForgotPinBtn = document.getElementById('cancelForgotPinBtn');
const resetIdentifierInput = document.getElementById('resetIdentifierInput');
const otpStep = document.getElementById('otpStep');
const resetOtpInput = document.getElementById('resetOtpInput');
const newPinInput = document.getElementById('newPinInput');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const confirmResetBtn = document.getElementById('confirmResetBtn');

// Demo Drawer Elements
const quickFillBtn = document.getElementById('quickFillBtn');
const demoAccountsBtn = document.getElementById('demoAccountsBtn');
const rolesMenu = document.getElementById('rolesMenu');

// Dashboard Elements
const signOutBtn = document.getElementById('signOutBtn');
const dashUserId = document.getElementById('dashUserId');
const dashUserRole = document.getElementById('dashUserRole');
const dashUserAvatar = document.getElementById('dashUserAvatar');
const dashStorageType = document.getElementById('dashStorageType');
const minesTableBody = document.getElementById('minesTableBody');
const mineSearchInput = document.getElementById('mineSearchInput');
const tableRowCount = document.getElementById('tableRowCount');
const toastContainer = document.getElementById('toastContainer');

// ============================================================================
// 3. Toast Notifications
// ============================================================================
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C94A29" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B07D53" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================================
// 4. Persistence & Session Management
// ============================================================================
function initSession() {
  try {
    const remembered = localStorage.getItem('minerva_remember_workstation');
    if (remembered === 'true') {
      const savedId = localStorage.getItem('minerva_user_identifier');
      if (savedId) {
        identifierInput.value = savedId;
        state.identifier = savedId;
      }
      rememberCheckbox.checked = true;
      state.rememberMe = true;
    } else if (remembered === 'false') {
      rememberCheckbox.checked = false;
      state.rememberMe = false;
    }

    // Check if user is currently active in session
    const activeUser = sessionStorage.getItem('minerva_session_user') || localStorage.getItem('minerva_session_user');
    if (activeUser) {
      const parsed = JSON.parse(activeUser);
      launchDashboard(parsed, false);
    }
  } catch (err) {
    console.warn('Storage access restricted', err);
  }
}

function persistLogin(userData, remember) {
  const sessionPayload = JSON.stringify({
    identifier: userData.identifier,
    role: userData.role,
    name: userData.name,
    timestamp: new Date().toISOString(),
    token: 'jwt_' + Math.random().toString(36).substring(2) + Date.now(),
  });

  try {
    if (remember) {
      localStorage.setItem('minerva_remember_workstation', 'true');
      localStorage.setItem('minerva_user_identifier', userData.identifier);
      localStorage.setItem('minerva_session_user', sessionPayload);
      sessionStorage.removeItem('minerva_session_user');
    } else {
      localStorage.setItem('minerva_remember_workstation', 'false');
      localStorage.removeItem('minerva_user_identifier');
      localStorage.removeItem('minerva_session_user');
      sessionStorage.setItem('minerva_session_user', sessionPayload);
    }
  } catch (err) {
    console.warn('Failed to save to web storage', err);
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem('minerva_session_user');
    localStorage.removeItem('minerva_session_user');
  } catch (err) {
    console.warn('Storage cleanup failed', err);
  }
}

// ============================================================================
// 5. Validation & Error Handling
// ============================================================================
function clearErrors() {
  errorBanner.classList.add('hidden');
  identifierWrapper.classList.remove('input-error');
  passcodeWrapper.classList.remove('input-error');
  identifierError.classList.add('hidden');
  passcodeError.classList.add('hidden');
  identifierInput.removeAttribute('aria-invalid');
  passcodeInput.removeAttribute('aria-invalid');
}

function showError(message, focusField = null) {
  errorBanner.classList.remove('hidden');
  errorMessageText.textContent = message;
  
  if (focusField === 'identifier') {
    identifierWrapper.classList.add('input-error');
    identifierError.classList.remove('hidden');
    identifierInput.setAttribute('aria-invalid', 'true');
    identifierInput.focus();
  } else if (focusField === 'passcode') {
    passcodeWrapper.classList.add('input-error');
    passcodeError.classList.remove('hidden');
    passcodeInput.setAttribute('aria-invalid', 'true');
    passcodeInput.focus();
  } else {
    identifierWrapper.classList.add('input-error');
    passcodeWrapper.classList.add('input-error');
    identifierInput.setAttribute('aria-invalid', 'true');
    passcodeInput.setAttribute('aria-invalid', 'true');
  }
}

// ============================================================================
// 6. Password Visibility Toggle
// ============================================================================
togglePasswordBtn.addEventListener('click', () => {
  state.showPassword = !state.showPassword;
  if (state.showPassword) {
    passcodeInput.type = 'text';
    passcodeInput.classList.remove('font-password');
    eyeIcon.classList.add('hidden');
    eyeOffIcon.classList.remove('hidden');
    togglePasswordBtn.setAttribute('aria-pressed', 'true');
    togglePasswordBtn.setAttribute('title', 'Hide passcode');
  } else {
    passcodeInput.type = 'password';
    passcodeInput.classList.add('font-password');
    eyeIcon.classList.remove('hidden');
    eyeOffIcon.classList.add('hidden');
    togglePasswordBtn.setAttribute('aria-pressed', 'false');
    togglePasswordBtn.setAttribute('title', 'Show passcode');
  }
});

// ============================================================================
// 7. Form Submission & Mock Authentication Flow
// ============================================================================
signInForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const idVal = identifierInput.value.trim().toUpperCase();
  const passVal = passcodeInput.value.trim();
  const remember = rememberCheckbox.checked;

  // Validation: Non-empty identifier
  if (!idVal) {
    showError('User Identifier is required.', 'identifier');
    return;
  }

  // Validation: Minimum 4-6 chars
  if (!passVal || passVal.length < 4) {
    showError('Security passcode must be at least 4 characters.', 'passcode');
    return;
  }

  // Enter Loading State
  setLoading(true);

  // Simulated Async Latency (800ms)
  await new Promise((res) => setTimeout(res, 800));

  // Verify against mock database
  const user = VALID_CREDENTIALS[idVal];
  const isValidAuth = user && (passVal === user.pin || passVal === user.fallbackPin);

  if (isValidAuth) {
    setLoading(false);
    showToast(`Authentication verified. Welcome back, ${user.name}!`, 'success');
    
    const authenticatedUser = {
      identifier: idVal,
      role: user.role,
      name: user.name,
    };

    persistLogin(authenticatedUser, remember);
    launchDashboard(authenticatedUser, true);
  } else {
    setLoading(false);
    showError('Invalid identifier or PIN. Please verify credentials.');
  }
});

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (isLoading) {
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
  } else {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

// ============================================================================
// 8. Single Sign-On (SSO) Handlers
// ============================================================================
// Google Identity Modal
googleSsoBtn.addEventListener('click', () => {
  googleModal.showModal();
});

closeGoogleBtn.addEventListener('click', () => googleModal.close());
cancelGoogleBtn.addEventListener('click', () => googleModal.close());

document.querySelectorAll('.google-account-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const email = btn.dataset.email;
    const name = btn.dataset.name;
    const role = btn.dataset.role;
    googleModal.close();

    showToast(`Authenticated via Google Identity (${email})`, 'success');
    const googleUser = {
      identifier: email,
      role: role,
      name: name,
    };
    persistLogin(googleUser, rememberCheckbox.checked);
    launchDashboard(googleUser, true);
  });
});

// Government ID (Jan Parichay) Modal & Simulation
govIdSsoBtn.addEventListener('click', () => {
  govModal.showModal();
  animateGovHandshake();
});

closeGovBtn.addEventListener('click', () => govModal.close());
cancelGovBtn.addEventListener('click', () => govModal.close());

function animateGovHandshake() {
  govProgressFill.style.width = '20%';
  govProgressText.textContent = 'Contacting Jan Parichay Identity Gateway...';

  setTimeout(() => {
    govProgressFill.style.width = '65%';
    govProgressText.textContent = 'Verifying DigiLocker Digital Signature...';
  }, 600);

  setTimeout(() => {
    govProgressFill.style.width = '95%';
    govProgressText.textContent = 'Handshake verified. Ready to authenticate.';
  }, 1200);
}

govInstantAuthBtn.addEventListener('click', () => {
  govModal.close();
  showToast('Redirecting to National Single Sign-On (Jan Parichay)...', 'info');

  setTimeout(() => {
    showToast('Aadhaar / DigiLocker credentials verified successfully!', 'success');
    const govUser = {
      identifier: 'GOV-IND-4091',
      role: 'Ministry of Mines Verified Officer',
      name: 'Shri R. K. Varma',
    };
    persistLogin(govUser, rememberCheckbox.checked);
    launchDashboard(govUser, true);
  }, 800);
});

// ============================================================================
// 9. Forgot PIN Recovery Dialog
// ============================================================================
forgotPinBtn.addEventListener('click', () => {
  resetIdentifierInput.value = identifierInput.value.trim() || 'USR-1024';
  otpStep.classList.add('hidden');
  sendOtpBtn.classList.remove('hidden');
  confirmResetBtn.classList.add('hidden');
  forgotPinModal.showModal();
});

closeForgotPinBtn.addEventListener('click', () => forgotPinModal.close());
cancelForgotPinBtn.addEventListener('click', () => forgotPinModal.close());

sendOtpBtn.addEventListener('click', () => {
  const targetId = resetIdentifierInput.value.trim().toUpperCase();
  if (!targetId) {
    showToast('Please enter your User Identifier', 'error');
    return;
  }

  showToast(`One-Time Passcode (849201) dispatched to device registered for ${targetId}`, 'info', 5000);
  otpStep.classList.remove('hidden');
  sendOtpBtn.classList.add('hidden');
  confirmResetBtn.classList.remove('hidden');
  resetOtpInput.focus();
});

confirmResetBtn.addEventListener('click', () => {
  const otp = resetOtpInput.value.trim();
  const newPin = newPinInput.value.trim();
  const targetId = resetIdentifierInput.value.trim().toUpperCase();

  if (otp !== '849201') {
    showToast('Invalid OTP. Please use the simulated demo code 849201.', 'error');
    return;
  }

  if (!newPin || newPin.length < 4) {
    showToast('New PIN must have at least 4 characters.', 'error');
    return;
  }

  // Update in-memory credentials directory
  if (VALID_CREDENTIALS[targetId]) {
    VALID_CREDENTIALS[targetId].pin = newPin;
  } else {
    VALID_CREDENTIALS[targetId] = { pin: newPin, role: 'Verified Officer', name: targetId };
  }

  passcodeInput.value = newPin;
  identifierInput.value = targetId;
  forgotPinModal.close();
  showToast('PIN successfully updated. You may now sign in with your new passcode.', 'success', 4500);
});

// ============================================================================
// 10. Demo Credentials Quick-Fill & Role Switcher
// ============================================================================
quickFillBtn.addEventListener('click', () => {
  identifierInput.value = 'USR-1024';
  passcodeInput.value = 'minerva@2026';
  rememberCheckbox.checked = true;
  clearErrors();
  showToast('Auto-filled demo credentials: USR-1024 / minerva@2026', 'info', 2500);
});

demoAccountsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  rolesMenu.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  if (!rolesMenu.classList.contains('hidden')) {
    rolesMenu.classList.add('hidden');
  }
});

document.querySelectorAll('.role-item').forEach((item) => {
  item.addEventListener('click', () => {
    const id = item.dataset.id;
    const pin = item.dataset.pin;
    identifierInput.value = id;
    passcodeInput.value = pin;
    clearErrors();
    rolesMenu.classList.add('hidden');
    showToast(`Switched credentials to ${id} (${item.dataset.role})`, 'info');
  });
});

// ============================================================================
// 11. Minerva Database Dashboard Rendering
// ============================================================================
function launchDashboard(userData, animate = true) {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');

  dashUserId.textContent = userData.identifier;
  dashUserRole.textContent = userData.role;
  dashUserAvatar.textContent = (userData.name || userData.identifier).charAt(0).toUpperCase();

  const isRemembered = localStorage.getItem('minerva_remember_workstation') === 'true';
  dashStorageType.textContent = isRemembered 
    ? 'Persisted to Workstation (localStorage)' 
    : 'Temporary Active Session (sessionStorage)';

  renderMinesTable(MINES_DATA);

  if (animate) {
    dashboardView.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderMinesTable(mines) {
  minesTableBody.innerHTML = '';
  tableRowCount.textContent = `Showing ${mines.length} entries`;

  if (mines.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="5" style="text-align:center; padding: 28px; color: var(--text-muted);">No matching mineral or mine records found.</td>`;
    minesTableBody.appendChild(emptyRow);
    return;
  }

  mines.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${m.name}</strong></td>
      <td>${m.district}, ${m.state}</td>
      <td>${m.company}</td>
      <td><span class="badge-mineral">${m.mineral}</span></td>
      <td><span class="badge-status-active">${m.status}</span></td>
    `;
    minesTableBody.appendChild(tr);
  });
}

// Live table search filter
mineSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = MINES_DATA.filter((m) => {
    return (
      m.name.toLowerCase().includes(query) ||
      m.state.toLowerCase().includes(query) ||
      m.district.toLowerCase().includes(query) ||
      m.company.toLowerCase().includes(query) ||
      m.mineral.toLowerCase().includes(query)
    );
  });
  renderMinesTable(filtered);
});

// Sign Out Handler
signOutBtn.addEventListener('click', () => {
  clearSession();
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');
  clearErrors();
  showToast('Logged out successfully. Workstation session locked.', 'info');
});

// ============================================================================
// 12. Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initSession();
});
