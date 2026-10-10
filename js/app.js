/* ============================================================
   PrepApp — lógica de la aplicación
   SPA sencilla con enrutado por hash, persistencia en
   localStorage y renderizado manual (sin dependencias).
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Almacenamiento ---------------- */

  const STORAGE_KEY = "prepapp_routines_v1";

  const DAYS = [
    { key: "L", name: "Lunes" },
    { key: "M", name: "Martes" },
    { key: "X", name: "Miércoles" },
    { key: "J", name: "Jueves" },
    { key: "V", name: "Viernes" },
    { key: "S", name: "Sábado" },
    { key: "D", name: "Domingo" },
  ];

  const PHASES = [
    { key: "calentamiento", label: "Calentamiento", cls: "warmup", icon: "flame" },
    { key: "entrenamiento", label: "Entrenamiento", cls: "training", icon: "dumbbell" },
    { key: "enfriamiento", label: "Enfriamiento", cls: "cooldown", icon: "snow" },
  ];

  function loadRoutines() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("No se pudo leer el almacenamiento", e);
      return [];
    }
  }

  function saveRoutines(routines) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  }

  let routines = loadRoutines();

  function persist() {
    saveRoutines(routines);
  }

  // Papelera: una rutina eliminada se conserva 7 días (por si fue un error)
  // antes de borrarse por completo en automático.
  const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function purgeExpiredTrash() {
    const before = routines.length;
    routines = routines.filter((r) => !(r.deletedAt && Date.now() - r.deletedAt > TRASH_TTL_MS));
    return routines.length !== before;
  }

  if (purgeExpiredTrash()) persist();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getRoutine(id) {
    return routines.find((r) => r.id === id);
  }

  function emptyPhases() {
    const p = {};
    PHASES.forEach((ph) => (p[ph.key] = {}));
    return p;
  }

  function ensureDayBucket(routine, phaseKey, dayKey) {
    if (!routine.phases[phaseKey]) routine.phases[phaseKey] = {};
    if (!routine.phases[phaseKey][dayKey]) routine.phases[phaseKey][dayKey] = [];
    return routine.phases[phaseKey][dayKey];
  }

  function todayKey() {
    // getDay(): 0=domingo..6=sábado -> convertimos a índice L..D
    const idx = (new Date().getDay() + 6) % 7;
    return DAYS[idx].key;
  }

  /* ---------------- Almacenamiento: carpetas ---------------- */

  const FOLDERS_KEY = "prepapp_folders_v1";
  const FOLDER_SEQ_KEY = "prepapp_folder_seq_v1";

  function loadFolders() {
    try {
      const raw = localStorage.getItem(FOLDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("No se pudo leer las carpetas", e);
      return [];
    }
  }

  function saveFolders(list) {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
  }

  let folders = loadFolders();

  // Última carpeta en la que estuvo el usuario (para que "Ver rutinas"
  // desde Inicio vuelva ahí directo). Vive solo en memoria a propósito:
  // se olvida al pasar por el listado de Carpetas sin entrar en ninguna
  // concreta, y también al cerrar/reabrir la app.
  let lastFolderId = null;

  function persistFolders() {
    saveFolders(folders);
  }

  // Papelera de carpetas: mismo funcionamiento que la de rutinas (7 días).
  function purgeExpiredFolderTrash() {
    const before = folders.length;
    folders = folders.filter((f) => !(f.deletedAt && Date.now() - f.deletedAt > TRASH_TTL_MS));
    return folders.length !== before;
  }

  if (purgeExpiredFolderTrash()) persistFolders();

  function getFolder(id) {
    return folders.find((f) => f.id === id);
  }

  // Sugerencia de nombre para la próxima carpeta ("Carpeta N"), sin
  // consumir aún el contador (solo se consume al crearla de verdad).
  function peekNextFolderNumber() {
    return parseInt(localStorage.getItem(FOLDER_SEQ_KEY) || "0", 10) + 1;
  }

  function bumpFolderSeq() {
    const n = peekNextFolderNumber();
    localStorage.setItem(FOLDER_SEQ_KEY, String(n));
    return n;
  }

  // Carpeta "Carpeta 1": la crea la migración de rutinas antiguas, y
  // también sirve de destino automático para quien crea su primerísima
  // rutina y todavía no tiene ninguna carpeta.
  function ensureDefaultFolder() {
    let f = folders.find((x) => x.name === "Carpeta 1");
    if (!f) {
      f = { id: uid(), name: "Carpeta 1" };
      folders.push(f);
      if (parseInt(localStorage.getItem(FOLDER_SEQ_KEY) || "0", 10) < 1) {
        localStorage.setItem(FOLDER_SEQ_KEY, "1");
      }
      persistFolders();
    }
    return f;
  }

  // Migración: las rutinas creadas antes de que existieran las carpetas no
  // tienen "folderId". La primera vez que se detectan, se agrupan todas en
  // una carpeta nueva llamada "Carpeta 1" para que no se pierda nada.
  function migrateRoutinesIntoFolders() {
    const orphaned = routines.filter((r) => !r.folderId);
    if (orphaned.length === 0) return false;
    const defaultFolder = ensureDefaultFolder();
    orphaned.forEach((r) => {
      r.folderId = defaultFolder.id;
    });
    persistFolders();
    return true;
  }

  if (migrateRoutinesIntoFolders()) persist();

  // Una rutina solo es visible si ni ella ni su carpeta están en la
  // papelera (son dos papeleras independientes: recuperar la carpeta no
  // resucita una rutina que además se borró a mano, y viceversa).
  function isRoutineVisible(r) {
    if (r.deletedAt) return false;
    const folder = getFolder(r.folderId);
    return !!folder && !folder.deletedAt;
  }

  // Copia un ejercicio con un id nuevo, conservando los campos que le
  // correspondan según su modo (Sets/Reps, Crono u Otro).
  function cloneExercise(ex) {
    const mode = ex.mode || "other";
    const clone = { id: uid(), name: ex.name, mode };
    if (mode === "sets") {
      clone.series = ex.series;
      clone.reps = ex.reps;
    } else if (mode === "crono") {
      clone.work = ex.work;
      clone.rest = ex.rest;
      clone.rounds = ex.rounds;
    } else {
      clone.detail = ex.detail;
    }
    return clone;
  }

  function deepCloneRoutine(routine, folderId) {
    const clone = {
      id: uid(),
      folderId,
      name: routine.name,
      days: [...routine.days],
      activeDay: routine.activeDay,
      phases: {},
    };
    PHASES.forEach((ph) => {
      clone.phases[ph.key] = {};
      const src = (routine.phases && routine.phases[ph.key]) || {};
      Object.keys(src).forEach((dayKey) => {
        clone.phases[ph.key][dayKey] = (src[dayKey] || []).map(cloneExercise);
      });
    });
    return clone;
  }

  // Duplica una carpeta entera: la carpeta y todas sus rutinas (con sus
  // ejercicios) quedan copiadas de forma independiente.
  function duplicateFolder(folder) {
    const newFolder = { id: uid(), name: `${folder.name} (copia)` };
    folders.push(newFolder);
    routines
      .filter((r) => r.folderId === folder.id && !r.deletedAt)
      .forEach((r) => routines.push(deepCloneRoutine(r, newFolder.id)));
    persistFolders();
    persist();
    return newFolder;
  }

  /* ---------------- Ejercicios: Sets/Reps, Crono u Otro ---------------- */

  // Texto que se muestra bajo el nombre del ejercicio en la lista,
  // según su modo.
  function exerciseSummary(ex) {
    const mode = ex.mode || "other";
    if (mode === "sets") {
      const parts = [];
      if (ex.series) parts.push(`${ex.series} series`);
      if (ex.reps) parts.push(`${ex.reps} reps`);
      return parts.join(" · ");
    }
    if (mode === "crono") {
      const parts = [];
      if (ex.work) parts.push(`${ex.work}s trabajo`);
      if (ex.rest) parts.push(`${ex.rest}s descanso`);
      if (ex.rounds) parts.push(`×${ex.rounds}`);
      return parts.join(" · ");
    }
    return ex.detail || "";
  }

  // Los tres bloques (Otro / Sets-Reps / Crono) que sustituyen al campo de
  // texto libre, según el modo elegido. Se usa tanto al crear un ejercicio
  // como al editar uno ya existente (con o sin el selector de modo).
  function detailModesHtml() {
    return `
      <div class="detail-modes" data-mode="other">
        <input type="text" class="field-detail" maxlength="60" autocomplete="off" placeholder="Series x reps, notas… (opcional)" />
        <div class="detail-sets">
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="field-series" placeholder="0" />
          <span>Series</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="field-reps" placeholder="0" />
          <span>Reps</span>
        </div>
        <div class="detail-crono">
          <label>Trabajo (s)<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" class="field-work" placeholder="30" /></label>
          <label>Descanso (s)<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" class="field-rest" placeholder="15" /></label>
          <label>Rondas<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="field-rounds" placeholder="8" /></label>
        </div>
      </div>`;
  }

  function restrictToDigits(input) {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "");
    });
  }

  function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // Un único AudioContext compartido, reutilizado para cada campana (crear
  // uno nuevo cada vez no hace falta y en iOS solo se "desbloquea" con un
  // gesto real del usuario, que es cuando se llama a esto desde "Iniciar").
  let sharedAudioCtx = null;
  function ensureAudioCtx() {
    try {
      if (!sharedAudioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        sharedAudioCtx = new AC();
      }
      if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
      return sharedAudioCtx;
    } catch (e) {
      return null;
    }
  }

  // Campana sencilla generada por código (sin archivos de audio): un tono
  // que entra y se apaga rápido, suficiente para avisar de un cambio de
  // fase aunque no se esté mirando el móvil.
  function playBell() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  // Modal del cronómetro de un ejercicio en modo Crono: alterna trabajo y
  // descanso durante las rondas programadas, con campana en cada cambio.
  function openCronoTimer(ex) {
    const work = Math.max(0, parseInt(ex.work, 10) || 0);
    const rest = Math.max(0, parseInt(ex.rest, 10) || 0);
    const rounds = Math.max(1, parseInt(ex.rounds, 10) || 1);
    const hasTime = work > 0 || rest > 0;

    const overlay = h(`<div class="sheet-overlay">
      <div class="sheet timer-sheet">
        <div class="timer-exercise-name">${esc(ex.name)}</div>
        <div class="timer-phase" id="timer-phase">LISTO</div>
        <div class="timer-countdown" id="timer-countdown">${formatMMSS(work || rest)}</div>
        <div class="timer-round" id="timer-round">Ronda 1 de ${rounds}</div>
        <div class="confirm-actions">
          <button class="run-btn" id="timer-start"${hasTime ? "" : " disabled"}>Iniciar</button>
          <button class="delete-btn hidden" id="timer-stop">Detener</button>
        </div>
        <button class="sheet-cancel" id="timer-close">Cerrar</button>
      </div>
    </div>`);

    const phaseEl = overlay.querySelector("#timer-phase");
    const countdownEl = overlay.querySelector("#timer-countdown");
    const roundEl = overlay.querySelector("#timer-round");
    const startBtn = overlay.querySelector("#timer-start");
    const stopBtn = overlay.querySelector("#timer-stop");

    let intervalId = null;
    let state = null; // { phase: "work" | "rest", remaining, round }

    function render() {
      const phase = state ? state.phase : null; // "LISTO" hasta que se pulse Iniciar
      phaseEl.textContent = phase === "work" ? "TRABAJO" : phase === "rest" ? "DESCANSO" : "LISTO";
      phaseEl.classList.toggle("work", phase === "work");
      phaseEl.classList.toggle("rest", phase === "rest");
      countdownEl.textContent = formatMMSS(state ? state.remaining : work || rest);
      roundEl.textContent = `Ronda ${state ? state.round : 1} de ${rounds}`;
    }

    function finish() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      state = null;
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      phaseEl.textContent = "COMPLETADO";
      phaseEl.classList.remove("work", "rest");
      countdownEl.textContent = "00:00";
      roundEl.textContent = `Ronda ${rounds} de ${rounds}`;
    }

    function advanceRound() {
      if (state.round >= rounds) {
        finish();
        return;
      }
      state.round += 1;
      state.phase = "work";
      state.remaining = work;
      render();
    }

    function nextPhase() {
      playBell();
      if (state.phase === "work" && rest > 0) {
        state.phase = "rest";
        state.remaining = rest;
        render();
        return;
      }
      advanceRound();
    }

    function tick() {
      state.remaining -= 1;
      if (state.remaining <= 0) {
        nextPhase();
      } else {
        render();
      }
    }

    function start() {
      if (!hasTime) return;
      ensureAudioCtx(); // desbloquea el audio con este gesto del usuario
      state = { phase: work > 0 ? "work" : "rest", remaining: work > 0 ? work : rest, round: 1 };
      render();
      intervalId = setInterval(tick, 1000);
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
    }

    function stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      state = null;
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      render();
    }

    function close() {
      stop();
      overlay.remove();
    }

    startBtn.addEventListener("click", start);
    stopBtn.addEventListener("click", stop);
    overlay.querySelector("#timer-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    render();
    document.body.appendChild(overlay);
  }

  /* ---------------- Iconos SVG ---------------- */

  const ICONS = {
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s-2 4.5-2 7a4 4 0 1 0 8 0c0-1-.5-2-1-3 0 1.5-1 2-1 2 .3-2.5-1-4-2-5.5-.3 2-1 3-2 4.5-1 1.5-2 2.7-2 4.5a4 4 0 0 0 4 4"/></svg>`,
    dumbbell: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 3 10l4 4M17.5 17.5 21 14l-4-4M9 15l6-6M4 9l2-2 4 4M18 13l2 2-4 4"/></svg>`,
    snow: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M2 12h20"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
    pencil: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6M9 16h4"/></svg>`,
    grip: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    timer: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/></svg>`,
  };

  function icon(name) {
    return ICONS[name] || "";
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  /* ---------------- Enrutado ---------------- */

  const app = document.getElementById("app");

  function navigate(hash) {
    if (location.hash === hash) {
      render();
    } else {
      location.hash = hash;
    }
  }

  function parseRoute() {
    const h = location.hash.replace(/^#/, "") || "/";
    const parts = h.split("/").filter(Boolean);
    // [] -> home
    if (parts.length === 0) return { name: "home" };
    if (parts[0] === "trash") return { name: "trash" };
    if (parts[0] === "routine" && parts[1] === "new") return { name: "routine-form", presetFolderId: parts[2] || null };
    if (parts[0] === "routine" && parts[2] === "edit") return { name: "routine-form", id: parts[1] };
    if (parts[0] === "routine" && parts.length === 2) return { name: "routine-detail", id: parts[1] };
    if (parts[0] === "routine" && parts.length === 3) return { name: "phase-editor", id: parts[1], phase: parts[2] };
    if (parts[0] === "folders" && parts.length === 1) return { name: "folders" };
    if (parts[0] === "folders" && parts[1] === "new") return { name: "folder-form" };
    if (parts[0] === "folders" && parts[1] === "trash") return { name: "folders-trash" };
    if (parts[0] === "folders" && parts[2] === "edit") return { name: "folder-form", id: parts[1] };
    if (parts[0] === "folders" && parts.length === 2) return { name: "folder-routines", id: parts[1] };
    return { name: "home" };
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", () => {
    render();
    registerServiceWorker();
  });

  function render() {
    const route = parseRoute();
    app.innerHTML = "";

    switch (route.name) {
      case "home":
        app.appendChild(screenHome());
        break;
      case "trash":
        app.appendChild(screenTrash());
        break;
      case "routine-form":
        app.appendChild(screenRoutineForm(route.id, route.presetFolderId));
        break;
      case "routine-detail":
        app.appendChild(screenRoutineDetail(route.id));
        break;
      case "phase-editor":
        app.appendChild(screenPhaseEditor(route.id, route.phase));
        break;
      case "folders":
        app.appendChild(screenFoldersList());
        break;
      case "folder-form":
        app.appendChild(screenFolderForm(route.id));
        break;
      case "folders-trash":
        app.appendChild(screenFoldersTrash());
        break;
      case "folder-routines":
        app.appendChild(screenRoutinesList(route.id));
        break;
      default:
        app.appendChild(screenHome());
    }
  }

  /* ---------------- Helpers de construcción DOM ---------------- */

  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // Reordenar por arrastre (Pointer Events) el hijo directo de `list` cuyo
  // asa ".grip-btn" se pulsa. Al soltar, reordena el array `items` para que
  // coincida con el nuevo orden visual y llama a `onCommit`.
  function attachDragReorder(list, items, onCommit) {
    Array.from(list.children).forEach((row) => {
      const grip = row.querySelector(".grip-btn");
      if (!grip) return;
      grip.addEventListener("pointerdown", (e) => startDrag(e, row));
    });

    function startDrag(e, row) {
      if (row.classList.contains("confirming")) return;
      e.preventDefault();
      e.stopPropagation(); // no confundir con el arrastre horizontal (swipe-to-delete) del row-main
      const pointerId = e.pointerId;
      row.setPointerCapture(pointerId);
      row.classList.add("dragging");

      let lastY = e.clientY;
      let translate = 0;

      function checkSwap() {
        const rowRect = row.getBoundingClientRect();
        const rowCenter = rowRect.top + rowRect.height / 2;
        const beforeNaturalTop = rowRect.top - translate;
        const siblings = Array.from(list.children).filter((r) => r !== row);
        for (const sib of siblings) {
          const sibRect = sib.getBoundingClientRect();
          const sibCenter = sibRect.top + sibRect.height / 2;
          const rowIndex = Array.prototype.indexOf.call(list.children, row);
          const sibIndex = Array.prototype.indexOf.call(list.children, sib);
          if (rowIndex < sibIndex && rowCenter > sibCenter) {
            list.insertBefore(row, sib.nextSibling);
          } else if (rowIndex > sibIndex && rowCenter < sibCenter) {
            list.insertBefore(row, sib);
          } else {
            continue;
          }
          row.style.transform = "none";
          const newNaturalTop = row.getBoundingClientRect().top;
          translate += beforeNaturalTop - newNaturalTop;
          row.style.transform = `translateY(${translate}px)`;
          break;
        }
      }

      function onMove(ev) {
        const delta = ev.clientY - lastY;
        lastY = ev.clientY;
        translate += delta;
        row.style.transform = `translateY(${translate}px)`;
        checkSwap();
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        row.classList.remove("dragging");
        row.style.transform = "";
        const newOrderIds = Array.from(list.children).map((r) => r.dataset.id);
        items.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
        onCommit();
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    }
  }

  // Arrastrar `row.row-main` hacia la izquierda; al superar el umbral,
  // añade la clase "confirming" al row (que revela su .row-confirm).
  // Los gestos verticales se ignoran para no romper el scroll de la lista.
  function attachSwipeLeftToConfirm(row) {
    const rowMain = row.querySelector(".row-main");
    const THRESHOLD = -70;
    const MAX_DRAG = -100;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let deciding = false;
    let isHorizontal = false;
    let pointerId = null;

    rowMain.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      deciding = true;
      isHorizontal = false;
      pointerId = e.pointerId;
    });

    rowMain.addEventListener("pointermove", (e) => {
      if (pointerId !== e.pointerId) return;
      const curDx = e.clientX - startX;
      const curDy = e.clientY - startY;

      if (deciding) {
        if (Math.abs(curDx) > 8 || Math.abs(curDy) > 8) {
          deciding = false;
          if (Math.abs(curDx) > Math.abs(curDy)) {
            isHorizontal = true;
            rowMain.setPointerCapture(pointerId);
            rowMain.classList.add("swiping");
          }
        }
      }

      if (isHorizontal) {
        e.preventDefault();
        dx = Math.max(MAX_DRAG, Math.min(0, curDx));
        rowMain.style.transform = `translateX(${dx}px)`;
      }
    });

    function endSwipe(e) {
      if (pointerId !== e.pointerId) return;
      rowMain.classList.remove("swiping");
      rowMain.style.transform = "";
      if (isHorizontal && dx <= THRESHOLD) {
        row.classList.add("confirming");
      }
      deciding = false;
      isHorizontal = false;
      pointerId = null;
    }

    rowMain.addEventListener("pointerup", endSwipe);
    rowMain.addEventListener("pointercancel", endSwipe);
  }

  function topbar({ title = "", showBack = false, onBack = null, right = "" } = {}) {
    const bar = h(`<div class="topbar">
      ${showBack ? `<button class="back-btn" aria-label="Volver">${icon("arrowLeft")}</button>` : ""}
      <div class="topbar-title">${esc(title)}</div>
      <div class="spacer"></div>
      ${right}
    </div>`);
    if (showBack) {
      bar.querySelector(".back-btn").addEventListener("click", onBack);
    }
    return bar;
  }

  /* ---------------- Pantalla: Home ---------------- */

  function screenHome() {
    const screen = h(`<div class="screen home">
      <div class="home-content">
        <div class="brand">
          <p class="brand-title">PrepApp</p>
          <p class="brand-sub">Tus entrenos</p>
        </div>
        <div class="home-actions">
          <button class="big-btn primary" id="btn-ver">
            <span class="ico">${icon("eye")}</span>
            <span>Ver rutinas</span>
            <span class="chev">${icon("chevronRight")}</span>
          </button>
          <button class="big-btn secondary" id="btn-crear">
            <span class="ico">${icon("plus")}</span>
            <span>Crear rutina</span>
            <span class="chev">${icon("chevronRight")}</span>
          </button>
        </div>
      </div>
    </div>`);

    screen.querySelector("#btn-ver").addEventListener("click", () => {
      // Si la última carpeta en la que estuvo el usuario sigue existiendo,
      // "Ver rutinas" vuelve directo ahí; si no, al listado de Carpetas.
      const folder = lastFolderId ? getFolder(lastFolderId) : null;
      navigate(folder && !folder.deletedAt ? `#/folders/${folder.id}` : "#/folders");
    });
    screen.querySelector("#btn-crear").addEventListener("click", () => navigate("#/routine/new"));
    return screen;
  }

  /* ---------------- Pantalla: Rutinas de una carpeta ---------------- */

  // Ya no existe un listado plano con todas las rutinas de todas las
  // carpetas juntas: a cualquier rutina solo se llega entrando primero
  // en su carpeta.
  function screenRoutinesList(folderId) {
    const folder = folderId ? getFolder(folderId) : null;
    if (!folder) {
      navigate("#/folders");
      return h(`<div class="screen"></div>`);
    }
    lastFolderId = folder.id;

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: folder.name,
        showBack: true,
        onBack: () => navigate("#/"),
        right: `
          <button class="pill-btn" id="btn-folders">${icon("folder")} Carpetas</button>
          <button class="icon-btn" id="btn-add">${icon("plus")}</button>
        `,
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    const activeRoutines = routines.filter((r) => isRoutineVisible(r) && r.folderId === folder.id);

    if (activeRoutines.length === 0) {
      scroll.appendChild(
        h(`<div class="empty-state">
          ${icon("clipboard")}
          <p>Esta carpeta no tiene rutinas todavía.<br>Crea la primera para empezar.</p>
        </div>`)
      );
    } else {
      const list = h(`<div class="list"></div>`);
      activeRoutines.forEach((r) => {
        const row = h(`<div class="routine-row" data-id="${r.id}">
          <div class="row-main">
            <button class="grip-btn" aria-label="Reordenar">${icon("grip")}</button>
            <button class="routine-btn" data-id="${r.id}">
              <span class="name">${esc(r.name)}</span>
              <span class="routine-days">
                ${DAYS.map((d) => `<span class="d ${r.days.includes(d.key) ? "on" : ""}">${d.key}</span>`).join("")}
              </span>
            </button>
          </div>
          <div class="row-confirm">
            <div class="confirm-text">Eliminar esta rutina.</div>
            <div class="confirm-actions">
              <button class="cancel-btn">Cancelar</button>
              <button class="delete-btn">Eliminar</button>
            </div>
          </div>
        </div>`);

        row.querySelector(".routine-btn").addEventListener("click", () => navigate(`#/routine/${r.id}`));
        row.querySelector(".row-confirm .cancel-btn").addEventListener("click", () => {
          row.classList.remove("confirming");
        });
        row.querySelector(".row-confirm .delete-btn").addEventListener("click", () => {
          r.deletedAt = Date.now();
          persist();
          render();
        });

        attachSwipeLeftToConfirm(row);

        list.appendChild(row);
      });
      scroll.appendChild(list);
      attachDragReorder(list, activeRoutines, () => {
        // Lo de fuera de esta carpeta (otras carpetas, papelera) se queda
        // intacto; solo se reordena el subconjunto mostrado.
        const shownIds = new Set(activeRoutines.map((r) => r.id));
        routines = [...routines.filter((r) => !shownIds.has(r.id)), ...activeRoutines];
        persist();
      });
    }

    screen.appendChild(scroll);
    screen.appendChild(
      h(`<button class="fab" id="btn-trash" aria-label="Papelera">${icon("trash")}</button>`)
    );
    screen.querySelector("#btn-add").addEventListener("click", () => navigate(`#/routine/new/${folder.id}`));
    screen.querySelector("#btn-trash").addEventListener("click", () => navigate("#/trash"));
    screen.querySelector("#btn-folders").addEventListener("click", () => navigate("#/folders"));
    return screen;
  }

  /* ---------------- Pantalla: Papelera de rutinas ---------------- */

  function screenTrash() {
    purgeExpiredTrash();

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: "Papelera",
        showBack: true,
        onBack: () => navigate("#/folders"),
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    const trashed = routines
      .filter((r) => r.deletedAt)
      .sort((a, b) => b.deletedAt - a.deletedAt);

    if (trashed.length === 0) {
      scroll.appendChild(
        h(`<div class="empty-state">
          ${icon("trash")}
          <p>La papelera está vacía.<br>Las rutinas eliminadas se guardan aquí 7 días.</p>
        </div>`)
      );
    } else {
      const list = h(`<div class="list"></div>`);
      trashed.forEach((r) => {
        const days = Math.floor((Date.now() - r.deletedAt) / (24 * 60 * 60 * 1000));
        const deletedLabel = days <= 0 ? "Eliminada hoy" : days === 1 ? "Eliminada ayer" : `Eliminada hace ${days} días`;

        const row = h(`<div class="routine-row trash-row" data-id="${r.id}" data-state="main">
          <div class="row-main">
            <button class="routine-btn">
              <span class="name">${esc(r.name)}</span>
              <span class="trash-meta">${deletedLabel}</span>
            </button>
          </div>
          <div class="row-actions">
            <div class="confirm-text">${esc(r.name)}</div>
            <div class="confirm-actions">
              <button class="recover-btn">Recuperar</button>
              <button class="purge-btn">Eliminar por completo</button>
            </div>
          </div>
          <div class="row-confirm">
            <div class="confirm-text">Eliminar esta rutina para siempre.</div>
            <div class="confirm-actions">
              <button class="cancel-btn">Cancelar</button>
              <button class="delete-btn">Eliminar</button>
            </div>
          </div>
        </div>`);

        row.querySelector(".row-main .routine-btn").addEventListener("click", () => {
          row.dataset.state = "actions";
        });
        row.querySelector(".recover-btn").addEventListener("click", () => {
          delete r.deletedAt;
          persist();
          render();
        });
        row.querySelector(".purge-btn").addEventListener("click", () => {
          row.dataset.state = "confirm";
        });
        row.querySelector(".row-confirm .cancel-btn").addEventListener("click", () => {
          row.dataset.state = "actions";
        });
        row.querySelector(".row-confirm .delete-btn").addEventListener("click", () => {
          routines = routines.filter((x) => x.id !== r.id);
          persist();
          render();
        });

        list.appendChild(row);
      });
      scroll.appendChild(list);
    }

    screen.appendChild(scroll);
    return screen;
  }

  /* ---------------- Pantalla: Carpetas ---------------- */

  function screenFoldersList() {
    lastFolderId = null; // se está viendo el listado sin entrar en ninguna
    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: "Carpetas",
        showBack: true,
        onBack: () => navigate("#/"),
        right: `<button class="icon-btn" id="btn-add">${icon("plus")}</button>`,
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    const activeFolders = folders.filter((f) => !f.deletedAt);

    if (activeFolders.length === 0) {
      scroll.appendChild(
        h(`<div class="empty-state">
          ${icon("folder")}
          <p>Todavía no tienes carpetas.<br>Crea la primera para empezar.</p>
        </div>`)
      );
    } else {
      const list = h(`<div class="list"></div>`);
      activeFolders.forEach((f) => {
        const count = routines.filter((r) => isRoutineVisible(r) && r.folderId === f.id).length;
        const row = h(`<div class="routine-row" data-id="${f.id}">
          <div class="row-main">
            <button class="routine-btn" data-id="${f.id}">
              <span class="name">${esc(f.name)}</span>
              <span class="trash-meta">${count} ${count === 1 ? "rutina" : "rutinas"}</span>
            </button>
            <button class="icon-btn" aria-label="Editar carpeta">${icon("pencil")}</button>
          </div>
        </div>`);

        row.querySelector(".routine-btn").addEventListener("click", () => navigate(`#/folders/${f.id}`));
        row.querySelector(".icon-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          navigate(`#/folders/${f.id}/edit`);
        });

        list.appendChild(row);
      });
      scroll.appendChild(list);
    }

    screen.appendChild(scroll);
    screen.appendChild(
      h(`<button class="fab" id="btn-trash" aria-label="Papelera de carpetas">${icon("trash")}</button>`)
    );
    screen.querySelector("#btn-add").addEventListener("click", () => navigate("#/folders/new"));
    screen.querySelector("#btn-trash").addEventListener("click", () => navigate("#/folders/trash"));
    return screen;
  }

  /* ---------------- Pantalla: Crear / editar carpeta ---------------- */

  function screenFolderForm(id) {
    const editing = !!id;
    const existing = editing ? getFolder(id) : null;
    if (editing && !existing) {
      navigate("#/folders");
      return h(`<div class="screen"></div>`);
    }

    const state = { name: existing ? existing.name : `Carpeta ${peekNextFolderNumber()}` };

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: editing ? "Editar carpeta" : "Nueva carpeta",
        showBack: true,
        onBack: () => navigate("#/folders"),
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    scroll.appendChild(h(`
      <div class="field">
        <label for="folder-name">Nombre de la carpeta</label>
        <input type="text" id="folder-name" placeholder="Ej. Alta intensidad" maxlength="40" value="${esc(state.name)}" autocomplete="off" />
      </div>
    `));

    const saveBtn = h(`<button class="primary-btn" id="save-btn">${editing ? "Guardar cambios" : "Crear carpeta"}</button>`);
    scroll.appendChild(saveBtn);

    if (editing) {
      const dupBtn = h(`<button class="secondary-btn" id="dup-btn">${icon("copy")} Duplicar carpeta</button>`);
      scroll.appendChild(dupBtn);
      dupBtn.addEventListener("click", () => {
        const copy = duplicateFolder(existing);
        navigate(`#/folders/${copy.id}`);
      });

      const delBtn = h(`<button class="text-btn" id="del-btn">Eliminar carpeta</button>`);
      scroll.appendChild(delBtn);
      delBtn.addEventListener("click", () => {
        if (confirm(`¿Eliminar la carpeta "${existing.name}"? Sus rutinas se irán con ella a la papelera.`)) {
          existing.deletedAt = Date.now();
          persistFolders();
          navigate("#/folders");
        }
      });
    }

    screen.appendChild(scroll);

    const nameInput = scroll.querySelector("#folder-name");
    function updateSaveState() {
      saveBtn.disabled = state.name.trim().length === 0;
    }
    nameInput.addEventListener("input", (e) => {
      state.name = e.target.value;
      updateSaveState();
    });
    updateSaveState();

    saveBtn.addEventListener("click", () => {
      const name = state.name.trim();
      if (!name) return;
      if (editing) {
        existing.name = name;
        persistFolders();
        navigate("#/folders");
      } else {
        bumpFolderSeq();
        const created = { id: uid(), name };
        folders.push(created);
        persistFolders();
        navigate(`#/folders/${created.id}`);
      }
    });

    return screen;
  }

  /* ---------------- Pantalla: Papelera de carpetas ---------------- */

  function screenFoldersTrash() {
    purgeExpiredFolderTrash();

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: "Papelera de carpetas",
        showBack: true,
        onBack: () => navigate("#/folders"),
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    const trashed = folders.filter((f) => f.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

    if (trashed.length === 0) {
      scroll.appendChild(
        h(`<div class="empty-state">
          ${icon("trash")}
          <p>La papelera de carpetas está vacía.<br>Las carpetas eliminadas se guardan aquí 7 días.</p>
        </div>`)
      );
    } else {
      const list = h(`<div class="list"></div>`);
      trashed.forEach((f) => {
        const days = Math.floor((Date.now() - f.deletedAt) / (24 * 60 * 60 * 1000));
        const deletedLabel = days <= 0 ? "Eliminada hoy" : days === 1 ? "Eliminada ayer" : `Eliminada hace ${days} días`;

        const row = h(`<div class="routine-row trash-row" data-id="${f.id}" data-state="main">
          <div class="row-main">
            <button class="routine-btn">
              <span class="name">${esc(f.name)}</span>
              <span class="trash-meta">${deletedLabel}</span>
            </button>
          </div>
          <div class="row-actions">
            <div class="confirm-text">${esc(f.name)}</div>
            <div class="confirm-actions">
              <button class="recover-btn">Recuperar</button>
              <button class="purge-btn">Eliminar por completo</button>
            </div>
          </div>
          <div class="row-confirm">
            <div class="confirm-text">Eliminar esta carpeta para siempre, con las rutinas que tenga dentro.</div>
            <div class="confirm-actions">
              <button class="cancel-btn">Cancelar</button>
              <button class="delete-btn">Eliminar</button>
            </div>
          </div>
        </div>`);

        row.querySelector(".row-main .routine-btn").addEventListener("click", () => {
          row.dataset.state = "actions";
        });
        row.querySelector(".recover-btn").addEventListener("click", () => {
          delete f.deletedAt;
          persistFolders();
          render();
        });
        row.querySelector(".purge-btn").addEventListener("click", () => {
          row.dataset.state = "confirm";
        });
        row.querySelector(".row-confirm .cancel-btn").addEventListener("click", () => {
          row.dataset.state = "actions";
        });
        row.querySelector(".row-confirm .delete-btn").addEventListener("click", () => {
          folders = folders.filter((x) => x.id !== f.id);
          routines = routines.filter((r) => r.folderId !== f.id);
          persistFolders();
          persist();
          render();
        });

        list.appendChild(row);
      });
      scroll.appendChild(list);
    }

    screen.appendChild(scroll);
    return screen;
  }

  /* ---------------- Pantalla: Crear / editar rutina ---------------- */

  function screenRoutineForm(id, presetFolderId) {
    const editing = !!id;
    const existing = editing ? getRoutine(id) : null;
    const lockedFolder = !editing && presetFolderId ? getFolder(presetFolderId) : null;
    // Solo se pregunta la carpeta cuando hace falta: al editar no se toca,
    // y al crear desde dentro de una carpeta ya se sabe cuál es.
    const needsFolderPicker = !editing && !lockedFolder;
    const activeFolders = folders.filter((f) => !f.deletedAt);

    // Al crear una rutina nueva, "atrás" vuelve a la carpeta de origen si
    // se entró desde una, o si no directo a la pantalla principal (sin
    // pasar por ningún listado intermedio).
    const backTarget = editing
      ? `#/routine/${id}`
      : lockedFolder
      ? `#/folders/${lockedFolder.id}`
      : "#/";

    const state = {
      name: existing ? existing.name : "",
      days: existing ? [...existing.days] : [],
      folderId: lockedFolder ? lockedFolder.id : null,
    };

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: editing ? "Editar rutina" : "Nueva rutina",
        showBack: true,
        onBack: () => navigate(backTarget),
      })
    );

    const scroll = h(`<div class="scroll"></div>`);
    scroll.appendChild(h(`
      <div class="field">
        <label for="routine-name">Nombre de la rutina</label>
        <input type="text" id="routine-name" placeholder="Ej. Full body" maxlength="40" value="${esc(state.name)}" autocomplete="off" />
      </div>
    `));

    scroll.appendChild(h(`
      <div class="field">
        <label>Días de entrenamiento</label>
        <div class="day-picker" id="day-picker">
          ${DAYS.map((d) => `<button type="button" class="day-toggle ${state.days.includes(d.key) ? "on" : ""}" data-day="${d.key}">${d.key}</button>`).join("")}
        </div>
      </div>
    `));

    let folderPickerEl = null;
    let folderOptsEl = null;
    if (needsFolderPicker) {
      // Si el usuario todavía no tiene ninguna carpeta (primera rutina de
      // todas), no le pedimos que elija: se le crea "Carpeta 1" sola,
      // igual que a quien ya tenía rutinas antes de esta función.
      if (activeFolders.length === 0) {
        state.usesDefaultFolder = true;
      } else {
        const preselected = activeFolders.find((f) => f.name === "Carpeta 1") || activeFolders[0];
        state.folderId = preselected.id;

        folderPickerEl = h(`
          <div class="field">
            <label>Carpeta</label>
            <div class="folder-picker" id="folder-picker"></div>
            <button type="button" class="folder-new-toggle" id="folder-new-toggle">${icon("plus")} Nueva carpeta</button>
            <div class="folder-new-form hidden" id="folder-new-form">
              <input type="text" id="new-folder-name" placeholder="Nombre de la carpeta" maxlength="40" autocomplete="off" />
              <button type="button" class="run-btn" id="folder-new-confirm">Crear</button>
            </div>
          </div>
        `);
        folderOptsEl = folderPickerEl.querySelector("#folder-picker");

        function renderFolderOpts() {
          folderOptsEl.innerHTML = "";
          folders
            .filter((f) => !f.deletedAt)
            .forEach((f) => {
              const opt = h(`<button type="button" class="folder-opt ${f.id === state.folderId ? "on" : ""}" data-folder-id="${f.id}">${esc(f.name)}</button>`);
              opt.addEventListener("click", () => {
                state.folderId = f.id;
                folderOptsEl.querySelectorAll(".folder-opt").forEach((o) => o.classList.toggle("on", o.dataset.folderId === f.id));
                updateSaveState();
              });
              folderOptsEl.appendChild(opt);
            });
        }
        renderFolderOpts();

        const newToggle = folderPickerEl.querySelector("#folder-new-toggle");
        const newForm = folderPickerEl.querySelector("#folder-new-form");
        const newNameInput = folderPickerEl.querySelector("#new-folder-name");
        newToggle.addEventListener("click", () => {
          newToggle.classList.add("hidden");
          newForm.classList.remove("hidden");
          newNameInput.value = `Carpeta ${peekNextFolderNumber()}`;
          newNameInput.focus();
          newNameInput.select();
        });
        folderPickerEl.querySelector("#folder-new-confirm").addEventListener("click", () => {
          const name = newNameInput.value.trim() || `Carpeta ${peekNextFolderNumber()}`;
          bumpFolderSeq();
          const created = { id: uid(), name };
          folders.push(created);
          persistFolders();
          state.folderId = created.id;
          renderFolderOpts();
          newForm.classList.add("hidden");
          newToggle.classList.remove("hidden");
          updateSaveState();
        });

        scroll.appendChild(folderPickerEl);
      }
    }

    const saveBtn = h(`<button class="primary-btn" id="save-btn">${editing ? "Guardar cambios" : "Crear rutina"}</button>`);
    scroll.appendChild(saveBtn);

    if (editing) {
      const delBtn = h(`<button class="text-btn" id="del-btn">Eliminar rutina</button>`);
      scroll.appendChild(delBtn);
      delBtn.addEventListener("click", () => {
        if (confirm(`¿Eliminar la rutina "${existing.name}"?`)) {
          routines = routines.filter((x) => x.id !== id);
          persist();
          navigate(existing.folderId ? `#/folders/${existing.folderId}` : "#/folders");
        }
      });
    }

    screen.appendChild(scroll);

    function updateSaveState() {
      const folderOk = editing || lockedFolder || state.usesDefaultFolder || !!state.folderId;
      saveBtn.disabled = !(state.name.trim().length > 0 && state.days.length > 0 && folderOk);
    }

    scroll.querySelector("#routine-name").addEventListener("input", (e) => {
      state.name = e.target.value;
      updateSaveState();
    });

    scroll.querySelectorAll(".day-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const day = btn.dataset.day;
        if (state.days.includes(day)) {
          state.days = state.days.filter((d) => d !== day);
          btn.classList.remove("on");
        } else {
          state.days.push(day);
          btn.classList.add("on");
        }
        updateSaveState();
      });
    });

    updateSaveState();

    saveBtn.addEventListener("click", () => {
      const orderedDays = DAYS.map((d) => d.key).filter((k) => state.days.includes(k));
      const name = state.name.trim();
      if (!name || orderedDays.length === 0) return;

      if (editing) {
        existing.name = name;
        existing.days = orderedDays;
        if (!orderedDays.includes(existing.activeDay)) {
          existing.activeDay = orderedDays[0];
        }
        persist();
        navigate(`#/routine/${id}`);
      } else {
        const folderId = lockedFolder ? lockedFolder.id : state.usesDefaultFolder ? ensureDefaultFolder().id : state.folderId;
        if (!folderId) return;
        const newRoutine = {
          id: uid(),
          folderId,
          name,
          days: orderedDays,
          activeDay: orderedDays.includes(todayKey()) ? todayKey() : orderedDays[0],
          phases: emptyPhases(),
        };
        routines.push(newRoutine);
        persist();
        navigate(`#/routine/${newRoutine.id}`);
      }
    });

    return screen;
  }

  /* ---------------- Pantalla: Detalle de rutina ---------------- */

  function screenRoutineDetail(id) {
    const routine = getRoutine(id);
    if (!routine) {
      navigate("#/folders");
      return h(`<div class="screen"></div>`);
    }

    if (!routine.days.includes(routine.activeDay)) {
      routine.activeDay = routine.days[0];
    }

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: "",
        showBack: true,
        onBack: () => navigate(routine.folderId ? `#/folders/${routine.folderId}` : "#/folders"),
        right: `<button class="icon-btn" id="btn-edit">${icon("pencil")}</button>`,
      })
    );
    screen.querySelector("#btn-edit").addEventListener("click", () => navigate(`#/routine/${id}/edit`));

    screen.appendChild(h(`<div class="routine-title"><h1>${esc(routine.name)}</h1></div>`));

    // Título opcional por día (p. ej. "Pecho y tríceps"), para distinguir de
    // un vistazo en qué día de la rutina estás además del nombre del día.
    const activeDayName = DAYS.find((d) => d.key === routine.activeDay).name;
    const dayTitle = (routine.dayTitles && routine.dayTitles[routine.activeDay]) || "";
    const dayTitleBox = h(`<div class="day-title-box">
      <div class="day-title-view">
        <div class="day-title-label">${esc(activeDayName.toUpperCase())}</div>
        <div class="day-title-text ${dayTitle ? "" : "placeholder"}">${dayTitle ? esc(dayTitle) : "Toca para añadir un título"}</div>
      </div>
      <div class="day-title-edit">
        <input type="text" class="day-title-input" maxlength="40" placeholder="Ej. Pecho y tríceps" autocomplete="off" value="${esc(dayTitle)}" />
        <div class="confirm-actions">
          <button class="cancel-btn">Cancelar</button>
          <button class="run-btn">Guardar</button>
        </div>
      </div>
    </div>`);

    const dayTitleInput = dayTitleBox.querySelector(".day-title-input");

    dayTitleBox.querySelector(".day-title-text").addEventListener("click", () => {
      dayTitleInput.value = dayTitle;
      dayTitleBox.classList.add("editing");
    });
    dayTitleBox.querySelector(".day-title-edit .cancel-btn").addEventListener("click", () => {
      dayTitleBox.classList.remove("editing");
    });
    function saveDayTitle() {
      const value = dayTitleInput.value.trim();
      if (!routine.dayTitles) routine.dayTitles = {};
      if (value) {
        routine.dayTitles[routine.activeDay] = value;
      } else {
        delete routine.dayTitles[routine.activeDay];
      }
      persist();
      render();
    }
    dayTitleBox.querySelector(".day-title-edit .run-btn").addEventListener("click", saveDayTitle);
    dayTitleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveDayTitle(); }
    });

    screen.appendChild(dayTitleBox);

    const stack = h(`<div class="phase-stack"></div>`);
    PHASES.forEach((ph) => {
      const count = (routine.phases[ph.key] && routine.phases[ph.key][routine.activeDay] || []).length;
      const btn = h(`<button class="phase-btn ${ph.cls}" data-phase="${ph.key}">
        <span class="ico">${icon(ph.icon)}</span>
        <span>
          <div class="label">${ph.label}</div>
          <div class="count">${count} ${count === 1 ? "ejercicio" : "ejercicios"}</div>
        </span>
        <span class="chev">${icon("chevronRight")}</span>
      </button>`);

      // Toque corto: entrar al editor. Pulsación larga (1,5 s): menú de opciones.
      let pressTimer = null;
      let longPressFired = false;

      function clearPressTimer() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }

      btn.addEventListener("pointerdown", () => {
        clearPressTimer();
        longPressFired = false;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          longPressFired = true;
          openPhaseMenu(routine, ph);
        }, 1500);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
        btn.addEventListener(evt, clearPressTimer)
      );
      btn.addEventListener("click", (e) => {
        if (longPressFired) {
          e.preventDefault();
          longPressFired = false;
          return;
        }
        navigate(`#/routine/${id}/${ph.key}`);
      });

      stack.appendChild(btn);
    });
    screen.appendChild(stack);

    const strip = h(`<div class="day-strip"></div>`);
    DAYS.filter((d) => routine.days.includes(d.key)).forEach((d) => {
      const chip = h(`<button class="day-chip ${d.key === routine.activeDay ? "active" : ""}" data-day="${d.key}">${d.key}</button>`);
      chip.addEventListener("click", () => {
        routine.activeDay = d.key;
        persist();
        render();
      });
      strip.appendChild(chip);
    });
    screen.appendChild(strip);

    return screen;
  }

  /* ---------------- Menú de opciones de una fase (pulsación larga) ---------------- */

  function openPhaseMenu(routine, phaseDef) {
    const day = routine.activeDay;
    const dayName = DAYS.find((d) => d.key === day).name;
    const phaseLabelLower = phaseDef.label.toLowerCase();
    const sourceExercises = (routine.phases[phaseDef.key] && routine.phases[phaseDef.key][day]) || [];
    const otherDays = DAYS.filter((d) => routine.days.includes(d.key) && d.key !== day);

    function cloneSource() {
      return sourceExercises.map(cloneExercise);
    }

    function applyTo(targetDay) {
      ensureDayBucket(routine, phaseDef.key, targetDay);
      routine.phases[phaseDef.key][targetDay] = cloneSource();
    }

    const overlay = h(`<div class="sheet-overlay">
      <div class="sheet">
        <div class="sheet-view sheet-view-options">
          <div class="sheet-title">${esc(phaseDef.label)} · ${esc(dayName)}</div>
          <div class="sheet-options">
            <button class="sheet-opt" data-action="all">Aplicar este ${esc(phaseLabelLower)} a todos los días</button>
            ${otherDays
              .map(
                (d) =>
                  `<button class="sheet-opt" data-action="day" data-day="${d.key}">Aplicar este ${esc(phaseLabelLower)} al ${esc(d.name.toLowerCase())}</button>`
              )
              .join("")}
            <button class="sheet-opt danger" data-action="clear">Vaciar</button>
          </div>
          <button class="sheet-cancel" data-action="cancel">Cancelar</button>
        </div>
        <div class="sheet-view sheet-view-confirm">
          <div class="sheet-options">
            <div class="sheet-confirm-text">¿Seguro que quieres ejecutar este cambio?</div>
            <div class="sheet-confirm-actions">
              <button class="cancel-btn" data-action="confirm-cancel">Cancelar</button>
              <button class="run-btn" data-action="confirm-run">Ejecutar</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);

    const sheetEl = overlay.querySelector(".sheet");
    let pendingAction = null;

    function close() {
      overlay.remove();
    }

    function askConfirm(actionFn) {
      pendingAction = actionFn;
      sheetEl.classList.add("confirming");
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('[data-action="all"]').addEventListener("click", () => {
      askConfirm(() => routine.days.forEach((d) => applyTo(d)));
    });

    overlay.querySelectorAll('[data-action="day"]').forEach((optBtn) => {
      optBtn.addEventListener("click", () => {
        askConfirm(() => applyTo(optBtn.dataset.day));
      });
    });

    overlay.querySelector('[data-action="clear"]').addEventListener("click", () => {
      askConfirm(() => {
        ensureDayBucket(routine, phaseDef.key, day);
        routine.phases[phaseDef.key][day] = [];
      });
    });

    overlay.querySelector('[data-action="confirm-cancel"]').addEventListener("click", () => {
      pendingAction = null;
      sheetEl.classList.remove("confirming");
    });

    overlay.querySelector('[data-action="confirm-run"]').addEventListener("click", () => {
      if (pendingAction) pendingAction();
      persist();
      close();
      render();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener("click", close);

    document.body.appendChild(overlay);
  }

  /* ---------------- Pantalla: Editor de fase (ejercicios) ---------------- */

  function screenPhaseEditor(id, phaseKey) {
    const routine = getRoutine(id);
    const phaseDef = PHASES.find((p) => p.key === phaseKey);
    if (!routine || !phaseDef) {
      navigate(id ? `#/routine/${id}` : "#/folders");
      return h(`<div class="screen"></div>`);
    }

    const day = routine.activeDay;
    const dayName = DAYS.find((d) => d.key === day).name;
    const exercises = ensureDayBucket(routine, phaseKey, day);

    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: `${phaseDef.label} · ${dayName}`,
        showBack: true,
        onBack: () => navigate(`#/routine/${id}`),
      })
    );

    const scroll = h(`<div class="scroll"></div>`);

    function renderList() {
      scroll.innerHTML = "";
      if (exercises.length === 0) {
        scroll.appendChild(h(`<div class="empty-state">
          ${icon(phaseDef.icon)}
          <p>Sin ejercicios todavía para ${dayName.toLowerCase()}.<br>Añade el primero abajo.</p>
        </div>`));
        return;
      }
      const list = h(`<div class="exercise-list"></div>`);
      exercises.forEach((ex) => {
        const mode = ex.mode || "other";
        const summary = exerciseSummary(ex);
        const row = h(`<div class="exercise-row" data-id="${ex.id}">
          <div class="row-main">
            <button class="grip-btn" aria-label="Reordenar">${icon("grip")}</button>
            <div class="exercise-info" role="button">
              <div class="name">${esc(ex.name)}${mode === "crono" ? `<span class="crono-icon">${icon("timer")}</span>` : ""}</div>
              ${summary ? `<div class="detail">${esc(summary)}</div>` : ""}
            </div>
            <button class="remove-btn" aria-label="Eliminar">
              <svg class="hold-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="16" />
              </svg>
              ${icon("trash")}
            </button>
          </div>
          <div class="row-confirm">
            <div class="confirm-text">Eliminar este ejercicio.</div>
            <div class="confirm-actions">
              <button class="cancel-btn">Cancelar</button>
              <button class="delete-btn">Eliminar</button>
            </div>
          </div>
          <div class="row-edit">
            <input type="text" class="edit-name" maxlength="60" autocomplete="off" />
            ${detailModesHtml()}
            <div class="confirm-actions">
              <button class="cancel-btn">Cancelar</button>
              <button class="run-btn">Guardar</button>
            </div>
          </div>
        </div>`);

        // Eliminar requiere mantener pulsada la papelera 1,2 s (evita borrados accidentales).
        const removeBtn = row.querySelector(".remove-btn");
        let holdTimer = null;
        function clearHold() {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          removeBtn.classList.remove("holding");
        }
        removeBtn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          clearHold();
          removeBtn.classList.add("holding"); // dispara el anillo rojo que se va completando en 1,2 s
          holdTimer = setTimeout(() => {
            holdTimer = null;
            removeBtn.classList.remove("holding");
            row.classList.add("confirming");
          }, 1200);
        });
        ["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
          removeBtn.addEventListener(evt, clearHold)
        );

        row.querySelector(".row-confirm .cancel-btn").addEventListener("click", () => {
          row.classList.remove("confirming");
        });
        row.querySelector(".row-confirm .delete-btn").addEventListener("click", () => {
          const idx = exercises.findIndex((e) => e.id === ex.id);
          if (idx >= 0) exercises.splice(idx, 1);
          persist();
          renderList();
        });

        // Tocar el ejercicio permite editar sus datos en lugar de tener que
        // borrarlo. Los campos que aparecen dependen de su modo (fijo desde
        // que se creó: Sets/Reps, Crono u Otro).
        const editNameInput = row.querySelector(".edit-name");
        const editDetailWrap = row.querySelector(".row-edit .detail-modes");
        const editDetailInput = editDetailWrap.querySelector(".field-detail");
        const editSeriesInput = editDetailWrap.querySelector(".field-series");
        const editRepsInput = editDetailWrap.querySelector(".field-reps");
        const editWorkInput = editDetailWrap.querySelector(".field-work");
        const editRestInput = editDetailWrap.querySelector(".field-rest");
        const editRoundsInput = editDetailWrap.querySelector(".field-rounds");
        [editSeriesInput, editRepsInput, editWorkInput, editRestInput, editRoundsInput].forEach(restrictToDigits);

        function openEditMode() {
          editNameInput.value = ex.name;
          editDetailWrap.dataset.mode = mode;
          editDetailInput.value = ex.detail || "";
          editSeriesInput.value = ex.series || "";
          editRepsInput.value = ex.reps || "";
          editWorkInput.value = ex.work || "";
          editRestInput.value = ex.rest || "";
          editRoundsInput.value = ex.rounds || "";
          row.classList.add("editing");
        }

        const infoEl = row.querySelector(".exercise-info");
        if (mode === "crono") {
          // Un toque edita (como siempre); dos toques seguidos abren el
          // temporizador. Sin esto, un solo toque bastaría para ambas cosas
          // y no se podrían distinguir.
          let pendingTap = null;
          infoEl.addEventListener("click", () => {
            if (pendingTap) {
              clearTimeout(pendingTap);
              pendingTap = null;
              openCronoTimer(ex);
            } else {
              pendingTap = setTimeout(() => {
                pendingTap = null;
                openEditMode();
              }, 350);
            }
          });
        } else {
          infoEl.addEventListener("click", openEditMode);
        }

        row.querySelector(".row-edit .cancel-btn").addEventListener("click", () => {
          row.classList.remove("editing");
        });

        function saveEdit() {
          const newName = editNameInput.value.trim();
          if (!newName) return;
          ex.name = newName;
          if (mode === "sets") {
            ex.series = editSeriesInput.value.trim();
            ex.reps = editRepsInput.value.trim();
          } else if (mode === "crono") {
            ex.work = editWorkInput.value.trim();
            ex.rest = editRestInput.value.trim();
            ex.rounds = editRoundsInput.value.trim();
          } else {
            ex.detail = editDetailInput.value.trim();
          }
          persist();
          renderList();
        }
        row.querySelector(".row-edit .run-btn").addEventListener("click", saveEdit);
        editNameInput.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (mode === "sets") editSeriesInput.focus();
          else if (mode === "crono") editWorkInput.focus();
          else editDetailInput.focus();
        });
        editDetailInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
        });

        list.appendChild(row);
      });
      scroll.appendChild(list);
      attachDragReorder(list, exercises, persist);
    }

    renderList();
    screen.appendChild(scroll);

    // Esta pantalla es sobre todo para repasar la rutina: el formulario para
    // añadir ejercicios queda oculto tras un botón "+" pequeño, y solo se
    // despliega mientras se está usando.
    const addBar = h(`<div class="add-toggle-bar">
      <button class="add-toggle-btn" aria-label="Añadir ejercicio">${icon("plus")}</button>
    </div>`);

    const form = h(`<div class="add-exercise-form hidden">
      <div class="inputs">
        <input type="text" id="ex-name" placeholder="Ejercicio (ej. Sentadillas)" maxlength="60" autocomplete="off" />
        ${detailModesHtml()}
        <div class="mode-picker">
          <button type="button" class="mode-btn" data-mode="sets">Sets/Reps</button>
          <button type="button" class="mode-btn" data-mode="crono">Crono</button>
          <button type="button" class="mode-btn on" data-mode="other">Otro</button>
        </div>
      </div>
      <button class="send" id="ex-add" disabled>${icon("plus")}</button>
    </div>`);

    const nameInput = form.querySelector("#ex-name");
    const detailWrap = form.querySelector(".detail-modes");
    const detailInput = detailWrap.querySelector(".field-detail");
    const seriesInput = detailWrap.querySelector(".field-series");
    const repsInput = detailWrap.querySelector(".field-reps");
    const workInput = detailWrap.querySelector(".field-work");
    const restInput = detailWrap.querySelector(".field-rest");
    const roundsInput = detailWrap.querySelector(".field-rounds");
    [seriesInput, repsInput, workInput, restInput, roundsInput].forEach(restrictToDigits);
    const addBtn = form.querySelector("#ex-add");

    form.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        form.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        detailWrap.dataset.mode = btn.dataset.mode;
      });
    });

    function updateAddState() {
      addBtn.disabled = nameInput.value.trim().length === 0;
    }
    nameInput.addEventListener("input", updateAddState);

    function collapseForm() {
      form.classList.add("hidden");
      addBar.classList.remove("hidden");
      nameInput.value = "";
      detailInput.value = "";
      seriesInput.value = "";
      repsInput.value = "";
      workInput.value = "";
      restInput.value = "";
      roundsInput.value = "";
      // Por defecto, cada vez que se abre el formulario, el modo es "Otro".
      form.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("on", b.dataset.mode === "other"));
      detailWrap.dataset.mode = "other";
      updateAddState();
    }

    function addExercise() {
      const name = nameInput.value.trim();
      if (!name) return;
      const mode = detailWrap.dataset.mode;
      const newEx = { id: uid(), name, mode };
      if (mode === "sets") {
        newEx.series = seriesInput.value.trim();
        newEx.reps = repsInput.value.trim();
      } else if (mode === "crono") {
        newEx.work = workInput.value.trim();
        newEx.rest = restInput.value.trim();
        newEx.rounds = roundsInput.value.trim();
      } else {
        newEx.detail = detailInput.value.trim();
      }
      exercises.push(newEx);
      persist();
      renderList();
      collapseForm();
    }

    addBtn.addEventListener("click", addExercise);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const mode = detailWrap.dataset.mode;
      if (mode === "sets") seriesInput.focus();
      else if (mode === "crono") workInput.focus();
      else detailInput.focus();
    });
    detailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addExercise(); }
    });

    addBar.querySelector(".add-toggle-btn").addEventListener("click", (e) => {
      e.stopPropagation(); // que este mismo toque no dispare el cierre "clic fuera" de abajo
      addBar.classList.add("hidden");
      form.classList.remove("hidden");
      nameInput.focus();
    });

    // Si el formulario está abierto y se toca fuera de él (sin llegar a
    // añadir nada), se cierra solo y vuelve a aparecer el botón "+" pequeño.
    screen.addEventListener("click", (e) => {
      if (form.classList.contains("hidden")) return;
      if (form.contains(e.target)) return;
      collapseForm();
    });

    screen.appendChild(addBar);
    screen.appendChild(form);

    return screen;
  }

  /* ---------------- Service worker ---------------- */

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("No se pudo registrar el service worker", err);
      });
    }
  }
})();
