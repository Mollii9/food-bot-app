(function () {
  "use strict";

  const NAME_MAX = 40;
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
    steps: {
      name: document.getElementById("step-name"),
      condition: document.getElementById("step-condition"),
      checks: document.getElementById("step-checks"),
    },
  };

  let selectedCondition = null;
  let selectedName = "";
  let selectedPalette = null;
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
      condition: selectedCondition === null,
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

    el.dockTitle.textContent = selectedName || "Состояние не выбрано";
    el.dockSub.textContent = valid
      ? "Всё готово — жми «Сохранить»"
      : "Дальше: " + left[0];
    el.dock.classList.toggle("ready", valid);
    for (let i = 0; i < PALETTES; i++) el.dock.classList.toggle("p" + i, selectedPalette === i);
    el.dock.classList.toggle("pal", selectedPalette !== null);
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
      v: 1,
      display_name: cleanName(el.name.value),
      adult: true,
      consent: true,
      condition_id: selectedCondition,
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

  function splitGroup(title) {
    // "🫃 Желудок и кишечник" → icon "🫃", name "Желудок и кишечник"
    const space = title.indexOf(" ");
    if (space > 0 && !/[\p{L}\p{N}]/u.test(title.slice(0, space))) {
      return { icon: title.slice(0, space), name: title.slice(space + 1).trim() };
    }
    return { icon: "•", name: title };
  }

  function select(c, input, groupIndex) {
    selectedCondition = c.id;
    selectedName = c.name;
    selectedPalette = groupIndex % PALETTES;
    for (const card of el.conditions.querySelectorAll(".card")) {
      card.classList.toggle("selected", card.contains(input));
    }
    groups.forEach((g, i) => g.chip.classList.toggle("has-choice", i === groupIndex));
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
    icon.textContent = parts.icon;
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
    chip.textContent = title;
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
      input.type = "radio";
      input.name = "condition";
      input.value = c.id;
      input.addEventListener("change", () => select(c, input, groupIndex));

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
  }

  init();
})();
