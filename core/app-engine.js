const SUPABASE_URL      = 'https://ebconnpnrssabyvdwrgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViY29ubnBucnNzYWJ5dmR3cmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTk2OTIsImV4cCI6MjA4ODc3NTY5Mn0.Oy2TVKjfsULidfS_esh-w6zuzRv2l_eX4pFkDfD1NyA';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const USERS = {
  Prem:    { name:'Prem Yerunkar',  dept:'IT Floor A',           email:'prem.yerunkar@khetangroup.in',  phone:'9766423202', role:'IT Engineer' },
  Kuldeep: { name:'Kuldeep Singh',  dept:'Accounts & Logistics', email:'kuldeep.singh@khetangroup.in',  phone:'9876543210', role:'Senior Accounts Executive' },
  Ranjit:  { name:'Ranjit Singh',   dept:'Accounts & Logistics', email:'ranjit.singh@khetangroup.in',   phone:'9632587410', role:'Accounts Executive' },
};
const PASSWORDS = { Prem:'pass123', Kuldeep:'pass123', Ranjit:'pass123', admin:'admin123' };

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
    if(u === 'admin' && p === 'admin123'){
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
      document.getElementById('user-avatar-top').textContent = info.name[0];
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

// Automatic Downtime Delta Engine
function calculateDowntime() {
  const startVal = document.getElementById('nt-start-time')?.value;
  const endVal = document.getElementById('nt-end-time')?.value;
  const downtimeInput = document.getElementById('nt-downtime');

  if (!startVal || !endVal || !downtimeInput) return;

  const [startHours, startMins] = startVal.split(':').map(Number);
  const [endHours, endMins] = endVal.split(':').map(Number);

  let startTotalMins = startHours * 60 + startMins;
  let endTotalMins = endHours * 60 + endMins;

  // Handle midnight wrap-around shifts automatically
  if (endTotalMins < startTotalMins) {
    endTotalMins += 24 * 60;
  }

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

// SUBMIT COMPONENT EVENT (With automated hooks)
async function submitTicket(){
  const unit = document.getElementById('nt-machine-unit').value;
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

  if(!unit || !name || !comp || !type || !start){
    showToast('Please fill out basic required configuration properties (*)','error'); return;
  }

  const tktId = 'TKT-' + String(Date.now()).slice(-6);
  const operatorName = currentRole === 'admin' ? 'System Admin' : USERS[currentUser].name;
  
  const timelineEvent = { time: new Date().toISOString(), text: `Ticket initialized by ${operatorName}`, color: 'blue' };

  const btn = document.getElementById('btn-submit-ticket');
  btn.disabled = true; btn.textContent = '⏳ Saving…';

  const { error } = await db.from('tickets_v2').insert([{
    ticket_id: tktId,
    machine_unit: unit,
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
    timeline: JSON.stringify([timelineEvent])
  }]);

  btn.disabled = false; btn.textContent = '🚀 Log / Save Ticket';
  if(error){ showToast('Failed: ' + error.message, 'error'); console.error(error); return; }

  showToast(`✅ Ticket ${tktId} logged successfully!`);
  clearNewTicket();
  switchView(document.querySelector('[data-view="user-tickets"]'), 'user');
}

// ══════════════════════════════════════════════
//  COLLABORATIVE REAL-TIME LIFECYCLE MODAL ENGINE
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
       <div class="form-group"><label>Machine Unit</label><input type="text" id="md-unit" value="${t.machine_unit||''}"></div>
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
       <h4>Collaborative Logging Audit Trail</h4>
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
    </div>
  `;
  openModal('modal-ticket');
}

// COLLABORATIVE INTERVENTION UPDATE ENGINE
async function saveTicketCollaborative(id) {
  const t = tickets.find(x => x.id === id);
  if(!t) return;

  const editorName = currentRole === 'admin' ? 'System Admin' : USERS[currentUser].name;
  const nextStatus = document.getElementById('md-status').value;
  
  const start = document.getElementById('md-start').value;
  const end = document.getElementById('md-end').value;
  
  // Calculate running delta mins inside modal container dynamically
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
  
  if(t.status !== nextStatus) {
     timeline.push({ time: new Date().toISOString(), text: `Status updated to [${nextStatus}] by ${editorName}`, color: 'green' });
  } else {
     timeline.push({ time: new Date().toISOString(), text: `Modifications committed by technical operator ${editorName}`, color: 'yellow' });
  }

  const { error } = await db.from('tickets_v2').update({
    machine_unit: document.getElementById('md-unit').value,
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
    action_taken: document.getElementById('md-action').value.trim(),
    remarks: document.getElementById('md-remarks').value.trim(),
    timeline: JSON.stringify(timeline)
  }).eq('id', id);

  if(error) { showToast('Update fault: ' + error.message, 'error'); return; }
  
  showToast('✔ System transaction processed successfully!');
  closeModal('modal-ticket');
  loadAllTickets();
}

// Reset functions
function clearNewTicket(){
  ['nt-sub-component','nt-start-time','nt-end-time','nt-downtime','nt-prod-loss','nt-part-used','nt-parts-cost','nt-labour-cost','nt-next-pm','nt-remarks','nt-action-taken']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('nt-machine-unit').value = '';
  document.getElementById('nt-machine-name').value = '';
  document.getElementById('nt-machine-component').value = '';
  document.getElementById('nt-failure-mode').value = '';
  document.getElementById('nt-maint-type').value = '';
  document.getElementById('nt-status').value = 'Open';
}

// Keep the standard listing filters intact
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
  const my = tickets; // Allows view of overall asset tickets for open cross-editing
  
  // Clean checks matching your exact form dropdown options
  const openCount      = my.filter(t => t.status === 'Open').length;
  const pendingParts   = my.filter(t => t.status === 'Pending Spare Parts').length;
  const inProgress     = my.filter(t => t.status === 'In Progress').length;
  const resolvedDone   = my.filter(t => t.status === 'Resolved / Done').length;

  // Safely update counters only if elements exist on screen
  if(document.getElementById('u-stat-total'))    document.getElementById('u-stat-total').textContent    = my.length;
  if(document.getElementById('u-stat-open'))     document.getElementById('u-stat-open').textContent     = openCount;
  if(document.getElementById('u-stat-received')) document.getElementById('u-stat-received').textContent = pendingParts;
  if(document.getElementById('u-stat-inprog'))   document.getElementById('u-stat-inprog').textContent   = inProgress;
  if(document.getElementById('u-stat-resolved')) document.getElementById('u-stat-resolved').textContent = resolvedDone;
  if(document.getElementById('u-badge-open'))    document.getElementById('u-badge-open').textContent    = openCount + pendingParts + inProgress;

  // Populate Dashboard Table Grid cleanly
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
      : '<tr><td colspan="6"><div class="empty-state"><div class="icon">📋</div>No active tickets registered in log system.</div></td></tr>';
  }
}

function renderUserTickets(list){
  const data = list || [...tickets];
  const ticketTable = document.getElementById('u-tickets-tbody');
  if(!ticketTable) return;

  ticketTable.innerHTML = data.length
    ? data.map(t => `<tr>
        <td><span class="ticket-id" onclick="viewTicket('${t.id}','user')" style="cursor:pointer; font-weight:600; color:var(--accent2);">${t.ticket_id}</span></td>
        <td><strong>${t.machine_name || '—'}</strong><br><small style="color:var(--text-muted)">${t.machine_unit || '—'}</small></td>
        <td>${t.machine_component || '—'}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.action_taken || 'No action summary logged yet.'}</td>
        <td>${priBadge('Medium')}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}','user')">Edit / View</button></td>
      </tr>`).join('')
    : '<tr><td colspan="8"><div class="empty-state">No tickets found.</div></td></tr>';
}

function filterUserTickets(){
  const q  = document.getElementById('u-search').value.toLowerCase();
  renderUserTickets(tickets.filter(t=> !q || t.ticket_id.toLowerCase().includes(q) || (t.machine_name && t.machine_name.toLowerCase().includes(q))));
}

function refreshAdminData(){
  document.getElementById('a-stat-total').textContent    = tickets.length;
  document.getElementById('a-stat-open').textContent     = tickets.filter(t=>t.status==='Open').length;
  document.getElementById('a-stat-inprog').textContent   = tickets.filter(t=>t.status==='In Progress').length;
  document.getElementById('a-stat-resolved').textContent = tickets.filter(t=>t.status==='Resolved / Done').length;

  document.getElementById('a-latest-tbody').innerHTML = tickets.slice(0,6).map(t=>`
    <tr onclick="viewTicket('${t.id}','admin')">
      <td><span class="ticket-id">${t.ticket_id}</span></td>
      <td>${t.machine_name || '—'}</td>
      <td>${priBadge('Medium')}</td>
      <td>${statusBadge(t.status)}</td>
    </tr>`).join('');
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

function renderMachines(){ refreshAdminData(); }
function renderUsers(){ refreshAdminData(); }
function renderAnalytics(){ refreshAdminData(); }
function renderUserProfile(){ refreshUserData(); }

// Global UI Badging Blocks
function statusBadge(s){
  const m={Open:'badge-open', Received:'badge-received', 'In Progress':'badge-inprog', 'Pending Spare Parts':'badge-pending', 'Resolved / Done':'badge-resolved', Closed:'badge-closed'};
  return `<span class="badge ${m[s]||'badge-open'}">${s}</span>`;
}
function priBadge(p){
  const m={Critical:'pri-critical',High:'pri-high',Medium:'pri-medium',Low:'pri-low'};
  const ic={Critical:'🔴',High:'🟠',Medium:'🟡',Low:'🔵'};
  return `<span class="pri-badge ${m[p]||'pri-low'}">${ic[p]||''} ${p}</span>`;
}
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
// EXPOSE WINDOW GLOBAL AT THE BOTTOM
// ══════════════════════════════════════════════
window.viewTicket = viewTicket;
window.closeModal = closeModal;
window.switchView = switchView;
window.submitTicket = submitTicket;
window.updateStatus = updateStatus;
window.clearNewTicket = clearNewTicket;
window.filterUserTickets = filterUserTickets;
window.goNewTicket = goNewTicket;
window.logout = logout;
window.doLogin = doLogin;
window.switchLoginTab = switchLoginTab;
window.calculateDowntime = calculateDowntime;
window.saveTicketCollaborative = saveTicketCollaborative;