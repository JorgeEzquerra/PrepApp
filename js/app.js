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
    check: `<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6M9 16h4"/></svg>`,
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
    if (parts[0] === "routines") return { name: "routines" };
    if (parts[0] === "routine" && parts[1] === "new") return { name: "routine-form" };
    if (parts[0] === "routine" && parts[2] === "edit") return { name: "routine-form", id: parts[1] };
    if (parts[0] === "routine" && parts.length === 2) return { name: "routine-detail", id: parts[1] };
    if (parts[0] === "routine" && parts.length === 3) return { name: "phase-editor", id: parts[1], phase: parts[2] };
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
      case "routines":
        app.appendChild(screenRoutinesList());
        break;
      case "routine-form":
        app.appendChild(screenRoutineForm(route.id));
        break;
      case "routine-detail":
        app.appendChild(screenRoutineDetail(route.id));
        break;
      case "phase-editor":
        app.appendChild(screenPhaseEditor(route.id, route.phase));
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

    screen.querySelector("#btn-ver").addEventListener("click", () => navigate("#/routines"));
    screen.querySelector("#btn-crear").addEventListener("click", () => navigate("#/routine/new"));
    return screen;
  }

  /* ---------------- Pantalla: Lista de rutinas ---------------- */

  function screenRoutinesList() {
    const screen = h(`<div class="screen"></div>`);
    screen.appendChild(
      topbar({
        title: "Rutinas",
        showBack: true,
        onBack: () => navigate("#/"),
        right: `<button class="icon-btn" id="btn-add">${icon("plus")}</button>`,
      })
    );

    const scroll = h(`<div class="scroll"></div>`);

    if (routines.length === 0) {
      scroll.appendChild(
        h(`<div class="empty-state">
          ${icon("clipboard")}
          <p>Todavía no tienes rutinas.<br>Crea la primera para empezar.</p>
        </div>`)
      );
    } else {
      const list = h(`<div class="list"></div>`);
      routines.forEach((r) => {
        const row = h(`<div class="routine-row">
          <button class="routine-btn" data-id="${r.id}">
            <span class="name">${esc(r.name)}</span>
            <span class="routine-days">
              ${DAYS.map((d) => `<span class="d ${r.days.includes(d.key) ? "on" : ""}">${d.key}</span>`).join("")}
            </span>
          </button>
          <button class="icon-btn danger" data-del="${r.id}" aria-label="Eliminar rutina">${icon("trash")}</button>
        </div>`);
        row.querySelector(".routine-btn").addEventListener("click", () => navigate(`#/routine/${r.id}`));
        row.querySelector("[data-del]").addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`¿Eliminar la rutina "${r.name}"?`)) {
            routines = routines.filter((x) => x.id !== r.id);
            persist();
            render();
          }
        });
        list.appendChild(row);
      });
      scroll.appendChild(list);
    }

    screen.appendChild(scroll);
    screen.querySelector("#btn-add").addEventListener("click", () => navigate("#/routine/new"));
    return screen;
  }

  /* ---------------- Pantalla: Crear / editar rutina ---------------- */

  function screenRoutineForm(id) {
    const editing = !!id;
    const existing = editing ? getRoutine(id) : null;
    const backTarget = editing ? `#/routine/${id}` : "#/routines";

    const state = {
      name: existing ? existing.name : "",
      days: existing ? [...existing.days] : [],
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

    const saveBtn = h(`<button class="primary-btn" id="save-btn">${editing ? "Guardar cambios" : "Crear rutina"}</button>`);
    scroll.appendChild(saveBtn);

    if (editing) {
      const delBtn = h(`<button class="text-btn" id="del-btn">Eliminar rutina</button>`);
      scroll.appendChild(delBtn);
      delBtn.addEventListener("click", () => {
        if (confirm(`¿Eliminar la rutina "${existing.name}"?`)) {
          routines = routines.filter((x) => x.id !== id);
          persist();
          navigate("#/routines");
        }
      });
    }

    screen.appendChild(scroll);

    function updateSaveState() {
      saveBtn.disabled = !(state.name.trim().length > 0 && state.days.length > 0);
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
        const newRoutine = {
          id: uid(),
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
      navigate("#/routines");
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
        onBack: () => navigate("#/routines"),
        right: `<button class="icon-btn" id="btn-edit">${icon("pencil")}</button>`,
      })
    );
    screen.querySelector("#btn-edit").addEventListener("click", () => navigate(`#/routine/${id}/edit`));

    screen.appendChild(h(`<div class="routine-title"><h1>${esc(routine.name)}</h1></div>`));

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
      btn.addEventListener("click", () => navigate(`#/routine/${id}/${ph.key}`));
      stack.appendChild(btn);
    });
    screen.appendChild(stack);

    const dayName = DAYS.find((d) => d.key === routine.activeDay).name;
    screen.appendChild(h(`<div class="day-hint">Editando ${dayName}</div>`));

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

  /* ---------------- Pantalla: Editor de fase (ejercicios) ---------------- */

  function screenPhaseEditor(id, phaseKey) {
    const routine = getRoutine(id);
    const phaseDef = PHASES.find((p) => p.key === phaseKey);
    if (!routine || !phaseDef) {
      navigate(id ? `#/routine/${id}` : "#/routines");
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
        const row = h(`<div class="exercise-row ${ex.done ? "done" : ""}" data-id="${ex.id}">
          <button class="check-btn" aria-label="Marcar hecho">${icon("check")}</button>
          <div class="exercise-info">
            <div class="name">${esc(ex.name)}</div>
            ${ex.detail ? `<div class="detail">${esc(ex.detail)}</div>` : ""}
          </div>
          <button class="remove-btn" aria-label="Eliminar">${icon("trash")}</button>
        </div>`);
        row.querySelector(".check-btn").addEventListener("click", () => {
          ex.done = !ex.done;
          persist();
          renderList();
        });
        row.querySelector(".remove-btn").addEventListener("click", () => {
          const idx = exercises.findIndex((e) => e.id === ex.id);
          if (idx >= 0) exercises.splice(idx, 1);
          persist();
          renderList();
        });
        list.appendChild(row);
      });
      scroll.appendChild(list);
    }

    renderList();
    screen.appendChild(scroll);

    const form = h(`<div class="add-exercise-form">
      <div class="inputs">
        <input type="text" id="ex-name" placeholder="Ejercicio (ej. Sentadillas)" maxlength="60" autocomplete="off" />
        <input type="text" id="ex-detail" placeholder="Series x reps, notas… (opcional)" maxlength="60" autocomplete="off" />
      </div>
      <button class="send" id="ex-add" disabled>${icon("plus")}</button>
    </div>`);

    const nameInput = form.querySelector("#ex-name");
    const detailInput = form.querySelector("#ex-detail");
    const addBtn = form.querySelector("#ex-add");

    function updateAddState() {
      addBtn.disabled = nameInput.value.trim().length === 0;
    }
    nameInput.addEventListener("input", updateAddState);

    function addExercise() {
      const name = nameInput.value.trim();
      if (!name) return;
      exercises.push({ id: uid(), name, detail: detailInput.value.trim(), done: false });
      persist();
      nameInput.value = "";
      detailInput.value = "";
      updateAddState();
      renderList();
      nameInput.focus();
    }

    addBtn.addEventListener("click", addExercise);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); detailInput.focus(); }
    });
    detailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addExercise(); }
    });

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
