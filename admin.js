a// This file returns the secure, interactive Claymorphism Admin Dashboard UI.
module.exports = function getAdminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard | Dental Clinic Moradabad</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #F4F8FF;
            --primary: #4F7CFF;
            --light-blue: #C9E8FF;
            --mint: #B8F3DC;
            --lavender: #DCCBFF;
            --coral: #FFB7A8;
            --text: #24324A;
            --white: #FFFFFF;
            --clay-shadow: 8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff;
            --clay-inset: inset 2px 2px 4px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.05);
            --danger: #FF6B6B;
            --success: #20C997;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Poppins', sans-serif; }
        body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
        
        .clay-card {
            background: var(--bg);
            border-radius: 24px;
            box-shadow: var(--clay-shadow), var(--clay-inset);
            padding: 24px;
            border: 1px solid rgba(255,255,255,0.5);
        }
        
        .clay-btn {
            background: var(--primary); color: var(--white); border: none; border-radius: 16px;
            padding: 12px 24px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
            box-shadow: 6px 6px 12px #d1d9e6, -6px -6px 12px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.1);
        }
        .clay-btn:active { transform: translateY(2px); box-shadow: inset 4px 4px 8px rgba(0,0,0,0.1), inset -4px -4px 8px rgba(255,255,255,0.4); }
        .clay-btn.danger { background: var(--danger); }
        .clay-btn.success { background: var(--success); }
        
        .clay-input {
            background: var(--bg); border: none; border-radius: 12px; padding: 14px; width: 100%;
            box-shadow: inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff;
            color: var(--text); font-size: 1rem; margin-bottom: 16px; outline: none;
        }

        #login-view, #dashboard-view { display: none; padding: 40px 20px; max-width: 1200px; margin: 0 auto; width: 100%; }
        #login-view { max-width: 400px; margin-top: 10vh; text-align: center; }
        
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 40px; }
        .stat-card { text-align: center; }
        .stat-card h3 { font-size: 2rem; color: var(--primary); margin-bottom: 8px; }
        
        .table-container { overflow-x: auto; margin-top: 20px; }
        table { width: 100%; border-collapse: separate; border-spacing: 0 12px; }
        th { text-align: left; padding: 0 16px; color: var(--primary); font-weight: 600; }
        td { padding: 16px; background: var(--bg); box-shadow: var(--clay-shadow); }
        td:first-child { border-top-left-radius: 16px; border-bottom-left-radius: 16px; }
        td:last-child { border-top-right-radius: 16px; border-bottom-right-radius: 16px; }
        
        .badge { padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500; }
        .badge.pending { background: var(--coral); color: #fff; }
        .badge.confirmed { background: var(--mint); color: var(--text); }
        .badge.unpaid { background: var(--lavender); color: var(--text); }
        .badge.verification { background: var(--light-blue); color: var(--text); }
        .badge.paid { background: var(--success); color: #fff; }
        
        .action-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: var(--text); color: var(--white); padding: 16px 24px; border-radius: 12px; transform: translateY(100px); transition: 0.3s; z-index: 1000; }
        .toast.show { transform: translateY(0); }
    </style>
</head>
<body>

<div id="login-view" class="clay-card">
    <h2 style="margin-bottom: 8px;">Admin Access</h2>
    <p style="margin-bottom: 24px; font-size: 0.9rem;">DENTAL CLINIC MORADABAD</p>
    <form id="login-form">
        <input type="text" id="username" class="clay-input" placeholder="Username" required autocomplete="username">
        <input type="password" id="password" class="clay-input" placeholder="Password" required autocomplete="current-password">
        <button type="submit" class="clay-btn" style="width: 100%;">Secure Login</button>
    </form>
</div>

<div id="dashboard-view">
    <div class="header">
        <div>
            <h2>Clinic Dashboard</h2>
            <p>Manage Appointments & Payments</p>
        </div>
        <button class="clay-btn danger" onclick="logout()">Logout</button>
    </div>
    
    <div class="stats-grid">
        <div class="clay-card stat-card"><h3 id="stat-total">0</h3><p>Total Bookings</p></div>
        <div class="clay-card stat-card"><h3 id="stat-pending">0</h3><p>Pending Apps</p></div>
        <div class="clay-card stat-card"><h3 id="stat-payments">0</h3><p>Payments to Verify</p></div>
    </div>
    
    <div class="clay-card">
        <h3>Recent Appointments</h3>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Patient</th>
                        <th>Doctor & Service</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="appointments-tbody">
                    <!-- Populated via JS -->
                </tbody>
            </table>
        </div>
    </div>
</div>

<div id="toast" class="toast"></div>

<script>
    const API_BASE = '/api/admin';
    let appointments = [];

    async function checkAuth() {
        try {
            const res = await fetch(\`\${API_BASE}/me\`);
            if (res.ok) {
                document.getElementById('login-view').style.display = 'none';
                document.getElementById('dashboard-view').style.display = 'block';
                loadDashboard();
            } else {
                document.getElementById('login-view').style.display = 'block';
                document.getElementById('dashboard-view').style.display = 'none';
            }
        } catch (e) { console.error(e); }
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = e.target.querySelector('button');
        btn.textContent = 'Authenticating...';
        
        try {
            const res = await fetch(\`\${API_BASE}/login\`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (res.ok) { showToast('Login successful!'); checkAuth(); }
            else { showToast('Invalid credentials.'); }
        } catch (err) { showToast('Connection error.'); }
        btn.textContent = 'Secure Login';
    });

    async function logout() {
        await fetch(\`\${API_BASE}/logout\`, { method: 'POST' });
        showToast('Logged out securely.');
        checkAuth();
    }

    async function loadDashboard() {
        try {
            const res = await fetch(\`\${API_BASE}/appointments\`);
            if (!res.ok) { if(res.status === 401) checkAuth(); return; }
            appointments = await res.json();
            renderDashboard();
        } catch(e) { showToast('Failed to load data'); }
    }

    function renderDashboard() {
        document.getElementById('stat-total').textContent = appointments.length;
        document.getElementById('stat-pending').textContent = appointments.filter(a => a.appointmentStatus === 'pending').length;
        document.getElementById('stat-payments').textContent = appointments.filter(a => a.paymentStatus === 'payment_pending_verification').length;
        
        const tbody = document.getElementById('appointments-tbody');
        tbody.innerHTML = '';
        
        appointments.forEach(app => {
            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td><strong>\${app.appointmentDate}</strong><br>\${app.appointmentTime}</td>
                <td><strong>\${app.patientName}</strong><br><small>\${app.patientPhone}</small></td>
                <td>\${app.doctorName}<br><small>\${app.serviceName}</small></td>
                <td><span class="badge \${app.appointmentStatus}">\${app.appointmentStatus.toUpperCase()}</span></td>
                <td><span class="badge \${app.paymentStatus === 'payment_pending_verification' ? 'verification' : app.paymentStatus}">\${app.paymentMethod.toUpperCase()} - \${app.paymentStatus}</span></td>
                <td>
                    <div class="action-btns">
                        \${app.appointmentStatus === 'pending' ? \`<button class="clay-btn success" style="padding: 6px 12px; font-size:0.8rem;" onclick="updateStatus('\${app._id}', 'confirmed')">Confirm</button>\` : ''}
                        \${app.paymentStatus === 'payment_pending_verification' ? \`<button class="clay-btn" style="padding: 6px 12px; font-size:0.8rem;" onclick="verifyPayment('\${app._id}')">Verify Pay</button>\` : ''}
                        \${app.paymentStatus === 'unpaid' && app.paymentMethod === 'cash' ? \`<button class="clay-btn" style="padding: 6px 12px; font-size:0.8rem;" onclick="markReceived('\${app._id}')">Cash Rcvd</button>\` : ''}
                        \${app.appointmentStatus !== 'cancelled' ? \`<button class="clay-btn danger" style="padding: 6px 12px; font-size:0.8rem;" onclick="updateStatus('\${app._id}', 'cancelled')">Cancel</button>\` : ''}
                    </div>
                </td>
            \`;
            tbody.appendChild(tr);
        });
    }

    async function updateStatus(id, status) {
        if(!confirm('Are you sure you want to change the status to ' + status + '?')) return;
        try {
            const res = await fetch(\`\${API_BASE}/appointments/\${id}\`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointmentStatus: status })
            });
            if(res.ok) { showToast('Status updated'); loadDashboard(); }
        } catch(e) { showToast('Error updating status'); }
    }

    async function verifyPayment(id) {
        if(!confirm('Mark this online payment as securely verified?')) return;
        try {
            const res = await fetch(\`\${API_BASE}/payments/\${id}/verify\`, { method: 'POST' });
            if(res.ok) { showToast('Payment verified successfully!'); loadDashboard(); }
        } catch(e) { showToast('Verification error'); }
    }

    async function markReceived(id) {
        if(!confirm('Confirm that cash payment has been received?')) return;
        try {
            const res = await fetch(\`\${API_BASE}/payments/\${id}/mark-received\`, { method: 'POST' });
            if(res.ok) { showToast('Cash marked as received!'); loadDashboard(); }
        } catch(e) { showToast('Update error'); }
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    checkAuth();
</script>
</body>
</html>`;
};
