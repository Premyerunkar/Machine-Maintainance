// ══════════════════════════════════════════════
// 🛰️ CORE DATABASE INITIALIZATION & STATE GLOBALS
// ══════════════════════════════════════════════
const SUPABASE_URL      = 'https://ebconnpnrssabyvdwrgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViY29ubnBucnNzYWJ5dmR3cmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTk2OTIsImV4cCI6MjA4ODc3NTY5Mn0.Oy2TVKjfsULidfS_esh-w6zuzRv2l_eX4pFkDfD1NyA';
const { createClient }  = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const USERS = {
  Prem:    { name:'Prem Yerunkar',  dept:'IT Floor A',           email:'prem.yerunkar@khetangroup.in',  phone:'9766423202', role:'Software Developer',             avatar: 'https://media.licdn.com/dms/image/v2/D4D03AQEDUODKHIYaWg/profile-displayphoto-crop_800_800/B4DZ0aSOzcHMAI-/0/1774262488917?e=1784160000&v=beta&t=O-T7wkXGO8JJO4F29Kgdr8zrwHFFgYZ3nBHRwNC7q7Q' },
  Kuldeep: { name:'Kuldeep Singh',  dept:'Accounts & Human Resources', email:'kuldeep.singh@khetangroup.in',  phone:'9876543210', role:'Senior Accounts Executive', avatar: 'https://media.licdn.com/dms/image/v2/D4D03AQHt1s3Tja87EA/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1681965882013?e=2147483647&v=beta&t=nbRa2Bkvm8NI5-9pLe-dYZ-KlYwX29MF2rRoq6FWy-0' },
  Ranjit:  { name:'Ranjit Singh',   dept:'Accounts', email:'ranjit.singh@khetangroup.in',   phone:'8805418158', role:'Accounts Executive',       avatar: 'https://media.licdn.com/dms/image/v2/D4D35AQGBwjQZsqx2EQ/profile-framedphoto-shrink_800_800/B4DZoB21.AGgAg-/0/1760967745688?e=1782986400&v=beta&t=wpZhZ8wvUq78BrX_5Ft1Eyf1DZ_3y7dhPxmfgkTc6KU' },
  Suraj:   { name:'Suraj Koli',    dept:'Accounts', email:'suraj.koli@khetangroup.in',    phone:'9022728536', role:'Accounts Executive',       avatar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Gorille_des_plaines_de_l%27ouest_%C3%A0_l%27Espace_Zoologique.jpg/250px-Gorille_des_plaines_de_l%27ouest_%C3%A0_l%27Espace_Zoologique.jpg' },
};
const PASSWORDS = { Prem:'pass123', Kuldeep:'pass123', Ranjit:'pass123', Suraj:'pass123', admin:'admi n123' };

let currentUser = null;
let currentRole = null;
let tickets = [];
let realtimeChannel = null;
let pollingInterval = null;
let realtimeWorking = false;
let currentView = '';
let openModalTicketId = null;
let loginType = 'user';

// Core Dynamic Renderer
async function loadView(viewName) {
  try {
    const res = await fetch(`features/${viewName}.html`);
    const html = await res.text();
    document.getElementById('view-mount-point').innerHTML = html;
    if(viewName === 'login-view') { switchLoginTab('user'); }
  } catch(e) { console.error("Layout mounting fault:", e); }
}

// Bootstrapping
window.addEventListener('DOMContentLoaded', () => { loadView('login-view'); });

function switchLoginTab(t){
  loginType = t;
  document.querySelectorAll('.login-tab').forEach((x,i)=>x.classList.toggle('active',(t==='user'&&i===0)||(t==='admin'&&i===1)));
  document.getElementById('login-form-user').style.display  = t==='user'  ? '' : 'none';
  document.getElementById('login-form-admin').style.display = t==='admin' ? '' : 'none';
}

async function doLogin(type){
  if(type === 'admin'){
    const u = document.getElementById('admin-username').value.trim();
    const p = document.getElementById('admin-password').value;
    if(u === 'admin' && p === 'admi n123'){
      currentRole = 'admin';
      await loadView('admin-view');
      currentView = 'admin-dashboard';
      await loadAllTickets();
      subscribeRealtime();
    } else { showToast('Invalid admin credentials','error'); }
  } else {
    const u = document.getElementById('user-username').value.trim();
    const p = document.getElementById('user-password').value;
    const matchedKey = Object.keys(USERS).find(k => k.toLowerCase() === u.toLowerCase());
    if(matchedKey && PASSWORDS[matchedKey] === p){
      currentUser = matchedKey;
      currentRole = 'user';
      await loadView('user-view');
      
      const info = USERS[matchedKey];
      document.getElementById('user-name-top').textContent   = info.name;
      if (info.avatar) {
        document.getElementById('user-avatar-top').innerHTML = `<img src="${info.avatar}" alt="${info.name}">`;
      } else {
        document.getElementById('user-avatar-top').textContent = info.name[0];
      }
      document.getElementById('u-welcome-name').textContent  = 'Welcome back, ' + info.name.split(' ')[0] + '!';
      currentView = 'user-dashboard';
      await loadAllTickets();
      subscribeRealtime();
    } else { showToast('Invalid username or password','error'); }
  }
}

function logout(){
  if(realtimeChannel){ try{ db.removeChannel(realtimeChannel); }catch(e){} realtimeChannel = null; }
  if(pollingInterval){ clearInterval(pollingInterval); pollingInterval = null; }
  currentUser = null; currentRole = null; tickets = []; currentView = ''; openModalTicketId = null;
  realtimeWorking = false;
  loadView('login-view');
}

function calculateDowntime() {
  const startVal = document.getElementById('nt-start-time')?.value;
  const endVal = document.getElementById('nt-end-time')?.value;
  const downtimeInput = document.getElementById('nt-downtime');

  if (!startVal || !endVal || !downtimeInput) return;

  const [startHours, startMins] = startVal.split(':').map(Number);
  const [endHours, endMins] = endVal.split(':').map(Number);

  let startTotalMins = startHours * 60 + startMins;
  let endTotalMins = endHours * 60 + endMins;

  if (endTotalMins < startTotalMins) { endTotalMins += 24 * 60; }
  downtimeInput.value = endTotalMins - startTotalMins;
}

async function loadAllTickets(){
  let query = db.from('tickets_v2').select('*').order('created_at', { ascending: false });
  const { data, error } = await query;
  if(error){ showToast('DB error: ' + error.message, 'error'); return; }
  tickets = data || [];
  refreshAllUI();
}

function setIndicator(online){
  const dotId   = currentRole === 'admin' ? 'rt-dot-admin'  : 'rt-dot-user';
  const labelId = currentRole === 'admin' ? 'rt-label-admin' : 'rt-label-user';
  const dot   = document.getElementById(dotId);
  const label = document.getElementById(labelId);
  if(!dot || !label) return;
  label.textContent = online ? 'Live ⚡' : 'Syncing…';
  dot.classList.toggle('offline', !online);
}

function subscribeRealtime(){
  if(realtimeChannel){ try{ db.removeChannel(realtimeChannel); }catch(e){} realtimeChannel = null; }
  startPolling();
}

function startPolling(){
  if(pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    if(!currentRole) return;
    loadAllTickets();
  }, 5000);
}

function refreshAllUI(){
  if(currentRole === 'admin'){
    refreshAdminData();
    if(currentView === 'admin-tickets')   renderAdminTickets();
    if(currentView === 'admin-machines')  renderMachines();
    if(currentView === 'admin-users')     renderUsers();
    if(currentView === 'admin-analytics') renderAnalytics();
  } else if(currentRole === 'user'){
    refreshUserData();
    if(currentView === 'user-tickets')  renderUserTickets();
    if(currentView === 'user-profile')  renderUserProfile();
  }
}

async function submitTicket(){
  const name = document.getElementById('nt-machine-name').value;
  const comp = document.getElementById('nt-machine-component').value;
  const subComp = document.getElementById('nt-sub-component').value.trim();
  const failMode = document.getElementById('nt-failure-mode').value;
  const type = document.getElementById('nt-maint-type').value;
  const start = document.getElementById('nt-start-time').value;
  const end = document.getElementById('nt-end-time').value;
  const down = document.getElementById('nt-downtime').value;
  const loss = document.getElementById('nt-prod-loss').value.trim();
  const part = document.getElementById('nt-part-used').value.trim();
  const pCost = document.getElementById('nt-parts-cost').value || 0;
  const lCost = document.getElementById('nt-labour-cost').value || 0;
  const status = document.getElementById('nt-status').value;
  const nextPm = document.getElementById('nt-next-pm').value;
  const remarks = document.getElementById('nt-remarks').value.trim();
  const action = document.getElementById('nt-action-taken').value.trim();

  if(!name || !comp || !type || !start){
    showToast('Please fill out basic required configuration properties (*)','error'); return;
  }

  const tktId = 'TKT-' + String(Date.now()).slice(-6);
  const operatorName = currentRole === 'admin' ? 'System Admin' : USERS[currentUser].name;
  
  const timelineEvents = [
    { time: new Date().toISOString(), text: `Ticket initialized by ${operatorName}`, color: 'blue' }
  ];
  if(action) {
    timelineEvents.push({ time: new Date().toISOString(), text: `Action summary updated: "${action}" by ${operatorName}`, color: 'purple' });
  }

  const btn = document.getElementById('btn-submit-ticket');
  btn.disabled = true; btn.textContent = '⏳ Saving…';

  const { error } = await db.from('tickets_v2').insert([{
    ticket_id: tktId,
    machine_name: name,
    machine_component: comp,
    sub_component: subComp,
    failure_mode: failMode,
    maintenance_type: type,
    start_time: start,
    end_time: end || null,
    downtime: down ? parseInt(down) : null,
    production_loss: loss,
    part_used: part,
    parts_cost: parseFloat(pCost),
    labour_cost: parseFloat(lCost),
    status: status,
    next_pm_due: nextPm || null,
    remarks: remarks,
    action_taken: action,
    reported_by: operatorName,
    submitted_by: currentUser || 'admin',
    timeline: JSON.stringify(timelineEvents)
  }]);

  btn.disabled = false; btn.textContent = '🚀 Log / Save Ticket';
  if(error){ showToast('Failed: ' + error.message, 'error'); console.error(error); return; }

  showToast(`Ticket ${tktId} logged successfully!`);
  clearNewTicket();
  switchView(document.querySelector('[data-view="user-tickets"]'), 'user');
}

// ══════════════════════════════════════════════
// 📑 LIFECYCLE MANAGEMENT INTERVENTION MODAL
// ══════════════════════════════════════════════
function viewTicket(id, panel){
  const t = tickets.find(x => x.id === id);
  if(!t) return;
  openModalTicketId = id;

  let timeline = [];
  try { timeline = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : (t.timeline || []); } catch(e){}

  document.getElementById('modal-ticket-title').innerHTML = `<span class="ticket-id">${t.ticket_id}</span> &nbsp; ${t.machine_name || '—'} [${t.status}]`;
  document.getElementById('modal-ticket-body').innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
       <div class="form-group"><label>Machine Component</label><input type="text" id="md-comp" value="${t.machine_component||''}"></div>
       <div class="form-group"><label>Sub Component</label><input type="text" id="md-sub" value="${t.sub_component||''}"></div>
       <div class="form-group"><label>Failure Mode</label><input type="text" id="md-fail" value="${t.failure_mode||''}"></div>
       <div class="form-group"><label>Start Time</label><input type="time" id="md-start" value="${t.start_time||''}"></div>
       <div class="form-group"><label>End Time</label><input type="time" id="md-end" value="${t.end_time||''}"></div>
       <div class="form-group"><label>Production Loss</label><input type="text" id="md-loss" value="${t.production_loss||''}"></div>
       <div class="form-group"><label>Parts Used</label><input type="text" id="md-part" value="${t.part_used||''}"></div>
       <div class="form-group"><label>Parts Cost (₹)</label><input type="number" id="md-pcost" value="${t.parts_cost||0}"></div>
       <div class="form-group"><label>Labour Cost (₹)</label><input type="number" id="md-lcost" value="${t.labour_cost||0}"></div>
       <div class="form-group"><label>Next PM Due</label><input type="date" id="md-pm" value="${t.next_pm_due||''}"></div>
       <div class="form-group">
          <label>Operational Status *</label>
          <select id="md-status">
             <option ${t.status==='Open'?'selected':''}>Open</option>
             <option ${t.status==='In Progress'?'selected':''}>In Progress</option>
             <option ${t.status==='Pending Spare Parts'?'selected':''}>Pending Spare Parts</option>
             <option ${t.status==='Resolved / Done'?'selected':''}>Resolved / Done</option>
          </select>
       </div>
    </div>
    <div class="form-group"><label>Action Taken Summary</label><textarea id="md-action" rows="2">${t.action_taken||''}</textarea></div>
    <div class="form-group"><label>Remarks / Notes</label><input type="text" id="md-remarks" value="${t.remarks||''}"></div>
    <div class="detail-section">
       <h4>Ticket Event Logs</h4>
       <small style="color:var(--text-muted)">Reported initially by: <strong>${t.reported_by || 'Unknown'}</strong></small>
       <div class="timeline" style="margin-top:0.5rem;">
          ${timeline.map(e => `
            <div class="timeline-item">
              <div class="tl-dot ${e.color||'blue'}"></div>
              <div><div>${e.text}</div><div class="tl-time">${fmtDateFull(e.time)}</div></div>
            </div>`).join('')}
       </div>
    </div>
    <div style="text-align:right; margin-top:1rem;">
       <button class="btn btn-primary" style="width:auto;" onclick="saveTicketCollaborative('${t.id}')">💾 Save Changes</button>
    </div>`;
  openModal('modal-ticket');
}

async function saveTicketCollaborative(id) {
  const t = tickets.find(x => x.id === id);
  if(!t) return;

  const editorName = currentRole === 'admin' ? 'System Admin' : USERS[currentUser].name;
  const nextStatus = document.getElementById('md-status').value;
  const nextAction = document.getElementById('md-action').value.trim();
  const start = document.getElementById('md-start').value;
  const end = document.getElementById('md-end').value;
  
  let mins = null;
  if(start && end) {
     const [sh, sm] = start.split(':').map(Number);
     const [eh, em] = end.split(':').map(Number);
     let sMins = sh * 60 + sm, eMins = eh * 60 + em;
     if(eMins < sMins) eMins += 24 * 60;
     mins = eMins - sMins;
  }

  let timeline = [];
  try { timeline = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : (t.timeline || []); } catch(e){}
  
  let structuralChangeLogged = false;

  if(t.status !== nextStatus) {
     timeline.push({ time: new Date().toISOString(), text: `Status updated to [${nextStatus}] by ${editorName}`, color: 'green' });
     structuralChangeLogged = true;
  } 
  
  if((t.action_taken || '').trim() !== nextAction) {
     const shortSummary = nextAction.length > 60 ? nextAction.substring(0, 57) + '...' : nextAction;
     timeline.push({ 
       time: new Date().toISOString(), 
       text: nextAction ? `Action details updated: "${shortSummary}" by ${editorName}` : `Action summary removed by ${editorName}`, 
       color: 'purple' 
     });
     structuralChangeLogged = true;
  }

  if(!structuralChangeLogged) {
     timeline.push({ time: new Date().toISOString(), text: `Modifications committed by technical operator ${editorName}`, color: 'yellow' });
  }

  const { error } = await db.from('tickets_v2').update({
    machine_component: document.getElementById('md-comp').value,
    sub_component: document.getElementById('md-sub').value.trim(),
    failure_mode: document.getElementById('md-fail').value,
    start_time: start,
    end_time: end || null,
    downtime: mins,
    production_loss: document.getElementById('md-loss').value.trim(),
    part_used: document.getElementById('md-part').value.trim(),
    parts_cost: parseFloat(document.getElementById('md-pcost').value || 0),
    labour_cost: parseFloat(document.getElementById('md-lcost').value || 0),
    status: nextStatus,
    next_pm_due: document.getElementById('md-pm').value || null,
    action_taken: nextAction,
    remarks: document.getElementById('md-remarks').value.trim(),
    timeline: JSON.stringify(timeline)
  }).eq('id', id);

  if(error) { showToast('Update fault: ' + error.message, 'error'); return; }
  
  showToast('✔ System transaction processed successfully!');
  closeModal('modal-ticket');
  loadAllTickets();
}

function clearNewTicket(){
  ['nt-sub-component','nt-start-time','nt-end-time','nt-downtime','nt-prod-loss','nt-part-used','nt-parts-cost','nt-labour-cost','nt-next-pm','nt-remarks','nt-action-taken']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('nt-machine-name').value = '';
  document.getElementById('nt-machine-component').value = '';
  document.getElementById('nt-failure-mode').value = '';
  document.getElementById('nt-maint-type').value = '';
  document.getElementById('nt-status').value = 'Open';
}

function switchView(el, panel){
  const vid = el.dataset.view; currentView = vid;
  el.closest('.sidebar').querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  el.closest('.app-shell').querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+vid).classList.add('active');
  refreshAllUI();
}

function goNewTicket(){ switchView(document.querySelector('[data-view="user-new-ticket"]'),'user'); }
function myTickets(){ return tickets.filter(t => t.submitted_by === currentUser); }

function refreshUserData(){
  const my = tickets;
  const openCount      = my.filter(t => t.status === 'Open').length;
  const pendingParts   = my.filter(t => t.status === 'Pending Spare Parts').length;
  const inProgress     = my.filter(t => t.status === 'In Progress').length;
  const resolvedDone   = my.filter(t => t.status === 'Resolved / Done').length;

  if(document.getElementById('u-stat-total'))    document.getElementById('u-stat-total').textContent    = my.length;
  if(document.getElementById('u-stat-open'))     document.getElementById('u-stat-open').textContent     = openCount;
  if(document.getElementById('u-stat-received')) document.getElementById('u-stat-received').textContent = pendingParts;
  if(document.getElementById('u-stat-inprog'))   document.getElementById('u-stat-inprog').textContent   = inProgress;
  if(document.getElementById('u-stat-resolved')) document.getElementById('u-stat-resolved').textContent = resolvedDone;
  if(document.getElementById('u-badge-open'))    document.getElementById('u-badge-open').textContent    = openCount + pendingParts + inProgress;

  const recentTable = document.getElementById('u-recent-tbody');
  if(recentTable) {
    const recent = [...my].slice(0, 5);
    recentTable.innerHTML = recent.length
      ? recent.map(t => `<tr onclick="viewTicket('${t.id}','user')">
          <td><span class="ticket-id">${t.ticket_id}</span></td>
          <td>${t.machine_name || '—'}</td>
          <td>${t.machine_component || '—'}</td>
          <td>${priBadge('Medium')}</td>
          <td>${statusBadge(t.status)}</td>
          <td>${fmtDate(t.created_at)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6"><div class="empty-state">📋 No active tickets found.</div></td></tr>';
  }
}

function renderUserTickets(list){
  const data = list || [...tickets];
  const ticketTable = document.getElementById('u-tickets-tbody');
  if(!ticketTable) return;

  ticketTable.innerHTML = data.length
    ? data.map(t => `<tr>
        <td><span class="ticket-id" onclick="viewTicket('${t.id}','user')" style="cursor:pointer; font-weight:600; color:var(--accent2);">${t.ticket_id}</span></td>
        <td><strong>${t.machine_name || '—'}</strong></td>
        <td>${t.machine_component || '—'}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.action_taken || 'No action summary logged.'}</td>
        <td>${priBadge('Medium')}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}','user')">Edit</button></td>
      </tr>`).join('')
    : '<tr><td colspan="8"><div class="empty-state">No tickets found.</div></td></tr>';
}

function filterUserTickets(){
  const q  = document.getElementById('u-search').value.toLowerCase();
  renderUserTickets(tickets.filter(t=> !q || t.ticket_id.toLowerCase().includes(q) || (t.machine_name && t.machine_name.toLowerCase().includes(q))));
}

function refreshAdminData(){
  if (!document.getElementById('a-stat-total')) return;

  const openCount      = tickets.filter(t => t.status === 'Open').length;
  const pendingParts   = tickets.filter(t => t.status === 'Pending Spare Parts').length;
  const inProgress     = tickets.filter(t => t.status === 'In Progress').length;
  const resolvedDone   = tickets.filter(t => t.status === 'Resolved / Done').length;

  document.getElementById('a-stat-total').textContent    = tickets.length;
  document.getElementById('a-stat-open').textContent     = openCount;
  document.getElementById('a-stat-received').textContent = pendingParts;
  document.getElementById('a-stat-inprog').textContent   = inProgress;
  document.getElementById('a-stat-critical').textContent = openCount + inProgress;
  document.getElementById('a-stat-nfix').textContent     = pendingParts;
  document.getElementById('a-stat-resolved').textContent = resolvedDone;
  document.getElementById('a-badge-open').textContent    = openCount + pendingParts + inProgress;

  const criticalTbody = document.getElementById('a-critical-tbody');
  if(criticalTbody) {
    const activeIssues = tickets.filter(t => t.status !== 'Resolved / Done');
    criticalTbody.innerHTML = activeIssues.length 
      ? activeIssues.slice(0, 5).map(t => `
          <tr onclick="viewTicket('${t.id}','admin')" style="cursor:pointer">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td><strong>${t.machine_name || 'Unassigned'}</strong></td>
            <td>${t.reported_by ? t.reported_by.split(' ')[0] : '—'}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1rem">No critical running updates.</div></td></tr>';
  }

  const latestTbody = document.getElementById('a-latest-tbody');
  if(latestTbody) {
    latestTbody.innerHTML = tickets.length
      ? tickets.slice(0, 5).map(t => `
          <tr onclick="viewTicket('${t.id}','admin')" style="cursor:pointer">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td>${t.machine_name || '—'}</td>
            <td>${priBadge('Medium')}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1rem">No records registered.</div></td></tr>';
  }
}

function renderAdminTickets(list){
  const data = list || [...tickets];
  const adminTable = document.getElementById('a-tickets-tbody');
  if(!adminTable) return;

  adminTable.innerHTML = data.map(t => `<tr>
        <td><span class="ticket-id" onclick="viewTicket('${t.id}','admin')" style="cursor:pointer; font-weight:600; color:var(--accent2);">${t.ticket_id}</span></td>
        <td><strong>${t.machine_name || '—'}</strong></td>
        <td>${t.machine_component || '—'}</td>
        <td>${t.reported_by || '—'}</td>
        <td>${priBadge('Medium')}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}','admin')">Manage</button></td>
      </tr>`).join('');
}

function renderMachines(){ refreshAdminData(); executeMachineRegistryGeneration(); }
function renderUsers(){ refreshAdminData(); executeUserDirectoryGeneration(); }
function renderAnalytics(){ refreshAdminData(); executeAnalyticsDashboardGeneration(); }

function executeMachineRegistryGeneration() {
  const machineTable = document.getElementById('a-machines-tbody');
  if (!machineTable) return;

  const machineMap = {};
  tickets.forEach(t => {
    const mName = t.machine_name || 'Unknown Asset';
    if (!machineMap[mName]) {
      machineMap[mName] = { name: mName, total: 0, active: 0, lastTicket: null, rawTimestamp: 0 };
    }
    machineMap[mName].total++;
    if (t.status !== 'Resolved / Done') machineMap[mName].active++;
    
    const ticketTime = new Date(t.created_at).getTime();
    if (ticketTime > machineMap[mName].rawTimestamp) {
      machineMap[mName].rawTimestamp = ticketTime;
      machineMap[mName].lastTicket = t.created_at;
    }
  });

  const machineList = Object.values(machineMap);
  machineTable.innerHTML = machineList.length
    ? machineList.map(m => `
        <tr>
          <td><span class="badge badge-received">${m.name.substring(0,3).toUpperCase()}-${Math.abs(m.name.hashCode()) % 1000}</span></td>
          <td><strong>${m.name}</strong></td>
          <td><span class="badge badge-open" style="background:#f3f4f6; color:#1f2937;">${m.total} Total</span></td>
          <td><span class="badge ${m.active > 0 ? 'badge-inprog' : 'badge-resolved'}">${m.active} Active</span></td>
          <td><small style="font-weight:500;">${m.lastTicket ? fmtDateFull(m.lastTicket) : '—'}</small></td>
        </tr>`).join('')
    : '<tr><td colspan="5"><div class="empty-state">No recorded machinery assets.</div></td></tr>';
}

String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) { hash = this.charCodeAt(i) + ((hash << 5) - hash); }
  return hash;
};

function executeUserDirectoryGeneration() {
  const userTable = document.getElementById('a-users-tbody');
  if (!userTable) return;

  const userMap = {};
  tickets.forEach(t => {
    const uKey = t.submitted_by || 'Unknown';
    const cleanName = t.reported_by || uKey;
    
    if (!userMap[uKey]) {
      const structuralMeta = USERS[Object.keys(USERS).find(k => k.toLowerCase() === uKey.toLowerCase())] || {};
      userMap[uKey] = { name: cleanName, dept: structuralMeta.dept || 'Shopfloor / Production', total: 0, open: 0, resolved: 0, lastActivity: null, rawTimestamp: 0 };
    }

    userMap[uKey].total++;
    if (t.status === 'Resolved / Done') { userMap[uKey].resolved++; } else { userMap[uKey].open++; }

    const ticketTime = new Date(t.created_at).getTime();
    if (ticketTime > userMap[uKey].rawTimestamp) {
      userMap[uKey].rawTimestamp = ticketTime;
      userMap[uKey].lastActivity = t.created_at;
    }
  });

  const userList = Object.values(userMap);
  userTable.innerHTML = userList.length
    ? userList.map(u => `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div class="avatar" style="width:32px; height:32px; font-size:0.85rem; background:var(--accent2); color:white; display:flex; align-items:center; justify-content:center; border-radius:50%;">${u.name[0]}</div>
              <div><strong>${u.name}</strong></div>
            </div>
          </td>
          <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${u.dept}</span></td>
          <td><strong>${u.total}</strong></td>
          <td><span class="badge badge-open">${u.open}</span></td>
          <td><span class="badge badge-resolved">${u.resolved}</span></td>
          <td><small style="color:var(--text-muted); font-weight:500;">${u.lastActivity ? fmtDate(u.lastActivity) : '—'}</small></td>
        </tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state">No interaction metrics available.</div></td></tr>';
}

function executeAnalyticsDashboardGeneration() {
  const machineCounts = {};
  tickets.forEach(t => { if(t.machine_name) machineCounts[t.machine_name] = (machineCounts[t.machine_name] || 0) + 1; });
  const sortedMachines = Object.entries(machineCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
  
  const listContainer = document.getElementById('top-machines-list');
  if(listContainer) {
    listContainer.innerHTML = sortedMachines.length
      ? sortedMachines.map(([name, count]) => `
          <div style="margin-bottom: 0.75rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem; font-size:0.9rem;">
              <span style="font-weight:600;">🔧 ${name}</span>
              <span style="color:var(--text-muted); font-weight:700;">${count} Tickets</span>
            </div>
            <div style="background:#e5e7eb; height:8px; border-radius:4px; overflow:hidden;">
              <div style="background:var(--accent2); height:100%; width: ${Math.min((count / (tickets.length || 1)) * 100, 100)}%;"></div>
            </div>
          </div>`).join('')
      : '<div class="empty-state">No log operations running.</div>';
  }

  drawNativePieChart('chart-status-pie', 'legend-status-pie', {
    'Open': tickets.filter(t => t.status === 'Open').length,
    'In Progress': tickets.filter(t => t.status === 'In Progress').length,
    'Pending Spare Parts': tickets.filter(t => t.status === 'Pending Spare Parts').length,
    'Resolved': tickets.filter(t => t.status === 'Resolved / Done').length,
  }, ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'], false);

  drawNativeBarChart('chart-issue-bar', {
    'Mechanical': tickets.filter(t => String(t.machine_component).toLowerCase().includes('mech') || String(t.failure_mode).toLowerCase().includes('break') || String(t.remarks).toLowerCase().includes('leak')).length,
    'Electrical': tickets.filter(t => String(t.machine_component).toLowerCase().includes('elect') || String(t.machine_component).toLowerCase().includes('wire') || String(t.machine_component).toLowerCase().includes('sensor')).length,
    'Pneumatic': tickets.filter(t => String(t.machine_component).toLowerCase().includes('pneu') || String(t.machine_component).toLowerCase().includes('air') || String(t.machine_component).toLowerCase().includes('valve')).length,
    'Other Setup': tickets.filter(t => !t.machine_component || (!String(t.machine_component).toLowerCase().includes('mech') && !String(t.machine_component).toLowerCase().includes('elect') && !String(t.machine_component).toLowerCase().includes('pneu'))).length
  }, '#6366f1');

  drawNativePieChart('chart-priority-donut', 'legend-priority-donut', {
    'Critical (Unresolved)': tickets.filter(t => t.status !== 'Resolved / Done').length,
    'Normal': tickets.filter(t => t.status === 'Resolved / Done').length
  }, ['#dc2626', '#fbbf24'], true);

  const machineBarData = {};
  sortedMachines.forEach(([name, count]) => { machineBarData[name.substring(0,10)] = count; });
  drawNativeBarChart('chart-machine-bar', machineBarData, '#0d9488');

  const userBarData = {};
  tickets.forEach(t => { const name = (t.reported_by || 'Unknown').split(' ')[0]; userBarData[name] = (userBarData[name] || 0) + 1; });
  drawNativeBarChart('chart-user-bar', userBarData, '#ec4899');

  drawStackedMachineHealthChart('chart-stacked-bar', 'legend-stacked', sortedMachines);
  drawMachineDowntimeChart('chart-machine-downtime');
}

function drawNativePieChart(canvasId, legendId, data, colors, isDonut = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  let startAngle = 0;
  const keys = Object.keys(data);
  
  keys.forEach((key, idx) => {
    const val = data[key];
    const sliceAngle = (val / total) * 2 * Math.PI;
    if(sliceAngle === 0) return;
    
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)/2 - 12, startAngle, startAngle + sliceAngle);
    ctx.lineTo(canvas.width/2, canvas.height/2);
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  if (isDonut) {
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)/4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  const legend = document.getElementById(legendId);
  if(legend) {
    legend.innerHTML = keys.map((k, i) => `
      <span style="display:inline-flex; align-items:center; margin-right:0.75rem; font-size:0.75rem; font-weight:500;">
        <span style="display:inline-block; width:10px; height:10px; background:${colors[i%colors.length]}; border-radius:2px; margin-right:4px;"></span>
        ${k} (${data[k]})
      </span>`).join('');
  }
}

function drawNativeBarChart(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const values = Object.values(data);
  const keys = Object.keys(data);
  const maxVal = Math.max(...values, 1);
  
  const paddingBottom = 25;
  const paddingTop = 20;
  const paddingSide = 30;
  const chartHeight = canvas.height - paddingBottom - paddingTop;
  const barWidth = (canvas.width - paddingSide * 2) / (values.length || 1) - 12;

  keys.forEach((key, idx) => {
    const val = values[idx];
    const barHeight = (val / maxVal) * chartHeight;
    const x = paddingSide + idx * (barWidth + 12);
    const y = canvas.height - paddingBottom - barHeight;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(key.substring(0, 9), x + barWidth/2, canvas.height - 8);
    
    ctx.fillStyle = '#111827';
    ctx.fillText(val, x + barWidth/2, y - 6);
  });
}

function drawStackedMachineHealthChart(canvasId, legendId, topMachines) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const paddingBottom = 30;
  const paddingSide = 50;
  const chartWidth = canvas.width - paddingSide * 2;
  const chartHeight = canvas.height - paddingBottom - 20;
  const barWidth = chartWidth / (topMachines.length || 1) - 30;

  let globalMax = 1;
  const machineMetrics = topMachines.map(([name]) => {
    const open = tickets.filter(t => t.machine_name === name && t.status !== 'Resolved / Done').length;
    const resolved = tickets.filter(t => t.machine_name === name && t.status === 'Resolved / Done').length;
    if ((open + resolved) > globalMax) globalMax = open + resolved;
    return { name: name.substring(0, 12), open, resolved };
  });

  machineMetrics.forEach((m, idx) => {
    const totalCount = m.open + m.resolved;
    const x = paddingSide + idx * (barWidth + 30);
    const openHeight = (m.open / globalMax) * chartHeight;
    const resolvedHeight = (m.resolved / globalMax) * chartHeight;

    const yResolved = canvas.height - paddingBottom - resolvedHeight;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x, yResolved, barWidth, resolvedHeight);

    const yOpen = yResolved - openHeight;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x, yOpen, barWidth, openHeight);

    ctx.fillStyle = '#4b5563';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.name, x + barWidth / 2, canvas.height - 12);
    
    if (totalCount > 0) {
      ctx.fillStyle = '#111827';
      ctx.fillText(totalCount, x + barWidth / 2, yOpen - 6);
    }
  });

  const legend = document.getElementById(legendId);
  if (legend) {
    legend.innerHTML = `
      <span style="display:inline-flex; align-items:center; margin-right:1rem; font-size:0.8rem;">
        <span style="display:inline-block; width:12px; height:12px; background:#ef4444; border-radius:2px; margin-right:4px;"></span> Open Issues
      </span>
      <span style="display:inline-flex; align-items:center; font-size:0.8rem;">
        <span style="display:inline-block; width:12px; height:12px; background:#10b981; border-radius:2px; margin-right:4px;"></span> Resolved
      </span>`;
  }
}

function drawMachineDowntimeChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const W = canvas.offsetWidth || canvas.width;
  const H = canvas.height;
  canvas.width = W;
  ctx.clearRect(0, 0, W, H);

  const downtimeMap = {};
  tickets.forEach(t => {
    if (t.machine_name && t.downtime) {
      downtimeMap[t.machine_name] = (downtimeMap[t.machine_name] || 0) + parseInt(t.downtime);
    }
  });

  const sortedData = Object.entries(downtimeMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sortedData.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recorded downtime logs to compile graphics chart.', W / 2, H / 2);
    return;
  }

  const pad = { t: 30, r: 40, b: 55, l: 120 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  
  const maxVal = Math.max(...sortedData.map(x => x[1]), 1);
  const stepY = cH / sortedData.length;
  const barHeight = Math.max(14, stepY - 14);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (i / 4) * cW;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + cH);
    ctx.stroke();
    
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round((maxVal * i) / 4) + 'm', x, pad.t + cH + 15);
  }

  sortedData.forEach(([name, mins], idx) => {
    const barWidth = (mins / maxVal) * cW;
    const x = pad.l;
    const y = pad.t + idx * stepY + (stepY / 2) - (barHeight / 2);

    ctx.fillStyle = 'rgb(5, 37, 80)';
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(name.substring(0, 16), x - 10, y + barHeight / 2 + 4);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mins + ' min', x + barWidth + 8, y + barHeight / 2 + 4);
  });
}

function renderUserProfile(){
  const info = USERS[currentUser];
  const profileCard = document.getElementById('u-profile-card');
  if(!profileCard) return;

  profileCard.innerHTML = `
    <div style="display:flex; align-items:center; gap:1.5rem;">
      <div class="profile-avatar">
        ${info.avatar ? `<img src="${info.avatar}" alt="${info.name}">` : info.name[0]}
      </div>
      <div>
        <div class="profile-name" style="font-size:1.25rem; font-weight:700;">${info.name}</div>
        <div class="profile-role" style="color:var(--text-muted); margin-bottom:0.5rem;">${info.role} · ${info.dept}</div>
        <div style="font-size:0.9rem; color:var(--text-muted);">📧 ${info.email}</div>
        <div style="font-size:0.9rem; color:var(--text-muted);">📞 ${info.phone}</div>
      </div>
    </div>
  `;
  refreshUserData();
}

function statusBadge(s){
  const m={Open:'badge-open', Received:'badge-received', 'In Progress':'badge-inprog', 'Pending Spare Parts':'badge-pending', 'Resolved / Done':'badge-resolved', Closed:'badge-closed'};
  return `<span class="badge ${m[s]||'badge-open'}">${s}</span>`;
}
function priBadge(p){
  const m={Critical:'pri-critical',High:'pri-high',Medium:'pri-medium',Low:'pri-low'};
  const ic={Critical:'🔴',High:'🟠',Medium:'🟡',Low:'🔵'};
  return `<span class="pri-badge ${m[p]||'pri-low'}">${ic[p]||''} ${p}</span>`;
}

// ══════════════════════════════════════════════
// 📊 ENTERPRISE AUTOMATED DATA EXPORT ENGINE
// ══════════════════════════════════════════════
function exportLedgerToExcel() {
  if (!tickets || !tickets.length) {
    showToast("No data rows found available to process file extraction.", "error");
    return;
  }

  const category = document.getElementById("export-category-selector")?.value || "ALL";
  let targetRows = [...tickets];

  // 1. Process Filter Category Pipelines
  if (category === "OPEN") {
    targetRows = targetRows.filter(t => t.status === "Open" || t.status === "In Progress");
  } else if (category === "PARTS") {
    targetRows = targetRows.filter(t => t.status === "Pending Spare Parts");
  } else if (category === "DONE") {
    targetRows = targetRows.filter(t => t.status === "Resolved / Done");
  } else if (category === "HIGH_LOSS") {
    targetRows = targetRows.filter(t => t.downtime && parseInt(t.downtime) >= 60);
  }

  if (!targetRows.length) {
    showToast(`No matches found matching category: "${category}"`, "warn");
    return;
  }

  showToast(`Compiling ${targetRows.length} rows into styled ledger rows...`);

  // 2. Extract Data Objects & Map Clean Headers
  const formattedLedger = targetRows.map((t, index) => {
    return {
      "Sr No": index + 1,
      "Ticket ID": t.ticket_id,
      "Machine Name": t.machine_name || "—",
      "Machine Component": t.machine_component || "—",
      "Sub Component": t.sub_component || "—",
      "Failure Mode": t.failure_mode || "—",
      "Maintenance Type": t.maintenance_type || "—",
      "Start Time": t.start_time || "—",
      "End Time": t.end_time || "—",
      "Downtime (Mins)": t.downtime ? Number(t.downtime) : 0,
      "Production Loss": t.production_loss || "—",
      "Spare Part Used": t.part_used || "—",
      "Parts Cost (INR)": t.parts_cost ? Number(t.parts_cost) : 0,
      "Labour Cost (INR)": t.labour_cost ? Number(t.labour_cost) : 0,
      "Total Repair Cost": (t.parts_cost ? Number(t.parts_cost) : 0) + (t.labour_cost ? Number(t.labour_cost) : 0),
      "Operational Status": t.status || "—",
      "Next PM Due": t.next_pm_due ? new Date(t.next_pm_due).toLocaleDateString('en-GB') : "—",
      "Logged Operator Name": t.reported_by || "—",
      "Registration Date": new Date(t.created_at).toLocaleDateString('en-GB'),
      "Remarks / Notes": t.remarks || "—",
      "Action Taken Summary": t.action_taken || "—"
    };
  });

  // 3. Build SheetJS Workbook
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(formattedLedger);

  // 4. Structural Table Optimization: Calculate & Auto-Fit Column Widths
  const columnWidths = [];
  const keys = Object.keys(formattedLedger[0]);
  
  keys.forEach((key, colIndex) => {
    let maxLength = key.length; // Start length size checking with header string name length
    formattedLedger.forEach(row => {
      const valStr = String(row[key] || '');
      if (valStr.length > maxLength) maxLength = valStr.length;
    });
    columnWidths[colIndex] = { wch: maxLength + 4 }; // Add extra padding space inside cell grids
  });
  worksheet["!cols"] = columnWidths;

  // 5. Append Sheet data to container and trigger instant system download
  XLSX.utils.book_append_sheet(workbook, worksheet, "Maintenance Ledger");
  
  // Create an automated dynamic timestamped title file string
  const fileDateStamp = new Date().toISOString().split('T')[0];
  const outputFileName = `KPFL_Maintenance_Report_${category}_${fileDateStamp}.xlsx`;

  XLSX.writeFile(workbook, outputFileName);
  showToast("📊 File extraction complete! Check downloads directory.");
}


window.exportLedgerToExcel = exportLedgerToExcel;

function fmtDate(ts){ return new Date(ts).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtDateFull(ts){ return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); openModalTicketId = null; }

document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m){ m.classList.remove('active'); openModalTicketId=null; } }));
let tt;
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.className='toast'+(type?' '+type:'');
  t.style.display='block'; clearTimeout(tt);
  tt=setTimeout(()=>t.style.display='none',3500);
}

// ══════════════════════════════════════════════
// 🔌 GLOBAL BINDINGS MOUNT POINT EXPORTS
// ══════════════════════════════════════════════
window.viewTicket = viewTicket;
window.closeModal = closeModal;
window.switchView = switchView;
window.submitTicket = submitTicket;
window.clearNewTicket = clearNewTicket;
window.filterUserTickets = filterUserTickets;
window.goNewTicket = goNewTicket;
window.logout = logout;
window.doLogin = doLogin;
window.switchLoginTab = switchLoginTab;
window.calculateDowntime = calculateDowntime;
window.saveTicketCollaborative = saveTicketCollaborative;
window.renderMachines = renderMachines;
window.renderUsers = renderUsers;
window.renderAnalytics = renderAnalytics;
window.renderUserProfile = renderUserProfile;
