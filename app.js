// UBT HUB mini-app v0.1: onboarding, home (banner, goal, test of the day, my subjects), account, test runner, calculator, rules.
// Static site; per-user state lives in Telegram CloudStorage (localStorage outside Telegram). Data in data/*.json.
(() => {
  "use strict";
  const V = "0.1.0";
  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user || null;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (n, cls = "ti") => `<span class="${cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${window.ICONS[n] || ""}</svg></span>`;
  const haptic = (k) => {
    try {
      const h = tg?.HapticFeedback;
      if (!h) return;
      if (k === "ok" || k === "bad") h.notificationOccurred(k === "ok" ? "success" : "error");
      else h.impactOccurred("light");
    } catch {}
  };
  let toastT;
  const toast = (msg) => {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("on"), 2200);
  };

  // ---------- dates: Kazakhstan is UTC+5 everywhere since 2024 ----------
  const today = (off = 0) => new Date(Date.now() + 5 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

  // ---------- seeded random ----------
  const hash = (s) => { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; };
  const rng = (seed) => { let a = hash(String(seed)); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- storage ----------
  const cloud = tg?.CloudStorage && tg.isVersionAtLeast?.("6.9") ? tg.CloudStorage : null;
  const local = {
    get: (k) => { try { return localStorage.getItem("ubt_" + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem("ubt_" + k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem("ubt_" + k); } catch {} },
  };
  const store = {
    get: (k) => (cloud ? new Promise((r) => cloud.getItem(k, (e, v) => r(e ? null : v || null))) : Promise.resolve(local.get(k))),
    set: (k, v) => (cloud ? new Promise((r) => cloud.setItem(k, v, () => r())) : Promise.resolve(local.set(k, v))),
    del: (keys) => (cloud ? new Promise((r) => cloud.removeItems(keys, () => r())) : Promise.resolve(keys.forEach(local.del))),
  };
  const KEYS = ["profile", "res", "streak", "day"];
  const S = { profile: null, res: {}, streak: { last: null, n: 0, best: 0 }, day: null };
  async function loadState() {
    const vals = await Promise.all(KEYS.map(store.get));
    const j = (x, f) => { try { return x ? JSON.parse(x) : f; } catch { return f; } };
    S.profile = j(vals[0], null);
    S.res = j(vals[1], {});
    S.streak = j(vals[2], { last: null, n: 0, best: 0 });
    S.day = j(vals[3], null);
  }
  const save = (k) => store.set(k, JSON.stringify(S[k]));

  // ---------- data ----------
  const D = {};
  const byId = {};
  async function loadData() {
    const get = (f) => fetch(`data/${f}.json?v=${V}`).then((r) => r.json());
    const [cfg, subjects, pairs, directions, rules, q] = await Promise.all(["config", "subjects", "pairs", "directions", "rules", "questions"].map(get));
    Object.assign(D, { cfg, subjects, pairs, directions, rules, q });
    q.questions.forEach((x) => (byId[x.id] = x));
  }
  const pool = () => D.q.questions.filter((x) => D.cfg.beta || x.checked_by);

  // ---------- i18n ----------
  const T = {
    ru: {
      soon: "Скоро", start: "Начать", next: "Дальше", back: "Назад", finish: "Завершить", change: "Изменить",
      b1t: "Программа на максимум", b1s: "Видеоуроки, конспекты и пробники по 5 предметам", b1c: ["Видео", "Конспекты", "Пробники"],
      b2t: "Комьюнити UBT HUB", b2s: "Готовимся вместе и разбираем сложные задания", b2c: ["Кто решил 7-е?", "Вот разбор 👇", "Спасибо!"],
      b3t: "Тест дня", b3s: "5 заданий, 10 минут", soonSub: "Подписка откроется скоро. Следи за каналом",
      goal: "Цель", of140: "из 140", thr: (n) => `Порог направления: ${n}`, fc: "Прогноз по обязательным", fcEmpty: "Реши тест дня, появится прогноз",
      day: "Тест дня", dayS: "5 заданий · 2 минуты на каждое", dayDone: (a, b) => `Сегодня: ${a} из ${b}. Завтра новые`, dayGo: (k) => `Продолжить: ${k} из 5`,
      streak: (n) => plural(n, "день", "дня", "дней"),
      mySubj: "Мои предметы", comp: "обязательный", prof: "профильный", soonTasks: "задания скоро", acc: (a) => `верных ${a}%`, noData: "ещё не решал",
      calc: "Калькулятор баллов", rules: "Правила ЕНТ",
      beta: "Бета-версия: задания проходят проверку учителем",
      readText: "Прочитай текст", right: "Верно", wrong: "Неверно", timeout: "Время вышло",
      res5: "Идеально", res3: "Хорошо. Разбери ошибки", res0: "Ничего. Завтра получится лучше",
      toHome: "На главную", share: "Позвать друга", more: "Ещё тренировка", practice: "Тренировка", practiceN: (n) => `Тренировка: ${n} заданий`,
      shareText: "Готовлюсь к ЕНТ в UBT HUB. Тест дня: 5 заданий за 10 минут",
      tasks: "заданий в тесте", maxPts: "максимум баллов", minPts: "минимум", topics: "Темы в тренировке",
      programSoon: "Программа по предмету готовится. Уроки и задания появятся здесь",
      calcHint: "Введи баллы по каждому предмету", total: "Сумма", belowMin: (n) => `ниже минимума ${n}`, okMin: (n) => `минимум ${n}`,
      where: "Куда проходит порог", failMin: "Ниже минимума хотя бы по одному предмету: порог не пройден, даже если сумма выше",
      grantNote: "Проходной балл на грант обычно выше порога и зависит от специальности", yourGoal: "Твоя цель",
      thOther: "Остальные вузы", thNat: "Национальные вузы", thMed: "Здравоохранение", thPed: "Педагогика", thLaw: "Право",
      creativeCalc: "У тебя творческий экзамен: на ЕНТ история Казахстана и грамотность чтения, остальное сдаётся в вузе",
      prof1: "Профильный 1", prof2: "Профильный 2",
      nick: "Ник в рейтинге", grade: "Класс", g10: "10 класс", g11: "11 класс", g12: "Выпускник", subjects: "Профильные предметы", creative: "Творческий экзамен",
      direction: "Направление", national: "национальный вуз", rating: "Рейтинг", ratingSoon: "Откроется вместе с пробниками. В рейтинге виден только твой ник",
      grant: "Шанс на грант", grantSoon: "Посчитаем по официальным проходным баллам прошлых лет и твоим пробникам",
      sub: "Подписка", subSoon: "Полная программа, видеоуроки, пробники и комьюнити", lang: "Язык", privacy: "Политика конфиденциальности",
      support: "Поддержка", reset: "Сбросить мои данные", resetQ: "Стереть профиль, ответы и серию? Это нельзя отменить", resetDone: "Данные удалены",
      o1: "Тілді таңда\nВыбери язык", o2: "В каком ты классе?", o3: "Твои профильные предметы", o3s: "Выбери пару, которую сдаёшь",
      o4: "Куда поступаешь?", o4s: "Нужно, чтобы считать порог и шанс на грант", natQ: "Национальный вуз", natS: "порог от 65 баллов",
      o5: "Твоя цель", o5s: "Сколько баллов хочешь набрать?", o6: "Всё готово", o6s: "Начни с теста дня: 5 заданий, 10 минут",
      startTest: "Пройти тест дня", later: "Позже", step: (a, b) => `Шаг ${a} из ${b}`, pick: "Выбери вариант",
      err: "Не получилось загрузить. Проверь интернет и открой ещё раз",
    },
    kk: {
      soon: "Жақында", start: "Бастау", next: "Келесі", back: "Артқа", finish: "Аяқтау", change: "Өзгерту",
      b1t: "Ең жоғары балға бағдарлама", b1s: "5 пән бойынша бейнесабақ, конспект және сынақ тест", b1c: ["Бейне", "Конспект", "Сынақ"],
      b2t: "UBT HUB қауымдастығы", b2s: "Бірге дайындаламыз, қиын тапсырмаларды талдаймыз", b2c: ["7-ні кім шешті?", "Міне, талдауы 👇", "Рақмет!"],
      b3t: "Күн тесті", b3s: "5 тапсырма, 10 минут", soonSub: "Жазылым жақында ашылады. Арнаны қадағала",
      goal: "Мақсат", of140: "140-тан", thr: (n) => `Бағыттың шекті балы: ${n}`, fc: "Міндетті пәндер болжамы", fcEmpty: "Күн тестін шеш, болжам шығады",
      day: "Күн тесті", dayS: "5 тапсырма · әрқайсысына 2 минут", dayDone: (a, b) => `Бүгін: ${b}-тен ${a}. Ертең жаңалары`, dayGo: (k) => `Жалғастыру: 5-тен ${k}`,
      streak: () => "күн",
      mySubj: "Менің пәндерім", comp: "міндетті", prof: "бейіндік", soonTasks: "тапсырмалар жақында", acc: (a) => `дұрыс ${a}%`, noData: "әлі шешілмеген",
      calc: "Балл калькуляторы", rules: "ҰБТ ережелері",
      beta: "Бета нұсқа: тапсырмаларды мұғалім тексеруде",
      readText: "Мәтінді оқы", right: "Дұрыс", wrong: "Қате", timeout: "Уақыт бітті",
      res5: "Керемет", res3: "Жақсы. Қателерді талда", res0: "Ештеңе етпейді. Ертең жақсырақ болады",
      toHome: "Басты бетке", share: "Досыңды шақыр", more: "Тағы жаттығу", practice: "Жаттығу", practiceN: (n) => `Жаттығу: ${n} тапсырма`,
      shareText: "UBT HUB-та ҰБТ-ға дайындалып жүрмін. Күн тесті: 10 минутта 5 тапсырма",
      tasks: "тесттегі тапсырма", maxPts: "ең жоғары балл", minPts: "шекті балл", topics: "Жаттығудағы тақырыптар",
      programSoon: "Пән бойынша бағдарлама дайындалып жатыр. Сабақтар мен тапсырмалар осында шығады",
      calcHint: "Әр пәннен балыңды енгіз", total: "Жалпы", belowMin: (n) => `шекті балдан төмен (${n})`, okMin: (n) => `шекті балл ${n}`,
      where: "Шекті балл қайда жетеді", failMin: "Бір пәннен шекті балл жоқ: жалпы балл жоғары болса да өтпейсің",
      grantNote: "Грантқа өту балы әдетте шекті балдан жоғары және мамандыққа байланысты", yourGoal: "Сенің мақсатың",
      thOther: "Басқа ЖОО", thNat: "Ұлттық ЖОО", thMed: "Денсаулық сақтау", thPed: "Педагогика", thLaw: "Құқық",
      creativeCalc: "Сенде шығармашылық емтихан: ҰБТ-да Қазақстан тарихы мен оқу сауаттылығы, қалғаны ЖОО-да тапсырылады",
      prof1: "Бейіндік 1", prof2: "Бейіндік 2",
      nick: "Рейтингтегі лақап ат", grade: "Сынып", g10: "10-сынып", g11: "11-сынып", g12: "Түлек", subjects: "Бейіндік пәндер", creative: "Шығармашылық емтихан",
      direction: "Бағыт", national: "ұлттық ЖОО", rating: "Рейтинг", ratingSoon: "Сынақ тесттермен бірге ашылады. Рейтингте тек лақап атың көрінеді",
      grant: "Грантқа мүмкіндік", grantSoon: "Өткен жылдардың ресми өту балдары мен сынақ тесттерің бойынша есептейміз",
      sub: "Жазылым", subSoon: "Толық бағдарлама, бейнесабақ, сынақ тест және қауымдастық", lang: "Тіл", privacy: "Құпиялық саясаты",
      support: "Қолдау", reset: "Деректерімді өшіру", resetQ: "Профиль, жауаптар және серия өшірілсін бе? Мұны қайтару мүмкін емес", resetDone: "Деректер өшірілді",
      o1: "Тілді таңда\nВыбери язык", o2: "Қай сыныптасың?", o3: "Бейіндік пәндерің", o3s: "Тапсыратын жұбыңды таңда",
      o4: "Қайда түсесің?", o4s: "Шекті балл мен грантқа мүмкіндікті есептеу үшін", natQ: "Ұлттық ЖОО", natS: "шекті балл 65-тен",
      o5: "Сенің мақсатың", o5s: "Қанша балл жинағың келеді?", o6: "Бәрі дайын", o6s: "Күн тестінен баста: 5 тапсырма, 10 минут",
      startTest: "Күн тестін өту", later: "Кейінірек", step: (a, b) => `${b} қадамның ${a}-сі`, pick: "Нұсқаны таңда",
      err: "Жүктеу мүмкін болмады. Интернетті тексеріп, қайта аш",
    },
  };
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  const initLang = () => (S.profile?.lang || (tgUser?.language_code === "kk" ? "kk" : "ru"));
  let LANG = "ru";
  const t = (k, ...a) => { const v = T[LANG][k] ?? T.ru[k]; return typeof v === "function" ? v(...a) : v; };
  const nm = (o) => (o ? o[LANG] || o.ru : "");

  // ---------- subjects of this user ----------
  const allSubj = () => [...D.subjects.compulsory, ...D.subjects.profile];
  const subj = (id) => allSubj().find((s) => s.id === id);
  const isCreative = () => S.profile?.pair === "creative";
  function mySubjects() {
    const c = D.subjects.compulsory.filter((s) => !isCreative() || s.id !== "mathlit");
    const p = Array.isArray(S.profile?.pair) ? S.profile.pair.map((id) => ({ ...subj(id), tasks: D.subjects.profileTasks, max: D.subjects.profileMax, min: D.subjects.profileMin, profile: true })) : [];
    return [...c, ...p];
  }
  const dirOf = (id) => D.directions.directions.find((d) => d.id === id);
  const threshold = (p = S.profile) => Math.max(dirOf(p?.dir)?.min || 50, p?.national ? D.directions.national : 0);

  // ---------- stats ----------
  function stat(subjectId) {
    let r = 0, w = 0;
    for (const [id, v] of Object.entries(S.res)) if (byId[id]?.subject === subjectId) { r += v[0]; w += v[1]; }
    return { r, w, n: r + w, acc: r + w ? r / (r + w) : null };
  }
  const streakNow = () => (S.streak.last === today() || S.streak.last === today(-1) ? S.streak.n : 0);

  // ---------- home ----------
  let bannerTimer;
  function renderHome() {
    const p = S.profile;
    const subs = mySubjects();
    const comp = subs.filter((s) => !s.profile);
    const known = comp.map((s) => ({ s, st: stat(s.id) })).filter((x) => x.st.n >= 3);
    const fc = known.length === comp.length && comp.length ? Math.round(known.reduce((a, x) => a + x.st.acc * x.s.max, 0)) : null;
    const compMax = comp.reduce((a, s) => a + s.max, 0);
    const d = S.day?.date === today() ? S.day : null;
    const dayState = d?.done ? "done" : d && d.picks.length ? "go" : "new";
    const sn = streakNow();
    $("#home").innerHTML = `
      ${topBar(0)}
      <div class="banner">
        <div class="bn-track">
          <button class="bn" data-banner="sub"><h2>${t("b1t")}</h2><p>${t("b1s")}</p><div class="chips">${t("b1c").map((c) => `<span>${c}</span>`).join("")}</div><div class="big140">140</div><span class="cta">${t("soon")}</span></button>
          <button class="bn dark" data-banner="community"><h2 style="max-width:52%">${t("b2t")}</h2><p style="max-width:50%">${t("b2s")}</p><div class="chat">${t("b2c").map((c, i) => `<div class="${i === 1 ? "me" : ""}">${c}</div>`).join("")}</div><span class="cta">${t("soon")}</span></button>
          <button class="bn light" data-go="#/test"><h2>${t("b3t")}</h2><p>${t("b3s")}</p><svg class="ring" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="45"/><circle class="fg" cx="50" cy="50" r="45"/></svg><div class="ring" style="pointer-events:none"><b>10'</b></div><div class="five"><i></i><i></i><i></i><i></i><i></i></div><span class="cta">${t("start")} ${icon("arrow-right")}</span></button>
        </div>
        <div class="bn-dots"><i class="on"></i><i></i><i></i></div>
      </div>
      ${p ? `<div class="card goal">
        <div><div class="lbl">${t("goal")}</div><div class="num">${p.goal} <small>${t("of140")}</small></div><div class="sub">${t("thr", threshold())}</div></div>
        <div style="text-align:right"><div class="lbl">${t("fc")}</div>${fc !== null ? `<div class="num brand">${fc} <small>/ ${compMax}</small></div>` : `<div class="sub" style="max-width:130px">${t("fcEmpty")}</div>`}</div>
      </div>` : ""}
      <button class="card day${dayState === "done" ? " done" : ""}" data-go="#/test">
        <span class="ic">${icon(dayState === "done" ? "check" : "bolt")}</span>
        <span><span class="t">${t("day")}</span><span class="s" style="display:block">${dayState === "done" ? t("dayDone", d.picks.filter((x) => x === 0).length, d.ids.length) : dayState === "go" ? t("dayGo", d.picks.length) : t("dayS")}</span></span>
        <span class="streak">${sn}<span>${icon("flame")}</span></span>
      </button>
      <div class="h">${t("mySubj")}</div>
      ${subs.map((s) => subjCard(s)).join("")}
      <div class="grid">
        <button class="tile" data-go="#/calc">${icon("calculator")}${t("calc")}</button>
        <button class="tile" data-go="#/rules">${icon("list-check")}${t("rules")}</button>
      </div>
      ${D.cfg.beta ? `<p class="note">${t("beta")}</p>` : ""}`;
    setupBanner();
  }
  function subjCard(s) {
    const st = stat(s.id);
    const hasQ = pool().some((q) => q.subject === s.id);
    const pts = st.acc !== null && st.n >= 3 ? Math.round(st.acc * s.max) : null;
    const sub = s.profile ? `${t("prof")} · ${hasQ ? (st.n ? t("acc", Math.round(st.acc * 100)) : t("noData")) : t("soonTasks")}` : `${t("comp")} · ${st.n ? t("acc", Math.round(st.acc * 100)) : t("noData")}`;
    return `<button class="subj" data-go="#/subj/${s.id}">
      <span class="ic">${icon(s.icon || (s.profile ? "book-2" : "book"))}</span>
      <span class="txt"><span class="t" style="display:block">${esc(nm(s))}</span><span class="s" style="display:block">${sub}</span><span class="bar" style="display:block"><i style="width:${pts !== null ? Math.round((pts / s.max) * 100) : 0}%"></i></span></span>
      <span class="pts">${pts !== null ? pts : "–"}<small>/${s.max}</small></span>
    </button>`;
  }
  function topBar(k) {
    return `<div class="top"><div class="logo">UBT <b>HUB</b></div><div class="dots"><i class="${k === 0 ? "on" : ""}" data-page="0"></i><i class="${k === 1 ? "on" : ""}" data-page="1"></i></div></div>`;
  }
  function setupBanner() {
    const track = $("#home .bn-track");
    const slides = [...track.children];
    const dots = [...$("#home .bn-dots").children];
    let cur = -1;
    const mark = (k) => {
      if (k === cur) return;
      cur = k;
      slides.forEach((s, i) => s.classList.toggle("on", i === k));
      dots.forEach((d, i) => d.classList.toggle("on", i === k));
      $("#home .bn-dots").classList.toggle("dim", slides[k].classList.contains("light"));
    };
    mark(0);
    track.addEventListener("scroll", () => mark(Math.round(track.scrollLeft / track.clientWidth)), { passive: true });
    clearInterval(bannerTimer);
    let touched = 0;
    track.addEventListener("touchstart", () => (touched = Date.now()), { passive: true });
    bannerTimer = setInterval(() => {
      if (Date.now() - touched < 8000 || $("#screen").classList.contains("open") || pagerIndex() !== 0) return;
      track.scrollTo({ left: ((cur + 1) % slides.length) * track.clientWidth, behavior: "smooth" });
    }, 5000);
  }

  // ---------- account ----------
  function renderAccount() {
    const p = S.profile;
    const name = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || "UBT HUB";
    const gradeName = p ? t({ 10: "g10", 11: "g11", 12: "g12" }[p.grade]) : "";
    const pairName = !p ? "" : isCreative() ? t("creative") : p.pair.map((id) => nm(subj(id))).join(" + ");
    const dir = p && dirOf(p.dir);
    $("#account").innerHTML = `
      ${topBar(1)}
      <div class="me">
        <div class="av">${tgUser?.photo_url ? `<img src="${esc(tgUser.photo_url)}" alt="">` : esc(name[0])}</div>
        <div><div class="n">${esc(name)}</div><div class="s">${esc(gradeName)}${p?.nick ? ` · ${esc(p.nick)}` : ""}</div></div>
      </div>
      ${p ? `<div class="list">
        <button class="li" data-edit="2"><span class="k">${t("subjects")}<span class="s" style="display:block">${esc(pairName)}</span></span>${icon("chevron-right", "ti chev")}</button>
        <button class="li" data-edit="3"><span class="k">${t("direction")}<span class="s" style="display:block">${esc(nm(dir))}${p.national ? `, ${t("national")}` : ""}</span></span>${icon("chevron-right", "ti chev")}</button>
        <button class="li" data-edit="4"><span class="k">${t("goal")}</span><span class="v">${p.goal} / 140</span>${icon("chevron-right", "ti chev")}</button>
        <button class="li" data-edit="1"><span class="k">${t("grade")}</span><span class="v">${esc(gradeName)}</span>${icon("chevron-right", "ti chev")}</button>
      </div>` : ""}
      <div class="card" style="margin-top:10px"><div class="lock">${icon("trophy")}<div><div class="t">${t("rating")}</div><div class="sub">${t("ratingSoon")}</div>${p?.nick ? `<div class="sub">${t("nick")}: <b>${esc(p.nick)}</b></div>` : ""}</div></div></div>
      <div class="card"><div class="lock">${icon("target")}<div><div class="t">${t("grant")}</div><div class="sub">${t("grantSoon")}</div></div></div></div>
      <div class="card"><div class="lock">${icon("crown")}<div><div class="t">${t("sub")} <span class="tag">${t("soon")}</span></div><div class="sub">${t("subSoon")}</div></div></div></div>
      <div class="list">
        <div class="li"><span class="k">${t("lang")}</span><span class="seg"><button data-lang="kk" class="${LANG === "kk" ? "on" : ""}">Қазақша</button><button data-lang="ru" class="${LANG === "ru" ? "on" : ""}">Русский</button></span></div>
        <button class="li" data-go="#/privacy"><span class="k">${t("privacy")}</span>${icon("chevron-right", "ti chev")}</button>
        ${D.cfg.bot ? `<button class="li" data-link="https://t.me/${esc(D.cfg.bot)}"><span class="k">${t("support")}</span>${icon("brand-telegram", "ti chev")}</button>` : ""}
        <button class="li danger" data-reset="1"><span class="k">${t("reset")}</span></button>
      </div>
      <p class="note">UBT HUB v${V}</p>`;
  }

  // ---------- pager ----------
  const pager = () => $("#pager");
  const pagerIndex = () => Math.round(pager().scrollLeft / pager().clientWidth);
  function pagerTo(k, smooth = true) {
    pager().scrollTo({ left: k * pager().clientWidth, behavior: smooth ? "smooth" : "auto" });
  }
  function onPagerScroll() {
    const k = pagerIndex();
    document.querySelectorAll(".page .dots").forEach((d) => [...d.children].forEach((i, n) => i.classList.toggle("on", n === k)));
  }

  // ---------- overlay screens ----------
  function screen(html) {
    const el = $("#screen");
    el.innerHTML = html;
    el.scrollTop = 0;
    el.classList.add("open");
    tg?.BackButton.show();
  }
  function hideScreen() {
    const el = $("#screen");
    if (!el.classList.contains("open")) return;
    el.classList.remove("open");
    tg?.BackButton.hide();
    renderHome();
    renderAccount();
  }
  const backLink = () => `<button class="back" data-go="#/">${icon("chevron-left")}${t("back")}</button>`;

  // ---------- test runner ----------
  let R = null;
  let timer = null;
  const LIMIT = 120;
  function stopTimer() { clearInterval(timer); timer = null; }

  function pickDay() {
    const r = rng(today() + ":" + (tgUser?.id || "guest"));
    const plan = isCreative() ? { history: 3, reading: 2 } : { history: 2, mathlit: 2, reading: 1 };
    const ids = [];
    for (const [s, n] of Object.entries(plan)) {
      const qs = pool().filter((q) => q.subject === s);
      const sc = new Map(qs.map((q) => { const v = S.res[q.id]; return [q.id, (v ? (v[1] > v[0] ? 1 : 2) : 0) + r()]; }));
      qs.sort((a, b) => sc.get(a.id) - sc.get(b.id));
      // reading questions come in passages: keep one passage per test
      if (s === "reading") {
        const first = qs[0];
        const same = first ? qs.filter((q) => q.passage === first.passage) : [];
        ids.push(...same.slice(0, n).map((q) => q.id));
      } else ids.push(...qs.slice(0, n).map((q) => q.id));
    }
    return ids;
  }
  function openDay() {
    if (!S.profile) return showOnboarding(0);
    if (S.day?.date !== today()) {
      S.day = { date: today(), ids: pickDay(), picks: [], done: false };
      save("day");
    }
    if (!S.day.ids.length) return screen(`${backLink()}<div class="empty">${t("soonTasks")}</div>`);
    R = { mode: "day", ids: S.day.ids, picks: S.day.picks.slice(), i: S.day.picks.length, seed: S.day.date };
    if (S.day.done || R.i >= R.ids.length) return showResult();
    renderQ();
  }
  function openPractice(sid) {
    const r = rng(Date.now());
    const qs = pool().filter((q) => q.subject === sid);
    if (!qs.length) return screen(`${backLink()}<div class="empty">${t("soonTasks")}</div>`);
    const sc = new Map(qs.map((q) => { const v = S.res[q.id]; return [q.id, (v ? (v[1] > v[0] ? 1 : 2) : 0) + r()]; }));
    let ids = qs.sort((a, b) => sc.get(a.id) - sc.get(b.id)).slice(0, 10);
    // keep passage questions together, in passage order
    ids = ids.sort((a, b) => (a.passage || "").localeCompare(b.passage || "")).map((q) => q.id);
    R = { mode: "practice", subject: sid, ids, picks: [], i: 0, seed: String(Date.now()) };
    renderQ();
  }
  function renderQ() {
    stopTimer();
    const q = byId[R.ids[R.i]];
    const c = q[LANG];
    const perm = shuffle([0, 1, 2, 3].slice(0, c.o.length), rng(q.id + R.seed));
    const passage = q.passage ? D.q.passages[q.passage][LANG] : null;
    screen(`
      ${backLink()}
      <div class="segs">${R.ids.map((_, k) => `<i class="${k < R.i ? (R.picks[k] === 0 ? "ok" : "bad") : k === R.i ? "cur" : ""}"></i>`).join("")}</div>
      <div class="run-meta"><span>${esc(nm(subj(q.subject)))} · ${R.i + 1}/${R.ids.length}</span><span class="clock" id="clock">${icon("clock")}<b id="sec">2:00</b></span></div>
      <div class="tbar"><i id="tbar"></i></div>
      ${passage ? `<div class="passage"><div class="cap">${t("readText")}</div><p>${esc(passage)}</p></div>` : ""}
      <h2 class="qtext">${esc(c.q)}</h2>
      <div class="opts">${perm.map((o, k) => `<button class="opt" data-opt="${o}"><span class="let">${"ABCD"[k]}</span><span>${esc(c.o[o])}</span></button>`).join("")}</div>
      <div id="after"></div>`);
    const t0 = (R.t0 = Date.now());
    const bar = $("#tbar");
    requestAnimationFrame(() => { bar.style.transition = `width ${LIMIT}s linear`; bar.style.width = "0%"; });
    timer = setInterval(() => {
      const left = Math.max(0, LIMIT - Math.floor((Date.now() - t0) / 1000));
      const el = $("#sec");
      if (!el) return stopTimer();
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      $("#clock").classList.toggle("low", left <= 15);
      if (left === 0) answer(-1);
    }, 250);
  }
  function answer(o) {
    if (R.picks.length > R.i) return;
    stopTimer();
    const q = byId[R.ids[R.i]];
    const ok = o === 0;
    R.picks.push(o);
    haptic(ok ? "ok" : "bad");
    const bar = $("#tbar");
    if (bar) { bar.style.transition = "none"; bar.style.width = `${Math.max(0, 100 - ((Date.now() - R.t0) / 1000 / LIMIT) * 100)}%`; }
    document.querySelectorAll(".opt").forEach((b) => {
      const v = Number(b.dataset.opt);
      b.disabled = true;
      if (v === 0) b.classList.add("right");
      else if (v === o) b.classList.add("wrong");
    });
    const v = S.res[q.id] || [0, 0, ""];
    v[ok ? 0 : 1]++;
    v[2] = today();
    S.res[q.id] = v;
    save("res");
    if (R.mode === "day") { S.day.picks = R.picks.slice(); save("day"); }
    const last = R.i === R.ids.length - 1;
    $("#after").innerHTML = `<div class="expl"><div class="v ${ok ? "ok" : "bad"}">${icon(ok ? "circle-check" : "circle-x")}${o === -1 ? t("timeout") : ok ? t("right") : t("wrong")}</div><p>${esc(q[LANG].e)}</p></div>
      <div class="stick"><button class="btn" data-next="1">${last ? t("finish") : t("next")} ${icon("arrow-right")}</button></div>`;
  }
  function nextQ() {
    R.i++;
    if (R.i < R.ids.length) return renderQ();
    if (R.mode === "day" && !S.day.done) {
      S.day.done = true;
      save("day");
      const d = today();
      if (S.streak.last !== d) {
        S.streak.n = S.streak.last === today(-1) ? S.streak.n + 1 : 1;
        S.streak.last = d;
        S.streak.best = Math.max(S.streak.best || 0, S.streak.n);
        save("streak");
      }
    }
    showResult();
  }
  function showResult() {
    stopTimer();
    const good = R.picks.filter((x) => x === 0).length;
    const n = R.ids.length;
    const msg = good === n ? t("res5") : good >= Math.ceil(n * 0.6) ? t("res3") : t("res0");
    const sn = streakNow();
    screen(`
      ${backLink()}
      <div class="score"><div class="num">${good}<small style="font-size:28px">/${n}</small></div><div class="msg">${msg}</div>
        ${R.mode === "day" ? `<div class="flame">${icon("flame")}${sn} ${t("streak", sn)}</div>` : ""}</div>
      <div class="card" style="margin-top:14px">${R.ids.map((id, k) => `<div class="rev">${icon(R.picks[k] === 0 ? "circle-check" : "circle-x", `ti ${R.picks[k] === 0 ? "ok" : "bad"}`)}<div>${esc(byId[id][LANG].q)}<small>${esc(nm(subj(byId[id].subject)))}</small></div></div>`).join("")}</div>
      <div style="margin-top:16px">
        ${R.mode === "practice" ? `<button class="btn" data-practice="${R.subject}">${t("more")}</button>` : `<button class="btn" data-share="1">${icon("users")}${t("share")}</button>`}
        <button class="btn ghost" data-go="#/">${t("toHome")}</button>
      </div>`);
  }
  function share() {
    const url = D.cfg.bot ? `https://t.me/${D.cfg.bot}` : location.href;
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t("shareText"))}`;
    haptic();
    if (tg) tg.openTelegramLink(link);
    else window.open(link, "_blank", "noopener");
  }

  // ---------- subject ----------
  function showSubject(id) {
    const s = mySubjects().find((x) => x.id === id) || (subj(id) && { ...subj(id), tasks: D.subjects.profileTasks, max: D.subjects.profileMax, min: D.subjects.profileMin, profile: true });
    if (!s) return go("#/");
    const qs = pool().filter((q) => q.subject === id);
    const st = stat(id);
    const topics = [...new Set(qs.map((q) => q.topic))];
    screen(`
      ${backLink()}
      <h1 class="title">${esc(nm(s))}</h1>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:0">
        <div class="card" style="margin:0"><div class="num">${s.tasks}</div><div class="lbl">${t("tasks")}</div></div>
        <div class="card" style="margin:0"><div class="num">${s.max}</div><div class="lbl">${t("maxPts")}</div></div>
        <div class="card" style="margin:0"><div class="num">${s.min}</div><div class="lbl">${t("minPts")}</div></div>
      </div>
      ${st.n ? `<div class="card" style="margin-top:10px"><div class="lbl">${t("acc", Math.round(st.acc * 100))}</div><div class="bar"><i style="width:${Math.round(st.acc * 100)}%"></i></div></div>` : ""}
      ${qs.length ? `<div style="margin-top:16px"><button class="btn" data-practice="${id}">${icon("bolt")}${t("practiceN", Math.min(10, qs.length))}</button></div>
        <div class="h">${t("topics")}</div><div class="list">${topics.map((x) => `<div class="li"><span class="k">${esc(x)}</span><span class="v">${qs.filter((q) => q.topic === x).length}</span></div>`).join("")}</div>`
        : `<div class="card" style="margin-top:14px"><div class="lock">${icon("sparkles")}<div class="sub" style="margin:0">${t("programSoon")}</div></div></div>`}`);
  }

  // ---------- calculator ----------
  const calcVals = {};
  function showCalc() {
    const base = isCreative() ? D.subjects.compulsory.filter((s) => s.id !== "mathlit") : D.subjects.compulsory;
    const prof = isCreative() ? [] : Array.isArray(S.profile?.pair) ? S.profile.pair.map((id) => ({ ...subj(id) })) : [{ id: "p1", ru: T.ru.prof1, kk: T.kk.prof1 }, { id: "p2", ru: T.ru.prof2, kk: T.kk.prof2 }];
    const rows = [...base, ...prof.map((s) => ({ ...s, max: D.subjects.profileMax, min: D.subjects.profileMin }))];
    screen(`
      ${backLink()}
      <h1 class="title">${t("calc")}</h1>
      <p class="lead">${isCreative() ? t("creativeCalc") : t("calcHint")}</p>
      <div class="card">${rows.map((s) => `<div class="calc-row" data-row="${s.id}"><div class="k">${esc(nm(s))}<small>${t("okMin", s.min)} · max ${s.max}</small></div>
        <div class="step"><button data-inc="${s.id}|-1" aria-label="-">-</button><input inputmode="numeric" data-in="${s.id}" data-max="${s.max}" value="${calcVals[s.id] ?? ""}" placeholder="0"><button data-inc="${s.id}|1" aria-label="+">+</button></div></div>`).join("")}</div>
      <div id="calc-out"></div>`);
    const upd = () => {
      let sum = 0, fail = false;
      rows.forEach((s) => {
        const v = Number(calcVals[s.id] || 0);
        sum += v;
        const low = v < s.min;
        fail ||= low;
        const small = $(`[data-row="${s.id}"] small`);
        small.textContent = low ? t("belowMin", s.min) : t("okMin", s.min);
        small.classList.toggle("bad", low && calcVals[s.id] !== undefined && calcVals[s.id] !== "");
      });
      const max = rows.reduce((a, s) => a + s.max, 0);
      const ths = [["thOther", 50], ["thNat", D.directions.national], ["thMed", 70], ["thPed", 75], ["thLaw", 75]];
      $("#calc-out").innerHTML = `
        <div class="card" style="margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end">
          <div><div class="lbl">${t("total")}</div><div class="num">${sum} <small>/ ${max}</small></div></div>
          ${S.profile ? `<div style="text-align:right"><div class="lbl">${t("yourGoal")}</div><div class="num brand">${S.profile.goal}</div></div>` : ""}
        </div>
        ${isCreative() ? "" : `<div class="h">${t("where")}</div>
        ${fail ? `<div class="card" style="background:var(--bad-bg);color:var(--bad);font-size:14px">${t("failMin")}</div>` : ""}
        <div class="card">${ths.map(([k, n]) => { const ok = !fail && sum >= n; return `<div class="th ${ok ? "ok" : "no"}">${icon(ok ? "circle-check" : "circle-x")}${t(k)}<b>${n}</b></div>`; }).join("")}</div>`}
        <p class="note">${t("grantNote")}</p>`;
    };
    upd();
    $("#screen").oninput = (e) => {
      const el = e.target.closest("[data-in]");
      if (!el) return;
      const max = Number(el.dataset.max);
      const v = el.value.replace(/\D/g, "").slice(0, 3);
      const n = v === "" ? "" : Math.min(max, Number(v));
      el.value = n;
      calcVals[el.dataset.in] = n;
      upd();
    };
    $("#screen").onclick = (e) => {
      const b = e.target.closest("[data-inc]");
      if (!b) return;
      const [id, d] = b.dataset.inc.split("|");
      const inp = $(`[data-in="${id}"]`);
      const n = Math.max(0, Math.min(Number(inp.dataset.max), Number(inp.value || 0) + Number(d)));
      inp.value = n;
      calcVals[id] = n;
      haptic();
      upd();
    };
  }

  // ---------- rules, privacy ----------
  function showRules() {
    screen(`
      ${backLink()}
      <h1 class="title">${t("rules")}</h1>
      ${D.rules.sections.map((s) => `<div class="card rule"><h3>${icon(s.icon)}${esc(s[LANG].t)}</h3><ul>${s[LANG].items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      <p class="note">${D.rules.sources.map((u) => `<a data-link="${esc(u)}" style="color:var(--ink3)">${esc(new URL(u).hostname)}</a>`).join(" · ")}</p>`);
  }
  const PRIVACY = {
    ru: `<p><b>Версия 0.1, 27.09.2026</b></p>
      <p><b>1. Что хранится.</b> Язык, класс, профильные предметы, направление, цель, ник, ответы на задания и серия дней. Эти данные лежат в облачном хранилище Telegram (CloudStorage) твоего аккаунта и доступны только этому приложению.</p>
      <p><b>2. Чего нет.</b> У этой версии приложения нет своего сервера. Мы не собираем телефон, фамилию и школу и не передаём данные третьим лицам.</p>
      <p><b>3. Данные Telegram.</b> Telegram передаёт приложению имя и id аккаунта. Имя видно только тебе на экране аккаунта.</p>
      <p><b>4. Удаление.</b> Кнопка "Сбросить мои данные" в аккаунте стирает всё сохранённое.</p>
      <p><b>5. Изменения.</b> Когда появятся рейтинг и подписка, часть данных начнёт храниться на сервере. Мы обновим эту политику до запуска этих функций.</p>`,
    kk: `<p><b>0.1 нұсқа, 27.09.2026</b></p>
      <p><b>1. Не сақталады.</b> Тіл, сынып, бейіндік пәндер, бағыт, мақсат, лақап ат, тапсырмаларға жауаптар және күндер сериясы. Бұл деректер Telegram аккаунтыңның бұлттық қоймасында (CloudStorage) сақталады және тек осы қосымшаға қолжетімді.</p>
      <p><b>2. Не жоқ.</b> Қосымшаның бұл нұсқасында өз сервері жоқ. Телефон нөмірін, тегіңді, мектебіңді жинамаймыз және деректерді үшінші тұлғаларға бермейміз.</p>
      <p><b>3. Telegram деректері.</b> Telegram қосымшаға аккаунттың атын және id-ін береді. Атың тек саған аккаунт бетінде көрінеді.</p>
      <p><b>4. Өшіру.</b> Аккаунттағы "Деректерімді өшіру" батырмасы сақталғанның бәрін өшіреді.</p>
      <p><b>5. Өзгерістер.</b> Рейтинг пен жазылым шыққанда деректердің бір бөлігі серверде сақтала бастайды. Бұл саясатты ол функциялар іске қосылғанға дейін жаңартамыз.</p>`,
  };
  function showPrivacy() {
    screen(`${backLink()}<h1 class="title">${t("privacy")}</h1><div class="doc">${PRIVACY[LANG]}</div>`);
  }

  // ---------- onboarding ----------
  const NICKS = ["Қыран", "Барыс", "Сұңқар", "Тұлпар", "Бүркіт", "Арлан", "Жолбарыс", "Құлан", "Аққу", "Самұрық"];
  let O = null;
  function showOnboarding(step = 0) {
    const p = S.profile;
    O = { step, d: p ? { ...p } : { lang: initLang(), grade: null, pair: null, dir: null, national: false, goal: null } };
    $("#onb").classList.add("open");
    tg?.BackButton.show();
    renderOnb();
  }
  function renderOnb() {
    const { step, d } = O;
    const N = 6;
    LANG = d.lang || LANG;
    const ch = (on, inner, attr) => `<button class="choice${on ? " on" : ""}" ${attr}>${inner}<span class="mark">${icon("check")}</span></button>`;
    let body = "";
    let canNext = true;
    if (step === 0) {
      body = `<h1 class="title" style="white-space:pre-line">${t("o1")}</h1>
        ${ch(d.lang === "kk", `<span class="k"><span class="big-lang">Қазақша</span></span>`, `data-o="lang|kk"`)}
        ${ch(d.lang === "ru", `<span class="k"><span class="big-lang">Русский</span></span>`, `data-o="lang|ru"`)}`;
    } else if (step === 1) {
      body = `<h1 class="title">${t("o2")}</h1>${[10, 11, 12].map((g) => ch(d.grade === g, `<span class="k"><span class="t">${t({ 10: "g10", 11: "g11", 12: "g12" }[g])}</span></span>`, `data-o="grade|${g}"`)).join("")}`;
      canNext = !!d.grade;
    } else if (step === 2) {
      const cur = Array.isArray(d.pair) ? d.pair.join("+") : d.pair;
      body = `<h1 class="title">${t("o3")}</h1><p class="lead">${t("o3s")}</p>
        ${D.pairs.pairs.map((x) => ch(cur === `${x.a}+${x.b}`, `<span class="k"><span class="t" style="display:block">${esc(nm(subj(x.a)))} + ${esc(nm(subj(x.b)))}</span><span class="s" style="display:block">${esc(x[LANG])}</span></span>`, `data-o="pair|${x.a}+${x.b}"`)).join("")}
        ${ch(cur === "creative", `<span class="k"><span class="t" style="display:block">${t("creative")}</span><span class="s" style="display:block">${esc(D.pairs.creative[LANG])}</span></span>`, `data-o="pair|creative"`)}`;
      canNext = !!d.pair;
    } else if (step === 3) {
      body = `<h1 class="title">${t("o4")}</h1><p class="lead">${t("o4s")}</p>
        ${D.directions.directions.map((x) => ch(d.dir === x.id, `<span class="ic">${icon(x.icon)}</span><span class="k"><span class="t" style="display:block">${esc(nm(x))}</span><span class="s" style="display:block">${t("thr", x.min)}</span></span>`, `data-o="dir|${x.id}"`)).join("")}
        <button class="toggle${d.national ? " on" : ""}" data-o="national|1"><span class="k"><span class="t" style="display:block;font-weight:700">${t("natQ")}</span><span class="s" style="display:block;font-size:13px;color:var(--ink2)">${t("natS")}</span></span><span class="sw"></span></button>`;
      canNext = !!d.dir;
    } else if (step === 4) {
      const th = threshold(d);
      const max = d.pair === "creative" ? 130 : 140;
      if (d.goal == null || d.goal < th || d.goal > max) d.goal = Math.min(max, Math.max(th, 100));
      body = `<h1 class="title">${t("o5")}</h1><p class="lead">${t("o5s")}</p>
        <div class="goal-big"><span id="gv">${d.goal}</span> <small>/ ${max}</small></div>
        <input type="range" min="${th}" max="${max}" step="1" value="${d.goal}" id="goal">
        <div class="scale"><span>${th}</span><span>${max}</span></div>
        <p class="note">${t("thr", th)}</p>`;
    } else {
      body = `<div style="text-align:center;padding-top:30px"><img src="avatar.png" alt="" style="width:96px;height:96px;border-radius:26px"><h1 class="title" style="margin-top:18px">${t("o6")}</h1><p class="lead" style="margin:0">${t("o6s")}</p></div>`;
    }
    $("#onb").innerHTML = `
      <div class="onb-head"><div class="run-meta"><span>${t("step", step + 1, N)}</span>${step > 0 ? `<button data-ostep="-1" style="color:var(--brand);font-weight:600">${t("back")}</button>` : "<span></span>"}</div>
        <div class="onb-prog"><i style="width:${((step + 1) / N) * 100}%"></i></div></div>
      <div class="onb-body">${body}</div>
      <div class="onb-foot">${step < N - 1 ? `<button class="btn" data-ostep="1" style="${canNext ? "" : "opacity:.45"}">${t("next")}</button>` : `<button class="btn" data-ofinish="test">${t("startTest")}</button><button class="btn ghost" data-ofinish="home">${t("later")}</button>`}</div>`;
    $("#onb .onb-body").scrollTop = 0;
    const g = $("#goal");
    if (g) g.oninput = () => { d.goal = Number(g.value); $("#gv").textContent = d.goal; };
  }
  function onbClick(el) {
    const { d } = O;
    if (el.dataset.o) {
      const [k, v] = el.dataset.o.split("|");
      haptic();
      if (k === "lang") d.lang = v;
      else if (k === "grade") d.grade = Number(v);
      else if (k === "pair") d.pair = v === "creative" ? "creative" : v.split("+");
      else if (k === "dir") d.dir = v;
      else if (k === "national") d.national = !d.national;
      if (k === "lang") { LANG = v; setTimeout(() => { O.step = 1; renderOnb(); }, 180); }
      return renderOnb();
    }
    if (el.dataset.ostep) {
      const dir = Number(el.dataset.ostep);
      if (dir > 0) {
        const need = [d.lang, d.grade, d.pair, d.dir, d.goal][O.step];
        if (O.step < 5 && need == null) return toast(t("pick"));
      }
      O.step = Math.max(0, O.step + dir);
      haptic();
      return renderOnb();
    }
    if (el.dataset.ofinish) finishOnb(el.dataset.ofinish);
  }
  async function finishOnb(next) {
    const d = O.d;
    d.nick ||= `${NICKS[Math.floor(Math.random() * NICKS.length)]} ${1000 + Math.floor(Math.random() * 9000)}`;
    d.created ||= today();
    S.profile = d;
    LANG = d.lang;
    await save("profile");
    O = null;
    $("#onb").classList.remove("open");
    haptic("ok");
    renderHome();
    renderAccount();
    if (next === "test") go("#/test");
    else { tg?.BackButton.hide(); go("#/"); }
  }

  // ---------- router ----------
  const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
  function route() {
    stopTimer();
    const [a, b] = location.hash.replace(/^#\/?/, "").split("/");
    try {
      if (!a || a === "home" || a === "account") { hideScreen(); if (a === "account") pagerTo(1); return; }
      if (a === "test") return openDay();
      if (a === "practice" && b) return openPractice(b);
      if (a === "subj" && b) return showSubject(b);
      if (a === "calc") return showCalc();
      if (a === "rules") return showRules();
      if (a === "privacy") return showPrivacy();
      go("#/");
    } catch (e) {
      console.error(e);
      screen(`${backLink()}<div class="empty">${t("err")}</div>`);
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go],[data-link],[data-page],[data-banner],[data-opt],[data-next],[data-practice],[data-share],[data-lang],[data-edit],[data-reset],[data-o],[data-ostep],[data-ofinish]");
    if (!el) return;
    if (el.closest("#onb")) return onbClick(el);
    if (el.dataset.opt !== undefined) return answer(Number(el.dataset.opt));
    if (el.dataset.next) return nextQ();
    if (el.dataset.practice) { haptic(); location.hash = `#/practice/${el.dataset.practice}`; return; }
    if (el.dataset.share) return share();
    if (el.dataset.page) { haptic(); return pagerTo(Number(el.dataset.page)); }
    if (el.dataset.banner) { haptic(); return toast(t("soonSub")); }
    if (el.dataset.edit) return showOnboarding(Number(el.dataset.edit));
    if (el.dataset.lang) {
      if (!S.profile || S.profile.lang === el.dataset.lang) return;
      S.profile.lang = LANG = el.dataset.lang;
      save("profile");
      haptic();
      renderHome();
      renderAccount();
      return;
    }
    if (el.dataset.reset) {
      const doReset = async () => {
        await store.del(KEYS);
        Object.assign(S, { profile: null, res: {}, streak: { last: null, n: 0, best: 0 }, day: null });
        toast(t("resetDone"));
        renderHome();
        renderAccount();
        pagerTo(0, false);
        showOnboarding(0);
      };
      if (tg?.showConfirm) tg.showConfirm(t("resetQ"), (ok) => ok && doReset());
      else if (confirm(t("resetQ"))) doReset();
      return;
    }
    if (el.dataset.link) return tg ? (/^https:\/\/t\.me\//.test(el.dataset.link) ? tg.openTelegramLink(el.dataset.link) : tg.openLink(el.dataset.link)) : window.open(el.dataset.link, "_blank", "noopener");
    haptic();
    go(el.dataset.go);
  });

  tg?.BackButton.onClick(() => {
    if (O) {
      if (!S.profile) { if (O.step > 0) { O.step--; renderOnb(); } return; }
      O = null;
      $("#onb").classList.remove("open");
      renderHome();
      renderAccount();
      if (!$("#screen").classList.contains("open")) tg.BackButton.hide();
      return;
    }
    if (history.length > 1) history.back();
    else go("#/");
  });
  window.addEventListener("hashchange", route);
  pager().addEventListener("scroll", onPagerScroll, { passive: true });

  // ---------- boot ----------
  try {
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor?.("#FF732D");
    tg?.setBackgroundColor?.("#FFFFFF");
    tg?.setBottomBarColor?.("#FFFFFF");
    if (tg?.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes();
  } catch {}
  Promise.all([loadData(), loadState()])
    .then(() => {
      LANG = initLang();
      document.documentElement.lang = LANG;
      renderHome();
      renderAccount();
      const start = tg?.initDataUnsafe?.start_param;
      const deep = { calc: "#/calc", rules: "#/rules", test: "#/test" }[start] || (start?.startsWith("subj_") ? `#/subj/${start.slice(5)}` : null);
      if (!S.profile) showOnboarding(0);
      else if (deep && !location.hash) location.hash = deep;
      route();
    })
    .catch((e) => {
      console.error(e);
      document.body.innerHTML = `<div class="empty">${T[initLang()].err}</div>`;
    });
})();
