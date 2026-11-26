/* Kernlogica: CSV inlezen, categoriseren en versleutelen.
   Geen externe afhankelijkheden; werkt in de browser en in Node (voor tests). */
'use strict';

const Core = (() => {
  // ---------- Categorieën ----------
  const OWN = 'Eigen rekeningen'; // overboekingen tussen eigen rekeningen tellen niet mee
  const DEFAULT_CATEGORIES = [
    'Inkomen', 'Overig inkomen', 'Boodschappen', 'Wonen & energie', 'Abonnementen',
    'Verzekeringen', 'Vervoer', 'Uit eten', 'Winkelen', 'Zorg', 'Belastingen',
    'Contant geld', 'Sparen', OWN, 'Overig',
  ];

  const DEFAULT_RULES = [
    ['Inkomen', ['salaris', 'loonbetaling', 'uwv', 'svb']],
    ['Boodschappen', ['albert heijn', 'ah', 'jumbo', 'lidl', 'aldi', 'plus', 'dirk', 'coop', 'spar',
      'picnic', 'ekoplaza', 'vomar', 'hoogvliet', 'dekamarkt', 'poiesz', 'crisp']],
    ['Wonen & energie', ['vattenfall', 'eneco', 'essent', 'greenchoice', 'budget energie', 'vandebron',
      'vitens', 'evides', 'brabant water', 'pwn', 'dunea', 'oasen', 'waternet', 'huur', 'hypotheek', 'woonstichting']],
    ['Abonnementen', ['ziggo', 'kpn', 'odido', 't-mobile', 'vodafone', 'simyo', 'lebara', 'youfone',
      'netflix', 'spotify', 'disney', 'videoland', 'hbo', 'apple.com', 'google play', 'google one', 'youtube premium', 'basic-fit', 'sportschool']],
    ['Verzekeringen', ['zilveren kruis', 'cz', 'vgz', 'menzis', 'dsw', 'ohra', 'centraal beheer', 'interpolis',
      'ditzo', 'unive', 'univé', 'nationale-nederlanden', 'fbto', 'asr', 'a.s.r.', 'anwb verzekeren', 'inshared']],
    ['Vervoer', ['ns', 'ns groep', 'ov-chipkaart', 'translink', 'shell', 'bp', 'esso', 'tinq', 'tango', 'totalenergies',
      'gvb', 'ret', 'htm', 'arriva', 'connexxion', 'qbuzz', 'q-park', 'parkeren', 'yellowbrick', 'anwb', 'swapfiets']],
    ['Uit eten', ['thuisbezorgd', 'uber eats', 'deliveroo', 'mcdonald', 'mcdonalds', 'burger king', 'starbucks',
      'restaurant', 'cafe', 'café', 'dominos', 'domino', 'new york pizza', 'kfc', 'subway', 'febo']],
    ['Winkelen', ['bol.com', 'coolblue', 'amazon', 'zalando', 'hema', 'action', 'ikea', 'kruidvat', 'etos',
      'primark', 'h&m', 'blokker', 'gamma', 'praxis', 'karwei', 'hornbach', 'mediamarkt', 'wehkamp', 'decathlon']],
    ['Zorg', ['apotheek', 'tandarts', 'fysio', 'fysiotherapie', 'huisarts', 'ziekenhuis', 'opticien']],
    ['Belastingen', ['belastingdienst', 'gemeente', 'gemeentelijke belastingen', 'waterschap', 'cjib', 'bsgw', 'rbg']],
    ['Contant geld', ['geldautomaat', 'geldopname', 'opname']],
    ['Sparen', ['spaarrekening', 'sparen', 'spaardoel']],
  ];

  function defaultRules() {
    const out = [];
    for (const [category, words] of DEFAULT_RULES) {
      for (const w of words) out.push({ match: w, category, builtin: true });
    }
    return out;
  }

  const ruleCache = new Map();
  function ruleRegex(word) {
    let re = ruleCache.get(word);
    if (!re) {
      const esc = word.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Woordgrenzen: "plus" past bij "PLUS Supermarkt" maar niet bij "surplus".
      re = new RegExp('(^|[^\\p{L}\\p{N}])' + esc + '($|[^\\p{L}\\p{N}])', 'iu');
      ruleCache.set(word, re);
    }
    return re;
  }

  function categorize(tx, rules, ownAccounts) {
    if (tx.counterIban && ownAccounts && ownAccounts.has(normIban(tx.counterIban))) return OWN;
    const text = (tx.counterparty + ' ' + tx.description).toLowerCase();
    for (const r of rules) {
      if (r.match && ruleRegex(r.match).test(text)) return r.category;
    }
    return tx.amount > 0 ? 'Overig inkomen' : 'Overig';
  }

  // ---------- CSV ----------
  function decodeBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes); // oudere Rabobank-exports
    }
    return text.replace(/^﻿/, '');
  }

  // Regel voor regel inlezen. Een aanhalingsteken sluit een veld alleen af als er een
  // scheidingsteken of het regeleinde op volgt, zodat losse " in omschrijvingen geen kwaad kunnen.
  function parseLine(line, delim) {
    const out = [];
    let i = 0;
    while (i <= line.length) {
      if (line[i] === '"') {
        let j = i + 1, f = '';
        while (j < line.length) {
          if (line[j] === '"') {
            if (line[j + 1] === '"') { f += '"'; j += 2; continue; }
            if (j + 1 === line.length || line[j + 1] === delim) break;
            f += '"'; j++; continue;
          }
          f += line[j]; j++;
        }
        out.push(f);
        i = j + 2;
      } else {
        let j = line.indexOf(delim, i);
        if (j < 0) j = line.length;
        out.push(line.slice(i, j));
        i = j + 1;
      }
    }
    return out;
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const first = lines[0] || '';
    const delim = first.split(';').length > first.split(',').length ? ';' : ',';
    return lines.filter(l => l.trim() !== '').map(l => parseLine(l, delim));
  }

  // "+1.234,56", "-12,50", "12.50" -> centen (integer)
  function parseAmount(s) {
    let v = String(s).trim().replace(/\s|€/g, '');
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    const n = Number(v);
    if (!isFinite(n)) throw new Error('Ongeldig bedrag: ' + s);
    return Math.round(n * 100);
  }

  function parseDate(s) {
    s = String(s).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    throw new Error('Ongeldige datum: ' + s);
  }

  function normIban(s) { return String(s || '').replace(/\s/g, '').toUpperCase(); }

  function hash(str) { // FNV-1a, alleen voor ID's
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function parseRabobank(text) {
    const rows = parseCSV(text);
    if (rows.length < 1) throw new Error('Het bestand is leeg.');
    const header = rows[0].map(h => h.trim().toLowerCase());
    const col = name => header.indexOf(name);
    const iDate = col('datum'), iAmount = col('bedrag');
    if (iDate < 0 || iAmount < 0) {
      throw new Error('Dit lijkt geen Rabobank CSV-bestand. Kies in de Rabo-app of Rabo Internetbankieren "Downloaden" → formaat CSV.');
    }
    const iAcc = col('iban/bban'), iSeq = col('volgnr'), iName = col('naam tegenpartij'),
      iCIban = col('tegenrekening iban/bban'), iCur = col('munt'), iCode = col('code'),
      iBal = col('saldo na trn'),
      iDesc = ['omschrijving-1', 'omschrijving-2', 'omschrijving-3'].map(col).filter(i => i >= 0);

    const transactions = [], errors = [], seen = new Map();
    for (let r = 1; r < rows.length; r++) {
      const f = rows[r];
      const get = i => (i >= 0 && i < f.length ? f[i].trim() : '');
      try {
        if (f.length !== header.length) throw new Error(`${f.length} kolommen in plaats van ${header.length}`);
        const tx = {
          account: normIban(get(iAcc)),
          date: parseDate(get(iDate)),
          amount: parseAmount(get(iAmount)),
          currency: get(iCur) || 'EUR',
          counterparty: get(iName).replace(/\s+/g, ' '),
          counterIban: normIban(get(iCIban)),
          description: iDesc.map(get).filter(Boolean).join(' ').replace(/\s+/g, ' '),
          code: get(iCode),
          balance: get(iBal) ? parseAmount(get(iBal)) : null,
          category: null,
          manual: false,
        };
        const seq = get(iSeq);
        let id;
        // Volgnummers zijn niet altijd uniek over langere periodes, dus datum en bedrag horen bij de sleutel.
        const base = seq
          ? [tx.account, seq, tx.date, tx.amount].join('|')
          : 'h' + hash([tx.account, tx.date, tx.amount, tx.counterparty, tx.description].join('|'));
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        id = n === 1 ? base : base + '#' + n;
        tx.id = id;
        transactions.push(tx);
      } catch (e) {
        errors.push(`Regel ${r + 1}: ${e.message}`);
      }
    }
    return { transactions, errors, rows: rows.length - 1 };
  }

  // ---------- Versleuteling (Web Crypto) ----------
  const ITERATIONS = 600000; // PBKDF2-SHA256, OWASP-advies
  const subtle = () => globalThis.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();

  function b64(bytes) {
    let s = '';
    const a = new Uint8Array(bytes);
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  async function deriveKey(password, salt, iterations) {
    const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function createKey(password) {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, ITERATIONS);
    return { key, meta: { salt: b64(salt), iterations: ITERATIONS } };
  }

  async function seal(key, meta, data) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
    return {
      format: 'financien-kluis', v: 1,
      kdf: { name: 'PBKDF2-SHA256', salt: meta.salt, iterations: meta.iterations },
      cipher: 'AES-GCM-256', iv: b64(iv), data: b64(ct),
    };
  }

  async function open(password, vault) {
    if (!vault || vault.format !== 'financien-kluis') throw new Error('Dit is geen geldig back-upbestand.');
    const meta = { salt: vault.kdf.salt, iterations: vault.kdf.iterations };
    const key = await deriveKey(password, unb64(meta.salt), meta.iterations);
    let pt;
    try {
      pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.data));
    } catch {
      throw new Error('Onjuist wachtwoord.');
    }
    return { key, meta, data: JSON.parse(dec.decode(pt)) };
  }

  // Oude sleutels (rekening|volgnr) omzetten naar het nieuwe formaat.
  function migrateIds(transactions) {
    let changed = 0;
    for (const t of transactions) {
      if (/^[A-Z0-9]+\|\d+$/.test(t.id)) { t.id = [t.id, t.date, t.amount].join('|'); changed++; }
    }
    return changed;
  }

  return {
    OWN, DEFAULT_CATEGORIES, migrateIds, defaultRules, categorize, normIban,
    decodeBytes, parseCSV, parseAmount, parseDate, parseRabobank,
    createKey, seal, open,
  };
})();

if (typeof module !== 'undefined') module.exports = Core;
