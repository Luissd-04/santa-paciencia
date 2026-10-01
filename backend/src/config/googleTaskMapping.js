const { EVENT_TYPE_LABELS } = require('./eventTypes');

// Base partilhada + chaves legacy próprias das operational_events
const TASK_TYPE_LABELS = {
  ...EVENT_TYPE_LABELS,
  check_in:  'Check-in',
  check_out: 'Check-out',
  outro:     'Tarefa',
};

function taskPayload(ev) {
  const typeLabel = TASK_TYPE_LABELS[ev.type] || ev.type;
  const title = ev.accommodation_name
    ? `[${ev.accommodation_name}] ${ev.title || typeLabel}`
    : (ev.title || typeLabel);
  const metadata = [
    `Evento da aplicação: ${ev.id}`,
    ev.responsible ? `Responsável: ${ev.responsible}` : '',
    ev.start_time ? `Hora: ${ev.start_time}${ev.end_time ? '–' + ev.end_time : ''}` : '',
    ev.important ? 'Importante' : '',
  ].filter(Boolean).join('\n');
  const footer = `--- Santa Paciência ---\n${metadata}`;
  const notes = [(ev.notes || '').slice(0, Math.max(0, 8192 - footer.length - 2)), footer].filter(Boolean).join('\n\n');
  return {
    title: title.slice(0, 1024), notes: notes.slice(0, 8192),
    due: new Date(ev.date + 'T00:00:00Z').toISOString(),
    status: ev.status === 'concluido' ? 'completed' : 'needsAction',
    completed: ev.status === 'concluido' ? (ev.completed_at || undefined) : null,
  };
}

function remotePayload(task) {
  return {
    title: task.title || '', notes: task.notes || '', due: (task.due || '').slice(0, 10),
    status: task.status || 'needsAction',
  };
}

module.exports = { taskPayload, remotePayload };
