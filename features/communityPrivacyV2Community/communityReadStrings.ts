export function communityReadStrings(language: string) {
  const es = language.toLowerCase().startsWith('es');
  return {
    unavailable: es ? 'No disponible. Desliza para actualizar.' : 'Unavailable. Pull to refresh.',
    request: es ? 'Solicitar' : 'Request',
    pending: es ? 'Solicitado · Cancelar' : 'Requested · Cancel',
    following: es ? 'Siguiendo' : 'Following',
    checking: es ? 'Verificando…' : 'Checking…',
    retry: es ? 'Intentar de nuevo' : 'Try again',
    actionFailed: es ? 'No se pudo confirmar el cambio. Actualiza antes de intentarlo de nuevo.' : 'Could not confirm the change. Refresh before trying again.',
    blockTitle: es ? '¿Bloquear a esta persona?' : 'Block this person?',
    blockBody: es ? 'Se retirará el acceso entre ambas cuentas.' : 'Access between both accounts will be revoked.',
    cancel: es ? 'Cancelar' : 'Cancel',
    block: es ? 'Bloquear' : 'Block',
    blocked: es ? 'Persona bloqueada' : 'User blocked',
  };
}
