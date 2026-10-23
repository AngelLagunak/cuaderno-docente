// Cuaderno docente · Apps Script · ping, Classroom (tareas, notas y rúbricas), correo, tablón y sincronización

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || req.token !== token) {
      return json_({ ok: false, error: '403' });
    }
    switch (req.action) {
      case 'ping':
        out = { ok: true, data: { pong: true, user: Session.getEffectiveUser().getEmail(), time: new Date().toISOString() } };
        break;
      case 'classroom.courses':
        out = { ok: true, data: courses_() };
        break;
      case 'classroom.students':
        out = { ok: true, data: students_(req.courseId) };
        break;
      case 'classroom.work.list':
        out = { ok: true, data: workList_(req.courseId) };
        break;
      case 'classroom.grades':
        out = { ok: true, data: grades_(req.courseId, req.courseWorkId) };
        break;
      case 'classroom.pending':
        out = { ok: true, data: pending_(req.courseId) };
        break;
      case 'classroom.alerts':
        out = { ok: true, data: alerts_(req.courseId, req.days || 14) };
        break;
      case 'classroom.comments':
        out = { ok: true, data: comments_(req.days || 14) };
        break;
      case 'classroom.work.create':
        out = { ok: true, data: workCreate_(req) };
        break;
      case 'classroom.grades.push':
        out = { ok: true, data: gradesPush_(req) };
        break;
      case 'classroom.announce':
        out = { ok: true, data: announce_(req) };
        break;
      case 'sync':
        out = { ok: true, data: sync_(req) };
        break;
      case 'backup.run':
        out = { ok: true, data: backup_() };
        break;
      case 'mail.send':
        out = { ok: true, data: mail_(req.messages) };
        break;
      default:
        out = { ok: false, error: 'accion_desconocida' };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Classroom (API REST con el token del propio script) ----------

function api_(path, method, body) {
  var opt = { method: method || 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch('https://classroom.googleapis.com' + path, opt);
  var code = res.getResponseCode();
  var txt = res.getContentText();
  var j = txt ? JSON.parse(txt) : {};
  if (code >= 300) throw new Error('Classroom ' + code + ': ' + ((j.error && j.error.message) || txt));
  return j;
}

function all_(path, key) {
  var out = [], tok = '';
  do {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var j = api_(path + (tok ? sep + 'pageToken=' + encodeURIComponent(tok) : ''));
    out = out.concat(j[key] || []);
    tok = j.nextPageToken || '';
  } while (tok);
  return out;
}

function enc_(s) { return encodeURIComponent(String(s)); }

function courses_() {
  return all_('/v1/courses?teacherId=me&courseStates=ACTIVE&pageSize=50', 'courses')
    .map(function (c) { return { id: c.id, name: c.name || '', section: c.section || '' }; });
}

function students_(courseId) {
  return all_('/v1/courses/' + enc_(courseId) + '/students?pageSize=100', 'students').map(function (s) {
    var p = s.profile || {}, n = p.name || {};
    return { userId: s.userId, givenName: n.givenName || '', familyName: n.familyName || '', fullName: n.fullName || '', email: p.emailAddress || '' };
  });
}

function pad_(n) { return (n < 10 ? '0' : '') + n; }

function workList_(courseId) {
  return all_('/v1/courses/' + enc_(courseId) + '/courseWork?pageSize=100', 'courseWork').map(function (w) {
    var d = w.dueDate;
    return {
      id: w.id, title: w.title || '', maxPoints: w.maxPoints === undefined ? null : w.maxPoints,
      state: w.state, workType: w.workType,
      dueDate: d ? d.year + '-' + pad_(d.month) + '-' + pad_(d.day) : ''
    };
  });
}

/** Entregas sin calificar del curso: por tarea, cuántas están entregadas (TURNED_IN) y aún no devueltas con nota. */
function pending_(courseId) {
  var subs = all_('/v1/courses/' + enc_(courseId) + '/courseWork/-/studentSubmissions?states=TURNED_IN&pageSize=100', 'studentSubmissions');
  var by = {};
  subs.forEach(function (s) { if (s.assignedGrade === undefined) by[s.courseWorkId] = (by[s.courseWorkId] || 0) + 1; });
  var ids = Object.keys(by);
  if (!ids.length) return [];
  var titles = {};
  workList_(courseId).forEach(function (w) { titles[w.id] = w.title; });
  return ids.map(function (id) { return { courseWorkId: id, title: titles[id] || '', turnedIn: by[id] }; });
}

/**
 * Avisos de un curso: tareas con fecha pasada que el alumnado no ha entregado (Classroom las marca «late») y
 * publicaciones del alumnado en el tablón de los últimos `days` días. La API no da los comentarios: ver comments_.
 */
function alerts_(courseId, days) {
  var cid = enc_(courseId);
  var work = {};
  workList_(courseId).forEach(function (w) { work[w.id] = w; });
  var subs = all_('/v1/courses/' + cid + '/courseWork/-/studentSubmissions?late=LATE_ONLY&pageSize=100', 'studentSubmissions');
  var by = {};
  subs.forEach(function (s) {
    if (s.state === 'TURNED_IN' || s.state === 'RETURNED') return;
    var w = work[s.courseWorkId];
    if (!w || w.state !== 'PUBLISHED') return;
    (by[s.courseWorkId] = by[s.courseWorkId] || []).push(s.userId);
  });
  var missing = Object.keys(by).map(function (id) {
    return { courseWorkId: id, title: work[id].title, dueDate: work[id].dueDate, userIds: by[id] };
  });
  var teachers = {};
  all_('/v1/courses/' + cid + '/teachers?pageSize=30', 'teachers').forEach(function (t) { teachers[t.userId] = true; });
  var since = new Date(Date.now() - days * 86400000).toISOString();
  var ann = api_('/v1/courses/' + cid + '/announcements?pageSize=40&orderBy=updateTime%20desc').announcements || [];
  var posts = ann.filter(function (a) { return !teachers[a.creatorUserId] && a.updateTime >= since; }).map(function (a) {
    return { id: a.id, userId: a.creatorUserId, text: String(a.text || '').slice(0, 300), time: a.updateTime, link: a.alternateLink || '' };
  });
  return { missing: missing, posts: posts };
}

/**
 * Comentarios en tareas y en el tablón: la API de Classroom no los da, así que se leen los avisos que Classroom
 * manda por correo (hay que tener activadas las notificaciones por correo en Classroom).
 */
function comments_(days) {
  // GmailApp (servicio propio de Apps Script): no hace falta activar la API de Gmail en Google Cloud.
  var threads = GmailApp.search('from:(classroom.google.com) newer_than:' + days + 'd', 0, 40);
  var out = [];
  threads.forEach(function (t) {
    var m = t.getMessages().pop();
    var body = m.getPlainBody().replace(/\s+/g, ' ').trim();
    out.push({
      id: m.getId(), subject: m.getSubject() || '', from: m.getFrom() || '', time: m.getDate().toISOString(),
      snippet: body.slice(0, 200), unread: t.isUnread(), link: t.getPermalink()
    });
  });
  return out.filter(function (x) { return /coment|comment|respon|repl|mencion|mention/i.test(x.subject + ' ' + x.snippet); });
}

function rubricGrades_(s) {
  var m = s.assignedRubricGrades || s.draftRubricGrades;
  if (!m) return [];
  return Object.keys(m).map(function (k) {
    return { criterionId: m[k].criterionId || k, levelId: m[k].levelId || '', points: m[k].points === undefined ? null : m[k].points };
  });
}

function grades_(courseId, workId) {
  var base = '/v1/courses/' + enc_(courseId) + '/courseWork/' + enc_(workId);
  var work = api_(base);
  var subs = all_(base + '/studentSubmissions?pageSize=100', 'studentSubmissions');
  var rubric = null, rubricError = '';
  try {
    var rs = all_(base + '/rubrics', 'rubrics');
    if (rs.length) {
      rubric = {
        id: rs[0].id,
        criteria: (rs[0].criteria || []).map(function (c) {
          return {
            id: c.id, title: c.title || '',
            levels: (c.levels || []).map(function (l) { return { id: l.id, title: l.title || '', points: l.points === undefined ? 0 : l.points }; })
          };
        })
      };
    }
  } catch (err) { rubricError = String(err.message || err); }
  return {
    maxPoints: work.maxPoints === undefined ? null : work.maxPoints,
    rubric: rubric,
    rubricError: rubricError,
    submissions: subs.map(function (s) {
      return {
        userId: s.userId, state: s.state, late: !!s.late,
        assignedGrade: s.assignedGrade === undefined ? null : s.assignedGrade,
        draftGrade: s.draftGrade === undefined ? null : s.draftGrade,
        rubricGrades: rubricGrades_(s)
      };
    })
  };
}

// Crea una tarea como borrador (para añadirle la rúbrica en Classroom antes de publicarla).
function workCreate_(req) {
  var body = { title: req.title, description: req.description || '', workType: 'ASSIGNMENT', state: 'DRAFT', maxPoints: req.maxPoints || 10 };
  if (req.dueDate) {
    var p = String(req.dueDate).split('-');
    body.dueDate = { year: Number(p[0]), month: Number(p[1]), day: Number(p[2]) };
    body.dueTime = { hours: 21, minutes: 59 }; // UTC: 23:59 en verano, 22:59 en invierno (Madrid)
  }
  var w = api_('/v1/courses/' + enc_(req.courseId) + '/courseWork', 'post', body);
  return { id: w.id, maxPoints: w.maxPoints === undefined ? null : w.maxPoints };
}

// Escribe notas en borrador. Classroom solo lo permite en tareas creadas por este script y ya publicadas.
function gradesPush_(req) {
  var base = '/v1/courses/' + enc_(req.courseId) + '/courseWork/' + enc_(req.courseWorkId) + '/studentSubmissions';
  var byUser = {};
  all_(base + '?pageSize=100', 'studentSubmissions').forEach(function (s) { byUser[s.userId] = s.id; });
  var updated = 0, errors = [];
  (req.grades || []).forEach(function (g) {
    var id = byUser[g.userId];
    if (!id) { errors.push('sin entrega (¿tarea sin publicar?)'); return; }
    try { api_(base + '/' + enc_(id) + '?updateMask=draftGrade', 'patch', { draftGrade: g.grade }); updated++; }
    catch (e) { errors.push(String(e.message || e)); }
  });
  return { updated: updated, errors: errors.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 5) };
}

function announce_(req) {
  var body = { text: req.text, state: 'PUBLISHED' };
  if (req.studentIds && req.studentIds.length) {
    body.assigneeMode = 'INDIVIDUAL_STUDENTS';
    body.individualStudentsOptions = { studentIds: req.studentIds };
  } else {
    body.assigneeMode = 'ALL_STUDENTS';
  }
  var r = api_('/v1/courses/' + enc_(req.courseId) + '/announcements', 'post', body);
  return { id: r.id };
}

// ---------- Correo ----------

function mail_(messages) {
  messages = messages || [];
  var left = MailApp.getRemainingDailyQuota();
  if (messages.length > left) throw new Error('Cuota diaria insuficiente: quedan ' + left + ' envíos.');
  messages.forEach(function (m) {
    MailApp.sendEmail({ to: m.to, subject: m.subject, body: m.body, name: 'Cuaderno docente' });
  });
  return { sent: messages.length, remaining: MailApp.getRemainingDailyQuota() };
}

// ---------- Sincronización (db.json en tu Drive) ----------

var DB_NAME = 'cuaderno-docente-db.json';

function dbFile_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DBFILE');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) {} }
  var it = DriveApp.getFilesByName(DB_NAME);
  var f = it.hasNext() ? it.next() : DriveApp.createFile(DB_NAME, JSON.stringify({ version: 0, tables: {} }), MimeType.PLAIN_TEXT);
  props.setProperty('DBFILE', f.getId());
  return f;
}

// req.since: última versión vista por el cliente. req.push: { tabla: [registros] }.
// Gana el registro con updatedAt más reciente. Devuelve lo cambiado por otros desde `since`.
function sync_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var file = dbFile_();
    var raw = file.getBlob().getDataAsString();
    var db = raw.replace(/\s/g, '') === '' ? { version: 0, tables: {} } : JSON.parse(raw);
    if (!db.tables) db.tables = {};
    if (!db.version) db.version = 0;
    var since = Number(req.since) || 0, push = req.push || {}, accepted = {}, changed = false;
    var v = db.version + 1;
    Object.keys(push).forEach(function (t) {
      var tab = db.tables[t] = db.tables[t] || {};
      push[t].forEach(function (r) {
        var cur = tab[r.id];
        if (!cur || cur.updatedAt < r.updatedAt) { r._v = v; tab[r.id] = r; accepted[t + '|' + r.id] = 1; changed = true; }
      });
    });
    // Los borrados de hace más de 60 días ya han llegado a todos los dispositivos: se eliminan del archivo.
    var cutoff = Date.now() - 60 * 24 * 3600 * 1000;
    Object.keys(db.tables).forEach(function (t) {
      var tab = db.tables[t];
      Object.keys(tab).forEach(function (id) {
        if (tab[id].deleted && tab[id].updatedAt < cutoff && !accepted[t + '|' + id]) { delete tab[id]; changed = true; }
      });
    });
    if (changed) { db.version = v; file.setContent(JSON.stringify(db)); }
    var pull = {};
    Object.keys(db.tables).forEach(function (t) {
      var out = [], tab = db.tables[t];
      Object.keys(tab).forEach(function (id) { if (tab[id]._v > since && !accepted[t + '|' + id]) out.push(tab[id]); });
      if (out.length) pull[t] = out;
    });
    return { version: db.version, pull: pull };
  } finally {
    lock.releaseLock();
  }
}

function backup_() {
  var text = dbFile_().getBlob().getDataAsString();
  var fo = DriveApp.getFoldersByName('Cuaderno docente copias');
  var folder = fo.hasNext() ? fo.next() : DriveApp.createFolder('Cuaderno docente copias');
  var name = 'db-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd') + '.json';
  var ex = folder.getFilesByName(name);
  while (ex.hasNext()) ex.next().setTrashed(true);
  folder.createFile(name, text, MimeType.PLAIN_TEXT);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); files.push({ f: f, n: f.getName() }); }
  files.sort(function (a, b) { return a.n < b.n ? 1 : -1; });
  files.slice(30).forEach(function (x) { x.f.setTrashed(true); });
  return { name: name, kept: Math.min(files.length, 30) };
}

function copiaDiaria() { backup_(); }

// Ejecuta esta función UNA vez para programar la copia diaria (03:00).
function instalarCopiaDiaria() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'copiaDiaria') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('copiaDiaria').timeBased().everyDays(1).atHour(3).create();
}

// ---------- Utilidades ----------

// Ejecuta esta función UNA vez. Copia el token que aparece en el Registro de ejecución.
function generarToken() {
  var t = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('TOKEN', t.replace(/-/g, ''));
  Logger.log('TOKEN: ' + t.replace(/-/g, ''));
}

// Ejecuta esta función UNA vez tras pegar el manifiesto: pide los permisos de Classroom y correo.
function autorizar() {
  Logger.log(JSON.stringify(courses_()));
  Logger.log('Cuota de correo: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Archivo de datos: ' + dbFile_().getUrl());
  try { Logger.log('Avisos de Classroom por correo: ' + comments_(14).length); }
  catch (e) { Logger.log('Correo no disponible (los comentarios no se mostrarán): ' + e.message); }
}
