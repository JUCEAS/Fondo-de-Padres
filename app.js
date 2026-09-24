(function(){
  'use strict';

  var DEFAULT_STATE = {
    evento: 'Fondo de Graduación',
    promocion: '',
    moneda: 'L',
    cuota: 300,
    meses: [],
    padres: []
  };

  // ---------- Acceso ----------
  // Quién puede EDITAR: solo estas cuentas de Google. La MISMA lista debe estar
  // en las reglas de Firestore (firestore.rules), que son las que de verdad
  // protegen los datos. Los supervisores de solo lectura se agregan desde
  // Ajustes dentro de la app (se guardan en fondoGraduacion/acceso).
  var EDITORES = ['juceas19@gmail.com', 'sairareyes4@gmail.com'];

  var db = null, auth = null, docRef = null, configRef = null;
  var unsubEstado = null, unsubAcceso = null;
  var state = null;
  var lectores = [];
  var editorUnlocked = false;
  var authState = 'checking'; // checking | signed-out | denied | ok
  var userEmail = '';
  var loginError = '';
  var settingsOpen = false;
  var retiroPanelFor = null;
  var connStatus = 'connecting'; // connecting | synced | offline | error | config

  // Limpieza del sistema de PIN anterior (ya no se usa)
  try { localStorage.removeItem('fg_editor'); localStorage.removeItem('fg_viewer_locked'); } catch (e) {}

  function esCorreoValido(c){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c); }

  function uid(){ return 'p' + Math.random().toString(36).slice(2, 9); }
  function num(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n){
    return (state.moneda || 'L') + ' ' + num(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function totalPadre(p){ return state.meses.reduce(function(s, m){ return s + num(p.pagos[m]); }, 0); }
  function esperadoPadre(){ return num(state.cuota) * state.meses.length; }
  function activePadres(){ return state.padres.filter(function(p){ return !p.retirado; }); }
  // Lo que queda en el fondo por este padre: lo que aportó, menos lo que se le
  // devolvió si se retiró. Si el retiro fue con devolución total, queda en 0.
  function netoPadre(p){ return totalPadre(p) - (p.retirado ? num(p.devolucion) : 0); }
  function granTotal(){ return state.padres.reduce(function(s, p){ return s + netoPadre(p); }, 0); }
  function granEsperado(){ return esperadoPadre() * activePadres().length; }
  function totalMes(m){ return state.padres.reduce(function(s, p){ return s + num(p.pagos[m]); }, 0); }
  function alDiaCount(){
    var esp = esperadoPadre();
    return activePadres().filter(function(p){ return totalPadre(p) >= esp - 0.001; }).length;
  }

  function normalizeState(d){
    var s = {};
    Object.assign ? Object.assign(s, DEFAULT_STATE, d || {}) : (function(){
      for (var k in DEFAULT_STATE) s[k] = DEFAULT_STATE[k];
      for (var k2 in (d || {})) s[k2] = d[k2];
    })();
    if (!Array.isArray(s.meses)) s.meses = [];
    if (!Array.isArray(s.padres)) s.padres = [];
    s.padres.forEach(function(p){
      if (!p.pagos) p.pagos = {};
      if (!p.id) p.id = uid();
      if (typeof p.retirado !== 'boolean') p.retirado = false;
      if (typeof p.devolucion !== 'number') p.devolucion = num(p.devolucion) || 0;
    });
    if (typeof s.cuota !== 'number') s.cuota = num(s.cuota);
    if (!s.moneda) s.moneda = 'L';
    return s;
  }

  function initFirebase(){
    if (typeof firebaseConfig === 'undefined' || !firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf('PEGA_AQUI') === 0) {
      connStatus = 'config';
      state = Object.assign({}, DEFAULT_STATE);
      render();
      return;
    }
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      try { db.enablePersistence({ synchronizeTabs: true }).catch(function(){}); } catch (e) {}
      try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){}); } catch (e) {}
      docRef = db.collection('fondoGraduacion').doc('estado');
      configRef = db.collection('fondoGraduacion').doc('acceso');
      auth.onAuthStateChanged(alCambiarSesion);
    } catch (e) {
      connStatus = 'error';
      state = Object.assign({}, DEFAULT_STATE);
      render();
    }

    window.addEventListener('online', function(){ if (connStatus !== 'config') { connStatus = 'synced'; render(); } });
    window.addEventListener('offline', function(){ if (connStatus !== 'config') { connStatus = 'offline'; render(); } });
  }

  function detenerEscuchas(){
    if (unsubEstado) { unsubEstado(); unsubEstado = null; }
    if (unsubAcceso) { unsubAcceso(); unsubAcceso = null; }
  }

  function alCambiarSesion(user){
    detenerEscuchas();
    state = null; lectores = []; settingsOpen = false; retiroPanelFor = null;
    if (!user) {
      userEmail = ''; editorUnlocked = false; authState = 'signed-out';
      render();
      return;
    }
    userEmail = String(user.email || '').toLowerCase();
    editorUnlocked = EDITORES.indexOf(userEmail) !== -1;
    authState = 'checking';
    render();

    unsubEstado = docRef.onSnapshot(function(snap){
      authState = 'ok';
      if (snap.exists) {
        state = normalizeState(snap.data());
      } else {
        state = Object.assign({}, DEFAULT_STATE);
        if (editorUnlocked) docRef.set(state).catch(function(){});
      }
      connStatus = navigator.onLine === false ? 'offline' : 'synced';
      render();
    }, function(err){
      if (err && err.code === 'permission-denied') {
        authState = 'denied';
      } else {
        connStatus = 'error';
        if (!state) state = Object.assign({}, DEFAULT_STATE);
        authState = 'ok';
      }
      render();
    });

    if (editorUnlocked) {
      unsubAcceso = configRef.onSnapshot(function(snap){
        var d = snap.exists ? snap.data() : {};
        lectores = Array.isArray(d.lectores) ? d.lectores : [];
        // Borra el PIN viejo que quedaba guardado en la base de datos
        if (!snap.exists || 'pin' in d) configRef.set({ lectores: lectores }).catch(function(){});
        render();
      }, function(){});
    }
  }

  function iniciarSesion(){
    loginError = '';
    var proveedor = new firebase.auth.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(proveedor).catch(function(err){
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        auth.signInWithRedirect(proveedor);
        return;
      }
      if (err && err.code === 'auth/popup-closed-by-user') return;
      loginError = 'No se pudo iniciar sesión (' + ((err && err.code) || 'error') + '). Intentá de nuevo.';
      render();
    });
  }

  function cerrarSesion(){
    if (auth) auth.signOut();
  }

  function guardarLectores(lista){
    if (!editorUnlocked || !configRef) return;
    lectores = lista;
    render();
    configRef.set({ lectores: lista }).catch(function(){ alert('No se pudo guardar la lista de supervisores.'); });
  }

  function persist(){
    if (!docRef || !state) return;
    docRef.set(state).catch(function(){});
  }
  function mutate(fn){
    if (!editorUnlocked || !state || authState !== 'ok') return;
    fn();
    render();
    persist();
  }

  // ---------- rendering ----------

  var CAP_SVG = '<svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<path d="M16 4 L30 10 L16 16 L2 10 Z" fill="var(--gold)"/>' +
    '<path d="M16 16 L30 10 L30 18" stroke="var(--navy)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M9 13.2 V20 C9 22 12 24 16 24 C20 24 23 22 23 20 V13.2" stroke="var(--navy)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="30" cy="19.5" r="1.6" fill="var(--navy)"/>' +
    '</svg>';

  function connBadgeHTML(){
    var map = {
      connecting: ['badge-connecting', 'Conectando…'],
      synced: ['badge-sync', 'Sincronizado'],
      offline: ['badge-offline', 'Sin internet · se guarda al reconectar'],
      error: ['badge-offline', 'No se pudo conectar'],
      config: ['badge-offline', 'Falta configurar Firebase']
    };
    var m = map[connStatus] || map.connecting;
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  }

  function setupScreenHTML(){
    return '<section class="setup-screen">' +
      '<h2>Falta un paso: conectar la base de datos</h2>' +
      '<p>Esta app necesita un proyecto de Firebase (gratis) para guardar y sincronizar los datos entre dispositivos. Abrí el archivo <code>firebase-config.js</code> y pegá la configuración de tu proyecto donde dice <code>PEGA_AQUI</code>.</p>' +
      '<ol>' +
        '<li>Entrá a <code>console.firebase.google.com</code> y creá un proyecto (o usá uno que ya tengas).</li>' +
        '<li>Activá <strong>Firestore Database</strong> en modo de producción.</li>' +
        '<li>En Configuración del proyecto → Tus apps, agregá una app web y copiá el objeto <code>firebaseConfig</code>.</li>' +
        '<li>Pegalo en <code>firebase-config.js</code>, guardá y volvé a subir el archivo a GitHub Pages.</li>' +
      '</ol>' +
      '<p>Mientras tanto podés ver cómo luce la app, pero nada de lo que escribas aquí se va a guardar.</p>' +
    '</section>';
  }

  function loginScreenHTML(){
    var cuerpo;
    if (authState === 'checking') {
      cuerpo = '<p>Comprobando acceso…</p>';
    } else if (authState === 'denied') {
      cuerpo = '<p>La cuenta <strong>' + escapeHtml(userEmail) + '</strong> no tiene acceso a este fondo.</p>' +
        '<p class="hint">Pedile a la persona que administra el fondo que agregue tu correo como supervisor, o entrá con otra cuenta.</p>' +
        '<button type="button" class="btn btn-primary" data-action="logout">Entrar con otra cuenta</button>';
    } else {
      cuerpo = '<p>Los datos del fondo son privados. Entrá con tu cuenta de Google autorizada para verlos.</p>' +
        '<button type="button" class="btn btn-primary" data-action="login">Entrar con Google</button>' +
        (loginError ? '<p class="pin-error">' + escapeHtml(loginError) + '</p>' : '');
    }
    return '<section class="setup-screen login-screen">' +
      '<div class="brand" style="justify-content:center;margin-bottom:8px">' + CAP_SVG + '</div>' +
      '<h2>Fondo de Graduación</h2>' + cuerpo +
    '</section>';
  }

  function lectoresHTML(){
    return '<div class="field" style="grid-column:1/-1">' +
        '<label>Supervisores (solo lectura)</label>' +
        (lectores.length ?
          '<ul class="lista-lectores">' + lectores.map(function(c){
            return '<li><span>' + escapeHtml(c) + '</span><button type="button" class="mini-x" data-action="remove-lector" data-email="' + escapeHtml(c) + '" title="Quitar acceso">✕</button></li>';
          }).join('') + '</ul>' :
          '<p class="hint" style="margin:4px 0 8px">Nadie más tiene acceso de solo lectura todavía.</p>') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input type="email" id="new-lector" placeholder="correo@gmail.com" autocomplete="off" style="flex:1;min-width:180px">' +
          '<button type="button" class="btn btn-outline btn-sm" data-action="add-lector">Dar acceso</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:6px">Esa persona entra con ese Gmail y solo puede ver, no modificar.</p>' +
      '</div>';
  }

  function settingsPanelHTML(){
    return '<section class="settings-panel">' +
      '<div class="field"><label for="set-evento">Nombre del evento</label><input type="text" id="set-evento" value="' + escapeHtml(state.evento) + '"></div>' +
      '<div class="field"><label for="set-promocion">Subtítulo (curso, colegio…)</label><input type="text" id="set-promocion" value="' + escapeHtml(state.promocion) + '"></div>' +
      '<div class="field field-sm"><label for="set-moneda">Moneda</label><input type="text" id="set-moneda" value="' + escapeHtml(state.moneda) + '" maxlength="4"></div>' +
      '<div class="field field-sm"><label for="set-cuota">Cuota mensual sugerida</label><input type="number" id="set-cuota" min="0" step="0.01" value="' + num(state.cuota) + '"></div>' +
      lectoresHTML() +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-settings">Listo</button>' +
    '</section>';
  }

  function parentRowHTML(p){
    var tot = totalPadre(p);
    var esp = esperadoPadre();
    var ok = tot >= esp - 0.001;
    var monthCells = state.meses.map(function(m){
      var v = num(p.pagos[m]);
      if (editorUnlocked && !p.retirado) {
        return '<td class="col-month amt-cell"><input type="number" class="amt-input" inputmode="decimal" step="0.01" min="0" placeholder="0.00" data-parent="' + escapeHtml(p.id) + '" data-month="' + escapeHtml(m) + '" value="' + (v ? v : '') + '"></td>';
      }
      return '<td class="col-month amt-cell"><span class="amt-static">' + (v ? fmt(v) : '—') + '</span></td>';
    }).join('');

    var statusCell = p.retirado ?
      ('<td class="col-status"><span class="pill" style="background:#e2e2e2;color:#555">Retirado</span>' +
        '<span class="pill-caption">devuelto ' + fmt(p.devolucion) + '</span></td>') :
      ('<td class="col-status"><span class="pill ' + (ok ? 'pill-ok' : 'pill-pending') + '">' + (ok ? 'Al día' : 'Pendiente') + '</span>' +
        (!ok && esp > 0 ? '<span class="pill-caption">faltan ' + fmt(esp - tot) + '</span>' : '') +
      '</td>');

    var actionsCell = '<td class="col-del">' + (editorUnlocked ? (
        (p.retirado ?
          '<button type="button" class="mini-x" data-action="reactivar-parent" data-id="' + escapeHtml(p.id) + '" title="Reactivar a este padre">↺</button>' :
          '<button type="button" class="mini-x" data-action="mark-retiro" data-id="' + escapeHtml(p.id) + '" title="Marcar como retirado y registrar devolución">↩</button>') +
        '<button type="button" class="mini-x" data-action="delete-parent" data-id="' + escapeHtml(p.id) + '" title="Eliminar padre por completo (borra su historial, sin dejar rastro)">✕</button>'
      ) : '') + '</td>';

    return '<tr' + (p.retirado ? ' style="opacity:.6"' : '') + '>' +
      '<td class="col-name">' + escapeHtml(p.nombre) + '</td>' +
      '<td class="col-student">' + escapeHtml(p.alumno || '—') + '</td>' +
      monthCells +
      '<td class="col-total">' + fmt(tot) + '</td>' +
      statusCell +
      actionsCell +
    '</tr>';
  }

  function retiroPanelHTML(p){
    return '<section class="pin-panel">' +
      '<p style="margin:0 0 10px;font-weight:600">Retirar a ' + escapeHtml(p.nombre) + '</p>' +
      '<div class="field"><label for="retiro-monto">Monto a devolver</label>' +
        '<input type="number" min="0" step="0.01" id="retiro-monto" value="' + num(totalPadre(p)) + '"></div>' +
      '<p class="hint">Aportó ' + fmt(totalPadre(p)) + ' en total. Ajustá el monto si solo se le devuelve una parte. ' +
        'El padre queda marcado como "Retirado" — no se borra, y su historial sigue apareciendo en el reporte PDF.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="confirm-retiro" data-id="' + escapeHtml(p.id) + '">Confirmar retiro</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="cancel-retiro">Cancelar</button>' +
    '</section>';
  }

  function waText(){
    var total = granTotal(), esperado = granEsperado();
    var pct = esperado > 0 ? Math.round((total / esperado) * 100) : 0;
    var esp = esperadoPadre();
    var activos = activePadres();
    var pendientes = activos.filter(function(p){ return totalPadre(p) < esp - 0.001; });
    var retiradosCount = state.padres.length - activos.length;
    var lines = [];
    lines.push('📋 *' + (state.evento || 'Fondo de Graduación') + '*');
    if (state.promocion) lines.push(state.promocion);
    lines.push('');
    lines.push('💰 Recaudado: ' + fmt(total) + ' de ' + fmt(esperado) + ' (' + pct + '%)');
    lines.push('✅ Al día: ' + alDiaCount() + ' de ' + activos.length);
    if (retiradosCount) lines.push('↩ Retirados (con devolución): ' + retiradosCount);
    if (pendientes.length) {
      lines.push('');
      lines.push('⏳ Pendientes:');
      pendientes.slice(0, 25).forEach(function(p){
        var falta = Math.max(0, esp - totalPadre(p));
        lines.push('- ' + p.nombre + ': falta ' + fmt(falta));
      });
      if (pendientes.length > 25) lines.push('… y ' + (pendientes.length - 25) + ' más');
    }
    lines.push('');
    lines.push('Reporte completo en PDF adjunto.');
    return lines.join('\n');
  }

  function bodyHTML(){
    if (connStatus === 'config') return setupScreenHTML();

    var total = granTotal(), esperado = granEsperado();
    var pct = esperado > 0 ? Math.min(100, Math.round((total / esperado) * 100)) : 0;
    var alDia = alDiaCount();
    var retiradosCount = state.padres.length - activePadres().length;
    var colCount = 5 + state.meses.length;

    var monthHeaders = state.meses.map(function(m){
      return '<th class="col-month"><span>' + escapeHtml(m) + '</span>' +
        (editorUnlocked ? '<button type="button" class="mini-x" data-action="delete-month" data-month="' + escapeHtml(m) + '" title="Quitar mes">✕</button>' : '') +
        '</th>';
    }).join('');

    var rows = state.padres.map(parentRowHTML).join('') ||
      '<tr class="empty-row"><td colspan="' + colCount + '">Todavía no hay padres registrados' + (editorUnlocked ? '. Agregá el primero abajo.' : '.') + '</td></tr>';

    var footer = state.padres.length ?
      '<tfoot><tr><td class="col-name">Total del mes</td><td class="col-student"></td>' +
      state.meses.map(function(m){ return '<td class="col-month amt-cell">' + fmt(totalMes(m)) + '</td>'; }).join('') +
      '<td class="col-total">' + fmt(total) + '</td><td class="col-status"></td><td class="col-del"></td></tr></tfoot>' : '';

    var controls = editorUnlocked ?
      '<div class="ledger-controls">' +
        '<div class="add-group">' +
          '<input type="text" id="new-parent-name" placeholder="Nombre del padre/madre" autocomplete="off">' +
          '<input type="text" id="new-parent-student" placeholder="Nombre del alumno/a (opcional)" autocomplete="off">' +
          '<button type="button" class="btn btn-outline btn-sm" data-action="add-parent">+ Agregar padre</button>' +
        '</div>' +
        '<div class="add-group">' +
          '<input type="text" id="new-month-label" placeholder="Ej. Mayo 2027" autocomplete="off">' +
          '<button type="button" class="btn btn-outline btn-sm" data-action="add-month">+ Agregar mes</button>' +
        '</div>' +
      '</div>' : '';

    return (
      '<header class="topbar">' +
        '<div class="brand">' + CAP_SVG +
          '<div><h1>' + escapeHtml(state.evento || 'Fondo de Graduación') + '</h1>' +
          (state.promocion ? '<p class="subtitle">' + escapeHtml(state.promocion) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="topbar-actions">' +
          connBadgeHTML() +
          (editorUnlocked ?
            '<span class="badge badge-editor">Editor</span><button type="button" class="icon-btn" data-action="toggle-settings" title="Ajustes">⚙</button>' :
            '<span class="badge badge-view">Solo lectura</span>') +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="logout" title="' + escapeHtml(userEmail) + '">Salir</button>' +
        '</div>' +
      '</header>' +

      (settingsOpen && editorUnlocked ? settingsPanelHTML() : '') +
      (retiroPanelFor && editorUnlocked ? (function(){
        var rp = state.padres.filter(function(x){ return x.id === retiroPanelFor; })[0];
        return rp ? retiroPanelHTML(rp) : '';
      })() : '') +

      '<section class="stats" aria-label="Resumen">' +
        '<div class="stat stat-hero">' +
          '<span class="stat-label">Recaudado</span>' +
          '<span class="stat-value">' + fmt(total) + '</span>' +
          '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="stat-caption">' + pct + '% de ' + fmt(esperado) + ' esperado</span>' +
        '</div>' +
        '<div class="stat"><span class="stat-label">Padres al día</span><span class="stat-value-sm">' + alDia + ' <span class="stat-of">/ ' + activePadres().length + '</span></span></div>' +
        '<div class="stat"><span class="stat-label">Meses registrados</span><span class="stat-value-sm">' + state.meses.length + '</span></div>' +
        '<div class="stat"><span class="stat-label">Cuota sugerida</span><span class="stat-value-sm">' + fmt(state.cuota) + '<span class="stat-of">/mes</span></span></div>' +
        (retiradosCount ? '<div class="stat"><span class="stat-label">Retirados</span><span class="stat-value-sm">' + retiradosCount + '</span></div>' : '') +
      '</section>' +

      '<section class="ledger" aria-label="Registro de aportaciones">' +
        '<div class="table-scroll"><table>' +
          '<thead><tr><th class="col-name">Padre / Madre</th><th class="col-student">Alumno/a</th>' + monthHeaders + '<th class="col-total">Total</th><th class="col-status">Estado</th><th class="col-del"></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' + footer +
        '</table></div>' +
        controls +
      '</section>' +

      '<section class="toolbar">' +
        '<button type="button" class="btn btn-primary" data-action="download-pdf">⬇ Descargar reporte PDF</button>' +
        '<button type="button" class="btn btn-whatsapp" data-action="share-pdf">Compartir PDF por WhatsApp</button>' +
      '</section>' +
      '<p class="footnote">En el celular, "Compartir PDF" abre el menú para enviarlo directo por WhatsApp (u otra app). En computadora, se descarga y lo adjuntás vos a mano.</p>'
    );
  }

  function render(){
    var root = document.getElementById('root');
    if (!root) return;
    if (connStatus !== 'config' && authState !== 'ok') { root.innerHTML = loginScreenHTML(); return; }
    if (!state && connStatus !== 'config') { root.innerHTML = '<p class="loading">Cargando…</p>'; return; }
    root.innerHTML = bodyHTML();
  }

  // ---------- actions ----------

  function addParentFromForm(){
    var nameEl = document.getElementById('new-parent-name');
    var studEl = document.getElementById('new-parent-student');
    var name = ((nameEl && nameEl.value) || '').trim();
    var stud = ((studEl && studEl.value) || '').trim();
    if (!name) { if (nameEl) nameEl.focus(); return; }
    mutate(function(){ state.padres.push({ id: uid(), nombre: name, alumno: stud, pagos: {} }); });
  }
  function addMonthFromForm(){
    var el = document.getElementById('new-month-label');
    var label = ((el && el.value) || '').trim();
    if (!label) { if (el) el.focus(); return; }
    if (state.meses.indexOf(label) !== -1) { if (el) el.focus(); return; }
    mutate(function(){ state.meses.push(label); });
  }

  function slug(s){
    var out = String(s || 'reporte').toLowerCase();
    try { out = out.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return out || 'reporte';
  }

  function buildPdf(){
    var jspdfNs = window.jspdf;
    if (!jspdfNs || !jspdfNs.jsPDF || !state) return null;
    var wide = state.meses.length > 4;
    var doc = new jspdfNs.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(state.evento || 'Fondo de Graduación', 40, 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    if (state.promocion) doc.text(state.promocion, 40, 60);
    doc.text('Generado: ' + new Date().toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' }), 40, 74);
    doc.setTextColor(0);

    var esp = esperadoPadre();
    var head = [['Padre/Madre', 'Alumno/a'].concat(state.meses).concat(['Total', 'Estado'])];
    var body = state.padres.map(function(p){
      var tot = totalPadre(p);
      var est = p.retirado ? ('Retirado (devuelto ' + fmt(p.devolucion) + ')') : (tot >= esp - 0.001 ? 'Al día' : 'Pendiente');
      return [p.nombre, p.alumno || '—'].concat(state.meses.map(function(m){ return p.pagos[m] ? fmt(p.pagos[m]) : '—'; })).concat([fmt(tot), est]);
    });
    var totalsRow = ['Total', ''].concat(state.meses.map(function(m){ return fmt(totalMes(m)); })).concat([fmt(granTotal()), '']);

    doc.autoTable({
      startY: 90, head: head, body: body.concat([totalsRow]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [28, 58, 94], textColor: 255 },
      didParseCell: function(d){
        if (d.section === 'body' && d.row.index === body.length) {
          d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 236, 216];
        }
      }
    });

    var finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 90) + 24;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Gran total recaudado: ' + fmt(granTotal()), 40, finalY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Meta esperada: ' + fmt(granEsperado()) + '   ·   Padres al día: ' + alDiaCount() + ' de ' + activePadres().length, 40, finalY + 16);
    return doc;
  }
  function handleDownloadPdf(){
    var doc = buildPdf();
    if (!doc) return;
    doc.save(slug(state.evento) + '.pdf');
  }

  function fallbackShare(doc){
    // No se puede compartir el archivo directamente: se descarga el PDF
    // y se abre WhatsApp con el resumen en texto, para que el usuario
    // adjunte el PDF manualmente desde su carpeta de descargas.
    doc.save(slug(state.evento) + '.pdf');
    var waUrl = 'https://wa.me/?text=' + encodeURIComponent(waText());
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function handleSharePdf(){
    var doc = buildPdf();
    if (!doc) return;

    var canUseFileShare = !!(navigator.share && navigator.canShare && window.File && window.Blob);
    if (!canUseFileShare) { fallbackShare(doc); return; }

    try {
      var blob = doc.output('blob');
      var filename = slug(state.evento) + '.pdf';
      var file = new File([blob], filename, { type: 'application/pdf' });

      if (!navigator.canShare({ files: [file] })) { fallbackShare(doc); return; }

      navigator.share({
        files: [file],
        title: state.evento || 'Fondo de Graduación',
        text: waText()
      }).catch(function(err){
        // El usuario canceló el menú de compartir, o el navegador lo rechazó.
        // Si fue un rechazo real (no una cancelación), usamos el respaldo.
        if (err && err.name !== 'AbortError') fallbackShare(doc);
      });
    } catch (e) {
      fallbackShare(doc);
    }
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'toggle-settings') { settingsOpen = !settingsOpen; render(); }
    else if (action === 'login') { iniciarSesion(); }
    else if (action === 'logout') { if (authState !== 'ok' || confirm('¿Cerrar sesión en este dispositivo? Vas a necesitar internet para volver a entrar.')) cerrarSesion(); }
    else if (action === 'add-lector') {
      var le = document.getElementById('new-lector');
      var correo = ((le && le.value) || '').trim().toLowerCase();
      if (!esCorreoValido(correo)) { alert('Escribí un correo válido, por ejemplo nombre@gmail.com'); return; }
      if (EDITORES.indexOf(correo) !== -1) { alert('Ese correo ya es editor.'); return; }
      if (lectores.indexOf(correo) === -1) guardarLectores(lectores.concat([correo]));
    }
    else if (action === 'remove-lector') {
      var quitar = btn.getAttribute('data-email');
      if (confirm('¿Quitar el acceso de ' + quitar + '?')) guardarLectores(lectores.filter(function(c){ return c !== quitar; }));
    }
    else if (action === 'delete-parent') { var id = btn.getAttribute('data-id'); mutate(function(){ state.padres = state.padres.filter(function(p){ return p.id !== id; }); }); }
    else if (action === 'mark-retiro') {
      retiroPanelFor = btn.getAttribute('data-id');
      render();
      setTimeout(function(){ var el = document.getElementById('retiro-monto'); if (el) { el.focus(); el.select(); } }, 0);
    }
    else if (action === 'cancel-retiro') { retiroPanelFor = null; render(); }
    else if (action === 'confirm-retiro') {
      var rid = btn.getAttribute('data-id');
      var montoEl = document.getElementById('retiro-monto');
      var monto = montoEl ? num(montoEl.value) : 0;
      retiroPanelFor = null;
      mutate(function(){
        var rp = state.padres.filter(function(x){ return x.id === rid; })[0];
        if (rp) { rp.retirado = true; rp.devolucion = monto; }
      });
    }
    else if (action === 'reactivar-parent') {
      var raid = btn.getAttribute('data-id');
      mutate(function(){
        var ap = state.padres.filter(function(x){ return x.id === raid; })[0];
        if (ap) { ap.retirado = false; ap.devolucion = 0; }
      });
    }
    else if (action === 'delete-month') { var m = btn.getAttribute('data-month'); mutate(function(){ state.meses = state.meses.filter(function(x){ return x !== m; }); state.padres.forEach(function(p){ delete p.pagos[m]; }); }); }
    else if (action === 'add-parent') { addParentFromForm(); }
    else if (action === 'add-month') { addMonthFromForm(); }
    else if (action === 'download-pdf') { handleDownloadPdf(); }
    else if (action === 'share-pdf') { handleSharePdf(); }
  });

  document.addEventListener('change', function(e){
    var t = e.target;
    if (!t) return;
    if (t.classList && t.classList.contains('amt-input')) {
      var pid = t.getAttribute('data-parent'), m = t.getAttribute('data-month');
      mutate(function(){
        var p = state.padres.filter(function(x){ return x.id === pid; })[0];
        if (p) { var v = num(t.value); if (v > 0) p.pagos[m] = v; else delete p.pagos[m]; }
      });
    } else if (t.id === 'set-evento') { mutate(function(){ state.evento = t.value.trim() || state.evento; }); }
    else if (t.id === 'set-promocion') { mutate(function(){ state.promocion = t.value; }); }
    else if (t.id === 'set-moneda') { mutate(function(){ state.moneda = t.value.trim() || 'L'; }); }
    else if (t.id === 'set-cuota') { mutate(function(){ state.cuota = num(t.value); }); }
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var id = e.target && e.target.id;
    if (id === 'new-parent-name' || id === 'new-parent-student') { e.preventDefault(); addParentFromForm(); }
    else if (id === 'new-month-label') { e.preventDefault(); addMonthFromForm(); }
    else if (id === 'new-lector') { e.preventDefault(); var b = document.querySelector('[data-action="add-lector"]'); if (b) b.click(); }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('service-worker.js').catch(function(){});
    });
  }

  render();
  initFirebase();
})();
