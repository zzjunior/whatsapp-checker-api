class AuthUI {
  constructor() {
    this.user = null;
    this.token = localStorage.getItem('admin_token');
    this.init();
  }
  async init() {
    if (this.token) {
      await this.fetchUser();
      this.renderHeader();
      this.showDashboard();
    } else {
      window.location.href = '/admin';
    }
    this.setupEvents();
  }
  async fetchUser() {
    const res = await fetch('/admin/status', { headers: { 'Authorization': 'Bearer ' + this.token } });
    const data = await res.json();
    this.user = data.user;
    document.getElementById('userName').textContent = this.user.username;
    if (this.user.role === 'admin') {
      document.getElementById('btnUsuarios').style.display = 'inline-block';
    }
    document.getElementById('meuUsuario').value = this.user.username;
  }
  renderHeader() {
    document.getElementById('btnMeusDados').onclick = () => {
      document.getElementById('modalMeusDados').style.display = 'block';
    };
    document.getElementById('closeModalMeusDados').onclick = () => {
      document.getElementById('modalMeusDados').style.display = 'none';
    };
    document.getElementById('btnLogout').onclick = () => {
      localStorage.removeItem('admin_token');
      window.location.reload();
    };
    document.getElementById('formAlterarSenha').onsubmit = async (e) => {
      e.preventDefault();
      const novaSenha = document.getElementById('novaSenha').value;
      const res = await fetch('/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
        body: JSON.stringify({ currentPassword: '', newPassword: novaSenha })
      });
      if (res.ok) {
        alert('Senha alterada!');
        document.getElementById('modalMeusDados').style.display = 'none';
      } else {
        alert('Erro ao alterar senha');
      }
    };
    document.getElementById('btnUsuarios').onclick = () => {
      document.getElementById('dashboardSection').style.display = 'none';
      document.getElementById('usuariosSection').style.display = 'block';
      UserUI.load();
    };
  }
  showDashboard() {
    document.getElementById('dashboardSection').innerHTML = '<h2>Dashboard</h2>';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('usuariosSection').style.display = 'none';
  }
  setupEvents() {}
}

class UserUI {
  static async load() {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/admin/users', { headers: { 'Authorization': 'Bearer ' + token } });
    const users = await res.json();
    let html = '<h2>Usuários</h2><ul>';
    users.forEach(u => {
      html += `<li>${u.username} (${u.user_type}) <button onclick="UserUI.delete(${u.id})">Excluir</button></li>`;
    });
    html += '</ul>';
    document.getElementById('usuariosSection').innerHTML = html;
  }
  static async delete(id) {
    if (!confirm('Excluir usuário?')) return;
    const token = localStorage.getItem('authToken');
    await fetch('/admin/users/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    UserUI.load();
  }
}

window.onload = () => new AuthUI();
