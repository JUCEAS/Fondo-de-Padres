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
4. Andá a **Reglas** (dentro de Firestore) y pegá esto para que la app pueda
   leer y escribir:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /fondoGraduacion/{doc} {
         allow read, write: if true;
       }
     }
   }
   ```

   **Nota honesta:** esto deja la base de datos abierta a quien tenga la
   configuración del proyecto (que queda visible en el código de la app).
   No es un candado bancario — es el mismo nivel de seguridad que Encantos.
   Para este uso (un fondo de graduación de un grupo de padres) es
   razonable; si más adelante manejás algo más sensible, se puede agregar
   autenticación real.

5. Andá al ícono de engranaje ⚙ → **Configuración del proyecto** → pestaña
   **Tus apps** → ícono `</>` (Web) → registrá una app (el nombre no
   importa, no marques Firebase Hosting). Te va a mostrar un bloque de
   código con `const firebaseConfig = { ... }`.
6. Copiá esos valores y pegalos en el archivo **`firebase-config.js`**
   (reemplazando los `PEGA_AQUI`). Guardá y volvé a subir ese archivo al
   repositorio de GitHub (podés arrastrar solo ese archivo, GitHub lo
   reemplaza).

## 3. Usarla en cada dispositivo

- **Computadora y teléfono editor:** abrí el link de GitHub Pages. La
  primera vez, tocá "Desbloquear edición" e ingresá el PIN inicial
  `0000`. Una vez adentro, andá a Ajustes (⚙) y cambialo por uno propio.
- **Teléfono supervisor:** abrí el mismo link y no ingreses ningún PIN —
  se queda en modo "Solo lectura" automáticamente. Ve los mismos datos,
  pero no puede modificarlos.
- El "desbloqueo" queda guardado en cada dispositivo por separado
  (`localStorage`), así que no hay que volver a escribir el PIN cada vez
  que se abre la app en ese mismo teléfono o computadora.

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
| `app.js` | Toda la lógica: tabla, totales, PIN, PDF, WhatsApp, Firebase |
| `firebase-config.js` | Tu configuración de Firebase (la editás vos) |
| `manifest.json` | Hace que se pueda instalar como app |
| `service-worker.js` | Permite que funcione sin internet |
| `icon-192.png`, `icon-512.png` | Íconos de la app |
