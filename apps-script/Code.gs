// Cuaderno docente · Apps Script · ping, Classroom (lectura), correo y tablón

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
}
