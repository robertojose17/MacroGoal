
# ⚡ Inicio Rápido - Arreglar Email Verification en iOS

## 🎯 Problema
El link del email muestra: `localhost:3000/#error=access_denied&error_code=otp_expired`

## ✅ Solución (5 minutos)

### Paso 1: Abrir Supabase
https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq

### Paso 2: Ir a Authentication → URL Configuration

### Paso 3: Configurar estas URLs

**Site URL:**
```
macrogoal://
```

**Redirect URLs** (agregar las 3):
```
macrogoal://auth/verify
exp://192.168.1.100:8081/--/auth/verify
exp://localhost:8081/--/auth/verify
```

⚠️ Reemplaza `192.168.1.100` con tu IP (aparece en la terminal de Expo)

### Paso 4: Guardar y Reiniciar

1. Clic en **Save** en Supabase
2. En la terminal: `Ctrl+C`
3. Luego: `npm run ios`

### Paso 5: Probar

1. Registra una cuenta nueva
2. Abre el email EN EL MISMO DISPOSITIVO
3. Toca el link → la app se abrirá automáticamente ✅

---

## 🔍 ¿Cómo saber si funciona?

**✅ Funciona si:**
- El link en el email empieza con `macrogoal://` (no `localhost`)
- Al tocar el link, la app se abre (no Safari)
- Ves "Verificando tu email..." en la app

**❌ No funciona si:**
- El link sigue siendo `localhost:3000`
- Safari se abre en vez de la app
- Ves error "otp_expired"

---

## 🆘 Si no funciona

1. Espera 2 minutos (los cambios tardan en propagarse)
2. Usa un email diferente (no reutilices el mismo)
3. Verifica que guardaste los cambios en Supabase
4. Reinicia la app completamente: `npx expo start -c`

---

## 📚 Más Información

- **Guía completa:** `CONFIGURACION_VERIFICACION_EMAIL.md`
- **Guía visual:** `GUIA_VISUAL_SUPABASE.md`
- **Resumen técnico:** `RESUMEN_CAMBIOS_EMAIL_VERIFICATION.md`

---

**¡Listo en 5 minutos!** 🚀
