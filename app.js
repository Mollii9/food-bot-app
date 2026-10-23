(function () {
  "use strict";

  const NAME_MAX = 40;
  const tg = window.Telegram && window.Telegram.WebApp;
  // Not tg.initData: it is empty for apps opened from a keyboard button (our case).
  // Outside Telegram the SDK still loads but reports platform "unknown".
  const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");
  const mainButton = inTelegram && tg.MainButton ? tg.MainButton : null;

  const el = {
    name: document.getElementById("name"),
    nameError: document.getElementById("name-error"),
    conditions: document.getElementById("conditions"),
    adult: document.getElementById("adult"),
    consent: document.getElementById("consent"),
    save: document.getElementById("save"),
    outside: document.getElementById("outside"),
  };

  let selectedCondition = null;
  let nameTouched = false;

  function cleanName(value) {
    // Drop control characters, collapse spaces; the bot validates again.
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").replace(/\s+/g, " ").trim();
  }

  function isValid() {
    const name = cleanName(el.name.value);
    return name.length >= 1 && name.length <= NAME_MAX &&
      selectedCondition !== null && el.adult.checked && el.consent.checked;
  }

  function refresh() {
    const valid = isValid();
    const name = cleanName(el.name.value);
    el.nameError.hidden = name.length >= 1 || !nameTouched;
    if (mainButton) {
      const theme = tg.themeParams || {};
      mainButton.setParams({
        text: "Сохранить",
        is_visible: true,
        is_active: valid,
        color: valid ? (theme.button_color || "#2481cc") : (theme.hint_color || "#a0a0a0"),
        text_color: theme.button_text_color || "#ffffff",
      });
    } else {
      el.save.disabled = !valid;
    }
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

  function renderConditions(list) {
    el.conditions.textContent = "";
    for (const c of list) {
      const label = document.createElement("label");
      label.className = "card";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "condition";
      input.value = c.id;
      input.addEventListener("change", () => {
        selectedCondition = c.id;
        for (const card of el.conditions.querySelectorAll(".card")) {
          card.classList.toggle("selected", card.contains(input));
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
        refresh();
      });

      const dot = document.createElement("span");
      dot.className = "dot";
      const text = document.createElement("span");
      text.textContent = c.name;

      label.append(input, dot, text);
      el.conditions.append(label);
    }
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

  function init() {
    if (tg) {
      tg.ready();
      tg.expand();
    }
    const user = inTelegram && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    if (user && user.first_name) el.name.value = cleanName(user.first_name).slice(0, NAME_MAX);

    for (const input of [el.name, el.adult, el.consent]) {
      input.addEventListener("input", refresh);
      input.addEventListener("change", refresh);
    }
    el.name.addEventListener("blur", () => { nameTouched = true; refresh(); });

    if (mainButton) {
      mainButton.onClick(submit);
    } else {
      el.save.hidden = false;
      el.save.addEventListener("click", submit);
    }
    refresh();
    loadConditions();
  }

  init();
})();
