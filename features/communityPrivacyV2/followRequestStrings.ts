export interface FollowRequestStrings {
  title: string;
  bell: string;
  bellCount: (count: number) => string;
  bellUnknown: string;
  close: string;
  explanation: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  listError: string;
  itemError: string;
  retry: string;
  refresh: string;
  more: string;
  accept: string;
  reject: string;
  accepting: string;
  rejecting: string;
  requesterFallback: string;
  acceptFor: (name: string) => string;
  rejectFor: (name: string) => string;
  accepted: string;
  rejected: string;
}
const en: FollowRequestStrings = {
  title: 'Follow requests', bell: 'Follow requests',
  bellCount: count => `${count} pending follow ${count === 1 ? 'request' : 'requests'}`,
  bellUnknown: 'Open to check pending follow requests', close: 'Close follow requests',
  explanation: 'Accepting lets this person view your profile and stats. Your approval does not give you access to theirs.',
  loading: 'Loading follow requests…', emptyTitle: 'No pending requests',
  emptyBody: 'New follow requests will appear here.', listError: 'Couldn’t load follow requests.',
  itemError: 'Couldn’t confirm this change. Refresh to check the request’s status.',
  retry: 'Retry', refresh: 'Refresh requests', more: 'Load more requests',
  accept: 'Accept', reject: 'Reject', accepting: 'Accepting…', rejecting: 'Rejecting…',
  requesterFallback: 'User', acceptFor: name => `Accept follow request from ${name}`,
  rejectFor: name => `Reject follow request from ${name}`,
  accepted: 'Follow request accepted.', rejected: 'Follow request rejected.',
};
const es: FollowRequestStrings = {
  title: 'Solicitudes de seguimiento', bell: 'Solicitudes de seguimiento',
  bellCount: count => `${count} ${count === 1 ? 'solicitud de seguimiento pendiente' : 'solicitudes de seguimiento pendientes'}`,
  bellUnknown: 'Abre para consultar las solicitudes pendientes', close: 'Cerrar solicitudes de seguimiento',
  explanation: 'Al aceptar, esta persona podrá ver tu perfil y tus estadísticas. Tu aprobación no te da acceso a los suyos.',
  loading: 'Cargando solicitudes…', emptyTitle: 'No hay solicitudes pendientes',
  emptyBody: 'Las nuevas solicitudes aparecerán aquí.', listError: 'No se pudieron cargar las solicitudes.',
  itemError: 'No se pudo confirmar el cambio. Actualiza para consultar el estado de la solicitud.',
  retry: 'Reintentar', refresh: 'Actualizar solicitudes', more: 'Cargar más solicitudes',
  accept: 'Aceptar', reject: 'Rechazar', accepting: 'Aceptando…', rejecting: 'Rechazando…',
  requesterFallback: 'Usuario', acceptFor: name => `Aceptar la solicitud de seguimiento de ${name}`,
  rejectFor: name => `Rechazar la solicitud de seguimiento de ${name}`,
  accepted: 'Solicitud de seguimiento aceptada.', rejected: 'Solicitud de seguimiento rechazada.',
};
/** The app uses useTranslation; pass i18n.resolvedLanguage or inject translated strings. */
export function getFollowRequestStrings(language: string): FollowRequestStrings {
  return language.toLowerCase().startsWith('es') ? es : en;
}
