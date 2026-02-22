
# 📸 Guía Visual - Configuración de Supabase para Email Verification

## 🎯 Objetivo
Configurar Supabase para que los links de confirmación de email funcionen en iOS.

---

## 📍 Paso 1: Acceder a Supabase Dashboard

1. Abre tu navegador
2. Ve a: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
3. Inicia sesión si es necesario

---

## 📍 Paso 2: Ir a Authentication Settings

1. En el menú lateral izquierdo, busca el icono de **llave** 🔑
2. Haz clic en **Authentication**
3. Verás un submenú, haz clic en **URL Configuration**

```
┌─────────────────────────────────────┐
│ 🏠 Home                             │
│ 📊 Table Editor                     │
│ 🔑 Authentication  ← AQUÍ           │
│    ├─ Users                         │
│    ├─ Policies                      │
│    └─ URL Configuration  ← Y AQUÍ  │
│ 🗄️  Database                        │
│ 📡 Edge Functions                   │
└─────────────────────────────────────┘
```

---

## 📍 Paso 3: Configurar Site URL

En la página **URL Configuration**, verás varios campos:

### Campo: Site URL
```
┌─────────────────────────────────────────────┐
│ Site URL                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ macrogoal://                            │ │ ← ESCRIBE ESTO
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Acción:** 
- Borra lo que esté ahí
- Escribe exactamente: `macrogoal://`
- **NO** agregues nada más (sin espacios, sin www, sin http)

---

## 📍 Paso 4: Configurar Redirect URLs

Desplázate hacia abajo hasta encontrar **Redirect URLs**:

```
┌─────────────────────────────────────────────┐
│ Redirect URLs                               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ macrogoal://auth/verify                 │ │ ← URL 1
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ exp://192.168.1.100:8081/--/auth/verify │ │ ← URL 2
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ exp://localhost:8081/--/auth/verify     │ │ ← URL 3
│ └─────────────────────────────────────────┘ │
│                                             │
│ [+ Add URL]                                 │
└─────────────────────────────────────────────┘
```

**Acción:**
1. Haz clic en **[+ Add URL]**
2. Pega la primera URL: `macrogoal://auth/verify`
3. Presiona Enter o haz clic fuera del campo
4. Repite para las otras 2 URLs

⚠️ **IMPORTANTE:** En la URL 2, reemplaza `192.168.1.100` con tu IP local real.

### ¿Cómo encontrar tu IP?

**Opción 1: En la terminal de Expo**
Cuando ejecutas `npm run ios`, verás algo como:
```
Metro waiting on exp://192.168.1.100:8081
                        ^^^^^^^^^^^^^^
                        ESTA ES TU IP
```

**Opción 2: Comando en terminal**
- **Mac/Linux:**
  ```bash
  ifconfig | grep "inet " | grep -v 127.0.0.1
  ```
  
- **Windows:**
  ```bash
  ipconfig
  ```
  Busca "Dirección IPv4"

---

## 📍 Paso 5: Guardar Cambios

1. Desplázate hasta el final de la página
2. Busca el botón **Save** (Guardar)
3. Haz clic en **Save**
4. Espera a que aparezca un mensaje de confirmación (generalmente un checkmark verde ✅)

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│                    [Save]  ← HAZ CLIC AQUÍ │
└─────────────────────────────────────────────┘
```

---

## 📍 Paso 6: Verificar la Configuración

Después de guardar, verifica que:

✅ **Site URL** muestra: `macrogoal://`

✅ **Redirect URLs** muestra las 3 URLs:
- `macrogoal://auth/verify`
- `exp://TU_IP:8081/--/auth/verify`
- `exp://localhost:8081/--/auth/verify`

Si todo está correcto, ¡ya terminaste la configuración de Supabase! 🎉

---

## 📍 Paso 7: Probar en la App

1. **Reinicia la app:**
   ```bash
   # En la terminal donde corre Expo:
   Ctrl + C  (para detener)
   npm run ios  (para reiniciar)
   ```

2. **Registra una cuenta nueva:**
   - Abre la app en tu iPhone/iPad
   - Toca "Create Account"
   - Llena el formulario con un email real
   - Toca "Sign Up"

3. **Verifica el email:**
   - Abre el email EN EL MISMO DISPOSITIVO (iPhone/iPad)
   - Toca el link de confirmación
   - La app debería abrirse automáticamente
   - Verás "Verificando tu email..."
   - Luego serás redirigido a completar tu perfil

---

## ✅ Señales de Éxito

**Cuando todo funciona correctamente:**

1. **En el email:** El link empieza con `macrogoal://` (NO con `localhost`)
2. **Al tocar el link:** La app se abre automáticamente (NO Safari)
3. **En la app:** Ves "Verificando tu email..." por 1-2 segundos
4. **Resultado:** Eres redirigido a completar tu perfil o al home

---

## ❌ Señales de Problema

**Si algo está mal:**

1. **El link sigue siendo `localhost:3000`:**
   - No guardaste los cambios en Supabase
   - Espera 2 minutos y prueba con un email nuevo

2. **Safari se abre en vez de la app:**
   - El URL scheme no está configurado correctamente
   - Verifica que `app.json` tenga `"scheme": "macrogoal"`
   - Reinicia la app completamente

3. **Error "otp_expired":**
   - El link expiró (válido por 24 horas)
   - Registra una cuenta nueva con un email diferente

---

## 🆘 Ayuda Adicional

Si después de seguir todos los pasos el problema persiste:

1. **Revisa los logs de la app:**
   - En la terminal donde corre Expo
   - Busca mensajes que empiecen con `[Verify]` o `[SignUp]`

2. **Revisa los logs de Supabase:**
   - Dashboard → Logs → Auth Logs
   - Busca errores relacionados con email verification

3. **Verifica la configuración:**
   - Vuelve a Authentication → URL Configuration
   - Confirma que las URLs estén guardadas correctamente

---

## 📋 Resumen de URLs

Para copiar y pegar fácilmente:

**Site URL:**
```
macrogoal://
```

**Redirect URL 1:**
```
macrogoal://auth/verify
```

**Redirect URL 2 (reemplaza la IP):**
```
exp://192.168.1.100:8081/--/auth/verify
```

**Redirect URL 3:**
```
exp://localhost:8081/--/auth/verify
```

---

**¡Listo!** 🎉 Con estos pasos, la verificación de email debería funcionar perfectamente en iOS.
