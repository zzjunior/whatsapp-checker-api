// admin-panel.js
// SPA do painel admin WhatsApp Checker
// Todo o HTML é gerado via JS, layout responsivo com Bootstrap

// Utilidades Bootstrap
function createModal(id, title, body, footer) {
  return `
  <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="${id}Label">${title}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">${footer || ''}</div>
      </div>
    </div>
  </div>`;
}

// SPA State
let state = {
  authToken: localStorage.getItem('authToken'),
  user: null,
  users: [],
  tokens: [],
  whatsapp: { connected: false, qr: null },
  currentView: 'status', // status | tokens | users
  editingUser: null
};

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
  renderApp();
});

function renderApp() {
  document.body.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary fixed-top">
      <div class="container-fluid">
        <a class="navbar-brand" href="#">WhatsApp Checker</a>
        <div class="d-flex align-items-center ms-auto">
          <span class="text-white me-3" id="userName"></span>
          <button class="btn btn-outline-light btn-sm me-2" id="btnMeusDados">Meus Dados</button>
          <button class="btn btn-outline-light btn-sm" id="btnUsuarios">Usuários</button>
          <button class="btn btn-outline-light btn-sm ms-2" id="btnLogout">Sair</button>
        </div>
      </div>
    </nav>
    <div class="container" style="margin-top:80px;max-width:900px;">
      <div id="mainContent"></div>
    </div>
    <div id="modals"></div>
  `;
  if (!state.authToken) {
    renderLogin();
    return;
  }
  fetchUserAndData();
  setupHeaderEvents();
}

function renderLogin() {
  document.getElementById('mainContent').innerHTML = `
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card mt-5">
          <div class="card-body">
            <h3 class="card-title mb-4">Login Admin</h3>
            <form id="loginForm">
              <div class="mb-3">
                <label class="form-label">Usuário</label>
                <input type="text" class="form-control" id="username" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Senha</label>
                <input type="password" class="form-control" id="password" required>
              </div>
              <button type="submit" class="btn btn-primary w-100">Entrar</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      state.authToken = data.token;
      localStorage.setItem('authToken', data.token);
      renderApp();
    } else {
      alert('Erro: ' + data.error);
    }
  };
}

function setupHeaderEvents() {
  document.getElementById('btnMeusDados').onclick = showMeusDadosModal;
  document.getElementById('btnUsuarios').onclick = () => {
    state.currentView = 'users';
    renderMain();
  };
  document.getElementById('btnLogout').onclick = () => {
    localStorage.removeItem('authToken');
    state.authToken = null;
    renderApp();
  };
}

async function fetchUserAndData() {
  const res = await fetch('/admin/status', {
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  const data = await res.json();
  if (!res.ok) {
    localStorage.removeItem('authToken');
    state.authToken = null;
    renderApp();
    return;
  }
  state.user = { username: data.username, user_type: data.user_type };
  state.whatsapp = { connected: data.whatsapp_connected, qr: data.current_qr };
  document.getElementById('userName').textContent = data.username;
  renderMain();
}

function renderMain() {
  if (state.currentView === 'users') {
    renderUsers();
  } else {
    renderStatus();
  }
}

function renderStatus() {
  document.getElementById('mainContent').innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-body">
            <h5 class="card-title">Status do WhatsApp</h5>
            <div id="whatsappStatus"></div>
            <button class="btn btn-success mt-2" id="btnConectar">Conectar</button>
            <button class="btn btn-primary mt-2" id="btnVerQR">Ver QR</button>
            <div id="qrCode" class="mt-3"></div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-body">
            <h5 class="card-title">Tokens de API</h5>
            <form id="tokenForm" class="mb-3">
              <div class="input-group">
                <input type="text" class="form-control" id="tokenName" placeholder="Nome do token" required>
                <button class="btn btn-primary" type="submit">Criar</button>
              </div>
            </form>
            <div id="tokensList"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  updateWhatsappStatus();
  loadTokens();
  document.getElementById('btnConectar').onclick = connectWhatsApp;
  document.getElementById('btnVerQR').onclick = showQRCode;
  document.getElementById('tokenForm').onsubmit = createToken;
}

function updateWhatsappStatus() {
  document.getElementById('whatsappStatus').innerHTML =
    `<span class="badge bg-${state.whatsapp.connected ? 'success' : 'danger'}">
      ${state.whatsapp.connected ? 'Conectado' : 'Desconectado'}
    </span>`;
}

async function connectWhatsApp() {
  await fetch('/admin/connect-whatsapp', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  setTimeout(fetchUserAndData, 2000);
}

async function showQRCode() {
  const res = await fetch('/admin/qr', {
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  const data = await res.json();
  const qrDiv = document.getElementById('qrCode');
  qrDiv.innerHTML = '';
  if (data.qr_code) {
    new window.QRCode(qrDiv, { text: data.qr_code, width: 220, height: 220 });
  }
}

async function createToken(e) {
  e.preventDefault();
  const name = document.getElementById('tokenName').value;
  const res = await fetch('/admin/tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.authToken
    },
    body: JSON.stringify({ name, requests_limit: 1000 })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Token: ' + data.token);
    loadTokens();
    document.getElementById('tokenForm').reset();
  } else {
    alert('Erro: ' + data.error);
  }
}

async function loadTokens() {
  const res = await fetch('/admin/tokens', {
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  const tokens = await res.json();
  state.tokens = tokens;
  document.getElementById('tokensList').innerHTML = tokens.map(t =>
    `<div class="border rounded p-2 mb-2">
      <strong>${t.name}</strong><br>
      <span class="text-muted">Token:</span> <code>${t.token}</code>
    </div>`
  ).join('');
}

function showMeusDadosModal() {
  const modalId = 'meusDadosModal';
  document.getElementById('modals').innerHTML = createModal(
    modalId,
    'Meus Dados',
    `<div><strong>Usuário:</strong> ${state.user.username}</div>
    <form id="changePasswordForm" class="mt-3">
      <div class="mb-3">
        <label class="form-label">Senha atual</label>
        <input type="password" class="form-control" id="currentPassword" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Nova senha</label>
        <input type="password" class="form-control" id="newPassword" required>
      </div>
      <button type="submit" class="btn btn-primary">Alterar Senha</button>
    </form>`,
    ''
  );
  const modal = new bootstrap.Modal(document.getElementById(modalId));
  modal.show();
  document.getElementById('changePasswordForm').onsubmit = async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const res = await fetch('/admin/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Senha alterada com sucesso!');
      modal.hide();
    } else {
      alert('Erro: ' + data.error);
    }
  };
}

// Usuários (apenas admin)
async function renderUsers() {
  if (state.user.user_type !== 'admin') {
    document.getElementById('mainContent').innerHTML = '<div class="alert alert-danger">Acesso restrito.</div>';
    return;
  }
  await loadUsers();
  document.getElementById('mainContent').innerHTML = `
    <div class="card mb-4">
      <div class="card-body">
        <h5 class="card-title">Usuários</h5>
        <button class="btn btn-success mb-3" id="btnNovoUsuario">Novo Usuário</button>
        <div id="usersList"></div>
      </div>
    </div>
  `;
  renderUsersList();
  document.getElementById('btnNovoUsuario').onclick = showAddUserModal;
}

async function loadUsers() {
  const res = await fetch('/admin/users', {
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  state.users = await res.json();
}

function renderUsersList() {
  document.getElementById('usersList').innerHTML = state.users.map(u =>
    `<div class="d-flex align-items-center border rounded p-2 mb-2">
      <div class="flex-grow-1">
        <strong>${u.username}</strong> <span class="badge bg-secondary">${u.user_type}</span>
      </div>
      <button class="btn btn-sm btn-outline-primary me-2" onclick="window.editUser(${u.id})">Editar</button>
      <button class="btn btn-sm btn-outline-danger" onclick="window.deleteUser(${u.id})">Excluir</button>
    </div>`
  ).join('');
  window.editUser = showEditUserModal;
  window.deleteUser = deleteUser;
}

function showAddUserModal() {
  const modalId = 'addUserModal';
  document.getElementById('modals').innerHTML = createModal(
    modalId,
    'Novo Usuário',
    `<form id="addUserForm">
      <div class="mb-3">
        <label class="form-label">Usuário</label>
        <input type="text" class="form-control" id="newUsername" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Senha</label>
        <input type="password" class="form-control" id="newUserPassword" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="newUserType">
          <option value="common">Comum</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <button type="submit" class="btn btn-success">Cadastrar</button>
    </form>`,
    ''
  );
  const modal = new bootstrap.Modal(document.getElementById(modalId));
  modal.show();
  document.getElementById('addUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newUserPassword').value;
    const user_type = document.getElementById('newUserType').value;
    const res = await fetch('/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken
      },
      body: JSON.stringify({ username, password, user_type })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Usuário cadastrado!');
      modal.hide();
      renderUsers();
    } else {
      alert('Erro: ' + data.error);
    }
  };
}

function showEditUserModal(id) {
  const user = state.users.find(u => u.id === id);
  if (!user) return;
  const modalId = 'editUserModal';
  document.getElementById('modals').innerHTML = createModal(
    modalId,
    'Editar Usuário',
    `<form id="editUserForm">
      <div class="mb-3">
        <label class="form-label">Usuário</label>
        <input type="text" class="form-control" id="editUsername" value="${user.username}" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="editUserType">
          <option value="common" ${user.user_type === 'common' ? 'selected' : ''}>Comum</option>
          <option value="admin" ${user.user_type === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </form>`,
    ''
  );
  const modal = new bootstrap.Modal(document.getElementById(modalId));
  modal.show();
  document.getElementById('editUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('editUsername').value;
    const user_type = document.getElementById('editUserType').value;
    // Atualização via exclusão + criação (pois não há endpoint PUT)
    await deleteUser(id, true);
    const res = await fetch('/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken
      },
      body: JSON.stringify({ username, password: '123456', user_type })
    });
    if (res.ok) {
      alert('Usuário atualizado! (Senha redefinida para 123456)');
      modal.hide();
      renderUsers();
    } else {
      const data = await res.json();
      alert('Erro: ' + data.error);
    }
  };
}

async function deleteUser(id, silent) {
  if (!silent && !confirm('Tem certeza que deseja excluir este usuário?')) return;
  const res = await fetch('/admin/users/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  if (res.ok) {
    if (!silent) alert('Usuário excluído!');
    renderUsers();
  } else {
    const data = await res.json();
    alert('Erro: ' + data.error);
  }
}

// Atualização periódica do status do WhatsApp
setInterval(() => {
  if (state.authToken && state.currentView !== 'users') fetchUserAndData();
}, 10000);
