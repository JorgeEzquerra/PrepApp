# PrepApp

PWA para crear y organizar tus rutinas de entrenamiento, pensada para
usarse instalada en la pantalla de inicio del iPhone.

Es una app estática (HTML + CSS + JS, sin frameworks ni paso de
build), con todos los datos guardados en el propio dispositivo
(`localStorage`) — no hay servidor ni backend.

## Estructura

```
index.html              punto de entrada
manifest.webmanifest     metadatos de instalación (nombre, iconos, tema)
sw.js                    service worker (funcionamiento offline)
css/style.css            estilos
js/app.js                lógica de la app (rutas, pantallas, datos)
icons/                   iconos de la app (192, 512, maskable, apple-touch-icon)
```

## Pantallas

1. **Inicio** — nombre "PrepApp" y dos botones: *Ver rutinas* (👁,
   lleva a Carpetas) y *Crear rutina* (+).
2. **Carpetas** — agrupan rutinas (por ejemplo, "Alta intensidad" con
   varias semanas dentro); es el único camino para llegar a cualquier
   rutina, no hay un listado plano con todas juntas. Se crean,
   renombran, duplican (con todas sus rutinas y ejercicios, como copia
   independiente) y eliminan —con su propia papelera de 7 días—. Las
   rutinas creadas antes de que existieran las carpetas se agrupan
   solas en una "Carpeta 1" la primera vez que se abre esta versión,
   para que no se pierda nada.
3. **Rutinas de una carpeta** — al tocar una carpeta, sus rutinas de
   arriba a abajo (o reordenadas arrastrándolas por su asa ☰), con su
   nombre como título; flecha atrás vuelve a Inicio, botón `+` añade
   una rutina directamente a esa carpeta y botón *Carpetas* para saltar
   a otra. Cada rutina se elimina arrastrándola hacia la izquierda
   (pide confirmación) y pasa a la **papelera** (botón 🗑 abajo a la
   derecha), donde se conserva 7 días —con opción de *Recuperar* o
   *Eliminar por completo*— antes de borrarse sola.
4. **Nueva/editar rutina** — nombre, selector de días de la semana
   (L M X J V S D) y, si no se creó ya dentro de una carpeta concreta,
   selector de en qué carpeta guardarla (con opción de crear una
   carpeta nueva ahí mismo).
5. **Detalle de rutina** — título con el nombre de la rutina; debajo,
   el nombre del día activo (LUNES, MARTES…) con un título opcional
   para ese día en concreto (p. ej. "Pecho y tríceps"), tocable para
   editarlo; tres botones (Calentamiento / Entrenamiento /
   Enfriamiento) y, al fondo, los días elegidos como *toggle*: el día
   activo determina qué contenido edita cada uno de los tres botones,
   y también de qué día es el título que se ve arriba.
6. **Editor de fase** — lista de ejercicios de esa fase para el día
   activo. Cada ejercicio se puede reordenar arrastrándolo por su asa
   (☰), se edita tocando su nombre (para no tener que borrarlo y
   volver a escribirlo si te equivocas) y solo se elimina manteniendo
   pulsada la papelera 1,2 segundos —con un anillo rojo que se va
   completando mientras se mantiene pulsada— (pide confirmación, para
   evitar borrados accidentales). Esta pantalla está pensada sobre
   todo para repasar la rutina: el formulario para añadir un ejercicio
   nuevo queda oculto tras un botón "+" pequeño, solo se despliega al
   tocarlo, y se cierra solo si se toca fuera de él.

   Al añadir un ejercicio, el campo de detalle cambia según el modo
   elegido abajo (*Sets/Reps* · *Crono* · *Otro*, marcado en naranja el
   activo; por defecto *Otro*, como texto libre de siempre):
   - **Sets/Reps** — dos números (máx. 2 cifras) junto a las palabras
     "Series" y "Reps".
   - **Crono** — tiempo de trabajo y de descanso (en segundos) y
     número de rondas. Un ejercicio así creado abre un temporizador
     con una doble pulsación sobre él (una sola pulsación lo sigue
     editando, como cualquier otro): cuenta atrás con la fase actual
     (TRABAJO/DESCANSO) y la ronda, campana al cambiar de fase y al
     terminar, y botón para detenerlo.
   - **Otro** — el campo de texto libre de siempre.

Además, manteniendo pulsado 1,5 s uno de los tres botones de fase en
el detalle de la rutina se abre un menú para copiar ese calentamiento
/ entrenamiento / enfriamiento a otro día, a todos los días de
entrenamiento de esa rutina, o vaciarlo — así no hace falta escribir
la misma rutina varias veces. Cualquier opción del menú pide una
segunda confirmación ("¿Seguro que quieres ejecutar este cambio?")
antes de aplicarse.

## Probarla en local

No requiere instalar nada más que un servidor estático (necesario
porque el service worker no se registra con `file://`):

```bash
cd prepapp
python3 -m http.server 8080
# abre http://localhost:8080 en el navegador
```

## Publicarla para poder instalarla en el iPhone

Un Service Worker y el "Añadir a pantalla de inicio" con icono propio
requieren HTTPS. La forma más rápida y gratuita es **GitHub Pages**:

```bash
cd prepapp
git init   # si aún no lo has hecho
git add .
git commit -m "PrepApp"
git branch -M main
git remote add origin <url-de-tu-repo-en-github>
git push -u origin main
```

Luego, en GitHub → *Settings → Pages*, selecciona la rama `main` y
carpeta raíz. En un par de minutos tendrás una URL tipo
`https://<usuario>.github.io/<repo>/`.

(Sirve igual de bien Netlify, Vercel o Cloudflare Pages: arrastrar la
carpeta o conectar el repo es suficiente, no hace falta build command.)

## Instalarla en el iPhone

1. Abre la URL publicada con **Safari** (tiene que ser Safari, no
   Chrome, para que aparezca la opción).
2. Toca el icono de compartir (el cuadrado con la flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.
4. Ábrela desde el icono nuevo: se abrirá a pantalla completa, sin
   barra de Safari, como una app nativa.

## Notas técnicas

- Los datos se guardan solo en el dispositivo (`localStorage`); no se
  sincronizan entre dispositivos ni se suben a ningún servidor.
- El service worker cachea la app shell para que abra también sin
  conexión una vez visitada la primera vez.
- Los tamaños de icono cubren los requisitos de iOS
  (`apple-touch-icon`) y del `manifest.webmanifest` estándar
  (192/512, incluida una versión *maskable*).
- La app está pensada para uso en vertical (`"orientation": "portrait"`
  en el manifest), aunque iOS Safari no permite forzar ese bloqueo
  desde una web instalada.
https://JorgeEzquerra.github.io/PrepApp/ jj new
jj new

