// Follows the same selected app locale used by Community dates/numbers.
export function progressMediaCopy(locale:string){return locale.toLowerCase().startsWith('es')?{
 pending:'Hay una publicación de fotos pendiente. Reintenta para completar el mismo intento. El contenido queda bloqueado para evitar duplicados; cerrar esta ventana no lo publica automáticamente.',
 retry:'Reintentar',
 failed:'No se pudo confirmar la publicación de las fotos. Puedes reintentar el mismo intento sin crear otra publicación.',
}:{
 pending:'A photo publication is pending. Retry to finish the same attempt. Content is locked to prevent duplicates; closing this window will not publish automatically.',
 retry:'Retry',
 failed:'Photo publication could not be confirmed. You can retry the same attempt without creating another post.',
};}
