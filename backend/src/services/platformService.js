// Dados da consola da plataforma. Ainda por implementar: cada função lança
// 501 e a rota devolve-o tal como está.
const { httpError } = require('./httpError');

const notImplemented = () => { throw httpError('Ainda não implementado.', 501); };

function getOverview() { return notImplemented(); }
function listOrganizations() { return notImplemented(); }
function getOrganization(_id) { return notImplemented(); }
// status: active | trial | suspended; notes: texto livre só da plataforma.
function updateOrganization(_id, { status: _status, notes: _notes } = {}) { return notImplemented(); }
function listIncidents() { return notImplemented(); }

module.exports = { getOverview, listOrganizations, getOrganization, updateOrganization, listIncidents };
