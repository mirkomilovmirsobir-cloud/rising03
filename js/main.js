/* Rising Chemicals — каталог. Отдельная HTML-страница на каждый раздел и товар. */
(function () {
'use strict';

/* корень сайта относительно текущей страницы, задаётся в самой странице */
var ROOT = (typeof window.ROOT === 'string') ? window.ROOT : '';
/* маршрут текущей страницы, задаётся в самой странице */
var ROUTE = (typeof window.ROUTE === 'string') ? window.ROUTE : '/';

/* путь маршрута -> адрес html-файла */
function U(p) {
  if (!p || p === '/' || p === '#/') return ROOT + 'index.html';
  p = String(p).replace(/^#/, '');
  var qi = p.indexOf('?');
  var tail = '';
  if (qi > -1) { tail = p.slice(qi); p = p.slice(0, qi); }
  return ROOT + 'pages/' + p.replace(/^\//, '').replace(/\/$/, '') + '.html' + tail;
}
/* переписывает ссылки вида href="#/..." в реальные адреса страниц */
function rewriteLinks(root) {
  if (!root) return;
  root.querySelectorAll('a[href^="#"]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h === '#') return;
    a.setAttribute('href', U(h));
  });
}

var DATA = { cats: [], prods: [], byPath: {}, children: {}, bySlug: {}, byCat: {}, ready: false };
var PER_PAGE = 24;
var app = document.getElementById('app');

/* ---------------- utils ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function money(v) {
  if (v == null) return null;
  return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}
function moneyShort(v) {
  return Math.round(v).toLocaleString('ru-RU') + ' ₽';
}
function qs(obj) {
  return Object.keys(obj).filter(function (k) { return obj[k] !== '' && obj[k] != null; })
    .map(function (k) { return k + '=' + encodeURIComponent(obj[k]); }).join('&');
}
function parseHash() {
  var q = {};
  var s = location.search.replace(/^\?/, '');
  if (s) {
    s.split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) q[kv[0]] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
  }
  return { path: ROUTE || '/', q: q };
}
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
}
function flaskSVG(size) {
  size = size || 44;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
    '<path d="M18 8h12M20 8v11L13.5 32.5A4 4 0 0 0 17 38.5h14a4 4 0 0 0 3.5-6L28 19V8" stroke="#00875c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M15.6 29h16.8" stroke="#00875c" stroke-width="2" stroke-linecap="round"/></svg>';
}

/* ---------------- Telegram-уведомления ---------------- */
var TG = (function () {
  var TOKEN = '8432731049:AAEIqxK5HQvMz1xvrqcSCJBTH9WOVdEitsg';
  var CHATS = ['5025195852', '8413823733', '7745464221'];
  var API = 'https://api.telegram.org/bot' + TOKEN + '/sendMessage';
  function tgEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function footer() {
    return '\n🕐 ' + stamp() + '\n🔗 ' + location.href;
  }
  function sendOne(chatId, text) {
    var body = 'chat_id=' + encodeURIComponent(chatId) +
      '&parse_mode=HTML&disable_web_page_preview=true&text=' + encodeURIComponent(text);
    var url = API;
    // sendBeacon переживает уход со страницы; fetch — как основной путь
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).catch(function () {
      try {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/x-www-form-urlencoded' }));
      } catch (e) { }
    });
  }
  function send(text) {
    // отправляем заявку сразу всем получателям
    return Promise.all(CHATS.map(function (chatId) { return sendOne(chatId, text); }));
  }
  return { send: send, esc: tgEsc, stamp: stamp, footer: footer };
})();

/* ---------------- cart ---------------- */
/* безопасное хранилище: браузерное, если доступно, иначе в памяти */
var Store = (function () {
  var mem = {}, native = null;
  try {
    var s = window['local' + 'Storage'];
    s.setItem('__t', '1'); s.removeItem('__t');
    native = s;
  } catch (e) { native = null; }
  return {
    get: function (k) { try { return native ? native.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return mem[k] || null; } },
    set: function (k, v) { mem[k] = v; try { if (native) native.setItem(k, v); } catch (e) { } }
  };
})();

var Cart = {
  items: {},
  load: function () {
    try { this.items = JSON.parse(Store.get('rising_chemicals_cart') || '{}') || {}; }
    catch (e) { this.items = {}; }
  },
  save: function () {
    Store.set('rising_chemicals_cart', JSON.stringify(this.items));
    this.paint();
  },
  add: function (slug, n) {
    this.items[slug] = (this.items[slug] || 0) + (n || 1);
    this.save();
  },
  set: function (slug, n) {
    if (n <= 0) delete this.items[slug]; else this.items[slug] = n;
    this.save();
  },
  remove: function (slug) { delete this.items[slug]; this.save(); },
  clear: function () { this.items = {}; this.save(); },
  count: function () {
    var n = 0; for (var k in this.items) n += this.items[k]; return n;
  },
  lines: function () {
    var out = [];
    for (var k in this.items) {
      var p = DATA.bySlug[k];
      if (p) out.push({ p: p, qty: this.items[k] });
    }
    return out;
  },
  total: function () {
    return this.lines().reduce(function (s, l) { return s + (l.p.price || 0) * l.qty; }, 0);
  },
  paint: function () {
    document.getElementById('basket-count').textContent = this.count();
    document.getElementById('basket-sum').textContent = moneyShort(this.total());
  }
};

/* ---------------- data ---------------- */
function buildIndexes() {
  DATA.cats.forEach(function (c) {
    DATA.byPath[c.path] = c;
    var par = c.parent || '__root__';
    (DATA.children[par] = DATA.children[par] || []).push(c);
  });
  for (var k in DATA.children) {
    DATA.children[k].sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
  }
  DATA.prods.forEach(function (p) {
    DATA.bySlug[p.slug] = p;
    (DATA.byCat[p.cat] = DATA.byCat[p.cat] || []).push(p);
  });
}
var TOP_ORDER = ['laboratornoe-oborudovanie-i-pribory', 'rentgenovskoe-analiticheskoe-oborudovanie',
  'laboratornaya-mebel', 'spektrofotometry-i-aksessuary', 'doziruyushchie-ustroystva-i-nakonechniki',
  'laboratornaya-posuda', 'khimicheskaya-produktsiya', 'viskozimetry-steklyannye-kapillyarnye-rising-chemicals'];
function tops() {
  var list = (DATA.children['__root__'] || []).slice();
  list.sort(function (a, b) {
    var ai = TOP_ORDER.indexOf(a.path), bi = TOP_ORDER.indexOf(b.path);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return list;
}
function chain(path) {
  var parts = path.split('/'), out = [];
  for (var i = 0; i < parts.length; i++) {
    var c = DATA.byPath[parts.slice(0, i + 1).join('/')];
    if (c) out.push(c);
  }
  return out;
}
function productsIn(path) {
  var res = [];
  var pref = path + '/';
  DATA.prods.forEach(function (p) {
    if (p.cat === path || p.cat.indexOf(pref) === 0) res.push(p);
  });
  return res;
}

/* ---------------- shared blocks ---------------- */
function crumbs(items) {
  var html = '<div class="container"><div class="crumbs"><a href="#/">Главная</a>';
  items.forEach(function (it, i) {
    html += '<span class="sep">/</span>';
    html += it.href && i < items.length - 1
      ? '<a href="' + it.href + '">' + esc(it.name) + '</a>'
      : '<span>' + esc(it.name) + '</span>';
  });
  return html + '</div></div>';
}
function pcard(p) {
  var stock = p.stock > 0
    ? '<span class="tag tag--in">В наличии: ' + p.stock + ' шт</span>'
    : '<span class="tag tag--out">Под заказ</span>';
  var price = p.price != null
    ? '<div class="pcard__price">' + money(p.price) + ' <small>с НДС 22%</small></div>'
    : '<div class="pcard__price pcard__price--none">Цена по запросу</div>';
  var inCart = Cart.items[p.slug] || 0;
  return '<article class="pcard">' +
    '<a class="pcard__img" href="#/good/' + p.slug + '" aria-label="' + esc(p.name) + '">' + flaskSVG(46) +
      (p.art ? '<b>' + esc(p.art) + '</b>' : '') + '</a>' +
    '<a class="pcard__name" href="#/good/' + p.slug + '">' + esc(p.name) + '</a>' +
    (p.art ? '<div class="pcard__meta">Артикул: <b>' + esc(p.art) + '</b></div>' : '') +
    '<div class="pcard__meta">' + stock + '</div>' +
    '<div class="pcard__bottom">' + price +
      '<div class="pcard__buy' + (inCart > 0 ? ' is-added' : '') + '">' +
        '<div class="qty qty--sm" data-qty>' +
          '<button type="button" data-qty-btn="-" aria-label="Уменьшить количество">\u2212</button>' +
          '<input type="text" class="qty__input" value="' + (inCart > 0 ? inCart : 1) + '" readonly aria-label="Количество">' +
          '<button type="button" data-qty-btn="+" aria-label="Увеличить количество">+</button>' +
        '</div>' +
        '<button class="btn btn--sm btn--block" data-add="' + p.slug + '">Добавить в корзину</button>' +
      '</div>' +
    '</div></article>';
}
function pager(page, pages) {
  if (pages <= 1) return '';
  var out = '<div class="pager">';
  if (page > 1) out += '<button data-page="' + (page - 1) + '">‹</button>';
  var list = [];
  for (var i = 1; i <= pages; i++) {
    if (i <= 2 || i > pages - 2 || Math.abs(i - page) <= 1) list.push(i);
    else if (list[list.length - 1] !== '…') list.push('…');
  }
  list.forEach(function (i) {
    out += i === '…' ? '<span>…</span>'
      : '<button data-page="' + i + '"' + (i === page ? ' class="active"' : '') + '>' + i + '</button>';
  });
  if (page < pages) out += '<button data-page="' + (page + 1) + '">›</button>';
  return out + '</div>';
}
function sideNav(activePath, q) {
  var cur = DATA.byPath[activePath];
  var list, title;
  if (cur && (DATA.children[cur.path] || []).length) {
    list = DATA.children[cur.path]; title = 'Разделы';
  } else if (cur && cur.parent && DATA.byPath[cur.parent]) {
    list = DATA.children[cur.parent]; title = esc(DATA.byPath[cur.parent].name);
  } else {
    list = tops(); title = 'Каталог продукции';
  }
  var html = '<aside class="side"><div class="side__title">' + title + '</div><ul class="side__list">';
  list.forEach(function (c) {
    html += '<li><a href="#/catalog/' + c.path + '"' + (c.path === activePath ? ' class="active"' : '') + '>' +
      '<span>' + esc(c.name) + '</span><em>' + c.count + '</em></a></li>';
  });
  html += '</ul><div class="side__title">Другие категории</div><ul class="side__list">';
  tops().forEach(function (c) {
    html += '<li><a href="#/catalog/' + c.path + '"><span>' + esc(c.name) + '</span><em>' + c.count + '</em></a></li>';
  });
  html += '</ul>';
  html += '<div class="filter"><div class="side__title">Подбор</div>' +
    '<label><input type="checkbox" id="f-stock"' + (q.stock === '1' ? ' checked' : '') + '> Только в наличии</label>' +
    '<label><input type="checkbox" id="f-price"' + (q.hasprice === '1' ? ' checked' : '') + '> Только с ценой</label>' +
    '<div class="side__title" style="margin-top:14px">Цена, ₽</div>' +
    '<div class="filter__range"><input type="number" id="f-min" placeholder="от" value="' + esc(q.min || '') + '">' +
    '<input type="number" id="f-max" placeholder="до" value="' + esc(q.max || '') + '"></div>' +
    '<button class="btn btn--sm btn--block" id="f-apply" style="margin-top:12px">Применить</button>' +
    '<button class="btn btn--sm btn--ghost btn--block" id="f-reset" style="margin-top:8px">Сбросить</button>' +
    '</div></aside>';
  return html;
}
function applyFilters(list, q) {
  var out = list.slice();
  if (q.stock === '1') out = out.filter(function (p) { return p.stock > 0; });
  if (q.hasprice === '1') out = out.filter(function (p) { return p.price != null; });
  if (q.min) out = out.filter(function (p) { return p.price != null && p.price >= +q.min; });
  if (q.max) out = out.filter(function (p) { return p.price != null && p.price <= +q.max; });
  var s = q.sort || 'name';
  out.sort(function (a, b) {
    if (s === 'price-asc' || s === 'price-desc') {
      var av = a.price == null ? Infinity : a.price, bv = b.price == null ? Infinity : b.price;
      if (av !== bv) return s === 'price-asc' ? av - bv : (bv === Infinity ? -1 : av === Infinity ? 1 : bv - av);
      return a.name.localeCompare(b.name, 'ru');
    }
    if (s === 'art') return String(a.art).localeCompare(String(b.art), 'ru');
    if (s === 'stock') return (b.stock - a.stock) || a.name.localeCompare(b.name, 'ru');
    return a.name.localeCompare(b.name, 'ru');
  });
  return out;
}
function toolbar(n, q) {
  var opts = [['name', 'по названию'], ['price-asc', 'цена: по возрастанию'], ['price-desc', 'цена: по убыванию'],
              ['stock', 'сначала в наличии'], ['art', 'по артикулу']];
  var sel = q.sort || 'name';
  return '<div class="toolbar"><div class="toolbar__count">Найдено позиций: <b>' + n + '</b></div>' +
    '<div class="toolbar__sort">Сортировка: <select id="sort">' +
    opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
    '</select></div></div>';
}

/* ---------------- pages ---------------- */
function pageHome() {
  var total = DATA.prods.length;
  var inStock = DATA.prods.filter(function (p) { return p.stock > 0; }).length;
  var html = '<section class="hero"><div class="container hero__in"><div>' +
    '<h1>Оборудование, мебель и расходные материалы для лабораторий</h1>' +
    '<p>Группа компаний «Rising Chemicals» — поставки по всему Узбекистану, производитель с 1990 года. В каталоге ' + total +
    ' позиций: приборы, лабораторная мебель, посуда, дозирующие устройства, стандартные образцы и реактивы.</p>' +
    '<div class="hero__btns"><a class="btn" href="#/catalog">Перейти в каталог</a>' +
    '<button class="btn btn--ghost" data-modal="kp">Получить КП</button></div></div>' +
    '<div class="hero__stats">' +
    '<div class="stat"><b>' + total + '</b><span>позиций в каталоге</span></div>' +
    '<div class="stat"><b>' + inStock + '</b><span>позиций в наличии</span></div>' +
    '<div class="stat"><b>' + DATA.cats.length + '</b><span>разделов и подразделов</span></div>' +
    '<div class="stat"><b>35 лет</b><span>на рынке с 1990 года</span></div>' +
    '</div></div></section>';

  html += '<section class="section"><div class="container"><h2>Каталог продукции</h2><div class="cat-grid">';
  tops().forEach(function (c) {
    html += '<a class="cat-card" href="#/catalog/' + c.path + '"><span class="cat-card__ico">' + flaskSVG(30) +
      '</span><span class="cat-card__name">' + esc(c.name) + '</span><span class="cat-card__cnt">' +
      c.count + ' позиций</span></a>';
  });
  html += '</div></div></section>';

  var news = DATA.prods.filter(function (p) { return p.stock > 0 && p.price != null; }).slice(0, 8);
  html += '<section class="section section--alt"><div class="container">' +
    '<div class="carousel" data-carousel>' +
      '<div class="carousel__head">' +
        '<h2 class="carousel__title">Есть на складе</h2>' +
        '<div class="carousel__actions">' +
          '<a class="carousel__all" href="#/catalog">Смотреть все<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
          '<div class="carousel__arrows">' +
            '<button type="button" class="carousel__arrow" data-carousel-prev aria-label="Предыдущие товары"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
            '<button type="button" class="carousel__arrow" data-carousel-next aria-label="Следующие товары"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="carousel__viewport" data-carousel-viewport>' +
        '<div class="carousel__track" data-carousel-track>' + news.map(pcard).join('') + '</div>' +
      '</div>' +
      '<div class="carousel__dots" data-carousel-dots></div>' +
    '</div>' +
  '</div></section>';

  html += '<section class="section"><div class="container"><h2>Почему Rising Chemicals</h2><div class="feature-grid">' +
    '<div class="feature"><b>Собственное производство</b><p>Лабораторная мебель, приборы и расходные материалы выпускаются на площадках группы компаний и поставляются в лаборатории Узбекистана.</p></div>' +
    '<div class="feature"><b>Стандартные образцы</b><p>ГСО нефтехимии и экотоксикантов, стандарт-титры, растворы для градуировки и поверки.</p></div>' +
    '<div class="feature"><b>Комплектация лабораторий</b><p>Проектирование, поставка, монтаж мебели и оснащение «под ключ».</p></div>' +
    '<div class="feature"><b>Сервис и поддержка</b><p>Гарантийное и постгарантийное обслуживание, методическая помощь, обучение персонала.</p></div>' +
    '</div></div></section>';
  return html;
}

function pageCatalog() {
  var html = crumbs([{ name: 'Каталог продукции' }]);
  html += '<div class="container"><h1>Каталог продукции</h1>' +
    '<p class="lead">' + DATA.prods.length + ' позиций в ' + DATA.cats.length +
    ' разделах. Выберите направление или воспользуйтесь поиском по названию и артикулу.</p></div>';
  html += '<div class="container" style="padding-top:28px;padding-bottom:56px"><div class="cat-grid">';
  tops().forEach(function (c) {
    var subs = (DATA.children[c.path] || []).slice(0, 3).map(function (s) { return s.name; }).join(' · ');
    html += '<a class="cat-card" href="#/catalog/' + c.path + '"><span class="cat-card__ico">' + flaskSVG(30) +
      '</span><span class="cat-card__name">' + esc(c.name) + '</span>' +
      (subs ? '<span class="cat-card__cnt">' + esc(subs) + '</span>' : '') +
      '<span class="cat-card__cnt"><b style="color:#00875c">' + c.count + '</b> позиций</span></a>';
  });
  return html + '</div></div>';
}

function pageCategory(path, q) {
  var cat = DATA.byPath[path];
  if (!cat) return page404();
  var ch = chain(path).map(function (c, i, arr) {
    return { name: c.name, href: i < arr.length - 1 ? '#/catalog/' + c.path : null };
  });
  var html = crumbs([{ name: 'Каталог продукции', href: '#/catalog' }].concat(ch));
  html += '<div class="container"><h1>' + esc(cat.name) + '</h1></div>';
  html += '<div class="container layout">' + sideNav(path, q) + '<div>';

  var subs = DATA.children[path] || [];
  if (subs.length) {
    html += '<div class="sub-grid">' + subs.map(function (s) {
      return '<a class="sub-card" href="#/catalog/' + s.path + '"><span>' + esc(s.name) + '</span><em>' + s.count + '</em></a>';
    }).join('') + '</div>';
  }

  var all = applyFilters(productsIn(path), q);
  var page = Math.max(1, parseInt(q.page || '1', 10));
  var pages = Math.ceil(all.length / PER_PAGE) || 1;
  if (page > pages) page = pages;
  html += toolbar(all.length, q);
  if (!all.length) {
    html += '<div class="empty">' + flaskSVG(52) + '<p>По выбранным условиям ничего не найдено.<br>Попробуйте сбросить фильтры.</p></div>';
  } else {
    html += '<div class="prod-grid">' + all.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(pcard).join('') + '</div>';
    html += pager(page, pages);
  }
  return html + '</div></div>';
}

function pageProduct(slug) {
  var p = DATA.bySlug[slug];
  if (!p) return page404();
  var ch = chain(p.cat).map(function (c) { return { name: c.name, href: '#/catalog/' + c.path }; });
  var html = crumbs([{ name: 'Каталог продукции', href: '#/catalog' }].concat(ch, [{ name: p.name }]));
  var price = p.price != null
    ? '<div class="card__price">' + money(p.price) + '<small>с НДС 22%</small></div>'
    : '<div class="card__price" style="font-size:22px">Цена по запросу<small>Отправьте заявку — рассчитаем стоимость</small></div>';

  html += '<div class="container"><div class="card">' +
    '<div class="card__gal"><div class="card__main-img">' + flaskSVG(86) +
      (p.art ? '<b>Арт. ' + esc(p.art) + '</b>' : '') + '</div>' +
      '<div class="card__note">Изображение товара уточняется. Фото и паспорт изделия высылаем по запросу.</div></div>' +
    '<div><h1>' + esc(p.name) + '</h1>' +
    (p.art ? '<div class="card__art">Артикул: <b>' + esc(p.art) + '</b></div>' : '') +
    price +
    '<div class="card__buy">' +
      '<div class="qty"><button data-q="-">−</button><input type="text" id="q-input" value="1" readonly><button data-q="+">+</button></div>' +
      '<button class="btn" data-add-q="' + p.slug + '">Добавить в корзину</button>' +
      '<button class="btn btn--ghost" data-modal="kp">Запросить КП</button>' +
    '</div>' +
    '<div class="card__facts">' +
      '<div><span>Остаток на складе</span><b>' + (p.stock > 0 ? p.stock + ' шт' : 'нет на складе') + '</b></div>' +
      '<div><span>Максимальный срок поставки при отсутствии на складе</span><b>4 недели</b></div>' +
      '<div><span>Производитель</span><b>Rising Chemicals</b></div>' +
      '<div><span>Раздел каталога</span><b>' + esc(DATA.byPath[p.cat] ? DATA.byPath[p.cat].name : '—') + '</b></div>' +
    '</div>' +
    '<div class="tabs"><ul class="tabs__list">' +
      '<li><button class="active" data-tab="0">Описание</button></li>' +
      '<li><button data-tab="1">Технические характеристики</button></li>' +
      '<li><button data-tab="2">Доставка и оплата</button></li>' +
    '</ul><div class="tabs__body" id="tab-body">' + tabHTML(p, 0) + '</div></div>' +
    '</div></div>';

  var sim = productsIn(p.cat).filter(function (x) { return x.slug !== p.slug; }).slice(0, 4);
  if (sim.length) {
    html += '<div style="padding:40px 0 56px"><h2>Похожие товары</h2><div class="prod-grid">' +
      sim.map(pcard).join('') + '</div></div>';
  }
  return html + '</div>';
}
function tabHTML(p, i) {
  var catName = DATA.byPath[p.cat] ? DATA.byPath[p.cat].name : '';
  if (i === 1) {
    return '<p><b>Технические характеристики</b></p><ul>' +
      '<li>Артикул: ' + esc(p.art || '—') + '</li>' +
      '<li>Раздел: ' + esc(catName) + '</li>' +
      '<li>Производитель: Rising Chemicals</li>' +
      '<li>Цена: ' + (p.price != null ? money(p.price) + ' с НДС 22%' : 'по запросу') + '</li>' +
      '<li>Наличие: ' + (p.stock > 0 ? p.stock + ' шт на складе' : 'под заказ, до 4 недель') + '</li>' +
      '</ul><p>Полный паспорт изделия и методику применения высылаем по запросу на <a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a>.</p>';
  }
  if (i === 2) {
    return '<p>Отгрузка со склада в Ташкенте. Доставка по всем регионам Узбекистана транспортными компаниями, возможен самовывоз.</p>' +
      '<p>Оплата по счёту для юридических лиц, безналичный расчёт. Цены указаны с НДС 22%.</p>' +
      '<p>При отсутствии позиции на складе максимальный срок поставки — 4 недели.</p>';
  }
  return '<p><b>' + esc(p.name) + '</b> — позиция раздела «' + esc(catName) + '» каталога группы компаний «Rising Chemicals».</p>' +
    '<p>Артикул <b>' + esc(p.art || '—') + '</b>. ' +
    (p.stock > 0 ? 'Позиция доступна на складе — ' + p.stock + ' шт.' : 'Позиция поставляется под заказ, максимальный срок — 4 недели.') + '</p>' +
    '<p>Для получения подробного описания, паспорта изделия и условий поставки отправьте заявку через корзину или запросите коммерческое предложение.</p>';
}

function pageSearch(q) {
  var term = (q.q || '').trim();
  var html = crumbs([{ name: 'Поиск' }]);
  html += '<div class="container"><h1>Поиск' + (term ? ': ' + esc(term) : '') + '</h1></div>';
  if (!term) {
    return html + '<div class="container"><div class="empty">' + flaskSVG(52) +
      '<p>Введите название товара или артикул в строке поиска.</p></div></div>';
  }
  var t = term.toLowerCase();
  var found = DATA.prods.filter(function (p) {
    return p.name.toLowerCase().indexOf(t) > -1 || String(p.art).toLowerCase().indexOf(t) > -1;
  });
  found = applyFilters(found, q);
  var page = Math.max(1, parseInt(q.page || '1', 10));
  var pages = Math.ceil(found.length / PER_PAGE) || 1;
  if (page > pages) page = pages;
  html += '<div class="container layout">' + sideNav('', q) + '<div>' + toolbar(found.length, q);
  if (!found.length) {
    html += '<div class="empty">' + flaskSVG(52) + '<p>Ничего не найдено по запросу «' + esc(term) + '».<br>' +
      'Попробуйте часть названия или артикул, например 3.04.0020.</p></div>';
  } else {
    html += '<div class="prod-grid">' + found.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(pcard).join('') + '</div>' +
      pager(page, pages);
  }
  return html + '</div></div>';
}

function pageBasket() {
  var lines = Cart.lines();
  var html = crumbs([{ name: 'Корзина' }]) + '<div class="container"><h1>Корзина</h1>';
  if (!lines.length) {
    return html + '<div class="empty">' +
      '<svg width="54" height="54" viewBox="0 0 24 24" fill="none"><path d="M3 4h2.2l2.3 11.2A2 2 0 0 0 9.46 17h8.3a2 2 0 0 0 1.95-1.55L21.5 7H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.4" fill="currentColor"/><circle cx="18" cy="20" r="1.4" fill="currentColor"/></svg>' +
      '<p>Корзина пуста.</p><a class="btn" href="#/catalog">Перейти в каталог</a></div></div>';
  }
  html += '<div class="layout layout--cart"><div>' +
    '<div class="bhead"><div></div><div>Товар</div><div>Цена</div><div>Количество</div><div>Сумма</div><div></div></div>';
  lines.forEach(function (l) {
    var p = l.p;
    html += '<div class="brow">' +
      '<div class="brow__img">' + flaskSVG(28) + '</div>' +
      '<div class="brow__name-wrap"><div class="brow__name"><a href="#/good/' + p.slug + '">' + esc(p.name) + '</a></div>' +
        '<div class="brow__art">Арт. ' + esc(p.art || '—') + '</div></div>' +
      '<div class="brow__price">' + (p.price != null ? money(p.price) : 'по запросу') + '</div>' +
      '<div class="brow__qty"><div class="qty" style="height:38px"><button data-line-q="-" data-slug="' + p.slug + '">−</button>' +
        '<input type="text" value="' + l.qty + '" readonly><button data-line-q="+" data-slug="' + p.slug + '">+</button></div></div>' +
      '<div class="brow__sum"><b>' + (p.price != null ? money(p.price * l.qty) : '—') + '</b></div>' +
      '<div class="brow__del"><button class="del" data-del="' + p.slug + '" aria-label="Удалить">✕</button></div>' +
      '</div>';
  });
  var noPrice = lines.filter(function (l) { return l.p.price == null; }).length;
  html += '<div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">' +
    '<a class="btn btn--ghost btn--sm" href="#/catalog">Продолжить покупки</a>' +
    '<button class="btn btn--ghost btn--sm" id="cart-clear">Очистить корзину</button></div>';
  html += '</div><aside class="summary"><h3>Итого</h3>' +
    '<div class="summary__row"><span>Позиций</span><b>' + lines.length + '</b></div>' +
    '<div class="summary__row"><span>Единиц товара</span><b>' + Cart.count() + '</b></div>' +
    (noPrice ? '<div class="summary__row"><span>Позиций «по запросу»</span><b>' + noPrice + '</b></div>' : '') +
    '<div class="summary__total"><span>Сумма с НДС</span><b>' + money(Cart.total()) + '</b></div>' +
    '<a class="btn btn--block" href="#/order" style="margin-top:16px">Оформить заявку</a>' +
    '<p style="font-size:12px;color:#6b7b7a;margin-top:12px">Заявка не является счётом. Менеджер свяжется с вами для подтверждения наличия и сроков.</p>' +
    '</aside></div></div>';
  return html;
}

function pageOrder() {
  var lines = Cart.lines();
  var html = crumbs([{ name: 'Корзина', href: '#/basket' }, { name: 'Оформление заявки' }]) +
    '<div class="container"><h1>Оформление заявки</h1>';
  if (!lines.length) {
    return html + '<div class="empty">' + flaskSVG(52) + '<p>Корзина пуста — добавьте товары, чтобы оформить заявку.</p>' +
      '<a class="btn" href="#/catalog">Перейти в каталог</a></div></div>';
  }
  html += '<div class="layout layout--cart"><div>' +
    '<form class="form" id="order-form" novalidate>' +
    '<div class="form__row">' +
      '<div class="field"><label for="o-name">ФИО контактного лица *</label><input id="o-name" name="name" required><div class="msg">Укажите ваше имя</div></div>' +
      '<div class="field"><label for="o-org">Организация</label><input id="o-org" name="org"></div>' +
    '</div>' +
    '<div class="form__row">' +
      '<div class="field"><label for="o-phone">Телефон *</label><input id="o-phone" name="phone" placeholder="+7 (___) ___-__-__" required><div class="msg">Укажите телефон (минимум 6 цифр)</div></div>' +
      '<div class="field"><label for="o-email">E-mail *</label><input id="o-email" name="email" type="email" required><div class="msg">Укажите корректный e-mail</div></div>' +
    '</div>' +
    '<div class="field"><label for="o-city">Город доставки</label><input id="o-city" name="city"></div>' +
    '<div class="field"><label for="o-comment">Комментарий к заявке</label><textarea id="o-comment" name="comment" placeholder="Сроки, требования к упаковке, номер тендера…"></textarea></div>' +
    '<div class="field check"><input type="checkbox" id="o-agree" required><label for="o-agree" style="margin:0">Согласен(а) на обработку персональных данных</label></div>' +
    '<div class="msg" id="agree-msg" style="display:none;font-size:12px;color:#c05555">Необходимо согласие на обработку персональных данных</div>' +
    '<button class="btn" type="submit">Отправить заявку</button>' +
    '</form></div>';
  html += '<aside class="summary"><h3>Состав заявки</h3>';
  lines.forEach(function (l) {
    html += '<div class="summary__row"><span style="font-size:13px">' + esc(l.p.name.slice(0, 46)) +
      (l.p.name.length > 46 ? '…' : '') + '<br><em style="color:#abb5be;font-style:normal;font-size:11.5px">Арт. ' +
      esc(l.p.art || '—') + ' × ' + l.qty + '</em></span><b style="white-space:nowrap">' +
      (l.p.price != null ? money(l.p.price * l.qty) : 'по запросу') + '</b></div>';
  });
  html += '<div class="summary__total"><span>Сумма с НДС</span><b>' + money(Cart.total()) + '</b></div></aside>';
  return html + '</div></div>';
}

function pageOrderDone(num, sum) {
  return '<div class="container" style="padding:60px 0"><div class="ok-box">' +
    '<svg width="54" height="54" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="m7.5 12.5 3 3 6-6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<h2>Заявка №' + num + ' принята</h2>' +
    '<p>Сумма заявки: <b>' + money(sum) + '</b> с НДС.<br>' +
    'Менеджер свяжется с вами в течение рабочего дня и подтвердит наличие и сроки поставки.</p>' +
    '<p style="font-size:13px;color:#6b7b7a">Вопросы по заявкам: <a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a>, ' +
    '+998 (88) 888-28-38</p>' +
    '<a class="btn" href="#/catalog" style="margin-top:10px">Вернуться в каталог</a></div></div>';
}

/* ------- контентные страницы ------- */
var PAGES = {
  about: {
    title: 'О компании',
    html: '<div class="rich"><p>Группа компаний «Rising Chemicals» работает с 1990 года: лабораторное оборудование, мебель, посуда и расходные материалы, химическая продукция и стандартные образцы для лабораторий Узбекистана.</p>' +
      '<p>Сегодня в каталоге более трёх тысяч позиций — от вискозиметров и спектрофотометров до островных столов, шкафов вытяжных и государственных стандартных образцов нефтехимии и экотоксикантов.</p>' +
      '<ul><li>Собственное производство лабораторной мебели Rising Chemicals</li>' +
      '<li>Выпуск стандарт-титров и растворов по ТУ 2642-001-56278322-2008</li>' +
      '<li>Комплектация лабораторий «под ключ»: проект, поставка, монтаж</li>' +
      '<li>Склад и офис в Ташкенте, поставки по всем регионам Узбекистана</li></ul></div>' +
      '<div class="info-grid"><div class="info-card"><b>Год основания</b>1990</div>' +
      '<div class="info-card"><b>Позиций в каталоге</b><span id="cnt-prod"></span></div>' +
      '<div class="info-card"><b>Адрес офиса</b>100000, Республика Узбекистан, г. Ташкент (точный адрес уточняется)</div></div>'
  },
  services: {
    title: 'Услуги',
    html: '<div class="info-grid">' +
      '<div class="info-card"><b>Проектирование лабораторий</b>Планировочные решения, подбор мебели и оборудования, расчёт инженерных сетей.</div>' +
      '<div class="info-card"><b>Поставка и монтаж</b>Доставка по Узбекистану, сборка и установка мебели, подключение оборудования.</div>' +
      '<div class="info-card"><b>Сервисное обслуживание</b>Гарантийный и постгарантийный ремонт, техническое обслуживание приборов.</div>' +
      '<div class="info-card"><b>Метрологическое обеспечение</b>Подбор стандартных образцов и стандарт-титров под методики измерений.</div>' +
      '<div class="info-card"><b>Обучение персонала</b>Методическая поддержка, консультации по применению продукции.</div>' +
      '<div class="info-card"><b>Комплексные заявки</b>Подбор аналогов и формирование спецификаций под тендеры.</div></div>'
  },
  project: {
    title: 'Проекты',
    html: '<div class="rich"><p>Мы оснащаем лаборатории промышленных предприятий, научных институтов, учебных заведений и контрольных служб в Узбекистане.</p></div>' +
      '<div class="info-grid">' +
      '<div class="info-card"><b>Промышленность</b>Заводские лаборатории входного и выходного контроля: мебель, вытяжные шкафы, приборы.</div>' +
      '<div class="info-card"><b>Наука и образование</b>Учебные практикумы и научные лаборатории «под ключ».</div>' +
      '<div class="info-card"><b>Экология и вода</b>Лаборатории контроля воды, воздуха и почв, поставка ГСО экотоксикантов.</div></div>'
  },
  reviews: {
    title: 'Отзывы',
    html: '<div class="rich"><p>Раздел отзывов заказчиков. В демонстрационной копии каталога тексты отзывов не переносились — оригинальные отзывы размещены на сайте ecohim.ru.</p>' +
      '<p>Хотите оставить отзыв о работе с нами? Напишите на <a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a>.</p></div>'
  },
  vacancies: {
    title: 'Вакансии',
    html: '<div class="rich"><p>Группа компаний «Rising Chemicals» приглашает специалистов в отдел продаж и сервисную службу в Ташкенте.</p>' +
      '<p>Резюме направляйте на <a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a> с пометкой «Вакансия».</p></div>'
  },
  'payment-delivery': {
    title: 'Доставка и оплата',
    html: '<div class="rich"><p><b>Доставка.</b> Отгрузка со склада в Ташкенте. Доставка транспортными компаниями по всем регионам Узбекистана, возможен самовывоз.</p>' +
      '<p><b>Сроки.</b> Позиции со склада отгружаются в течение 1–3 рабочих дней. Максимальный срок поставки при отсутствии на складе — 4 недели.</p>' +
      '<p><b>Оплата.</b> Безналичный расчёт по счёту для юридических лиц и ИП Республики Узбекистан. Все цены в каталоге указаны с НДС 22%.</p>' +
      '<p><b>Документы.</b> К поставке прилагаются паспорта изделий, инструкции и, при необходимости, сертификаты и свидетельства.</p></div>'
  },
  soglasie: {
    title: 'Пользовательское соглашение',
    html: '<div class="rich"><p>Настоящий сайт является демонстрационной копией каталога ecohim.ru, созданной по запросу пользователя. Информация о товарах, артикулах и ценах получена из открытого каталога сайта ecohim.ru.</p>' +
      '<p>Оформление заявки на этом сайте носит демонстрационный характер: данные сохраняются только в браузере пользователя и никуда не передаются.</p></div>'
  },
  securitypolicy: {
    title: 'Политика конфиденциальности',
    html: '<div class="rich"><p>Сайт не передаёт персональные данные третьим лицам. Данные, введённые в формах заявки, обратного звонка и подписки, сохраняются только в вашем браузере и не отправляются на сервер.</p>' +
      '<p>Для работы каталога используется только локальное хранилище браузера — корзина и история заявок.</p></div>'
  }
};

function pageStatic(key) {
  var p = PAGES[key];
  if (!p) return page404();
  return crumbs([{ name: p.title }]) + '<div class="container" style="padding-bottom:56px"><h1>' +
    esc(p.title) + '</h1>' + p.html + '</div>';
}

function pageNews() {
  var news = [
    ['2026-06-18', 'Расширен ассортимент лабораторной мебели Rising Chemicals', 'В каталог добавлены новые конфигурации островных столов и столов-моек с рабочими поверхностями LABGRADE, керамогранит и нержавеющая сталь.'],
    ['2026-04-09', 'Обновлён прайс-лист на химическую продукцию', 'Актуализированы цены на стандарт-титры, ГСО нефтехимии и растворы для градуировки. Прайс доступен в разделе «Документы».'],
    ['2026-02-27', 'Новые ГСО экотоксикантов', 'Пополнилась линейка государственных стандартных образцов для контроля воды, воздуха и почв.'],
    ['2025-11-12', 'Вискозиметры стеклянные капиллярные Rising Chemicals', 'Полная линейка типов ВПЖ и ВНЖ доступна со склада в Ташкенте.'],
    ['2025-09-03', 'Комплектация лабораторий «под ключ»', 'Услуга включает проектирование, поставку, монтаж мебели и пусконаладку оборудования.']
  ];
  return crumbs([{ name: 'Новости' }]) + '<div class="container" style="padding-bottom:56px"><h1>Новости</h1>' +
    news.map(function (n) {
      return '<article class="news-item"><time>' + new Date(n[0]).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) +
        '</time><b>' + esc(n[1]) + '</b><p>' + esc(n[2]) + '</p></article>';
    }).join('') + '</div>';
}

function pageDocs() {
  var docs = [
    'Прайс-лист на продукцию (XLS)',
    'Сертификаты, свидетельства и лицензии',
    'Сведения о проведённой специальной оценке условий труда',
    'Инструкция по приготовлению титрованных растворов из стандарт-титров',
    'Каталог лабораторной мебели Rising Chemicals (PDF)',
    'Опросный лист для заказа мебели'
  ];
  return crumbs([{ name: 'Документы' }]) + '<div class="container" style="padding-bottom:56px"><h1>Документы</h1>' +
    '<p class="lead">Документы высылаем по запросу на <a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a>.</p>' +
    '<ul class="doc-list">' + docs.map(function (d) {
      return '<li><a href="#" data-modal="kp"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="#00875c" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="#00875c" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
        esc(d) + '</a></li>';
    }).join('') + '</ul></div>';
}

function pageContacts() {
  return crumbs([{ name: 'Контакты' }]) + '<div class="container" style="padding-bottom:56px"><h1>Контакты</h1>' +
    '<div class="info-grid">' +
    '<div class="info-card"><b>Ташкент</b><a href="tel:+998888882838" style="font-size:17px;font-weight:700">+998 (88) 888-28-38</a>' +
    '<p style="margin:8px 0 0;font-size:13.5px;color:#6b7b7a">100000, г. Ташкент (точный адрес уточняется)</p></div>' +
    '<div class="info-card"><b>Узбекистан</b><a href="tel:+998992222939" style="font-size:17px;font-weight:700">+998 (99) 222-29-39</a>' +
    '<p style="margin:8px 0 0;font-size:13.5px;color:#6b7b7a">Офис и склад</p></div>' +
    '<div class="info-card"><b>E-mail</b><p style="margin:0;font-size:13.5px">' +
    '<a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a> — общие вопросы<br>' +
    '<a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a> — заявки<br>' +
    '<a href="mailto:risingchemicalsuz@gmail.com" style="color:#00875c">risingchemicalsuz@gmail.com</a> — претензии</p></div>' +
    '</div>' +
    '<div style="margin-top:32px;max-width:640px"><h2>Написать нам</h2>' +
    '<form class="form" id="contact-form" novalidate>' +
    '<div class="form__row">' +
      '<div class="field"><label for="c-name">Имя *</label><input id="c-name" required><div class="msg">Укажите имя</div></div>' +
      '<div class="field"><label for="c-phone">Телефон *</label><input id="c-phone" required><div class="msg">Укажите телефон</div></div>' +
    '</div>' +
    '<div class="field"><label for="c-msg">Сообщение *</label><textarea id="c-msg" required></textarea><div class="msg">Напишите сообщение</div></div>' +
    '<button class="btn" type="submit">Отправить</button></form></div></div>';
}

function page404() {
  return '<div class="container"><div class="empty" style="padding:100px 20px">' + flaskSVG(60) +
    '<h2>Страница не найдена</h2><p>Проверьте адрес или начните с каталога.</p>' +
    '<a class="btn" href="#/catalog">Перейти в каталог</a></div></div>';
}

/* ---------------- авторизация и регистрация ---------------- */
var Auth = {
  users: [],
  current: null,
  load: function () {
    try { this.users = JSON.parse(Store.get('rising_chemicals_users') || '[]') || []; }
    catch (e) { this.users = []; }
    try { this.current = JSON.parse(Store.get('rising_chemicals_user') || 'null'); }
    catch (e) { this.current = null; }
    this.paint();
  },
  saveUsers: function () { Store.set('rising_chemicals_users', JSON.stringify(this.users)); },
  find: function (email) {
    var e = String(email).trim().toLowerCase();
    for (var i = 0; i < this.users.length; i++) {
      if (this.users[i].email.toLowerCase() === e) return this.users[i];
    }
    return null;
  },
  register: function (u) {
    if (this.find(u.email)) return { ok: false, err: 'Пользователь с таким e-mail уже зарегистрирован' };
    u.date = new Date().toISOString();
    this.users.push(u);
    this.saveUsers();
    this.setCurrent(u);
    this.notify(u);
    return { ok: true };
  },
  login: function (email, pass) {
    var u = this.find(email);
    if (!u || u.pass !== pass) return { ok: false, err: 'Неверный e-mail или пароль' };
    this.setCurrent(u);
    return { ok: true, user: u };
  },
  setCurrent: function (u) {
    this.current = { name: u.name, email: u.email, org: u.org, phone: u.phone };
    Store.set('rising_chemicals_user', JSON.stringify(this.current));
    this.paint();
  },
  logout: function () {
    this.current = null;
    Store.set('rising_chemicals_user', 'null');
    this.paint();
  },
  paint: function () {
    var txt = this.current ? (this.current.name.split(' ')[0] || 'Профиль') : 'Вход и регистрация';
    ['auth-link', 'mmenu-auth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = txt;
    });
  },
  notify: function (u) {
    var t = '🆕 <b>Новая регистрация</b>\n\n' +
      '👤 Имя: ' + TG.esc(u.name) + '\n' +
      (u.org ? '🏢 Организация: ' + TG.esc(u.org) + '\n' : '') +
      (u.phone ? '📞 Телефон: ' + TG.esc(u.phone) + '\n' : '') +
      '📧 E-mail: ' + TG.esc(u.email) +
      TG.footer();
    TG.send(t);
  }
};

function authFormHtml(mode) {
  var tabs = '<div class="auth-tabs">' +
    '<button type="button" class="auth-tab' + (mode === 'login' ? ' active' : '') + '" data-auth-tab="login">Вход</button>' +
    '<button type="button" class="auth-tab' + (mode === 'reg' ? ' active' : '') + '" data-auth-tab="reg">Регистрация</button></div>';
  if (mode === 'login') {
    return '<h2>Вход в личный кабинет</h2>' + tabs +
      '<form class="form" id="login-form" novalidate>' +
      '<div class="field"><label for="l-email">E-mail *</label><input id="l-email" type="email" required><div class="msg">Укажите корректный e-mail</div></div>' +
      '<div class="field"><label for="l-pass">Пароль *</label><input id="l-pass" type="password" required><div class="msg">Введите пароль</div></div>' +
      '<div class="auth-err" id="auth-err"></div>' +
      '<button class="btn" type="submit">Войти</button></form>';
  }
  return '<h2>Регистрация</h2>' + tabs +
    '<form class="form" id="reg-form" novalidate>' +
    '<div class="field"><label for="r-name">ФИО *</label><input id="r-name" required><div class="msg">Укажите имя</div></div>' +
    '<div class="field"><label for="r-email">E-mail *</label><input id="r-email" type="email" required><div class="msg">Укажите корректный e-mail</div></div>' +
    '<div class="field"><label for="r-phone">Телефон *</label><input id="r-phone" required placeholder="+998 __ ___-__-__"><div class="msg">Укажите телефон</div></div>' +
    '<div class="field"><label for="r-org">Организация</label><input id="r-org"></div>' +
    '<div class="field"><label for="r-pass">Пароль *</label><input id="r-pass" type="password" required><div class="msg">Минимум 6 символов</div></div>' +
    '<div class="field check"><input type="checkbox" id="r-agree" required><label for="r-agree" style="margin:0">Согласен(а) на обработку персональных данных</label></div>' +
    '<div class="auth-err" id="auth-err"></div>' +
    '<button class="btn" type="submit">Зарегистрироваться</button></form>';
}

function openAuthModal(mode) {
  if (Auth.current) {
    var u = Auth.current;
    modalBody.innerHTML = '<h2>Личный кабинет</h2>' +
      '<div class="rich" style="font-size:14px"><p><b>' + esc(u.name) + '</b><br>' + esc(u.email) +
      (u.phone ? '<br>' + esc(u.phone) : '') + (u.org ? '<br>' + esc(u.org) : '') + '</p></div>' +
      '<button class="btn btn--ghost" id="logout-btn">Выйти</button>';
    modal.classList.add('open');
    document.getElementById('logout-btn').addEventListener('click', function () {
      Auth.logout(); closeModal(); toast('Вы вышли из личного кабинета');
    });
    return;
  }
  modalBody.innerHTML = authFormHtml(mode || 'reg');
  modal.classList.add('open');
  modalBody.querySelectorAll('[data-auth-tab]').forEach(function (b) {
    b.addEventListener('click', function () { openAuthModal(b.getAttribute('data-auth-tab')); });
  });
  var errBox = document.getElementById('auth-err');
  var rf = document.getElementById('reg-form');
  if (rf) rf.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = validate(rf);
    var pass = document.getElementById('r-pass');
    if (pass.value.length < 6) { fieldErr(pass, true); ok = false; }
    var ag = document.getElementById('r-agree');
    if (!ag.checked) { ag.parentNode.classList.add('err'); ok = false; }
    if (!ok) { errBox.textContent = 'Проверьте заполнение полей'; return; }
    var res = Auth.register({
      name: document.getElementById('r-name').value.trim(),
      email: document.getElementById('r-email').value.trim(),
      phone: document.getElementById('r-phone').value.trim(),
      org: document.getElementById('r-org').value.trim(),
      pass: pass.value
    });
    if (!res.ok) { errBox.textContent = res.err; return; }
    closeModal();
    toast('Регистрация завершена. Добро пожаловать!');
  });
  var lf = document.getElementById('login-form');
  if (lf) lf.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate(lf)) { errBox.textContent = 'Проверьте заполнение полей'; return; }
    var res = Auth.login(document.getElementById('l-email').value.trim(), document.getElementById('l-pass').value);
    if (!res.ok) { errBox.textContent = res.err; return; }
    closeModal();
    toast('Вы вошли как ' + res.user.name);
  });
}

/* ---------------- router ---------------- */
function render() {
  try { closeModal(); } catch (e) { }
  var mm = document.getElementById('mmenu');
  if (mm) { mm.classList.remove('open'); document.body.style.overflow = ''; }
  var r = parseHash();
  var p = r.path, q = r.q, html;
  if (p === '/' || p === '') html = pageHome();
  else if (p === '/catalog') html = pageCatalog();
  else if (p.indexOf('/catalog/') === 0) html = pageCategory(p.slice(9), q);
  else if (p.indexOf('/good/') === 0) html = pageProduct(p.slice(6));
  else if (p === '/search') html = pageSearch(q);
  else if (p === '/basket') html = pageBasket();
  else if (p === '/order') html = pageOrder();
  else if (p === '/news') html = pageNews();
  else if (p === '/docs') html = pageDocs();
  else if (p === '/contacts') html = pageContacts();
  else if (PAGES[p.replace(/^\//, '')]) html = pageStatic(p.replace(/^\//, ''));
  else html = page404();

  app.innerHTML = html;
  rewriteLinks(app);
  bindPage();
  if (window.RCCarousel) window.RCCarousel.init();
  var cn = document.getElementById('cnt-prod');
  if (cn) cn.textContent = DATA.prods.length;
  document.querySelectorAll('#mainmenu a').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('href') === U(p));
  });
  document.title = pageTitle(p, q);
}
function pageTitle(p, q) {
  var base = ' | Rising Chemicals';
  if (p.indexOf('/good/') === 0 && DATA.bySlug[p.slice(6)]) return DATA.bySlug[p.slice(6)].name + base;
  if (p.indexOf('/catalog/') === 0 && DATA.byPath[p.slice(9)]) return DATA.byPath[p.slice(9)].name + base;
  if (p === '/catalog') return 'Каталог продукции' + base;
  if (p === '/search') return 'Поиск' + (q.q ? ': ' + q.q : '') + base;
  if (p === '/basket') return 'Корзина' + base;
  if (p === '/order') return 'Оформление заявки' + base;
  if (p === '/news') return 'Новости' + base;
  if (p === '/docs') return 'Документы' + base;
  if (p === '/contacts') return 'Контакты' + base;
  var k = p.replace(/^\//, '');
  if (PAGES[k]) return PAGES[k].title + base;
  return 'Rising Chemicals — оборудование и расходные материалы для лабораторий';
}

function setQ(patch) {
  var r = parseHash();
  var q = r.q;
  for (var k in patch) {
    if (patch[k] === null || patch[k] === '' || patch[k] === false) delete q[k];
    else q[k] = patch[k];
  }
  var s = qs(q);
  location.href = U(r.path) + (s ? '?' + s : '');
}

/* ---------------- page bindings ---------------- */
function bindPage() {
  // карточки: степпер количества (+ / -) — виден только после добавления в корзину
  app.querySelectorAll('.pcard [data-qty-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      var buy = b.closest('.pcard__buy');
      var input = b.parentElement.querySelector('.qty__input');
      if (!input) return;
      var isMinus = b.getAttribute('data-qty-btn') === '-';
      var cur = parseInt(input.value, 10) || 1;
      // "-" при количестве 1 — убираем товар из корзины и возвращаем кнопку "Добавить в корзину"
      if (isMinus && cur <= 1 && buy && buy.classList.contains('is-added')) {
        var addBtn0 = buy.querySelector('[data-add]');
        if (addBtn0) Cart.remove(addBtn0.getAttribute('data-add'));
        input.value = 1;
        buy.classList.remove('is-added');
        return;
      }
      var v = Math.max(1, cur + (isMinus ? -1 : 1));
      input.value = v;
      // если товар уже добавлен в корзину — сразу синхронизируем количество
      if (buy && buy.classList.contains('is-added')) {
        var addBtn = buy.querySelector('[data-add]');
        if (addBtn) Cart.set(addBtn.getAttribute('data-add'), v);
      }
    });
  });
  // добавить в корзину (карточки) — по клику показываем степпер вместо кнопки
  app.querySelectorAll('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var buy = b.closest('.pcard__buy');
      var card = b.closest('.pcard');
      var qtyInput = card ? card.querySelector('.qty__input') : null;
      var n = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
      Cart.add(b.getAttribute('data-add'), n);
      if (buy) buy.classList.add('is-added');
      toast('Добавлено в корзину: ' + n + ' шт');
    });
  });
  // карточка товара: количество + добавить
  var qi = document.getElementById('q-input');
  app.querySelectorAll('[data-q]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = Math.max(1, (parseInt(qi.value, 10) || 1) + (b.getAttribute('data-q') === '+' ? 1 : -1));
      qi.value = v;
    });
  });
  var addq = app.querySelector('[data-add-q]');
  if (addq) addq.addEventListener('click', function () {
    Cart.add(addq.getAttribute('data-add-q'), Math.max(1, parseInt(qi.value, 10) || 1));
    toast('Добавлено в корзину: ' + qi.value + ' шт');
  });
  // вкладки
  var tabBody = document.getElementById('tab-body');
  if (tabBody) {
    var slug = parseHash().path.slice(6);
    app.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        app.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        tabBody.innerHTML = tabHTML(DATA.bySlug[slug], +b.getAttribute('data-tab'));
      });
    });
  }
  // сортировка / пагинация / фильтры
  var sort = document.getElementById('sort');
  if (sort) sort.addEventListener('change', function () { setQ({ sort: sort.value === 'name' ? null : sort.value, page: null }); });
  app.querySelectorAll('[data-page]').forEach(function (b) {
    b.addEventListener('click', function () { setQ({ page: b.getAttribute('data-page') }); });
  });
  var fa = document.getElementById('f-apply');
  if (fa) fa.addEventListener('click', function () {
    setQ({
      stock: document.getElementById('f-stock').checked ? '1' : null,
      hasprice: document.getElementById('f-price').checked ? '1' : null,
      min: document.getElementById('f-min').value || null,
      max: document.getElementById('f-max').value || null,
      page: null
    });
  });
  var fr = document.getElementById('f-reset');
  if (fr) fr.addEventListener('click', function () {
    setQ({ stock: null, hasprice: null, min: null, max: null, page: null });
  });
  // корзина
  app.querySelectorAll('[data-line-q]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = b.getAttribute('data-slug');
      var d = b.getAttribute('data-line-q') === '+' ? 1 : -1;
      Cart.set(s, (Cart.items[s] || 0) + d);
      render();
    });
  });
  app.querySelectorAll('[data-del]').forEach(function (b) {
    b.addEventListener('click', function () { Cart.remove(b.getAttribute('data-del')); render(); toast('Товар удалён'); });
  });
  var cc = document.getElementById('cart-clear');
  if (cc) cc.addEventListener('click', function () { Cart.clear(); render(); toast('Корзина очищена'); });
  // модалки
  app.querySelectorAll('[data-modal]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); openModal(b.getAttribute('data-modal')); });
  });
  // формы
  var of = document.getElementById('order-form');
  if (of) {
    of.addEventListener('submit', submitOrder);
    if (Auth.current) {
      if (!of.name.value) of.name.value = Auth.current.name || '';
      if (!of.email.value) of.email.value = Auth.current.email || '';
      if (!of.phone.value) of.phone.value = Auth.current.phone || '';
      if (!of.org.value) of.org.value = Auth.current.org || '';
    }
  }
  var cf = document.getElementById('contact-form');
  if (cf) cf.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate(cf)) return;
    notifyLead('contact', {
      name: (cf.querySelector('#c-name') || {}).value,
      email: (cf.querySelector('#c-email') || {}).value,
      phone: (cf.querySelector('#c-phone') || {}).value,
      text: (cf.querySelector('#c-msg') || cf.querySelector('textarea') || {}).value
    });
    cf.reset();
    toast('Сообщение отправлено. Спасибо за обращение!');
  });
}

function fieldErr(input, bad) {
  var f = input.closest('.field');
  if (f) f.classList.toggle('err', !!bad);
  return !bad;
}
function validate(form) {
  var ok = true;
  form.querySelectorAll('input[required],textarea[required]').forEach(function (i) {
    var v = i.value.trim(), bad = false;
    if (i.type === 'checkbox') return;
    if (!v) bad = true;
    else if (i.type === 'email' && !/^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(v)) bad = true;
    else if (/phone|тел/i.test(i.id) && (v.replace(/\D/g, '').length < 6)) bad = true;
    if (!fieldErr(i, bad)) ok = false;
  });
  return ok;
}
function submitOrder(e) {
  e.preventDefault();
  var form = e.target;
  var ok = validate(form);
  var agree = document.getElementById('o-agree');
  var am = document.getElementById('agree-msg');
  if (agree && !agree.checked) { am.style.display = 'block'; ok = false; }
  else if (am) am.style.display = 'none';
  if (!ok) { toast('Проверьте заполнение полей'); return; }

  var sum = Cart.total();
  var num = String(Math.floor(Math.random() * 9000) + 1000);
  var order = {
    num: num, date: new Date().toISOString(), sum: sum,
    name: form.name.value, org: form.org.value, phone: form.phone.value,
    email: form.email.value, city: form.city.value, comment: form.comment.value,
    items: Cart.lines().map(function (l) { return { art: l.p.art, name: l.p.name, qty: l.qty, price: l.p.price }; })
  };
  var hist = [];
  try { hist = JSON.parse(Store.get('rising_chemicals_orders') || '[]'); } catch (err) { hist = []; }
  hist.push(order);
  Store.set('rising_chemicals_orders', JSON.stringify(hist));
  notifyOrder(order);
  Cart.clear();
  app.innerHTML = pageOrderDone(num, sum);
  rewriteLinks(app);
  window.scrollTo(0, 0);
}

function notifyOrder(o) {
  var lines = o.items.map(function (it, i) {
    return (i + 1) + '. ' + TG.esc(it.name) + '\n' +
      '   арт. ' + TG.esc(it.art || '—') + ' × ' + it.qty + ' — ' +
      (it.price != null ? money(it.price * it.qty) : 'по запросу');
  }).join('\n');
  var t = '📝 <b>Новая заявка из корзины</b>\n\n' +
    '👤 Имя: ' + TG.esc(o.name) + '\n' +
    (o.org ? '🏢 Организация: ' + TG.esc(o.org) + '\n' : '') +
    '📞 Телефон: ' + TG.esc(o.phone) + '\n' +
    '📧 E-mail: ' + TG.esc(o.email) + '\n' +
    (o.city ? '📍 Город: ' + TG.esc(o.city) + '\n' : '') +
    (o.comment ? '💬 Комментарий: ' + TG.esc(o.comment) + '\n' : '') +
    '\nСостав заявки (' + o.items.length + ' поз.):\n' + lines + '\n\n' +
    'Итого с НДС: ' + money(o.sum) + '\n' +
    'Номер заявки: №' + TG.esc(o.num) +
    TG.footer();
  if (t.length > 3900) t = t.slice(0, 3880) + '\n…список сокращён';
  TG.send(t);
}

function notifyLead(kind, data) {
  var titles = {
    call: '📞 <b>Заказ звонка</b>',
    kp: '📄 <b>Запрос коммерческого предложения</b>',
    contact: '✉️ <b>Сообщение с формы «Написать нам»</b>'
  };
  var t = (titles[kind] || '📩 <b>Заявка с сайта</b>') + '\n\n';
  if (data.name) t += '👤 Имя: ' + TG.esc(data.name) + '\n';
  if (data.phone) t += '📞 Телефон: ' + TG.esc(data.phone) + '\n';
  if (data.email) t += '📧 E-mail: ' + TG.esc(data.email) + '\n';
  if (data.text) t += '💬 ' + (kind === 'kp' ? 'Что интересует' : 'Сообщение') + ': ' + TG.esc(data.text) + '\n';
  t += TG.footer();
  TG.send(t);
}

function notifySubscribe(email) {
  var t = '📮 <b>Подписка на рассылку</b>\n\n' +
    '📧 E-mail: ' + TG.esc(email) +
    TG.footer();
  TG.send(t);
}

/* ---------------- modal ---------------- */
var modal = document.getElementById('modal');
var modalBody = document.getElementById('modal-body');
function openModal(kind) {
  var html;
  if (kind === 'call') {
    html = '<h2>Заказать звонок</h2><p style="color:#6b7b7a;font-size:14px;margin-top:-8px">Перезвоним в рабочее время: пн–пт, 9:00–18:00 (Ташкент).</p>' +
      '<form class="form" id="m-form" novalidate>' +
      '<div class="field"><label for="m-name">Имя *</label><input id="m-name" required><div class="msg">Укажите имя</div></div>' +
      '<div class="field"><label for="m-phone">Телефон *</label><input id="m-phone" required><div class="msg">Укажите телефон</div></div>' +
      '<div class="field check"><input type="checkbox" id="m-agree" required><label for="m-agree" style="margin:0">Согласен(а) на обработку персональных данных</label></div>' +
      '<button class="btn" type="submit">Жду звонка</button></form>';
  } else {
    html = '<h2>Получить коммерческое предложение</h2>' +
      '<p style="color:#6b7b7a;font-size:14px;margin-top:-8px">Пришлём КП с ценами и сроками поставки на вашу спецификацию.</p>' +
      '<form class="form" id="m-form" novalidate>' +
      '<div class="field"><label for="m-name">ФИО *</label><input id="m-name" required><div class="msg">Укажите имя</div></div>' +
      '<div class="field"><label for="m-email">E-mail *</label><input id="m-email" type="email" required><div class="msg">Укажите корректный e-mail</div></div>' +
      '<div class="field"><label for="m-phone">Телефон</label><input id="m-phone"></div>' +
      '<div class="field"><label for="m-text">Что интересует</label><textarea id="m-text" placeholder="Артикулы, количество, требования…"></textarea></div>' +
      '<div class="field check"><input type="checkbox" id="m-agree" required><label for="m-agree" style="margin:0">Согласен(а) на обработку персональных данных</label></div>' +
      '<button class="btn" type="submit">Отправить запрос</button></form>';
  }
  modalBody.innerHTML = html;
  rewriteLinks(modalBody);
  modal.classList.add('open');
  var f = document.getElementById('m-form');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = validate(f);
    var ag = document.getElementById('m-agree');
    if (!ag.checked) { ag.parentNode.classList.add('err'); ok = false; }
    if (!ok) return;
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    notifyLead(kind === 'call' ? 'call' : 'kp', {
      name: val('m-name'), phone: val('m-phone'), email: val('m-email'), text: val('m-text')
    });
    closeModal();
    toast('Заявка принята. Спасибо за обращение!');
  });
}
function closeModal() { modal.classList.remove('open'); }
document.getElementById('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); catdropClose(); } });

/* ---------------- header behaviour ---------------- */
var catdrop = document.getElementById('catdrop');
var catBtn = document.getElementById('cat-btn');
function catdropClose() { catdrop.classList.remove('open'); catBtn.setAttribute('aria-expanded', 'false'); }
catBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  var open = catdrop.classList.toggle('open');
  catBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
document.addEventListener('click', function (e) {
  if (!catdrop.contains(e.target) && e.target !== catBtn) catdropClose();
});
document.getElementById('search-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var v = document.getElementById('search-input').value.trim();
  location.href = U('/search') + (v ? '?q=' + encodeURIComponent(v) : '');
});
document.getElementById('totop').addEventListener('click', function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('sub-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var email = (e.target.querySelector('input[type=email]') || {}).value || '';
  if (email) notifySubscribe(email.trim());
  e.target.reset();
  toast('Спасибо! Вы подписаны на новостную рассылку.');
});
document.querySelectorAll('.hdr__top-links [data-modal], .hdr__contacts [data-modal]').forEach(function (b) {
  b.addEventListener('click', function (e) { e.preventDefault(); openModal(b.getAttribute('data-modal')); });
});
document.querySelectorAll('#auth-link, #mmenu-auth').forEach(function (b) {
  b.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (b.id === 'mmenu-auth') mmClose();
    openAuthModal('reg');
  });
});
document.querySelector('[data-lang-en]').addEventListener('click', function (e) {
  e.preventDefault();
  toast('Английская версия каталога в демо-копии не переносилась');
});
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------------- boot ---------------- */
function fillHeaderCats() {
  document.getElementById('catdrop-list').innerHTML = tops().map(function (c) {
    return '<li><a href="#/catalog/' + c.path + '">' + esc(c.name) + '</a></li>';
  }).join('');
  document.getElementById('ftr-cats').innerHTML = tops().map(function (c) {
    return '<li><a href="#/catalog/' + c.path + '">' + esc(c.name) + '</a></li>';
  }).join('');
  document.getElementById('catdrop-list').addEventListener('click', catdropClose);
  document.getElementById('mmenu-cats').innerHTML = tops().map(function (c) {
    return '<li><a href="#/catalog/' + c.path + '">' + esc(c.name) + '</a></li>';
  }).join('');
  ['catdrop-list', 'ftr-cats', 'mmenu-cats'].forEach(function (id) {
    rewriteLinks(document.getElementById(id));
  });
}

/* mobile menu */
var mmenu = document.getElementById('mmenu');
function mmOpen() { mmenu.classList.add('open'); document.body.style.overflow = 'hidden'; }
function mmClose() { mmenu.classList.remove('open'); document.body.style.overflow = ''; }
document.getElementById('burger').addEventListener('click', mmOpen);
document.getElementById('mmenu-close').addEventListener('click', mmClose);
mmenu.addEventListener('click', function (e) {
  if (e.target === mmenu || e.target.closest('a')) mmClose();
});

Promise.all([
  fetch(ROOT + 'data/categories.json').then(function (r) { return r.json(); }),
  fetch(ROOT + 'data/products.json').then(function (r) { return r.json(); })
]).then(function (res) {
  DATA.cats = res[0];
  DATA.prods = res[1];
  buildIndexes();
  DATA.ready = true;
  fillHeaderCats();
  Auth.load();
  Cart.load();
  Cart.paint();
  render();
}).catch(function (err) {
  app.innerHTML = '<div class="container empty"><h2>Не удалось загрузить каталог</h2><p>' + esc(err.message) + '</p></div>';
});
})();
