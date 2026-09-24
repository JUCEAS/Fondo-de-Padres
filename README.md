# Fondo de Graduación — app instalable

App para registrar aportaciones mensuales de padres de familia para el fondo de
graduación: totales por padre, gran total, reporte en PDF y resumen por
WhatsApp. Funciona en computadora y celular, sin necesidad de cuenta de
Claude, y sincroniza entre dispositivos con Firebase/Firestore (igual que
ApiCampo y Encantos).

## 1. Subir la app a GitHub Pages

1. Entrá a tu cuenta de GitHub (usuario **JUCEAS**).
2. Creá un repositorio nuevo, público, llamado por ejemplo `fondo-graduacion`.
3. Arrastrá **todos los archivos de esta carpeta** (no la carpeta en sí, los
   archivos que están adentro) a la página del repositorio en GitHub, igual
   que hiciste con ApiCampo y Encantos. Confirmá el "commit".
4. Andá a **Settings → Pages** del repositorio. En "Branch" elegí `main` y
   carpeta `/ (root)`. Guardá.
5. Esperá 1-2 minutos. Tu app va a quedar publicada en algo como:
   `https://juceas.github.io/fondo-graduacion/`

En este punto la app ya abre, pero todavía no guarda nada — falta conectar
la base de datos (siguiente paso).

## 2. Crear el proyecto de Firebase

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com)
   con tu cuenta `juceas19@gmail.com`.
2. Creá un proyecto nuevo (podés llamarlo "Fondo Graduación") — no hace
   falta que sea el mismo proyecto que usás para Encantos, mejor uno aparte
   para no mezclar los datos.
3. En el menú izquierdo, entrá a **Firestore Database** → "Crear base de
   datos" → modo **producción** → elegí una región cercana (por ejemplo
   `us-central`).
4. Andá a **Reglas** (dentro de Firestore), borrá lo que haya y pegá el
   contenido completo del archivo **`firestore.rules`** de esta carpeta.
   Tocá **Publicar**. Esas reglas hacen que solo los editores autorizados
   puedan modificar, y solo editores y supervisores autorizados puedan ver.
   En **Authentication → Método de acceso** activá **Google**, y en
   **Authentication → Configuración → Dominios autorizados** agregá
   `juceas.github.io`.

5. Andá al ícono de engranaje ⚙ → **Configuración del proyecto** → pestaña
   **Tus apps** → ícono `</>` (Web) → registrá una app (el nombre no
   importa, no marques Firebase Hosting). Te va a mostrar un bloque de
   código con `const firebaseConfig = { ... }`.
6. Copiá esos valores y pegalos en el archivo **`firebase-config.js`**
   (reemplazando los `PEGA_AQUI`). Guardá y volvé a subir ese archivo al
   repositorio de GitHub (podés arrastrar solo ese archivo, GitHub lo
   reemplaza).

## 3. Usarla en cada dispositivo

- **Editores** (los correos de la lista `EDITORES` en `app.js` y en
  `firestore.rules`): abrí el link, tocá **Entrar con Google** y elegí tu
  cuenta. La sesión queda guardada en ese dispositivo.
- **Supervisores (solo lectura):** un editor agrega su Gmail desde
  Ajustes (⚙) → "Supervisores". Luego esa persona abre el link y entra con
  ese Gmail: ve los mismos datos, pero no puede modificarlos.
- Cualquier otra cuenta, o alguien sin sesión, no ve ningún dato.
- Para agregar otro **editor** hay que sumar su correo en `app.js`
  (lista `EDITORES`) y en `firestore.rules`, y volver a publicar las reglas.

## 4. Instalarla como app (opcional pero recomendado)

- **Android (Chrome):** abrí el link → menú (⋮) → "Instalar app" o
  "Agregar a pantalla de inicio".
- **iPhone (Safari):** abrí el link → botón de compartir → "Agregar a
  pantalla de inicio".
- **Computadora (Chrome/Edge):** ícono de instalar en la barra de
  direcciones.

Una vez instalada, abre a pantalla completa con su propio ícono, y sigue
funcionando aunque no haya internet (los cambios se guardan localmente y
se sincronizan solos cuando vuelve la conexión).

## Archivos de esta carpeta

| Archivo | Qué hace |
|---|---|
| `index.html` | Página principal |
| `styles.css` | Diseño visual |
| `app.js` | Toda la lógica: tabla, totales, acceso con Google, PDF, WhatsApp, Firebase |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |
| `firebase-config.js` | Tu configuración de Firebase (la editás vos) |
| `manifest.json` | Hace que se pueda instalar como app |
| `service-worker.js` | Permite que funcione sin internet |
| `icon-192.png`, `icon-512.png` | Íconos de la app |
