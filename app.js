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
  var DEFAULT_PIN = '0000';

  var db = null, docRef = null, configRef = null;
  var state = null;
  var appConfig = { pin: null };
  var editorUnlocked = false;
  var viewerLocked = false;
  var settingsOpen = false;
  var pinPanelOpen = false;
  var pinError = '';
  var connStatus = 'connecting'; // connecting | synced | offline | error | config

  try { editorUnlocked = localStorage.getItem('fg_editor') === '1'; } catch (e) {}
  try { viewerLocked = localStorage.getItem('fg_viewer_locked') === '1'; } catch (e) {}

  // Una vez que un dispositivo se fija como "solo lectura", el botón para
  // desbloquear edición desaparece. Para recuperarlo en ese mismo dispositivo
  // (por ejemplo si vos mismo lo bloqueaste sin querer), abrí la app agregando
  // ?editor al final del link, ej: https://tu-link/?editor
  function showUnlockOption(){
    if (editorUnlocked) return false;
    if (!viewerLocked) return true;
    try { return /[?&#]editor\b/.test(window.location.href); } catch (e) { return false; }
  }

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
  function granTotal(){ return state.padres.reduce(function(s, p){ return s + totalPadre(p); }, 0); }
  function granEsperado(){ return esperadoPadre() * state.padres.length; }
  function totalMes(m){ return state.padres.reduce(function(s, p){ return s + num(p.pagos[m]); }, 0); }
  function alDiaCount(){
    var esp = esperadoPadre();
    return state.padres.filter(function(p){ return totalPadre(p) >= esp - 0.001; }).length;
  }

  function normalizeState(d){
    var s = {};
    Object.assign ? Object.assign(s, DEFAULT_STATE, d || {}) : (function(){
      for (var k in DEFAULT_STATE) s[k] = DEFAULT_STATE[k];
      for (var k2 in (d || {})) s[k2] = d[k2];
    })();
    if (!Array.isArray(s.meses)) s.meses = [];
    if (!Array.isArray(s.padres)) s.padres = [];
    s.padres.forEach(function(p){ if (!p.pagos) p.pagos = {}; if (!p.id) p.id = uid(); });
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
      try { db.enablePersistence({ synchronizeTabs: true }).catch(function(){}); } catch (e) {}
      docRef = db.collection('fondoGraduacion').doc('estado');
      configRef = db.collection('fondoGraduacion').doc('acceso');

      docRef.onSnapshot(function(snap){
        if (snap.exists) {
          state = normalizeState(snap.data());
        } else {
          state = Object.assign({}, DEFAULT_STATE);
          docRef.set(state).catch(function(){});
        }
        connStatus = navigator.onLine === false ? 'offline' : 'synced';
        render();
      }, function(){
        connStatus = 'error';
        if (!state) state = Object.assign({}, DEFAULT_STATE);
        render();
      });

      configRef.get().then(function(snap){
        if (snap.exists && snap.data().pin) {
          appConfig.pin = snap.data().pin;
        } else {
          appConfig.pin = DEFAULT_PIN;
          configRef.set({ pin: DEFAULT_PIN }, { merge: true }).catch(function(){});
        }
      }).catch(function(){ appConfig.pin = DEFAULT_PIN; });
    } catch (e) {
      connStatus = 'error';
      state = Object.assign({}, DEFAULT_STATE);
      render();
    }

    window.addEventListener('online', function(){ if (connStatus !== 'config') { connStatus = 'synced'; render(); } });
    window.addEventListener('offline', function(){ if (connStatus !== 'config') { connStatus = 'offline'; render(); } });
  }

  function persist(){
    if (!docRef || !state) return;
    docRef.set(state).catch(function(){});
  }
  function mutate(fn){
    if (!editorUnlocked || !state) return;
    fn();
    render();
    persist();
  }

  function tryUnlock(pin){
    if (!appConfig.pin) { pinError = 'Todavía cargando, esperá un segundo e intentá de nuevo.'; render(); return; }
    if (pin === appConfig.pin) {
      editorUnlocked = true;
      try { localStorage.setItem('fg_editor', '1'); } catch (e) {}
      pinPanelOpen = false; pinError = '';
      render();
    } else {
      pinError = 'PIN incorrecto.';
      render();
    }
  }
  function lockDevice(){
    editorUnlocked = false;
    try { localStorage.removeItem('fg_editor'); } catch (e) {}
    settingsOpen = false;
    render();
  }
  function changePin(newPin){
    if (!editorUnlocked || !configRef || !newPin) return;
    appConfig.pin = newPin;
    configRef.set({ pin: newPin }, { merge: true }).catch(function(){});
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

  function pinPanelHTML(){
    return '<section class="pin-panel">' +
      '<div class="field"><label for="pin-input">PIN de edición</label><input type="password" inputmode="numeric" id="pin-input" placeholder="••••" maxlength="12" autocomplete="off"></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="submit-pin">Desbloquear</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="cancel-pin">Cancelar</button>' +
      (pinError ? '<p class="pin-error">' + escapeHtml(pinError) + '</p>' : '') +
      '<p class="hint">PIN inicial: <strong>' + escapeHtml(DEFAULT_PIN) + '</strong> (cambialo desde Ajustes una vez adentro).</p>' +
    '</section>';
  }

  function settingsPanelHTML(){
    return '<section class="settings-panel">' +
      '<div class="field"><label for="set-evento">Nombre del evento</label><input type="text" id="set-evento" value="' + escapeHtml(state.evento) + '"></div>' +
      '<div class="field"><label for="set-promocion">Subtítulo (curso, colegio…)</label><input type="text" id="set-promocion" value="' + escapeHtml(state.promocion) + '"></div>' +
      '<div class="field field-sm"><label for="set-moneda">Moneda</label><input type="text" id="set-moneda" value="' + escapeHtml(state.moneda) + '" maxlength="4"></div>' +
      '<div class="field field-sm"><label for="set-cuota">Cuota mensual sugerida</label><input type="number" id="set-cuota" min="0" step="0.01" value="' + num(state.cuota) + '"></div>' +
      '<div class="field field-sm"><label for="set-pin">Cambiar PIN de edición</label><input type="text" inputmode="numeric" id="set-pin" placeholder="Nuevo PIN" maxlength="12"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="lock-device">Bloquear este dispositivo</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-settings">Listo</button>' +
    '</section>';
  }

  function parentRowHTML(p){
    var tot = totalPadre(p);
    var esp = esperadoPadre();
    var ok = tot >= esp - 0.001;
    var monthCells = state.meses.map(function(m){
      var v = num(p.pagos[m]);
      if (editorUnlocked) {
        return '<td class="col-month amt-cell"><input type="number" class="amt-input" inputmode="decimal" step="0.01" min="0" placeholder="0.00" data-parent="' + p.id + '" data-month="' + escapeHtml(m) + '" value="' + (v ? v : '') + '"></td>';
      }
      return '<td class="col-month amt-cell"><span class="amt-static">' + (v ? fmt(v) : '—') + '</span></td>';
    }).join('');
    return '<tr>' +
      '<td class="col-name">' + escapeHtml(p.nombre) + '</td>' +
      '<td class="col-student">' + escapeHtml(p.alumno || '—') + '</td>' +
      monthCells +
      '<td class="col-total">' + fmt(tot) + '</td>' +
      '<td class="col-status"><span class="pill ' + (ok ? 'pill-ok' : 'pill-pending') + '">' + (ok ? 'Al día' : 'Pendiente') + '</span>' +
        (!ok && esp > 0 ? '<span class="pill-caption">faltan ' + fmt(esp - tot) + '</span>' : '') +
      '</td>' +
      '<td class="col-del">' + (editorUnlocked ? '<button type="button" class="mini-x" data-action="delete-parent" data-id="' + p.id + '" title="Eliminar padre">✕</button>' : '') + '</td>' +
    '</tr>';
  }

  function waText(){
    var total = granTotal(), esperado = granEsperado();
    var pct = esperado > 0 ? Math.round((total / esperado) * 100) : 0;
    var esp = esperadoPadre();
    var pendientes = state.padres.filter(function(p){ return totalPadre(p) < esp - 0.001; });
    var lines = [];
    lines.push('📋 *' + (state.evento || 'Fondo de Graduación') + '*');
    if (state.promocion) lines.push(state.promocion);
    lines.push('');
    lines.push('💰 Recaudado: ' + fmt(total) + ' de ' + fmt(esperado) + ' (' + pct + '%)');
    lines.push('✅ Al día: ' + alDiaCount() + ' de ' + state.padres.length);
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
            '<span class="badge badge-view">Solo lectura</span>' + (showUnlockOption() ?
              '<button type="button" class="btn btn-outline btn-sm" data-action="open-pin">Desbloquear edición</button>' +
              '<button type="button" class="icon-btn" data-action="lock-viewer" title="Fijar este dispositivo como solo lectura y no volver a mostrar este botón">🔒</button>'
              : '')) +
        '</div>' +
      '</header>' +

      (pinPanelOpen ? pinPanelHTML() : '') +
      (settingsOpen && editorUnlocked ? settingsPanelHTML() : '') +

      '<section class="stats" aria-label="Resumen">' +
        '<div class="stat stat-hero">' +
          '<span class="stat-label">Recaudado</span>' +
          '<span class="stat-value">' + fmt(total) + '</span>' +
          '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="stat-caption">' + pct + '% de ' + fmt(esperado) + ' esperado</span>' +
        '</div>' +
        '<div class="stat"><span class="stat-label">Padres al día</span><span class="stat-value-sm">' + alDia + ' <span class="stat-of">/ ' + state.padres.length + '</span></span></div>' +
        '<div class="stat"><span class="stat-label">Meses registrados</span><span class="stat-value-sm">' + state.meses.length + '</span></div>' +
        '<div class="stat"><span class="stat-label">Cuota sugerida</span><span class="stat-value-sm">' + fmt(state.cuota) + '<span class="stat-of">/mes</span></span></div>' +
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
      var est = tot >= esp - 0.001 ? 'Al día' : 'Pendiente';
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
    doc.text('Meta esperada: ' + fmt(granEsperado()) + '   ·   Padres al día: ' + alDiaCount() + ' de ' + state.padres.length, 40, finalY + 16);
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
    else if (action === 'open-pin') { pinPanelOpen = true; pinError = ''; render(); setTimeout(function(){ var el = document.getElementById('pin-input'); if (el) el.focus(); }, 0); }
    else if (action === 'cancel-pin') { pinPanelOpen = false; pinError = ''; render(); }
    else if (action === 'submit-pin') { var el = document.getElementById('pin-input'); tryUnlock(el ? el.value.trim() : ''); }
    else if (action === 'lock-device') { lockDevice(); }
    else if (action === 'lock-viewer') {
      viewerLocked = true;
      try { localStorage.setItem('fg_viewer_locked', '1'); } catch (e) {}
      pinPanelOpen = false;
      render();
    }
    else if (action === 'delete-parent') { var id = btn.getAttribute('data-id'); mutate(function(){ state.padres = state.padres.filter(function(p){ return p.id !== id; }); }); }
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
    else if (t.id === 'set-pin') { var v = t.value.trim(); if (v) { changePin(v); t.value = ''; } }
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var id = e.target && e.target.id;
    if (id === 'new-parent-name' || id === 'new-parent-student') { e.preventDefault(); addParentFromForm(); }
    else if (id === 'new-month-label') { e.preventDefault(); addMonthFromForm(); }
    else if (id === 'pin-input') { e.preventDefault(); tryUnlock(e.target.value.trim()); }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('service-worker.js').catch(function(){});
    });
  }

  render();
  initFirebase();
})();
