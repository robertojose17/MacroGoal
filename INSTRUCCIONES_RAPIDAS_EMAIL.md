
# ⚡ Instrucciones Rápidas - Verificación de Email iOS

## 🚨 Problema
El link del email de confirmación muestra:
```
localhost:3000/#error=access_denied&error_code=otp_expired
```

## ✅ Solución en 3 Pasos

### 1️⃣ Ir a Supabase Dashboard
https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq

### 2️⃣ Configurar URLs
**Authentication** → **URL Configuration**

**Site URL:**
```
macrogoal://
```

**Redirect URLs** (agregar estas 3):
```
macrogoal://auth/verify
exp://192.168.1.100:8081/--/auth/verify
exp://localhost:8081/--/auth/verify
```
*(Reemplaza `192.168.1.100` con tu IP local - aparece en la terminal de Expo)*

### 3️⃣ Guardar y Probar
1. Haz clic en **Save** en Supabase
2. Reinicia la app: `Ctrl+C` y luego `npm run ios`
3. Registra una cuenta nueva
4. Abre el email EN EL MISMO DISPOSITIVO
5. Toca el link → la app se abrirá automáticamente

---

## ✅ Checklist
- [ ] Site URL configurado: `macrogoal://`
- [ ] Redirect URLs agregadas (las 3)
- [ ] Cambios guardados en Supabase
- [ ] App reiniciada
- [ ] Probado con email nuevo

---

## 🆘 Si no funciona
1. Espera 2 minutos (los cambios tardan en propagarse)
2. Usa un email diferente (no reutilices el mismo)
3. Verifica que el link en el email empiece con `macrogoal://` (no `localhost`)

---

**Tiempo estimado:** 5 minutos
**Dificultad:** Fácil ⭐

Para más detalles, ver: `CONFIGURACION_VERIFICACION_EMAIL.md`
