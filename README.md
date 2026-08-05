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

1. **Inicio** — nombre "PrepApp" y dos botones: *Ver rutinas* (👁) y
   *Crear rutina* (+).
2. **Rutinas** — lista de las rutinas creadas; flecha atrás arriba a
   la izquierda; botón `+` para crear una nueva.
3. **Nueva/editar rutina** — nombre y selector de días de la semana
   (L M X J V S D).
4. **Detalle de rutina** — título con el nombre de la rutina, tres
   botones (Calentamiento / Entrenamiento / Enfriamiento) y, al fondo,
   los días elegidos como *toggle*: el día activo determina qué
   contenido edita cada uno de los tres botones.
5. **Editor de fase** — lista de ejercicios de esa fase para el día
   activo, con alta/baja y marcado de "hecho".

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
