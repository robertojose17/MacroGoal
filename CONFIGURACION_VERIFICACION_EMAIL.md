
# 🔧 Configuración de Verificación de Email para iOS

## ❌ Problema
El enlace de confirmación de email usa `localhost:3000` que **NO funciona en dispositivos móviles iOS**.

Error que aparece:
```
localhost:3000/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
```

## ✅ Solución
Configurar **deep linking** para que el enlace de confirmación abra la app directamente en el teléfono.

---

## 📋 Pasos de Configuración en Supabase

### 🔑 PASO 1: Configurar Site URL

1. Ve a tu proyecto de Supabase: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
2. En el menú lateral, haz clic en **Authentication** (icono de llave)
3. Haz clic en **URL Configuration**
4. En el campo **Site URL**, ingresa:
   ```
   macrogoal://
   ```
5. Haz clic en **Save** (Guardar)

---

### 🔗 PASO 2: Configurar Redirect URLs

1. En la misma página (**URL Configuration**)
2. Desplázate hasta **Redirect URLs**
3. Agrega las siguientes URLs (haz clic en **Add URL** para cada una):

   **Para producción (iOS/Android):**
   ```
   macrogoal://auth/verify
   ```

   **Para desarrollo (Expo Go):**
   ```
   exp://192.168.1.100:8081/--/auth/verify
   exp://localhost:8081/--/auth/verify
   ```

   ⚠️ **IMPORTANTE:** Reemplaza `192.168.1.100` con tu IP local real.

   **¿Cómo encontrar tu IP local?**
   - **Mac/Linux:** Abre Terminal y ejecuta:
     ```bash
     ifconfig | grep "inet " | grep -v 127.0.0.1
     ```
   - **Windows:** Abre CMD y ejecuta:
     ```bash
     ipconfig
     ```
   - Busca tu dirección IP local (generalmente empieza con `192.168.x.x` o `10.0.x.x`)
   - También aparece en la terminal de Expo cuando ejecutas `npm run ios`

4. Haz clic en **Save** (Guardar)

---

### 📧 PASO 3: Verificar Email Templates (Opcional)

1. Ve a **Authentication** → **Email Templates**
2. Selecciona **Confirm signup**
3. Verifica que el template contenga la variable: `{{ .ConfirmationURL }}`
4. El template por defecto debería funcionar correctamente

---

## 🧪 Probar la Configuración

### 1. Reiniciar la App
```bash
# Detén el servidor Expo (Ctrl+C)
# Luego reinicia:
npm run ios
```

### 2. Registrar una Cuenta de Prueba
1. Abre la app en tu iPhone/iPad
2. Crea una nueva cuenta con un **email real** (que puedas revisar en el mismo dispositivo)
3. Verás un mensaje: "Verifica tu Email"

### 3. Verificar el Email
1. **Abre el email EN EL MISMO DISPOSITIVO** (iPhone/iPad)
2. Toca el enlace de confirmación
3. La app debería abrirse automáticamente
4. Verás "Verificando tu email..." y luego serás redirigido

---

## 🔄 Cómo Funciona el Flujo

```
1. Usuario se registra
   ↓
2. Supabase envía email con enlace
   ↓
3. Enlace usa formato: macrogoal://auth/verify?access_token=...
   ↓
4. iOS reconoce el esquema "macrogoal://" y abre la app
   ↓
5. La app captura los tokens del deep link
   ↓
6. La app establece la sesión automáticamente
   ↓
7. Usuario es redirigido a onboarding o home
```

---

## 🐛 Troubleshooting (Solución de Problemas)

### ❌ El enlace sigue usando localhost
**Causa:** Los cambios en Supabase no se han guardado o propagado.

**Solución:**
1. Verifica que hiciste clic en **Save** en Supabase Dashboard
2. Espera 1-2 minutos para que los cambios se propaguen
3. Intenta registrarte con un **email diferente** (no reutilices el mismo)
4. Si persiste, cierra sesión en Supabase Dashboard y vuelve a entrar

---

### ❌ La app no se abre al tocar el enlace
**Causa:** El URL scheme no está configurado correctamente.

**Solución:**
1. Verifica que `app.json` tenga: `"scheme": "macrogoal"` (sin espacios) ✅ YA ESTÁ CORREGIDO
2. Reinicia completamente la app Expo:
   ```bash
   # Detén el servidor (Ctrl+C)
   # Borra caché:
   npx expo start -c
   ```
3. En iOS, ve a **Configuración** → **General** → **Gestión de dispositivos** y confía en el perfil de desarrollo

---

### ❌ Error "otp_expired" o "Email link is invalid"
**Causa:** El enlace de confirmación ha expirado (válido por 24 horas).

**Solución:**
1. El enlace solo funciona una vez y expira después de 24 horas
2. Registra una nueva cuenta con un email diferente
3. O implementa la funcionalidad de "reenviar email de confirmación"

---

### ❌ El email no llega
**Causa:** Puede estar en spam o Supabase tiene límites de envío.

**Solución:**
1. Revisa la carpeta de **Spam/Correo no deseado**
2. Verifica en Supabase Dashboard → **Authentication** → **Users** que el usuario se creó
3. Si el usuario aparece pero sin confirmar, el email se envió pero no llegó
4. Intenta con otro proveedor de email (Gmail, Outlook, etc.)

---

## 📚 URLs de Referencia

- **Dashboard de Supabase:** https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
- **Documentación de Deep Linking (Expo):** https://docs.expo.dev/guides/linking/
- **Documentación de Supabase Auth:** https://supabase.com/docs/guides/auth
- **Configuración de Email en Supabase:** https://supabase.com/docs/guides/auth/auth-email

---

## ✅ Checklist Final

Antes de probar, verifica que:

- [x] `app.json` tiene `"scheme": "macrogoal"` (sin espacios) - **✅ YA CORREGIDO**
- [ ] Supabase Site URL es `macrogoal://`
- [ ] Supabase Redirect URLs incluye `macrogoal://auth/verify`
- [ ] Supabase Redirect URLs incluye `exp://TU_IP:8081/--/auth/verify`
- [ ] Reiniciaste la app Expo completamente
- [ ] Usas un email real que puedes revisar en el mismo dispositivo
- [ ] Abres el email EN EL MISMO DISPOSITIVO donde está la app

---

## 🆘 ¿Necesitas Ayuda?

Si después de seguir estos pasos el problema persiste:

1. Revisa los logs de la app en la terminal donde corre Expo
2. Busca mensajes que empiecen con `[Verify]` o `[SignUp]`
3. Comparte esos logs para diagnóstico adicional

---

## 🎯 Resumen Rápido

**LO QUE YA ESTÁ HECHO:**
- ✅ Código de la app actualizado para usar deep links
- ✅ URL scheme corregido en `app.json` (ahora es `macrogoal` sin espacios)
- ✅ Pantalla de verificación (`app/auth/verify.tsx`) implementada
- ✅ Mensajes en español en la app

**LO QUE DEBES HACER TÚ:**
1. Ir a Supabase Dashboard
2. Configurar Site URL: `macrogoal://`
3. Agregar Redirect URLs:
   - `macrogoal://auth/verify`
   - `exp://TU_IP:8081/--/auth/verify`
4. Guardar cambios
5. Reiniciar la app
6. Probar con un nuevo registro

**TIEMPO ESTIMADO:** 5 minutos
