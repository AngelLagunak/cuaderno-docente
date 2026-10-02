// Cuaderno docente · Apps Script · Fase 0 (ping)

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
      default:
        out = { ok: false, error: 'accion_desconocida' };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Ejecuta esta función UNA vez. Copia el token que aparece en el Registro de ejecución.
function generarToken() {
  var t = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('TOKEN', t.replace(/-/g, ''));
  Logger.log('TOKEN: ' + t.replace(/-/g, ''));
}
