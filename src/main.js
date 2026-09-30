import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-300-italic.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource-variable/inter/wght.css';
import './style.css';
import images from './images.json';

/* Número do WhatsApp (somente dígitos, com DDI+DDD, ex.: 5515999999999).
   Defina VITE_WHATSAPP no .env. Sem número, os botões abrem o e-mail. */
const WHATSAPP = (import.meta.env.VITE_WHATSAPP || '').replace(/\D/g, '');
const MESSAGE = 'Olá, Giovana! Vim pelo site e gostaria de conversar sobre o meu espaço.';
const EMAIL = 'contatogiovana3@gmail.com';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- WhatsApp ---------- */
$$('[data-wa]').forEach((a) => {
  if (WHATSAPP) {
    a.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MESSAGE)}`;
  } else {
    a.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Contato pelo site')}&body=${encodeURIComponent(MESSAGE)}`;
    a.removeAttribute('target');
  }
});
$('#year').textContent = new Date().getFullYear();

/* ---------- Texto em sequência (palavra a palavra) ---------- */
function splitWords(root) {
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(' ');
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          inner.textContent = part;
          inner.style.setProperty('--i', i++);
          w.append(inner);
          frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  root.setAttribute('aria-label', root.textContent.trim());
  walk(root);
  $$('.w', root).forEach((w) => w.setAttribute('aria-hidden', 'true'));
}
$$('[data-split]').forEach(splitWords);

/* ---------- Header + menu ---------- */
const header = $('#header');
const burger = $('#burger');
const menu = $('#menu');
const setMenu = (open) => {
  burger.setAttribute('aria-expanded', open);
  burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', !open);
  header.classList.toggle('menu-open', open);
  document.body.classList.toggle('is-locked', open);
};
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
$$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => e.key === 'Escape' && menu.classList.contains('is-open') && setMenu(false));
matchMedia('(min-width: 900px)').addEventListener('change', (e) => e.matches && setMenu(false));

/* ---------- Revelações ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      if (en.target.closest('.quote')) en.target.closest('.quote').classList.add('is-in');
      io.unobserve(en.target);
    });
  },
  { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
);
$$('.reveal, .mask, [data-split]').forEach((el) => io.observe(el));

/* ---------- Scroll: header, item ativo, parallax sutil ---------- */
const hero = $('.hero');
const heroMedia = $('.hero__media');
const parallaxEls = $$('[data-parallax]');
const navLinks = $$('.nav a');
const sections = navLinks.map((a) => $(a.getAttribute('href')));
let ticking = false;

function onScroll() {
  ticking = false;
  const y = scrollY;
  header.classList.toggle('is-solid', y > 40);

  if (!reduced) {
    if (y < innerHeight * 1.2) heroMedia.style.transform = `translate3d(0, ${y * 0.12}px, 0)`;
    const vh = innerHeight;
    parallaxEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // -1..1; amplitude = fração da altura do elemento (0.03 casa com o scale(1.06) do CSS: sem bordas vazias)
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      el.style.setProperty('--py', `${(-p * parseFloat(el.dataset.parallax) * r.height).toFixed(1)}px`);
    });
  }

  const mid = innerHeight * 0.4;
  let active = -1;
  let best = -Infinity;
  sections.forEach((s, i) => {
    const top = s ? s.getBoundingClientRect().top : Infinity;
    if (top <= mid && top > best) { best = top; active = i; }
  });
  navLinks.forEach((a, i) => a.classList.toggle('is-active', i === active && y > 40));
}
addEventListener('scroll', () => !ticking && ((ticking = true), requestAnimationFrame(onScroll)), { passive: true });
addEventListener('resize', onScroll);
onScroll();

/* ---------- Lightbox ---------- */
const lb = $('#lb');
const fig = $('.lb__fig', lb);
const items = $$('.p__btn');
let cur = 0;
let lastFocus = null;

const pictureFor = (name, alt) => {
  const m = images[name];
  const widths = m.widths.filter((w) => w <= 1600);
  const set = (ext) => widths.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(', ');
  const big = widths[widths.length - 1];
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="100vw"><source type="image/webp" srcset="${set('webp')}" sizes="100vw"><img src="/img/${name}-${big}.webp" width="${m.w}" height="${m.h}" alt="${alt}"></picture>`;
};

function show(i, animate = true) {
  cur = (i + items.length) % items.length;
  const btn = items[cur];
  const alt = $('img', btn).alt;
  const render = () => {
    fig.innerHTML = pictureFor(btn.dataset.full, alt);
    $('.lb__cat', lb).textContent = btn.dataset.cat;
    $('.lb__count', lb).textContent = `${String(cur + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    requestAnimationFrame(() => fig.classList.remove('swap'));
  };
  if (animate && !reduced) {
    fig.classList.add('swap');
    setTimeout(render, 380);
  } else render();
  // pré-carrega vizinhas
  [cur + 1, cur - 1].forEach((n) => {
    const b = items[(n + items.length) % items.length];
    const m = images[b.dataset.full];
    const w = m.widths.filter((x) => x <= 1600).pop();
    new Image().src = `/img/${b.dataset.full}-${w}.webp`;
  });
}
function openLb(i) {
  lastFocus = document.activeElement;
  lb.hidden = false;
  document.body.classList.add('is-locked');
  show(i, false);
  requestAnimationFrame(() => lb.classList.add('open'));
  $('.lb__close', lb).focus();
}
function closeLb() {
  lb.classList.remove('open');
  document.body.classList.remove('is-locked');
  setTimeout(() => { lb.hidden = true; fig.innerHTML = ''; }, reduced ? 0 : 700);
  lastFocus && lastFocus.focus();
}
items.forEach((b, i) => b.addEventListener('click', () => openLb(i)));
$('.lb__close', lb).addEventListener('click', closeLb);
$('.lb__nav--prev', lb).addEventListener('click', () => show(cur - 1));
$('.lb__nav--next', lb).addEventListener('click', () => show(cur + 1));
lb.addEventListener('click', (e) => (e.target === lb || e.target === fig) && closeLb());
addEventListener('keydown', (e) => {
  if (lb.hidden) return;
  if (e.key === 'Escape') closeLb();
  else if (e.key === 'ArrowRight') show(cur + 1);
  else if (e.key === 'ArrowLeft') show(cur - 1);
  else if (e.key === 'Tab') {
    const f = $$('button', lb);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
// Deslizar com o dedo
let sx = 0, sy = 0;
lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) show(cur + (dx < 0 ? 1 : -1));
  else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) closeLb();
}, { passive: true });

/* ---------- Cursor "Ver" na galeria (apenas mouse) ---------- */
const cursor = $('#cursor');
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduced) {
  let tx = -100, ty = -100, x = -100, y = -100, raf = 0;
  const loop = () => {
    x += (tx - x) * 0.18;
    y += (ty - y) * 0.18;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; raf || (raf = requestAnimationFrame(loop)); }, { passive: true });
  items.forEach((b) => {
    b.addEventListener('mouseenter', () => cursor.classList.add('on'));
    b.addEventListener('mouseleave', () => cursor.classList.remove('on'));
  });
}

/* ---------- Carrossel (WebGL) embutido em Projetos — carregado sob demanda ---------- */
const car = $('#car');
const carStage = $('#carStage');
const webglOk = (() => {
  try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; }
})();

if (webglOk) {
  car.hidden = false;
  const compact = carStage.clientWidth < 700;
  // Texturas: 800 px no celular, 1200 px no desktop (foco na página ampliada)
  const imageUrl = (name) => `/img/${name}-${images[name].widths.filter((x) => x <= (compact ? 800 : 1200)).pop()}.webp`;
  let carScene = null;
  const boot = new IntersectionObserver(async ([en]) => {
    if (!en.isIntersecting) return;
    boot.disconnect();
    try {
      const { createImmersive } = await import('./immersive.js');
      const names = [...items.map((b) => b.dataset.full), 'gourmet'];
      carScene = createImmersive(carStage, {
        images: names.map(imageUrl),
        compact,
        drift: !reduced,
        wheel: 'horizontal', // a rolagem vertical continua sendo da página
      });
    } catch {
      car.hidden = true; // sem WebGL utilizável: fica só a galeria em grade
    }
  }, { rootMargin: '600px 0px' });
  boot.observe(carStage);
  addEventListener('keydown', (e) => e.key === 'Escape' && carScene && carScene.focused && carScene.unfocus());
}
