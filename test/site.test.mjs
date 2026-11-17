import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import ejs from 'ejs';
import { build, outDir } from '../build.mjs';

let pages = [];
const html = {};

before(async () => {
  pages = await build({ quiet: true });
  for (const p of pages) html[p] = await readFile(path.join(outDir, p), 'utf8');
});

test('builds the core company profile pages', () => {
  for (const p of ['index.html', 'solutions.html', 'about.html', 'news.html', 'careers.html', 'contact.html']) {
    assert.ok(pages.includes(p), `${p} should be built`);
  }
});

test('Careers navigation is available on every page and active only on Careers', () => {
  for (const p of pages) {
    const nav = html[p].match(/<nav id="site-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${p} should have the main navigation`);
    const link = nav.match(/<a href="careers\.html"([^>]*)>Careers<\/a>/);
    assert.ok(link, `${p} should link to Careers`);
    assert.equal(link[1].includes('aria-current="page"'), p === 'careers.html');
  }
});

test('Careers page describes benefits, open roles and how to apply', () => {
  const page = html['careers.html'];
  assert.match(page, /<h2>Why work at Contoso<\/h2>/);
  for (const benefit of ['Benefits', 'Learning budget', 'Hybrid work']) {
    assert.ok(page.includes(`<h3>${benefit}</h3>`));
  }
  assert.match(page, /<h2>Open roles<\/h2>/);
  for (const [title, location, team] of [
    ['Cloud Engineer', 'Jakarta', 'Cloud &amp; Infrastructure'],
    ['Security Analyst', 'Surabaya', 'Cybersecurity'],
    ['Data Engineer', 'Singapore', 'Data &amp; AI']
  ]) {
    const card = page.match(new RegExp(`<article class="card">\\s*<h3>${title}</h3>[\\s\\S]*?</article>`))?.[0];
    assert.ok(card, `missing role: ${title}`);
    assert.ok(card.includes(`<strong>Location:</strong> ${location}`));
    assert.ok(card.includes(`<strong>Team:</strong> ${team}`));
  }
  assert.match(page, /<a class="btn btn-light" href="mailto:careers@contoso\.com">[^<]+<\/a>/);
});

test('Careers content is escaped when rendered', async () => {
  const site = JSON.parse(await readFile('src/data/site.json', 'utf8'));
  const careers = JSON.parse(await readFile('src/data/careers.json', 'utf8'));
  careers.openRoles.roles[0].title = '<script>alert("test")</script>';
  const rendered = await ejs.renderFile('src/pages/careers.ejs', {
    site, careers, page: 'careers', buildDate: '2026-01-01'
  });
  assert.ok(rendered.includes('&lt;script&gt;alert(&#34;test&#34;)&lt;/script&gt;'));
  assert.ok(!rendered.includes('<script>alert("test")</script>'));
});

test('every page has a title and exactly one h1', () => {
  for (const p of pages) {
    assert.match(html[p], /<title>[^<]+<\/title>/, `${p} needs a <title>`);
    const h1 = html[p].match(/<h1[\s>]/g) || [];
    assert.equal(h1.length, 1, `${p} should have exactly one <h1>`);
  }
});

test('every image has an alt attribute', () => {
  for (const p of pages) {
    for (const img of html[p].match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\salt=/, `${p}: ${img} is missing alt text`);
    }
  }
});

test('internal links and assets resolve', async () => {
  for (const p of pages) {
    const refs = [...html[p].matchAll(/(?:href|src)="([^"#?]+)(?:[#?][^"]*)?"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
      try {
        await access(path.join(outDir, ref));
      } catch {
        assert.fail(`${p} links to a missing file: ${ref}`);
      }
    }
  }
});
