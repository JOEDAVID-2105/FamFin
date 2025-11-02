/* app.js - FAMFIN
   Single file to power login.html, family.html and index.html.
   Uses Firebase compat SDK included in the HTML files.
*/

/* =======================
   Firebase configuration
   (use the keys you provided)
   ======================= */
   const firebaseConfig = {
    apiKey: "AIzaSyBVR3g5urVCcuo1ShpxGtzKCQ0s411bvYE",
    authDomain: "fam-finance-app.firebaseapp.com",
    projectId: "fam-finance-app",
    storageBucket: "fam-finance-app.firebasestorage.app",
    messagingSenderId: "1064036121029",
    appId: "1:1064036121029:web:eb2b3bf2d2dba73ffc73ac",
    measurementId: "G-0SW6Z9MD4Y"
  };
  const GOOGLE_OAUTH_CLIENT_ID = "1064036121029-93p8hqbuigjr7ls62q96aebc94el3gn5.apps.googleusercontent.com";
  
  /* Initialize firebase */
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  /* Optional: gapi initialization for Google Sheets export */
  function initGapi() {
    try {
      gapi.load('client:auth2', async () => {
        await gapi.client.init({
          apiKey: '', // optional
          clientId: GOOGLE_OAUTH_CLIENT_ID,
          discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
          scope: "https://www.googleapis.com/auth/spreadsheets"
        });
      });
    } catch (e) {
      console.warn('gapi init failed (maybe not loaded yet)', e);
    }
  }
  if (typeof gapi !== 'undefined') initGapi();
  
  /* -----------------------
     Utility helpers
     ----------------------- */
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const randId = (n = 8) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
  const fmtDateTime = ts => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };
  
  /* Get current user display name (fallback to email) */
  function getDisplayName(user) {
    if (!user) return 'Guest';
    return user.displayName || user.email || user.uid;
  }
  
  /* -----------------------
     LOGIN PAGE
     ----------------------- */
  function initLoginPage() {
    const googleBtn = qs('#googleSignIn');
    const signUpBtn = qs('#signUpBtn');
    const signInBtn = qs('#signInBtn');
    const emailInput = qs('#email');
    const passInput = qs('#password');
    const authMsg = qs('#auth-msg');
  
    // Google sign-in using popup
    googleBtn.onclick = async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
        // redirect to main
        location.href = 'index.html';
      } catch (err) {
        showAuthMsg(err.message || 'Google sign-in failed');
      }
    };
  
    signUpBtn.onclick = async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const pass = passInput.value;
      if (!email || !pass) return showAuthMsg('Enter email & password');
      try {
        await auth.createUserWithEmailAndPassword(email, pass);
        location.href = 'index.html';
      } catch (err) {
        showAuthMsg(err.message || 'Signup failed');
      }
    };
  
    signInBtn.onclick = async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const pass = passInput.value;
      if (!email || !pass) return showAuthMsg('Enter email & password');
      try {
        await auth.signInWithEmailAndPassword(email, pass);
        location.href = 'index.html';
      } catch (err) {
        showAuthMsg(err.message || 'Login failed');
      }
    };
  
    function showAuthMsg(msg) {
      authMsg.classList.remove('d-none');
      authMsg.textContent = msg;
      setTimeout(() => authMsg.classList.add('d-none'), 4000);
    }
  
    // if already signed in, go to app
    auth.onAuthStateChanged(user => {
      if (user) {
        location.href = 'index.html';
      }
    });
  }
  
  /* -----------------------
     FAMILY PAGE
     ----------------------- */
  function initFamilyPage() {
    const createBtn = qs('#createFamBtn');
    const copyBtn = qs('#copyFamIdBtn');
    const newFamName = qs('#newFamName');
    const createdFam = qs('#createdFam');
    const joinBtn = qs('#joinFamBtn');
    const leaveBtn = qs('#leaveFamBtn');
    const joinInput = qs('#joinFamId');
    const joinMsg = qs('#joinMsg');
    const backBtn = qs('#backToMain');
  
    backBtn.onclick = () => location.href = 'index.html';
  
    auth.onAuthStateChanged(async user => {
      if (!user) {
        location.href = 'login.html';
        return;
      }
      // create
      createBtn.onclick = async () => {
        const name = (newFamName.value || `${getDisplayName(user)}'s Fam`).trim();
        const famId = randId(6);
        const famRef = db.collection('families').doc(famId);
        await famRef.set({
          famName: name,
          famId,
          members: [{ uid: user.uid, name: getDisplayName(user) }],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // also set user's personal fam link (in users collection)
        await db.collection('users').doc(user.uid).set({
          famId
        }, { merge: true });
        createdFam.textContent = `Created Fam "${name}" — FamID: ${famId}`;
        copyBtn.disabled = false;
        copyBtn.onclick = () => navigator.clipboard.writeText(famId);
      };
  
      joinBtn.onclick = async () => {
        const id = joinInput.value.trim().toUpperCase();
        if (!id) return showJoinMsg('Enter FamID to join', 'danger');
        const famDoc = await db.collection('families').doc(id).get();
        if (!famDoc.exists) return showJoinMsg('Family not found', 'danger');
        const fam = famDoc.data();
        const members = fam.members || [];
        if (members.some(m => m.uid === user.uid)) {
          await db.collection('users').doc(user.uid).set({ famId: id }, { merge: true });
          showJoinMsg('Already a member — joined', 'success');
          return;
        }
        members.push({ uid: user.uid, name: getDisplayName(user) });
        await db.collection('families').doc(id).update({ members });
        await db.collection('users').doc(user.uid).set({ famId: id }, { merge: true });
        showJoinMsg('Joined family successfully', 'success');
      };
  
      leaveBtn.onclick = async () => {
        // remove user from current family
        const userDoc = await db.collection('users').doc(user.uid).get();
        const famId = userDoc.exists ? userDoc.data().famId : null;
        if (!famId) return showJoinMsg('Not in any family', 'danger');
        const famRef = db.collection('families').doc(famId);
        const famDoc = await famRef.get();
        if (!famDoc.exists) return showJoinMsg('Family record missing', 'danger');
        const members = (famDoc.data().members || []).filter(m => m.uid !== user.uid);
        await famRef.update({ members });
        await db.collection('users').doc(user.uid).set({ famId: firebase.firestore.FieldValue.delete() }, { merge: true });
        showJoinMsg('Left family', 'success');
      };
    });
  
    function showJoinMsg(msg, kind = 'info') {
      joinMsg.textContent = msg;
      joinMsg.className = `mt-2 small text-${kind}`;
      setTimeout(() => { joinMsg.textContent = ''; joinMsg.className = 'mt-2 small'; }, 3500);
    }
  }
  
  /* -----------------------
     MAIN APP (index.html)
     ----------------------- */
  function initMainApp() {
    // splash hide after short delay
    const splash = qs('#splash');
    setTimeout(() => { if (splash) splash.remove(); }, 1600);
  
    initGapi();
  
    // DOM references
    const appRoot = qs('#app');
    const userNameEl = qs('#userName');
    const famNameEl = qs('#famName');
    const entryType = qs('#entryType');
    const memberSelect = qs('#memberSelect');
    const manageMembersBtn = qs('#manageMembersBtn');
    const amountInput = qs('#amountInput');
    const noteInput = qs('#noteInput');
    const saveBtn = qs('#saveEntryBtn');
    const clearBtn = qs('#clearEntryBtn');
    const entryDatetime = qs('#entryDatetime');
    const totalIncomeEl = qs('#totalIncome');
    const totalExpenseEl = qs('#totalExpense');
    const balanceEl = qs('#balance');
    const saveMsg = qs('#saveMsg');
  
    const navButtons = qsa('.nav-btn');
    const sections = {
      Entry: qs('#tabEntry'),
      Manage: qs('#tabManage'),
      Settings: qs('#tabSettings')
    };
  
    // Manage tab refs
    const filterType = qs('#filterType');
    const filterMember = qs('#filterMember');
    const filterFrom = qs('#filterFrom');
    const filterTo = qs('#filterTo');
    const entriesList = qs('#entriesList');
    const exportCsvBtn = qs('#exportCsv');
    const exportExcelBtn = qs('#exportExcel');
    const exportToGoogleSheetBtn = qs('#exportToGoogleSheet');
  
    // Settings refs
    const profileName = qs('#profileName');
    const profileEmail = qs('#profileEmail');
    const settingsFamName = qs('#settingsFamName');
    const settingsFamId = qs('#settingsFamId');
    const settingsMembersList = qs('#settingsMembers');
    const themeSelect = qs('#themeSelect');
    const textSizeRange = qs('#textSizeRange');
    const goFamilyPage = qs('#goFamilyPage');
    const signOutBtn = qs('#signOutBtn');
  
    // template
    const entryRowTpl = qs('#entryRowTpl').content;
  
    let currentUser = null;
    let currentFamId = null;
    let currentFamDoc = null;
    let unsubscribeEntries = null;
    let entriesCache = []; // keep entries to filter/render
  
    /* ------- NAV handling ------- */
    navButtons.forEach(btn => btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      Object.values(sections).forEach(s => s.classList.add('d-none'));
      sections[tab].classList.remove('d-none');
      // when switching to Manage, render entries
      if (tab === 'Manage') renderEntries();
    }));
  
    /* ------- Auth state ------- */
    auth.onAuthStateChanged(async user => {
      if (!user) {
        location.href = 'login.html';
        return;
      }
      currentUser = user;
      userNameEl.textContent = getDisplayName(user);
      profileName.value = getDisplayName(user);
      profileEmail.value = user.email || '';
  
      // load user's fam ID (if any)
      const userDoc = await db.collection('users').doc(user.uid).get();
      currentFamId = (userDoc.exists && userDoc.data().famId) ? userDoc.data().famId : null;
      if (!currentFamId) {
        // create personal fam using uid (so each user always has a family document),
        // but mark it as private fam with id = UID
        currentFamId = user.uid;
        // ensure family doc exists
        const famRef = db.collection('families').doc(currentFamId);
        const famSnap = await famRef.get();
        if (!famSnap.exists) {
          await famRef.set({
            famName: `${getDisplayName(user)} (Personal)`,
            famId: currentFamId,
            members: [{ uid: user.uid, name: getDisplayName(user) }],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        await db.collection('users').doc(user.uid).set({ famId: currentFamId }, { merge: true });
      }
  
      // subscribe to family doc for live updates
      db.collection('families').doc(currentFamId).onSnapshot(doc => {
        currentFamDoc = doc.exists ? doc.data() : null;
        famNameEl.textContent = currentFamDoc ? currentFamDoc.famName : '';
        settingsFamName.textContent = currentFamDoc ? (currentFamDoc.famName || '') : '';
        settingsFamId.textContent = currentFamId || '';
        // update members UI
        updateMembersUI(currentFamDoc?.members || []);
        populateMembersSelect(currentFamDoc?.members || []);
        // render entries list (if Manage)
        renderEntries();
      });
  
      // subscribe to entries subcollection
      subscribeEntries();
      applySavedPreferences();
      appRoot.classList.remove('d-none');
    });
  
    /* ------- Members UI ------- */
    function populateMembersSelect(members) {
      memberSelect.innerHTML = '';
      filterMember.innerHTML = '<option value="all">All</option>';
      // add an option for "Me" (current user)
      const meOption = document.createElement('option');
      meOption.value = currentUser.uid;
      meOption.textContent = getDisplayName(currentUser) + ' (Me)';
      memberSelect.appendChild(meOption);
      filterMember.appendChild(meOption.cloneNode(true));
  
      (members || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.uid;
        opt.textContent = m.name;
        memberSelect.appendChild(opt);
  
        const opt2 = opt.cloneNode(true);
        filterMember.appendChild(opt2);
      });
    }
  
    function updateMembersUI(members) {
      settingsMembersList.innerHTML = '';
      (members || []).forEach(m => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.textContent = m.name || m.uid;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-sm btn-outline-danger';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = async () => {
          if (!confirm(`Remove ${m.name}?`)) return;
          const newMembers = (currentFamDoc.members || []).filter(x => x.uid !== m.uid);
          await db.collection('families').doc(currentFamId).update({ members: newMembers });
        };
        // don't allow user to remove self
        if (m.uid === currentUser.uid) removeBtn.disabled = true;
        li.appendChild(removeBtn);
        settingsMembersList.appendChild(li);
      });
    }
  
    manageMembersBtn.onclick = async () => {
      const name = prompt('Add member - enter the member name (their UID will be used later). For quick use, type email or name then we will add as placeholder entry.');
      if (!name) return;
      const members = currentFamDoc?.members || [];
      members.push({ uid: randId(6), name });
      await db.collection('families').doc(currentFamId).update({ members });
    };
  
    /* ------- Entries subscription & handling ------- */
    function subscribeEntries() {
      if (unsubscribeEntries) unsubscribeEntries();
      const entriesRef = db.collection('families').doc(currentFamId).collection('entries').orderBy('timestamp', 'desc');
      unsubscribeEntries = entriesRef.onSnapshot(snapshot => {
        const arr = [];
        snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
        entriesCache = arr; // keep copy for filtering
        // update totals on Entry tab
        computeTotals();
        // Refresh Manage tab (if visible)
        if (!sections['Manage'].classList.contains('d-none')) renderEntries();
      });
    }
  
    function computeTotals() {
      let income = 0, expense = 0;
      entriesCache.forEach(e => {
        if (e.type === 'income') income += Number(e.amount || 0);
        else expense += Number(e.amount || 0);
      });
      totalIncomeEl.textContent = income.toFixed(2);
      totalExpenseEl.textContent = expense.toFixed(2);
      balanceEl.textContent = (income - expense).toFixed(2);
    }
  
    /* Save entry */
saveBtn.onclick = async () => {
  const amount = Number(amountInput.value || 0);
  if (!amount || isNaN(amount)) return flashSave('Enter valid amount', 'danger');

  const type = entryType.value;
  const memberUid = memberSelect.value || currentUser.uid;
  const memberName =
    (currentFamDoc?.members || []).find(m => m.uid === memberUid)?.name ||
    (memberUid === currentUser.uid ? getDisplayName(currentUser) : memberUid);
  const note = noteInput.value || '';

  // ✅ Automatically take date/time from device
  const now = new Date();
  const ts = now.getTime();

  const entry = {
    type,
    amount: Number(amount.toFixed(2)),
    memberUid,
    memberName,
    paidBy: getDisplayName(currentUser),
    note,
    timestamp: ts,
    date: now.toLocaleDateString(),  // local device date (for display)
    time: now.toLocaleTimeString(),  // local device time (for display)
    createdAt: firebase.firestore.FieldValue.serverTimestamp() // Firestore server-side timestamp
  };
      // save to family entries subcollection
      const ref = db.collection('families').doc(currentFamId).collection('entries');
      await ref.add(entry);
      flashSave('Entry saved', 'success');
      clearEntryForm();
    };
  
    clearBtn.onclick = clearEntryForm;
    function clearEntryForm() {
      amountInput.value = '';
      noteInput.value = '';
      entryDatetime.value = '';
      entryType.value = 'income';
    }
  
    function flashSave(msg, kind = 'success') {
      saveMsg.textContent = msg;
      saveMsg.classList.remove('text-success', 'text-danger');
      saveMsg.classList.add(kind === 'success' ? 'text-success' : 'text-danger');
      saveMsg.classList.remove('hide');
      setTimeout(() => {
        saveMsg.classList.add('hide');
      }, 1800);
    }
  
    /* ------- Render Manage entries with filters ------- */
    function renderEntries() {
      entriesList.innerHTML = '';
      // grouping by date header (common dates in side header)
      const grouped = {};
      const from = filterFrom.value ? new Date(filterFrom.value).setHours(0,0,0,0) : null;
      const to = filterTo.value ? new Date(filterTo.value).setHours(23,59,59,999) : null;
      const typeFilter = filterType.value;
      const memberFilter = filterMember.value;
  
      const filtered = entriesCache.filter(e => {
        if (typeFilter !== 'all' && e.type !== typeFilter) return false;
        if (memberFilter !== 'all' && e.memberUid !== memberFilter) return false;
        if (from && e.timestamp < from) return false;
        if (to && e.timestamp > to) return false;
        return true;
      });
  
      // group by date (YYYY-MM-DD)
      filtered.forEach(e => {
        const d = new Date(e.timestamp);
        const key = d.toISOString().slice(0,10);
        grouped[key] = grouped[key] || [];
        grouped[key].push(e);
      });
  
      // render grouped
      Object.keys(grouped).sort((a,b) => b.localeCompare(a)).forEach(dateKey => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'mb-1 mt-2 small text-muted';
        dayHeader.textContent = new Date(dateKey).toLocaleDateString();
        entriesList.appendChild(dayHeader);
  
        grouped[dateKey].forEach(e => {
          const node = entryRowTpl.cloneNode(true);
          const wrapper = node.querySelector('.card');
          const dateEl = node.querySelector('.entry-date');
          const noteEl = node.querySelector('.entry-note');
          const metaEl = node.querySelector('.entry-meta');
          const amountEl = node.querySelector('.entry-amount');
          const delBtn = node.querySelector('.delete-entry');
  
          dateEl.textContent = fmtDateTime(e.timestamp);
          noteEl.textContent = e.note || `${e.type === 'income' ? 'Income' : 'Expense'} — ${e.memberName || ''}`;
          metaEl.textContent = `Paid by: ${e.paidBy} • ${e.memberName || ''}`;
          amountEl.textContent = `${e.type === 'income' ? '+' : '-'} ${Number(e.amount).toFixed(2)}`;
          amountEl.classList.add(e.type === 'income' ? 'income' : 'expense');
  
          delBtn.onclick = async () => {
            if (!confirm('Delete this entry?')) return;
            await db.collection('families').doc(currentFamId).collection('entries').doc(e.id).delete();
          };
  
          entriesList.appendChild(node);
        });
      });
  
      // If no entries
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center text-muted small mt-3';
        empty.textContent = 'No entries match the filters';
        entriesList.appendChild(empty);
      }
    }
  
    // filters live: apply on change
    [filterType, filterMember, filterFrom, filterTo].forEach(el => el && el.addEventListener('change', renderEntries));
  
    /* ------- EXPORTS ------- */
    exportCsvBtn.onclick = () => exportAsCSV(entriesCache);
    exportExcelBtn.onclick = () => exportAsExcel(entriesCache);
    exportToGoogleSheetBtn.onclick = () => exportToGoogleSheet(entriesCache);
  
    function exportAsCSV(entries) {
      if (!entries.length) return alert('No entries to export');
      const header = ['Date','Type','Amount','PaidBy','PaidTo/For','Note'];
      const rows = entries.map(e => [
        new Date(e.timestamp).toLocaleString(),
        e.type,
        Number(e.amount).toFixed(2),
        e.paidBy,
        e.memberName || '',
        (e.note || '').replace(/(\r\n|\n|\r)/gm, ' ')
      ]);
      const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `famfin-export-${(new Date()).toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  
    function exportAsExcel(entries) {
      if (!entries.length) return alert('No entries to export');
      // Create a simple HTML table and save with .xls extension (works with Excel)
      let html = `<table><tr><th>Date</th><th>Type</th><th>Amount</th><th>PaidBy</th><th>PaidTo/For</th><th>Note</th></tr>`;
      entries.forEach(e => {
        html += `<tr>
          <td>${new Date(e.timestamp).toLocaleString()}</td>
          <td>${e.type}</td>
          <td>${Number(e.amount).toFixed(2)}</td>
          <td>${e.paidBy}</td>
          <td>${e.memberName || ''}</td>
          <td>${(e.note || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
        </tr>`;
      });
      html += '</table>';
      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `famfin-export-${(new Date()).toISOString().slice(0,10)}.xls`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  
    async function exportToGoogleSheet(entries) {
      if (!entries.length) return alert('No entries to export');
      try {
        // Sign in user to gapi if needed
        const authInstance = gapi && gapi.auth2 ? gapi.auth2.getAuthInstance() : null;
        if (!authInstance) {
          alert('Google API not initialized. Ensure gapi script loaded.');
          return;
        }
        if (!authInstance.isSignedIn.get()) {
          await authInstance.signIn();
        }
        // create sheet
        const title = `FAMFIN Export ${(new Date()).toLocaleString()}`;
        const createResp = await gapi.client.sheets.spreadsheets.create({
          properties: { title }
        });
        const sheetId = createResp.result.spreadsheetId;
        // prepare values
        const values = [
          ['Date','Type','Amount','PaidBy','PaidTo/For','Note'],
          ...entries.map(e => [new Date(e.timestamp).toLocaleString(), e.type, Number(e.amount).toFixed(2), e.paidBy, e.memberName || '', e.note || ''])
        ];
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: 'A1',
          valueInputOption: 'RAW',
          resource: { values }
        });
        alert('Exported to Google Sheet — opening now');
        window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank');
      } catch (err) {
        console.error('sheets export error', err);
        alert('Google Sheets export failed: ' + (err.message || err));
      }
    }
  
    /* ------- Settings actions ------- */
    themeSelect.onchange = () => {
      const t = themeSelect.value;
      applyTheme(t);
      localStorage.setItem('famfin_theme', t);
    };
  
    textSizeRange.oninput = () => {
      const size = Number(textSizeRange.value);
      document.documentElement.style.fontSize = `${size}px`;
      localStorage.setItem('famfin_fontsize', size);
    };
  
    profileName.onchange = async () => {
      const name = profileName.value.trim();
      if (!name) return;
      // update Firebase user profile and family member entry
      try {
        await currentUser.updateProfile({ displayName: name });
        // update member name in family doc if present
        const members = (currentFamDoc?.members || []).map(m => m.uid === currentUser.uid ? { ...m, name } : m);
        await db.collection('families').doc(currentFamId).update({ members });
        alert('Profile updated');
      } catch (err) {
        alert('Profile update failed: ' + (err.message || err));
      }
    };
  
    goFamilyPage.onclick = () => location.href = 'family.html';
    signOutBtn.onclick = async () => {
      await auth.signOut();
      location.href = 'login.html';
    };
  
    /* ------- Theme & font preferences ------- */
    function applySavedPreferences() {
      const theme = localStorage.getItem('famfin_theme') || 'auto';
      themeSelect.value = theme;
      applyTheme(theme);
      const size = localStorage.getItem('famfin_fontsize') || 16;
      textSizeRange.value = size;
      document.documentElement.style.fontSize = `${size}px`;
    }
  
    function applyTheme(mode) {
      if (mode === 'auto') {
        // use prefers-color-scheme
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', mode);
      }
    }
  
    /* ------- small helpers ------- */
    function safeGetEntriesForExport() {
      return entriesCache.slice().sort((a,b) => a.timestamp - b.timestamp);
    }
  
    // Bind initial filter member change to trigger render
    filterMember.addEventListener('change', renderEntries);
  
    // Export handlers should use filtered entries rather than full cache
    exportCsvBtn.onclick = () => exportAsCSV(filteredEntriesForExport());
    exportExcelBtn.onclick = () => exportAsExcel(filteredEntriesForExport());
    exportToGoogleSheetBtn.onclick = () => exportToGoogleSheet(filteredEntriesForExport());
  
    function filteredEntriesForExport() {
      // apply the same filters as in UI
      const from = filterFrom.value ? new Date(filterFrom.value).setHours(0,0,0,0) : null;
      const to = filterTo.value ? new Date(filterTo.value).setHours(23,59,59,999) : null;
      const typeFilter = filterType.value;
      const memberFilter = filterMember.value;
      return entriesCache.filter(e => {
        if (typeFilter !== 'all' && e.type !== typeFilter) return false;
        if (memberFilter !== 'all' && e.memberUid !== memberFilter) return false;
        if (from && e.timestamp < from) return false;
        if (to && e.timestamp > to) return false;
        return true;
      }).slice().sort((a,b) => a.timestamp - b.timestamp);
    }
  }
  
  /* ========================
     Bootstrapping (handle which page)
     The HTML pages call init* in their inline scripts:
     - login.html calls initLoginPage()
     - family.html calls initFamilyPage()
     - index.html calls initMainApp()
     ======================== */
  
  /* If the HTML forgot to call page initializer, attempt safe auto-detection */
  document.addEventListener('DOMContentLoaded', () => {
    // do nothing here; each page calls its init explicitly (as per HTML).
  });
  