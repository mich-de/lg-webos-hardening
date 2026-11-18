#!/usr/bin/env node
/*
 * NusStream — discovery dominio StreamingCommunity.
 *
 * StreamingCommunity cambia dominio ogni poche settimane: questo script trova
 * l'host vivo, ne ricava app_url/cdn_url reali dalla pagina (data-page) e
 * riscrive SEEDS/CDN0 in app/main.js. Se qualcosa cambia bumpa la patch
 * version in app/appinfo.json.
 *
 * Uso:
 *   node tools/update_domains.mjs            # scrive i file
 *   node tools/update_domains.mjs --dry-run  # solo stampa
 *
 * Exit code 0 sempre; "changed=true|false" finisce in $GITHUB_OUTPUT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..', 'app');
const MAIN_JS = path.join(APP_DIR, 'main.js');
const APPINFO = path.join(APP_DIR, 'appinfo.json');
const DRY = process.argv.includes('--dry-run');

const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36';
const TIMEOUT = 12000;

/* TLD noti/storici del dominio: il primo che risponde vince. */
const TLDS = ['dad', 'store', 'one', 'build', 'day', 'nexus', 'space', 'vip', 'top', 'click', 'win', 'cool', 'life', 'monster', 'site', 'online', 'cloud', 'rest'];
const BASE = 'https://streamingcommunityz.';

function log(...a) { console.log(...a); }

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/json' }
    });
    if (!r.ok) return { ok: false, status: r.status, url: r.url };
    return { ok: true, status: r.status, url: r.url, json: await r.json() };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  } finally { clearTimeout(t); }
}

async function getText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' }
    });
    return { ok: r.ok, status: r.status, url: r.url, text: r.ok ? await r.text() : '' };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  } finally { clearTimeout(t); }
}

/* Estrae props.app_url / props.cdn_url dal data-page della home. */
function readConfig(html) {
  const m = /data-page="(.*?)"\s*>/.exec(html || '');
  if (!m) return null;
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const app = /"app_url"\s*:\s*"([^"]+)"/.exec(raw);
  const cdn = /"cdn_url"\s*:\s*"([^"]+)"/.exec(raw);
  if (!app) return null;
  return {
    app_url: app[1].replace(/\/+$/, ''),
    cdn_url: cdn ? cdn[1].replace(/\/+$/, '') : null
  };
}

/* Un host è valido se: home con data-page coerente + archivio JSON popolato. */
async function probe(host) {
  const home = await getText(host + '/');
  if (!home.ok) return { host, ok: false, why: 'home HTTP ' + home.status };
  const cfg = readConfig(home.text);
  if (!cfg) return { host, ok: false, why: 'data-page assente' };
  if (!/streamingcommunity/i.test(cfg.app_url)) return { host, ok: false, why: 'app_url inatteso: ' + cfg.app_url };
  const arch = await getJson(cfg.app_url + '/it/archive?type=movie&sort=release_date&page=1');
  if (!arch.ok || !arch.json || !Array.isArray(arch.json.data) || !arch.json.data.length) {
    return { host, ok: false, why: 'archivio vuoto/HTTP ' + arch.status };
  }
  return { host: cfg.app_url, http: host, ok: true, cfg, sample: arch.json.data[0] };
}

function currentSeeds(src) {
  const m = /var SEEDS = \[([\s\S]*?)\];/.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/'(https:\/\/[^']+)'/g)].map(x => x[1]);
}

function bumpPatch(appinfoSrc) {
  const m = /"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/.exec(appinfoSrc);
  if (!m) throw new Error('version non trovata in appinfo.json');
  const [, a, b, c] = m;
  const next = `${a}.${b}.${Number(c) + 1}`;
  return { next, out: appinfoSrc.replace(m[0], `"version": "${next}"`) };
}

function setOutput(changed) {
  log('changed=' + changed);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

(async () => {
  const mainSrc = fs.readFileSync(MAIN_JS, 'utf8');
  const oldSeeds = currentSeeds(mainSrc);
  const oldCdn = (/var CDN0 = '([^']+)'/.exec(mainSrc) || [])[1] || '';
  log('SEEDS attuali:', oldSeeds.join(', ') || '(nessuno)');

  /* Ordine di prova: seed correnti, poi gli altri TLD. */
  const queue = [];
  for (const s of oldSeeds) queue.push(s);
  for (const t of TLDS) {
    const u = BASE + t;
    if (!queue.includes(u)) queue.push(u);
  }

  let winner = null;
  const alive = [];
  for (const host of queue) {
    const r = await probe(host);
    log(`${r.ok ? 'OK  ' : 'FAIL'} ${host}${r.ok ? ' -> ' + r.host : ' (' + r.why + ')'}`);
    if (r.ok) {
      alive.push(r);
      if (!winner) winner = r;
    }
    if (alive.length >= 4) break;
  }

  if (!winner) {
    log('ERRORE: nessun dominio StreamingCommunity raggiungibile.');
    setOutput(false);
    process.exit(0);
  }

  /* Il dominio canonico (quello dichiarato dal sito) va per primo. */
  const seeds = [];
  for (const r of alive) if (!seeds.includes(r.host)) seeds.push(r.host);
  for (const s of oldSeeds) if (seeds.length < 4 && !seeds.includes(s)) seeds.push(s);
  seeds.length = Math.min(seeds.length, 4);

  const cdn = (winner.cfg.cdn_url ? winner.cfg.cdn_url + '/images/' : oldCdn);
  const changed = seeds.join() !== oldSeeds.join() || cdn !== oldCdn;

  log('nuovo host:', winner.host);
  log('nuovo CDN :', cdn);
  log('cambiato  :', changed);

  if (!changed) { setOutput(false); return; }

  const seedsJs = 'var SEEDS = [\n' + seeds.map(s => `\t'${s}'`).join(',\n') + '\n];';
  let out = mainSrc.replace(/var SEEDS = \[[\s\S]*?\];/, seedsJs);
  out = out.replace(/var CDN0 = '[^']*';/, `var CDN0 = '${cdn}';`);

  const appinfoSrc = fs.readFileSync(APPINFO, 'utf8');
  const { next, out: appinfoOut } = bumpPatch(appinfoSrc);
  out = out.replace(/^\/\* NusStream \d+\.\d+\.\d+/, `/* NusStream ${next}`);

  log('versione  :', next);

  if (!DRY) {
    fs.writeFileSync(MAIN_JS, out);
    fs.writeFileSync(APPINFO, appinfoOut);
  }
  setOutput(true);
})();
