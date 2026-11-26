/* Financiën – interface. Alle gegevens blijven versleuteld op dit apparaat. */
'use strict';

(() => {
  const $app = document.getElementById('app');
  const $dlg = document.getElementById('dlg');
  const $toast = document.getElementById('toast');
  const $fileCsv = document.getElementById('file-csv');
  const $fileBackup = document.getElementById('file-backup');

  // ---------- Opslag (IndexedDB, bevat alleen versleutelde gegevens) ----------
  const DB = {
    _db: null,
    async db() {
      if (this._db) return this._db;
      this._db = await new Promise((res, rej) => {
        const r = indexedDB.open('financien', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kluis');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this._db;
    },
    async tx(mode, fn) {
      const db = await this.db();
      return new Promise((res, rej) => {
        const t = db.transaction('kluis', mode);
        const req = fn(t.objectStore('kluis'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    },
    get() { return this.tx('readonly', s => s.get('main')); },
    put(v) { return this.tx('readwrite', s => s.put(v, 'main')); },
    clear() { return this.tx('readwrite', s => s.delete('main')); },
  };

  // ---------- Toestand ----------
  let key = null, meta = null, state = null;
  let view = { tab: 'overzicht', month: null, search: '', category: null };
  let lastActivity = Date.now(), hiddenAt = null;

  const newState = () => ({
    version: 1,
    transactions: [],
    rules: [],                      // eigen regels; ingebouwde regels komen uit Core
    categories: Core.DEFAULT_CATEGORIES.slice(),
    settings: { autoLockMin: 5, lastBackup: null },
  });

  async function save() {
    await DB.put(await Core.seal(key, meta, state));
  }

  function lock() {
    key = meta = state = null;
    $dlg.open && $dlg.close();
    renderUnlock();
  }

  // ---------- Hulpjes ----------
  const h = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const money = c => eur.format(c / 100);
  const eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const moneyShort = c => eur0.format(Math.round(c / 100));
  const svg = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    overzicht: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    transacties: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    importeren: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
    instellingen: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  };
  const monthName = m => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  };
  const dayName = d => {
    const [y, mo, da] = d.split('-').map(Number);
    return new Date(y, mo - 1, da).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const shiftMonth = (m, n) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const PALETTE = ['#2f8f6b', '#d98c2b', '#4f7cc4', '#c45a6a', '#8a6cc4', '#3aa0a8', '#b7a13a',
    '#7c8c3a', '#c4784f', '#5a6fa8', '#a85a9c', '#6aa84f', '#9c9c9c', '#6b7a8f', '#8f8f8f'];
  const color = cat => {
    const i = state.categories.indexOf(cat);
    return PALETTE[(i < 0 ? state.categories.length : i) % PALETTE.length];
  };

  function toast(msg, ms = 3500) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { $toast.hidden = true; }, ms);
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Even geduld…'; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  // Na het tekenen: breedtes/hoogtes zetten (CSP staat geen style-attributen toe)
  function applySizes() {
    $app.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
    $app.querySelectorAll('[data-h]').forEach(el => { el.style.height = el.dataset.h + '%'; });
    $app.querySelectorAll('[data-c]').forEach(el => { el.style.background = el.dataset.c; });
  }

  // ---------- Categoriseren ----------
  function ownAccounts() {
    return new Set(state.transactions.map(t => t.account).filter(Boolean));
  }
  function allRules() { return state.rules.concat(Core.defaultRules()); }
  function recategorize() {
    const rules = allRules(), own = ownAccounts();
    for (const t of state.transactions) if (!t.manual) t.category = Core.categorize(t, rules, own);
  }

  // ---------- Schermen: instellen en ontgrendelen ----------
  function renderSetup() {
    $app.className = '';
    $app.innerHTML = `
      <section class="center card">
        <div class="logo">€</div>
        <h1>Welkom bij Financiën</h1>
        <p class="muted">Kies een sterk wachtwoord. Hiermee worden al je gegevens op dit apparaat versleuteld.</p>
        <form data-form="setup" autocomplete="off">
          <label>Wachtwoord<input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>
          <label>Herhaal wachtwoord<input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>
          <p class="warn">Let op: er is geen "wachtwoord vergeten". Ben je het kwijt, dan zijn je gegevens niet meer te openen. Bewaar het bijvoorbeeld in je wachtwoordbeheerder.</p>
          <button class="primary" type="submit">Kluis aanmaken</button>
        </form>
        <div class="sep"><span>of</span></div>
        <button data-action="restore-start">Back-up herstellen (ander apparaat)</button>
      </section>`;
  }

  function renderUnlock() {
    $app.className = '';
    $app.innerHTML = `
      <section class="center card">
        <div class="logo">🔒</div>
        <h1>Financiën is vergrendeld</h1>
        <form data-form="unlock" autocomplete="off">
          <label>Wachtwoord<input type="password" name="p" required autocomplete="current-password" autofocus></label>
          <button class="primary" type="submit">Ontgrendelen</button>
        </form>
      </section>`;
    const inp = $app.querySelector('input');
    inp && setTimeout(() => inp.focus(), 50);
  }

  // ---------- Hoofdscherm ----------
  function render() {
    if (!state) return;
    if (view.tab !== 'transacties' && view.month === 'alle') view.month = null;
    if (!view.month) {
      const months = state.transactions.map(t => t.date.slice(0, 7)).sort();
      view.month = months.length ? months[months.length - 1] : thisMonth();
    }
    const tabs = [['overzicht', 'Overzicht', '◔'], ['transacties', 'Transacties', '≡'],
      ['importeren', 'Importeren', '⇪'], ['instellingen', 'Instellingen', '⚙']];
    let body = '';
    if (view.tab === 'overzicht') body = viewOverview();
    else if (view.tab === 'transacties') body = viewTransactions();
    else if (view.tab === 'importeren') body = viewImport();
    else body = viewSettings();

    $app.className = 'shell';
    $app.innerHTML = `
      <header class="top">
        <h1>${h(tabs.find(t => t[0] === view.tab)[1])}</h1>
        <button class="icon" data-action="lock" aria-label="Vergrendelen" title="Vergrendelen">${ICONS.lock}</button>
      </header>
      <div class="content">${body}</div>
      <nav class="tabs">
        <div class="brand"><span class="logo sm">€</span>Financiën</div>
        ${tabs.map(([id, label, ic]) => `
          <button data-action="tab" data-tab="${id}" class="${view.tab === id ? 'active' : ''}">
            <span class="ic">${ICONS[id]}</span><span>${label}</span></button>`).join('')}
      </nav>`;
    applySizes();
  }

  function monthOptions() {
    const set = monthsWithData();
    if (view.month && view.month !== 'alle') set.add(view.month);
    return [...set].sort().reverse();
  }
  function periodText(list) {
    if (!list.length) return '–';
    const ds = list.map(t => t.date).sort();
    const f = d => { const [y, mo, da] = d.split('-').map(Number); return new Date(y, mo - 1, da).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }); };
    return `${f(ds[0])} t/m ${f(ds[ds.length - 1])}`;
  }

  function monthPicker() {
    return `
      <div class="month">
        <button class="icon" data-action="month" data-n="-1" aria-label="Vorige maand">‹</button>
        <select class="monthsel" data-input="month" aria-label="Kies maand">
          ${monthOptions().map(m => `<option value="${m}" ${m === view.month ? 'selected' : ''}>${h(monthName(m))}</option>`).join('')}
        </select>
        <button class="icon" data-action="month" data-n="1" aria-label="Volgende maand">›</button>
      </div>`;
  }

  function totals(list) {
    let inc = 0, exp = 0;
    for (const t of list) {
      if (t.category === Core.OWN) continue;
      if (t.amount > 0) inc += t.amount; else exp += -t.amount;
    }
    return { inc, exp, net: inc - exp };
  }

  const INCOME_CATS = ['Inkomen', 'Overig inkomen'];
  function spendByCat(month) {
    const m = new Map();
    for (const t of state.transactions) {
      if (!t.date.startsWith(month) || t.category === Core.OWN || INCOME_CATS.includes(t.category)) continue;
      m.set(t.category, (m.get(t.category) || 0) - t.amount);
    }
    return m;
  }
  function averageSpend(months) {
    const sum = new Map();
    for (const mo of months) for (const [c, v] of spendByCat(mo)) sum.set(c, (sum.get(c) || 0) + Math.max(0, v));
    for (const [c, v] of sum) sum.set(c, Math.round(v / months.length));
    return sum;
  }
  function monthsWithData() { return new Set(state.transactions.map(t => t.date.slice(0, 7))); }
  function shortMonth(m) {
    return new Date(m + '-01T12:00').toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '');
  }
  // lowerIsGood: bij uitgaven is minder goed (groen), bij inkomsten is meer goed
  function deltaHtml(cur, prev, lowerIsGood, label) {
    const d = cur - prev;
    if (Math.abs(d) < 100) return `<small class="delta">= gelijk aan ${h(label)}</small>`;
    const good = lowerIsGood ? d < 0 : d > 0;
    return `<small class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${moneyShort(Math.abs(d))} t.o.v. ${h(label)}</small>`;
  }

  function catDetail(cat) {
    const data = monthsWithData();
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(view.month, -i));
    const rows = months.map(m => ({ m, v: data.has(m) ? Math.max(0, spendByCat(m).get(cat) || 0) : null }));
    const known = rows.filter(r => r.v != null);
    const mx = Math.max(1, ...known.map(r => r.v));
    const avgAll = known.length ? Math.round(known.reduce((a, r) => a + r.v, 0) / known.length) : 0;
    openDialog(`<div>
      <h2><span class="dot" data-c="${color(cat)}"></span> ${h(cat)}</h2>
      <p class="muted small">Uitgaven per maand. Gemiddeld ${money(avgAll)} over ${known.length} maand${known.length === 1 ? '' : 'en'}.</p>
      <div class="hist">
        ${rows.map((r, i) => {
          const p = i > 0 ? rows[i - 1].v : null;
          return `<div class="hrow ${r.m === view.month ? 'cur' : ''}">
            <span class="lbl">${h(shortMonth(r.m))}</span>
            <span class="bar"><span data-w="${r.v == null ? 0 : (r.v / mx * 100).toFixed(1)}" data-c="${color(cat)}"></span></span>
            <span class="amt">${r.v == null ? '<span class="muted">–</span>' : money(r.v)}</span>
            <span class="d">${r.v != null && p != null ? deltaHtml(r.v, p, true, shortMonth(rows[i - 1].m)).replace(/ t\.o\.v\. [^<]+/, '').replace(/= gelijk aan [^<]+/, '=') : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="btns">
        <button type="button" data-action="close">Sluiten</button>
        <button class="primary" data-action="filter-cat" data-cat="${h(cat)}">Bekijk transacties</button>
      </div></div>`);
    $dlg.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
  }

  function viewOverview() {
    if (!state.transactions.length) {
      return `<div class="card empty">
        <p>Nog geen transacties.</p>
        <p class="muted">Download een CSV-bestand bij Rabobank en importeer het hier.</p>
        <button class="primary" data-action="tab" data-tab="importeren">Transacties importeren</button>
      </div>`;
    }
    const list = state.transactions.filter(t => t.date.startsWith(view.month));
    const { inc, exp, net } = totals(list);

    // Vergelijkingsbasis: vorige maand en gemiddelde van de 3 maanden ervoor (alleen maanden met gegevens)
    const dataMonths = monthsWithData();
    const prevM = shiftMonth(view.month, -1);
    const hasPrev = dataMonths.has(prevM);
    const avgMonths = [1, 2, 3].map(i => shiftMonth(view.month, -i)).filter(m => dataMonths.has(m));
    const prevTot = hasPrev ? totals(state.transactions.filter(t => t.date.startsWith(prevM))) : null;

    const cur = spendByCat(view.month);
    const prev = hasPrev ? spendByCat(prevM) : null;
    const avg = averageSpend(avgMonths);
    const cats = [...cur].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = cats.length ? cats[0][1] : 1;

    // Opvallende verschillen t.o.v. het gemiddelde
    let highlights = [];
    if (avgMonths.length) {
      const all = new Set([...cur.keys(), ...avg.keys()]);
      highlights = [...all].map(c => {
        const a = avg.get(c) || 0, v = Math.max(0, cur.get(c) || 0);
        return { c, v, a, d: v - a };
      }).filter(x => Math.abs(x.d) >= 1000 && Math.abs(x.d) >= 0.15 * Math.max(x.a, 1))
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3);
    }
    const pm = shortMonth(prevM);

    // Laatste 6 maanden
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(view.month, -i));
    const series = months.map(m => ({ m, ...totals(state.transactions.filter(t => t.date.startsWith(m))) }));
    const smax = Math.max(1, ...series.map(s => Math.max(s.inc, s.exp)));

    // Saldo per rekening (laatst bekende)
    const bal = new Map();
    for (const t of [...state.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
      if (t.balance != null && t.account) bal.set(t.account, { b: t.balance, d: t.date });
    }

    const lb = state.settings.lastBackup;
    const backupOld = !lb || (Date.now() - new Date(lb).getTime()) > 14 * 864e5;

    return `
      ${backupOld ? `<div class="notice">Je hebt ${lb ? 'al ruim 2 weken' : 'nog'} geen back-up gemaakt.
        <button class="link" data-action="backup">Nu back-up maken</button></div>` : ''}
      ${monthPicker()}

      <div class="kpis">
        <div class="kpi"><span>Inkomsten</span><strong class="pos" title="${money(inc)}">${moneyShort(inc)}</strong>
          ${prevTot ? deltaHtml(inc, prevTot.inc, false, pm) : ''}</div>
        <div class="kpi"><span>Uitgaven</span><strong class="neg" title="${money(exp)}">${moneyShort(exp)}</strong>
          ${prevTot ? deltaHtml(exp, prevTot.exp, true, pm) : ''}</div>
        <div class="kpi"><span>Over</span><strong class="${net >= 0 ? 'pos' : 'neg'}" title="${money(net)}">${moneyShort(net)}</strong>
          ${prevTot ? deltaHtml(net, prevTot.net, false, pm) : ''}</div>
      </div>

      ${highlights.length ? `<section class="card">
        <h2>Opvallend deze maand</h2>
        <p class="muted small">Vergeleken met je gemiddelde van ${avgMonths.length === 1 ? 'de vorige maand' : `de ${avgMonths.length} maanden ervoor`}.</p>
        ${highlights.map(x => `
          <button class="hl" data-action="cat-detail" data-cat="${h(x.c)}">
            <span class="dot" data-c="${color(x.c)}"></span>
            <span class="name">${h(x.c)}</span>
            <span class="delta ${x.d > 0 ? 'bad' : 'good'}">${x.d > 0 ? '▲' : '▼'} ${money(Math.abs(x.d))} ${x.d > 0 ? 'meer' : 'minder'}</span>
          </button>`).join('')}
      </section>` : ''}

      <div class="ov-grid"><div>
      <section class="card">
        <h2>Uitgaven per categorie</h2>
        ${cats.length ? cats.map(([c, v]) => {
          const pv = prev ? Math.max(0, prev.get(c) || 0) : null;
          const av = avgMonths.length ? (avg.get(c) || 0) : null;
          return `
          <button class="catrow" data-action="cat-detail" data-cat="${h(c)}">
            <span class="dot" data-c="${color(c)}"></span>
            <span class="name">${h(c)}</span>
            <span class="amt">${money(v)}</span>
            <span class="bar"><span data-w="${(v / max * 100).toFixed(1)}" data-c="${color(c)}"></span></span>
            ${pv != null || av != null ? `<span class="cmp">
              ${pv != null ? deltaHtml(v, pv, true, pm) : ''}
              ${av != null ? `<span class="muted">gem. ${moneyShort(av)}</span>` : ''}
            </span>` : ''}
          </button>`;
        }).join('') : '<p class="muted">Geen uitgaven deze maand.</p>'}
        <p class="muted small">Tik op een categorie voor het verloop per maand.</p>
      </section>
      </div><div>
      <section class="card">
        <h2>Laatste 6 maanden</h2>
        <div class="chart">
          ${series.map(s => `
            <div class="col ${s.m === view.month ? 'cur' : ''}">
              <div class="bars">
                <span class="b inc" data-h="${(s.inc / smax * 100).toFixed(1)}" title="Inkomsten ${money(s.inc)}"></span>
                <span class="b exp" data-h="${(s.exp / smax * 100).toFixed(1)}" title="Uitgaven ${money(s.exp)}"></span>
              </div>
              <span class="lbl">${h(new Date(s.m + '-01T12:00').toLocaleDateString('nl-NL', { month: 'short' }))}</span>
            </div>`).join('')}
        </div>
        <div class="legend"><span><i class="inc"></i>Inkomsten</span><span><i class="exp"></i>Uitgaven</span></div>
      </section>

      ${bal.size ? `<section class="card">
        <h2>Saldo</h2>
        ${[...bal].map(([acc, { b, d }]) => `
          <div class="row"><span class="mono">${h(acc.replace(/(.{4})/g, '$1 ').trim())}</span>
          <span><strong>${money(b)}</strong><br><small class="muted">op ${h(dayName(d))}</small></span></div>`).join('')}
      </section>` : ''}
      </div></div>
      ${allMonthsCard()}`;
  }

  function allMonthsCard() {
    const ms = [...monthsWithData()].sort().reverse();
    if (ms.length < 2) return '';
    return `<section class="card">
      <h2>Alle maanden (${ms.length})</h2>
      <div class="mrow head"><span>Maand</span><span>In</span><span>Uit</span><span>Over</span></div>
      ${ms.map(m => {
        const t = totals(state.transactions.filter(x => x.date.startsWith(m)));
        return `<button class="mrow ${m === view.month ? 'cur' : ''}" data-action="goto-month" data-m="${m}">
          <span>${h(new Date(m + '-01T12:00').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }))}</span>
          <span class="pos">${moneyShort(t.inc)}</span>
          <span>${moneyShort(t.exp)}</span>
          <span class="${t.net >= 0 ? 'pos' : 'neg'}">${moneyShort(t.net)}</span>
        </button>`;
      }).join('')}
    </section>`;
  }

  function txListHtml() {
    const q = view.search.trim().toLowerCase();
    let list = state.transactions.filter(t => view.month === 'alle' || t.date.startsWith(view.month));
    if (view.category) list = list.filter(t => t.category === view.category);
    if (q) list = list.filter(t => (t.counterparty + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q)
      || money(t.amount).includes(q));
    list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const shown = list.slice(0, 500);

    let lastDate = '', rows = '';
    for (const t of shown) {
      if (t.date !== lastDate) { rows += `<div class="day">${h(dayName(t.date))}</div>`; lastDate = t.date; }
      rows += `
        <button class="tx" data-action="edit-tx" data-id="${h(t.id)}">
          <span class="dot" data-c="${color(t.category)}"></span>
          <span class="main"><span class="who">${h(t.counterparty || t.description || '(onbekend)')}</span>
            <small class="muted">${h(t.category)}${t.manual ? ' ✎' : ''}${t.counterparty && t.description ? ' · ' + h(t.description) : ''}</small></span>
          <span class="amt ${t.amount >= 0 ? 'pos' : ''}">${money(t.amount)}</span>
        </button>`;
    }
    return `<div class="card list">${rows || '<p class="muted">Geen transacties gevonden.</p>'}</div>
      ${list.length > shown.length ? `<p class="muted center-text">Eerste 500 van ${list.length} getoond. Verfijn je zoekopdracht.</p>` : ''}`;
  }

  function viewTransactions() {
    return `
      ${view.month === 'alle'
        ? `<div class="month"><strong>Alle maanden</strong><button class="link" data-action="month-current">Per maand</button></div>`
        : monthPicker()}
      <div class="filters">
        <input type="search" placeholder="Zoeken…" value="${h(view.search)}" data-input="search" aria-label="Zoeken">
        ${view.month !== 'alle' ? '<button class="link" data-action="month-all">Alle maanden</button>' : ''}
      </div>
      ${view.category ? `<div class="chip">${h(view.category)} <button class="link" data-action="clear-cat" aria-label="Filter wissen">✕</button></div>` : ''}
      <div id="txlist">${txListHtml()}</div>`;
  }

  function viewImport() {
    const accounts = [...ownAccounts()];
    return `
      <section class="card">
        <h2>Rabobank CSV importeren</h2>
        <ol class="steps">
          <li>Open Rabo Internetbankieren op je computer, of de Rabo-app.</li>
          <li>Ga naar je rekening en kies <strong>Downloaden</strong> (of "Transacties downloaden").</li>
          <li>Kies formaat <strong>CSV</strong> en de periode die je wilt.</li>
          <li>Kies het bestand hieronder. Dubbele transacties worden automatisch overgeslagen.</li>
        </ol>
        <button class="primary" data-action="pick-csv">CSV-bestand kiezen</button>
        <p class="muted small">Het bestand wordt alleen op dit apparaat gelezen en niet verstuurd. Verwijder het daarna gerust uit je Downloads.</p>
      </section>
      <section class="card">
        <h2>Huidige gegevens</h2>
        <div class="row"><span>Transacties</span><strong>${state.transactions.length}</strong></div>
        <div class="row"><span>Periode</span><span>${h(periodText(state.transactions))}</span></div>
        <div class="row"><span>Maanden</span><strong>${monthsWithData().size}</strong></div>
        <div class="row"><span>Rekeningen</span><span class="mono right">${accounts.map(a => h(a)).join('<br>') || '–'}</span></div>
      </section>`;
  }

  function viewSettings() {
    const s = state.settings;
    const own = state.rules.map((r, i) => `
      <div class="row"><span>"${h(r.match)}" → ${h(r.category)}</span>
        <button class="link danger" data-action="del-rule" data-i="${i}">Verwijder</button></div>`).join('');
    return `
      <section class="card">
        <h2>Back-up & synchroniseren</h2>
        <p class="muted small">Een back-up is versleuteld met je wachtwoord. Bewaar hem in Google Drive (via "Bewaar in Bestanden" → Google Drive) en open hem op je andere apparaat met "Back-up terugzetten".</p>
        <p class="small">Laatste back-up: <strong>${s.lastBackup ? h(new Date(s.lastBackup).toLocaleString('nl-NL')) : 'nog nooit'}</strong></p>
        <div class="btns">
          <button class="primary" data-action="backup">Back-up maken</button>
          <button data-action="restore-start">Back-up terugzetten</button>
        </div>
      </section>
      <section class="card">
        <h2>Beveiliging</h2>
        <label class="inline">Automatisch vergrendelen na
          <select data-input="autolock">
            ${[1, 2, 5, 10, 15].map(m => `<option value="${m}" ${s.autoLockMin === m ? 'selected' : ''}>${m} min</option>`).join('')}
          </select></label>
        <button data-action="change-pw">Wachtwoord wijzigen</button>
      </section>
      <section class="card">
        <h2>Eigen categorieregels</h2>
        <p class="muted small">Ontstaan als je bij een transactie "Onthoud voor deze tegenpartij" aanvinkt. Ze gaan voor de ingebouwde regels.</p>
        ${own || '<p class="muted">Nog geen eigen regels.</p>'}
      </section>
      <section class="card">
        <h2>Categorieën</h2>
        <div class="chips">${state.categories.map(c => `<span class="chip"><span class="dot" data-c="${color(c)}"></span>${h(c)}</span>`).join('')}</div>
        <form data-form="add-cat" class="inline-form">
          <input name="c" placeholder="Nieuwe categorie" maxlength="40" required>
          <button type="submit">Toevoegen</button>
        </form>
      </section>
      <section class="card">
        <h2>Gevarenzone</h2>
        <button class="danger" data-action="wipe">Alle gegevens van dit apparaat wissen</button>
      </section>
      <p class="muted small center-text">Financiën v1 · alles lokaal versleuteld (AES-256-GCM)</p>`;
  }

  // ---------- Dialogen ----------
  function openDialog(html) {
    $dlg.innerHTML = html;
    $dlg.showModal();
    applySizesIn($dlg);
  }
  function applySizesIn(root) {
    root.querySelectorAll('[data-c]').forEach(el => { el.style.background = el.dataset.c; });
  }

  function editTx(id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) return;
    openDialog(`
      <form data-form="tx" data-id="${h(t.id)}">
        <h2>${h(t.counterparty || 'Transactie')}</h2>
        <p class="big ${t.amount >= 0 ? 'pos' : ''}">${money(t.amount)}</p>
        <dl>
          <dt>Datum</dt><dd>${h(dayName(t.date))} ${h(t.date.slice(0, 4))}</dd>
          ${t.description ? `<dt>Omschrijving</dt><dd>${h(t.description)}</dd>` : ''}
          ${t.counterIban ? `<dt>Tegenrekening</dt><dd class="mono">${h(t.counterIban)}</dd>` : ''}
          <dt>Rekening</dt><dd class="mono">${h(t.account || '–')}</dd>
        </dl>
        <label>Categorie
          <select name="cat">${state.categories.map(c => `<option ${c === t.category ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>
        </label>
        ${t.counterparty ? `<label class="check"><input type="checkbox" name="remember" checked>
          Onthoud voor alle transacties van "${h(t.counterparty)}"</label>` : ''}
        <div class="btns">
          <button type="button" data-action="close">Annuleren</button>
          <button class="primary" type="submit">Opslaan</button>
        </div>
      </form>`);
  }

  function changePwDialog() {
    openDialog(`
      <form data-form="change-pw" autocomplete="off">
        <h2>Wachtwoord wijzigen</h2>
        <label>Huidig wachtwoord<input type="password" name="old" required autocomplete="current-password"></label>
        <label>Nieuw wachtwoord<input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>
        <label>Herhaal nieuw wachtwoord<input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>
        <p class="muted small">Oude back-ups blijven met het oude wachtwoord versleuteld.</p>
        <div class="btns">
          <button type="button" data-action="close">Annuleren</button>
          <button class="primary" type="submit">Wijzigen</button>
        </div>
      </form>`);
  }

  let pendingBackup = null;
  function restorePwDialog(fileName) {
    const fresh = !state;
    openDialog(`
      <form data-form="restore" autocomplete="off">
        <h2>Back-up terugzetten</h2>
        <p class="muted small">${h(fileName)}</p>
        <label>Wachtwoord van de back-up<input type="password" name="p" required autocomplete="current-password"></label>
        ${fresh ? '<p class="muted small">Dit wordt ook het wachtwoord van de app op dit apparaat.</p>' : `
          <fieldset><legend>Wat wil je doen?</legend>
            <label class="check"><input type="radio" name="mode" value="merge" checked> Samenvoegen met wat hier staat</label>
            <label class="check"><input type="radio" name="mode" value="replace"> Alles hier vervangen door de back-up</label>
          </fieldset>`}
        <div class="btns">
          <button type="button" data-action="close">Annuleren</button>
          <button class="primary" type="submit">Terugzetten</button>
        </div>
      </form>`);
  }

  // ---------- Acties ----------
  async function doImport(files) {
    let added = 0, dup = 0, errs = [];
    const newTx = [];
    const known = new Set(state.transactions.map(t => t.id));
    for (const f of files) {
      try {
        const { transactions, errors } = Core.parseRabobank(Core.decodeBytes(await f.arrayBuffer()));
        errs = errs.concat(errors.map(e => `${f.name}: ${e}`));
        for (const t of transactions) {
          if (known.has(t.id)) { dup++; continue; }
          known.add(t.id); state.transactions.push(t); newTx.push(t); added++;
        }
      } catch (e) { errs.push(`${f.name}: ${e.message}`); }
    }
    recategorize();
    await save();
    if (added) {
      const months = state.transactions.map(t => t.date.slice(0, 7)).sort();
      view.month = months[months.length - 1];
    }
    view.tab = added ? 'overzicht' : view.tab;
    render();
    const months = new Set(newTx.map(t => t.date.slice(0, 7)));
    const accs = new Set(newTx.map(t => t.account).filter(Boolean));
    if (!added && !errs.length) { toast(`Geen nieuwe transacties: alle ${dup} stonden er al in.`); return; }
    openDialog(`<div><h2>${added ? (errs.length ? 'Import deels gelukt' : 'Import gelukt') : 'Import mislukt'}</h2>
      ${added ? `<dl>
        <dt>Nieuw</dt><dd><strong>${added}</strong> transacties</dd>
        <dt>Periode</dt><dd>${h(periodText(newTx))}</dd>
        <dt>Maanden</dt><dd>${months.size}</dd>
        <dt>Rekening${accs.size === 1 ? '' : 'en'}</dt><dd class="mono">${[...accs].map(h).join('<br>') || '–'}</dd>
        ${dup ? `<dt>Overgeslagen</dt><dd>${dup} (stonden er al in)</dd>` : ''}
      </dl>
      ${months.size > 1 ? '<p class="muted small">Het overzicht toont één maand tegelijk. Kies een andere maand met de maandkiezer bovenaan, of bekijk onderaan het overzicht alle maanden op een rij.</p>' : ''}` : ''}
      ${errs.length ? `<ul class="errors">${errs.slice(0, 10).map(e => `<li>${h(e)}</li>`).join('')}</ul>
        ${errs.length > 10 ? `<p class="muted">…en nog ${errs.length - 10} meldingen.</p>` : ''}` : ''}
      <div class="btns"><button class="primary" data-action="close">OK</button></div></div>`);
  }

  async function doBackup() {
    const vault = await DB.get();
    const name = `financien-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(vault)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    let done = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Financiën back-up' }); done = true; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!done) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    state.settings.lastBackup = new Date().toISOString();
    await save();
    render();
    toast('Back-up gemaakt. Zet hem in je Google Drive-map.');
  }

  function mergeState(incoming) {
    const byId = new Map(state.transactions.map(t => [t.id, t]));
    let added = 0;
    for (const t of incoming.transactions || []) {
      const cur = byId.get(t.id);
      if (!cur) { state.transactions.push(t); byId.set(t.id, t); added++; }
      else if (t.manual && !cur.manual) { cur.category = t.category; cur.manual = true; }
    }
    for (const r of incoming.rules || []) {
      if (!state.rules.some(x => x.match === r.match)) state.rules.push(r);
    }
    for (const c of incoming.categories || []) if (!state.categories.includes(c)) state.categories.splice(-1, 0, c);
    return added;
  }

  // ---------- Gebeurtenissen ----------
  $app.addEventListener('click', onClick);
  $dlg.addEventListener('click', onClick);
  $app.addEventListener('submit', onSubmit);
  $dlg.addEventListener('submit', onSubmit);

  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    try {
      switch (a) {
        case 'tab': view.tab = el.dataset.tab; view.category = null; render(); window.scrollTo(0, 0); break;
        case 'lock': lock(); break;
        case 'month': view.month = shiftMonth(view.month, Number(el.dataset.n)); render(); break;
        case 'goto-month': view.month = el.dataset.m; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'month-all': view.month = 'alle'; render(); break;
        case 'month-current': view.month = null; render(); break;
        case 'cat-detail': catDetail(el.dataset.cat); break;
        case 'filter-cat': $dlg.open && $dlg.close(); view.category = el.dataset.cat; view.tab = 'transacties'; render(); window.scrollTo(0, 0); break;
        case 'clear-cat': view.category = null; render(); break;
        case 'edit-tx': editTx(el.dataset.id); break;
        case 'close': $dlg.close(); break;
        case 'pick-csv': $fileCsv.value = ''; $fileCsv.click(); break;
        case 'backup': await doBackup(); break;
        case 'restore-start': $fileBackup.value = ''; $fileBackup.click(); break;
        case 'change-pw': changePwDialog(); break;
        case 'del-rule':
          state.rules.splice(Number(el.dataset.i), 1); recategorize(); await save(); render(); break;
        case 'wipe':
          if (confirm('Weet je het zeker? Alle transacties op dit apparaat worden gewist. Dit kan niet ongedaan worden (behalve met een back-up).')) {
            await DB.clear(); key = meta = state = null; renderSetup(); toast('Alle gegevens zijn gewist.');
          }
          break;
      }
    } catch (err) { console.error(err); toast('Er ging iets mis: ' + err.message); }
  }

  async function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    const kind = form.dataset.form;
    try {
      if (kind === 'setup') {
        if (fd.get('p1') !== fd.get('p2')) return toast('De wachtwoorden zijn niet gelijk.');
        busy(btn, true, 'Kluis aanmaken…');
        ({ key, meta } = await Core.createKey(fd.get('p1')));
        state = newState();
        await save();
        view = { tab: 'importeren', month: null, search: '', category: null };
        render();
      } else if (kind === 'unlock') {
        busy(btn, true, 'Ontgrendelen…');
        try {
          const r = await Core.open(fd.get('p'), await DB.get());
          key = r.key; meta = r.meta; state = r.data;
          state.settings = Object.assign({ autoLockMin: 5, lastBackup: null }, state.settings);
          lastActivity = Date.now();
          view = { tab: 'overzicht', month: null, search: '', category: null };
          render();
        } catch (err) {
          await new Promise(r => setTimeout(r, 800)); // vertraagt raden
          busy(btn, false);
          form.reset();
          toast(err.message);
        }
      } else if (kind === 'tx') {
        const t = state.transactions.find(x => x.id === form.dataset.id);
        const cat = fd.get('cat');
        t.category = cat; t.manual = true;
        if (fd.get('remember') && t.counterparty) {
          const match = t.counterparty.toLowerCase();
          state.rules = state.rules.filter(r => r.match !== match);
          state.rules.unshift({ match, category: cat });
          t.manual = false;
          recategorize();
        }
        await save();
        $dlg.close();
        render();
      } else if (kind === 'change-pw') {
        if (fd.get('p1') !== fd.get('p2')) return toast('De nieuwe wachtwoorden zijn niet gelijk.');
        busy(btn, true);
        try { await Core.open(fd.get('old'), await DB.get()); }
        catch { busy(btn, false); return toast('Huidig wachtwoord klopt niet.'); }
        ({ key, meta } = await Core.createKey(fd.get('p1')));
        await save();
        $dlg.close();
        toast('Wachtwoord gewijzigd. Maak een nieuwe back-up.');
      } else if (kind === 'restore') {
        busy(btn, true, 'Openen…');
        let r;
        try { r = await Core.open(fd.get('p'), pendingBackup.vault); }
        catch (err) { busy(btn, false); return toast(err.message); }
        if (!state) {
          key = r.key; meta = r.meta; state = r.data;
          state.settings = Object.assign({ autoLockMin: 5, lastBackup: null }, state.settings);
          await save();
          $dlg.close();
          view = { tab: 'overzicht', month: null, search: '', category: null };
          render();
          toast(`Back-up teruggezet: ${state.transactions.length} transacties.`);
        } else if (fd.get('mode') === 'replace') {
          state = r.data;
          state.settings = Object.assign({ autoLockMin: 5, lastBackup: null }, state.settings);
          await save(); // opnieuw versleuteld met het huidige wachtwoord
          $dlg.close(); view.month = null; render();
          toast(`Vervangen: ${state.transactions.length} transacties.`);
        } else {
          const added = mergeState(r.data);
          recategorize();
          await save();
          $dlg.close(); view.month = null; render();
          toast(`Samengevoegd: ${added} nieuwe transacties.`);
        }
        pendingBackup = null;
      } else if (kind === 'add-cat') {
        const c = String(fd.get('c')).trim();
        if (c && !state.categories.includes(c)) { state.categories.splice(-1, 0, c); await save(); }
        render();
      }
    } catch (err) {
      console.error(err);
      busy(btn, false);
      toast('Er ging iets mis: ' + err.message);
    }
  }

  $app.addEventListener('input', e => {
    if (e.target.dataset.input === 'search') {
      view.search = e.target.value;
      const box = document.getElementById('txlist');
      if (box) { box.innerHTML = txListHtml(); applySizes(); }
    }
  });
  $app.addEventListener('change', async e => {
    if (e.target.dataset.input === 'month') {
      view.month = e.target.value; render(); return;
    }
    if (e.target.dataset.input === 'autolock') {
      state.settings.autoLockMin = Number(e.target.value);
      await save();
      toast('Opgeslagen.');
    }
  });

  $fileCsv.addEventListener('change', async () => {
    if ($fileCsv.files.length && state) await doImport([...$fileCsv.files]);
  });
  $fileBackup.addEventListener('change', async () => {
    const f = $fileBackup.files[0];
    if (!f) return;
    try {
      pendingBackup = { vault: JSON.parse(await f.text()) };
      if (pendingBackup.vault.format !== 'financien-kluis') throw new Error();
      restorePwDialog(f.name);
    } catch { toast('Dit is geen geldig back-upbestand.'); }
  });

  // ---------- Automatisch vergrendelen & privacy ----------
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
    addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (state && Date.now() - lastActivity > state.settings.autoLockMin * 60000) lock();
  }, 10000);
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('privacy', document.hidden);
    if (document.hidden) hiddenAt = Date.now();
    else if (state && hiddenAt && Date.now() - hiddenAt > Math.min(60000, state.settings.autoLockMin * 60000)) lock();
  });
  addEventListener('pagehide', () => document.body.classList.add('privacy'));
  addEventListener('pageshow', () => document.body.classList.remove('privacy'));

  // ---------- Start ----------
  async function start() {
    if (!globalThis.crypto || !crypto.subtle) {
      $app.innerHTML = '<section class="center card"><h1>Niet beveiligd</h1><p>Open deze app via https (bijvoorbeeld GitHub Pages). Versleuteling werkt niet via een losse bestandslink.</p></section>';
      return;
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    (await DB.get()) ? renderUnlock() : renderSetup();
  }
  start();
})();
