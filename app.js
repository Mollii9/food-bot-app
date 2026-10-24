(function () {
  "use strict";

  const NAME_MAX = 40;
  const MAX_SELECTED = 5; // the bot accepts 1–5 conditions
  const PALETTES = 8; // .p0 … .p7 in style.css, one per group in file order
  const BRAND_COLOR = "#7c3aed";
  const tg = window.Telegram && window.Telegram.WebApp;
  // Not tg.initData: it is empty for apps opened from a keyboard button (our case).
  // Outside Telegram the SDK still loads but reports platform "unknown".
  const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");
  const mainButton = inTelegram && tg.MainButton ? tg.MainButton : null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = {
    name: document.getElementById("name"),
    nameError: document.getElementById("name-error"),
    conditions: document.getElementById("conditions"),
    chips: document.getElementById("chips"),
    adult: document.getElementById("adult"),
    consent: document.getElementById("consent"),
    save: document.getElementById("save"),
    outside: document.getElementById("outside"),
    dock: document.getElementById("dock"),
    dockStatus: document.getElementById("dock-status"),
    dockTitle: document.getElementById("dock-title"),
    dockSub: document.getElementById("dock-sub"),
    meter: document.getElementById("meter").children,
    pickCount: document.getElementById("pick-count"),
    steps: {
      name: document.getElementById("step-name"),
      condition: document.getElementById("step-condition"),
      checks: document.getElementById("step-checks"),
    },
  };

  let selected = []; // [{id, name, palette}] in the order the user ticked them
  let nameTouched = false;
  let wasValid = false;
  let groups = []; // [{section, chip}]
  let activeGroup = -1;

  function haptic(kind) {
    const h = tg && tg.HapticFeedback;
    if (!h) return;
    if (kind === "select") h.selectionChanged();
    else h.notificationOccurred(kind);
  }

  function cleanName(value) {
    // Drop control characters, collapse spaces; the bot validates again.
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").replace(/\s+/g, " ").trim();
  }

  function missing() {
    const name = cleanName(el.name.value);
    return {
      name: !(name.length >= 1 && name.length <= NAME_MAX),
      condition: selected.length === 0,
      adult: !el.adult.checked,
      consent: !el.consent.checked,
    };
  }

  function isValid() {
    const m = missing();
    return !m.name && !m.condition && !m.adult && !m.consent;
  }

  function renderDock(m, valid) {
    const left = [];
    if (m.name) left.push("напиши имя");
    if (m.condition) left.push("выбери, что учитывать");
    if (m.adult) left.push("отметь 18+");
    if (m.consent) left.push("дай согласие");

    const last = selected[selected.length - 1];
    el.dockTitle.textContent = !last
      ? "Ничего не выбрано"
      : selected.length === 1 ? last.name : selected[0].name + " + ещё " + (selected.length - 1);
    el.dockSub.textContent = valid
      ? "Всё готово — жми «Сохранить»"
      : "Дальше: " + left[0];
    el.dock.classList.toggle("ready", valid);
    const palette = last ? last.palette : null;
    for (let i = 0; i < PALETTES; i++) el.dock.classList.toggle("p" + i, palette === i);
    el.dock.classList.toggle("pal", palette !== null);
    if (el.pickCount) {
      el.pickCount.textContent = selected.length
        ? "Выбрано: " + selected.length + " из " + MAX_SELECTED
        : "Можно выбрать несколько — до " + MAX_SELECTED;
    }
    const done = 4 - left.length;
    Array.from(el.meter).forEach((bar, i) => bar.classList.toggle("on", i < done));

    el.steps.name.classList.toggle("done", !m.name);
    el.steps.condition.classList.toggle("done", !m.condition);
    el.steps.checks.classList.toggle("done", !m.adult && !m.consent);
  }

  function refresh() {
    const m = missing();
    const valid = !m.name && !m.condition && !m.adult && !m.consent;
    el.nameError.hidden = cleanName(el.name.value).length >= 1 || !nameTouched;
    if (mainButton) {
      const theme = tg.themeParams || {};
      mainButton.setParams({
        text: "Сохранить",
        is_visible: true,
        is_active: valid,
        color: valid ? BRAND_COLOR : (theme.hint_color || "#a0a0a0"),
        text_color: "#ffffff",
      });
    } else {
      el.save.disabled = !valid;
    }
    renderDock(m, valid);
    if (valid && !wasValid) {
      haptic("success");
      el.dock.classList.remove("bump");
      void el.dock.offsetWidth; // restart the animation
      el.dock.classList.add("bump");
    }
    wasValid = valid;
  }

  function submit() {
    if (!isValid()) return;
    const payload = {
      v: 2,
      display_name: cleanName(el.name.value),
      adult: true,
      consent: true,
      condition_ids: selected.map((s) => s.id),
    };
    const data = JSON.stringify(payload);
    if (inTelegram) {
      tg.sendData(data); // sends web_app_data to the bot and closes the mini app
    } else {
      el.outside.hidden = false;
      console.log("payload (outside Telegram, not sent):", data);
    }
  }

  function scrollToEl(target) {
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function goToMissing() {
    const m = missing();
    if (m.name) {
      scrollToEl(el.steps.name);
      el.name.focus({ preventScroll: true });
    } else if (m.condition) {
      scrollToEl(el.steps.condition);
    } else if (m.adult || m.consent) {
      scrollToEl(el.steps.checks);
    }
  }

  function svgCheck() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M5 12.5l4.5 4.5L19 7.5");
    svg.append(path);
    return svg;
  }

  // Drawn icons, one 24px stroke family, matched to the group by a word in its name.
  const ICONS = [
    ["Желуд", '<path d="M9 3v4c0 2-3 3-3 7a6 6 0 0 0 6 6c3.5 0 6-2.5 6-5.5 0-2.5-2-4-4-4s-3 1.5-5 1.5"/><path d="M15 3v3"/>'],
    ["Непере", '<path d="M8 3h8v3l2 3v12H6V9l2-3z"/><path d="M6 13h12"/><path d="M8 6h8"/>'],
    ["Серд", '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8 11h2l1-2 2 4 1-2h2"/>'],
    ["Обмен", '<path d="M12 3v2"/><path d="M5 7h14"/><path d="M7 7l-3 7a3 3 0 0 0 6 0z"/><path d="M17 7l-3 7a3 3 0 0 0 6 0z"/><path d="M9 21h6"/><path d="M12 7v14"/>'],
    ["Почк", '<path d="M10 4c-3.5 0-6 3.5-6 8s2.5 8 6 8c2 0 2.5-1.5 2.5-3 0-1.2-1-2-1-5s1-3.8 1-5c0-1.5-.5-3-2.5-3z"/><path d="M14 9c3 0 6 1 6 3s-3 3-6 3"/>'],
    ["Кож", '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>'],
    ["Голов", '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>'],
    ["Кров", '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/><path d="M12 11v6"/><path d="M9 14h6"/>'],
  ];
  const DEFAULT_ICON = '<circle cx="12" cy="12" r="7"/>';

  function iconSvg(name) {
    const hit = ICONS.find(([word]) => name.indexOf(word) !== -1);
    const span = document.createElement("span");
    span.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (hit ? hit[1] : DEFAULT_ICON) + "</svg>";
    return span.firstChild;
  }

  function splitGroup(title) {
    // "🫃 Желудок и кишечник" → icon "🫃", name "Желудок и кишечник"
    const space = title.indexOf(" ");
    if (space > 0 && !/[\p{L}\p{N}]/u.test(title.slice(0, space))) {
      return { icon: title.slice(0, space), name: title.slice(space + 1).trim() };
    }
    return { icon: "•", name: title };
  }

  function toggle(c, input, groupIndex) {
    if (input.checked && selected.length >= MAX_SELECTED) {
      input.checked = false; // limit reached: keep the answer short and precise
      haptic("warning");
      el.pickCount.classList.remove("shake");
      void el.pickCount.offsetWidth;
      el.pickCount.classList.add("shake");
      clearTimeout(toggle.shakeTimer);
      toggle.shakeTimer = setTimeout(() => el.pickCount.classList.remove("shake"), 1200);
      return;
    }
    if (input.checked) selected.push({ id: c.id, name: c.name, palette: groupIndex % PALETTES, group: groupIndex });
    else selected = selected.filter((s) => s.id !== c.id);
    input.closest(".card").classList.toggle("selected", input.checked);
    groups.forEach((g, i) => g.chip.classList.toggle("has-choice", selected.some((s) => s.group === i)));
    haptic("select");
    refresh();
  }

  function newGroup(title, index) {
    const palette = index % PALETTES;
    const parts = splitGroup(title);

    const section = document.createElement("div");
    section.className = "group pal p" + palette;
    section.id = "group-" + index;
    const head = document.createElement("div");
    head.className = "group-head";
    const icon = document.createElement("span");
    icon.className = "group-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.append(iconSvg(parts.name));
    const name = document.createElement("h3");
    name.className = "group-name";
    name.textContent = parts.name;
    head.append(icon, name);
    const cards = document.createElement("div");
    cards.className = "group-cards";
    section.append(head, cards);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip pal p" + palette;
    chip.append(iconSvg(parts.name), document.createTextNode(parts.name));
    chip.addEventListener("click", () => scrollToEl(section));

    const group = { section, chip, cards };
    groups.push(group);
    return group;
  }

  function renderConditions(list) {
    el.conditions.textContent = "";
    el.chips.textContent = "";
    groups = [];
    let current = null;
    for (const c of list) {
      // Conditions come grouped in order; each group gets a section and a chip.
      const title = c.group || "Другое";
      if (!current || current.title !== title) {
        current = { title, ...newGroup(title, groups.length) };
        el.conditions.append(current.section);
        el.chips.append(current.chip);
      }
      const groupIndex = groups.length - 1;

      const label = document.createElement("label");
      label.className = "card";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "condition";
      input.value = c.id;
      input.addEventListener("change", () => toggle(c, input, groupIndex));

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.append(svgCheck());
      const text = document.createElement("span");
      text.textContent = c.name;

      label.append(input, dot, text);
      current.cards.append(label);
    }
    el.chips.hidden = groups.length < 2;
    onScroll();
  }

  function setActiveGroup(index) {
    if (index === activeGroup) return;
    activeGroup = index;
    groups.forEach((g, i) => g.chip.classList.toggle("active", i === index));
    const chip = groups[index] && groups[index].chip;
    if (chip) {
      el.chips.scrollTo({ left: chip.offsetLeft - 16, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }

  let scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (el.chips.hidden || !groups.length) return;
      const bar = el.chips.getBoundingClientRect();
      el.chips.classList.toggle("stuck", bar.top <= 0.5);
      let index = 0;
      groups.forEach((g, i) => {
        if (g.section.getBoundingClientRect().top <= bar.bottom + 24) index = i;
      });
      setActiveGroup(index);
    });
  }

  async function loadConditions() {
    try {
      const response = await fetch("conditions.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(String(response.status));
      renderConditions(await response.json());
    } catch (e) {
      el.conditions.innerHTML = '<p class="error">Не удалось загрузить список. Закрой и открой ещё раз.</p>';
    }
  }

  function applyTheme() {
    if (!inTelegram) return;
    if (tg.colorScheme) document.documentElement.dataset.scheme = tg.colorScheme;
    if (tg.isVersionAtLeast && tg.isVersionAtLeast("6.1")) {
      try {
        tg.setHeaderColor("secondary_bg_color");
        tg.setBackgroundColor("secondary_bg_color");
      } catch (e) { /* older clients: keep their colours */ }
    }
  }

  // The hero label gets scanned once on open (and again on tap): the beam passes,
  // ingredients take their verdict colours, the stamp lands.
  function scanLabel() {
    const label = document.getElementById("label");
    if (!label) return;
    label.classList.remove("scanning", "scanned");
    if (reducedMotion) { label.classList.add("scanned"); return; }
    void label.offsetWidth;
    label.classList.add("scanning");
    const words = Array.from(label.querySelectorAll(".w"));
    const top = label.getBoundingClientRect().top;
    const height = label.offsetHeight || 1;
    words.forEach((w) => { w.style.transitionDelay = ""; });
    setTimeout(() => {
      words.forEach((w) => {
        // colour each word when the beam reaches its line
        const y = (w.getBoundingClientRect().top - top) / height;
        w.style.transitionDelay = Math.round(y * 1100) + "ms";
      });
      label.classList.add("scanned");
      haptic("select");
    }, 250);
  }

  function init() {
    if (tg) {
      tg.ready();
      tg.expand();
    }
    applyTheme();
    const user = inTelegram && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    if (user && user.first_name) el.name.value = cleanName(user.first_name).slice(0, NAME_MAX);

    for (const input of [el.name, el.adult, el.consent]) {
      input.addEventListener("input", refresh);
      input.addEventListener("change", refresh);
    }
    for (const box of [el.adult, el.consent]) box.addEventListener("change", () => haptic("select"));
    el.name.addEventListener("blur", () => { nameTouched = true; refresh(); });
    el.name.addEventListener("keydown", (e) => { if (e.key === "Enter") el.name.blur(); });
    el.dockStatus.addEventListener("click", goToMissing);
    window.addEventListener("scroll", onScroll, { passive: true });

    if (mainButton) {
      mainButton.onClick(submit);
      tg.onEvent("themeChanged", () => { applyTheme(); refresh(); });
    } else {
      el.save.hidden = false;
      document.body.classList.add("no-tg");
      el.save.addEventListener("click", submit);
    }
    refresh();
    loadConditions();
    const label = document.getElementById("label");
    if (label) label.addEventListener("click", scanLabel);
    setTimeout(scanLabel, 400);
  }

  init();
})();
