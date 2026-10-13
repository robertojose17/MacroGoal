const en = {
  title: 'Blocked accounts', back: 'Back', loading: 'Loading blocked accounts…', empty: 'No blocked accounts.',
  explanation: 'Unblocking does not restore follows or requests. If this person has also blocked you, their block will remain.',
  unavailable: 'Sign in to manage your blocked accounts.', error: 'Couldn’t load blocked accounts.', retry: 'Retry',
  refresh: 'Refresh', more: 'Load more', unblock: 'Unblock', cancel: 'Cancel', confirm: 'Unblock this account?',
  saving: 'Unblocking…', success: 'Account unblocked.', uncertain: 'Couldn’t confirm the change. Check the refreshed list before trying again.',
  fallback: 'Account',
};
const es: typeof en = {
  title: 'Cuentas bloqueadas', back: 'Volver', loading: 'Cargando cuentas bloqueadas…', empty: 'No hay cuentas bloqueadas.',
  explanation: 'Desbloquear no restablece seguimientos ni solicitudes. Si esta persona también te bloqueó, su bloqueo se mantendrá.',
  unavailable: 'Inicia sesión para gestionar tus cuentas bloqueadas.', error: 'No se pudieron cargar las cuentas bloqueadas.', retry: 'Reintentar',
  refresh: 'Actualizar', more: 'Cargar más', unblock: 'Desbloquear', cancel: 'Cancelar', confirm: '¿Desbloquear esta cuenta?',
  saving: 'Desbloqueando…', success: 'Cuenta desbloqueada.', uncertain: 'No se pudo confirmar el cambio. Revisa la lista actualizada antes de intentarlo otra vez.',
  fallback: 'Cuenta',
};
export type BlockedStrings = typeof en;
export function blockedStrings(language: string): BlockedStrings { return language.toLowerCase().startsWith('es') ? es : en; }
