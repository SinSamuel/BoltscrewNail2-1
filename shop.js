/* ==================================================================
   CATALOG  --  fetched live from /api/products (Stripe Dashboard is
   the source of truth). Stripe product metadata drives the mapping:
   cat, sub, family, variant, stock, badge, order. Variants that share
   a `family` id are grouped back here into one card with a picker.
   ================================================================== */

let products = [];   // built by buildProducts() from /api/products

const subSections = {
    'bolts': [{ id: 'sub-bolts-structural', name: 'STRUCTURAL' }, { id: 'sub-bolts-anchor', name: 'ANCHOR' }, { id: 'sub-bolts-specialty', name: 'SPECIALTY' }],
    'screws': [{ id: 'sub-screws-construction', name: 'CONSTRUCTION' }, { id: 'sub-screws-interior', name: 'INTERIOR' }, { id: 'sub-screws-masonry', name: 'MASONRY' }],
    'nails': [{ id: 'sub-nails-strip', name: 'STRIP' }, { id: 'sub-nails-coil', name: 'COIL' }, { id: 'sub-nails-finish', name: 'FINISH' }, { id: 'sub-nails-bulk', name: 'BULK' }, { id: 'sub-nails-staples', name: 'STAPLES' }],
    'limited': [{ id: 'sub-limited-power-tools', name: 'POWER TOOLS' }, { id: 'sub-limited-lots', name: 'LOTS' }]
};

const loyaltyDB = { "1": { name: "Sam", discount: 0.20 } };
/* ------------------------------------------------------------------
   Order state. A line is (product, variant, quantity) - so one card can
   hold several sizes of the same nail, which is the whole point.
   ------------------------------------------------------------------ */
/* Elements the handlers below need. Assigned in the boot block at the
   bottom - they are declared here because openProductDetail and friends
   are top-level functions, not inside that callback. */
let productModal, checkoutModal, brandLink, navLogoCenter;

let orderLines = [];   // { pid, sku, qty }
let selectedVariant = null;   // variant highlighted in the detail modal

/* Price of one variant comes straight off Stripe - no local formula. */
function priceFor(p, v) {
    return v.price != null ? v.price : 0;
}

/* Single-variant products (bolts/screws/limited) carry no size, gauge, shank
   or finish, so guard before building a label or the invoice printed
   "undefined”" as the spec for every one of them. */
const sizeText = v => !v.size ? '' : (/D$/.test(v.size) ? v.size : v.size + '”');

function variantLabel(v) {
    return v.variant || [sizeText(v), v.gauge, v.shank, v.finish].filter(Boolean).join(' · ');
}

const findProduct = pid => products.find(p => p.id === pid);
const findVariant = (p, sku) => p.variants.find(v => v.sku === sku);

/* Merge rather than duplicate: picking the same size twice bumps qty. */
function addLine(pid, sku, qty) {
    const n = parseInt(qty) || 0;
    if (n <= 0) return;
    const existing = orderLines.find(l => l.pid === pid && l.sku === sku);
    if (existing) existing.qty += n;
    else orderLines.push({ pid, sku, qty: n });
    refreshTotals();
}

function setLineQty(pid, sku, qty) {
    const line = orderLines.find(l => l.pid === pid && l.sku === sku);
    if (!line) return;
    const n = parseInt(qty) || 0;
    if (n <= 0) orderLines = orderLines.filter(l => l !== line);
    else line.qty = n;
    refreshTotals();
}

function clearLines() {
    orderLines = [];
    refreshTotals();
}

/* Running order total, straight off the state array - not the DOM. */
function orderSubtotal() {
    return orderLines.reduce((sum, l) => {
        const p = findProduct(l.pid);
        const v = p && findVariant(p, l.sku);
        return sum + (v ? priceFor(p, v) * l.qty : 0);
    }, 0);
}

/* ---- Cart persistence -------------------------------------------------
   Quantities used to live only in this array, so navigating back to the
   landing page and returning wiped everything the customer had entered.
   sessionStorage survives that round trip (and reloads) without leaking
   into a later visit the way localStorage would. */
const CART_KEY = 'bsn_cart_v1';

function saveCart() {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(orderLines)); } catch (e) { }
}

function loadCart() {
    try {
        const raw = sessionStorage.getItem(CART_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        // drop anything that no longer matches the catalogue
        orderLines = parsed.filter(l => l && findProduct(l.pid) &&
            findVariant(findProduct(l.pid), l.sku) && parseInt(l.qty) > 0);
    } catch (e) { orderLines = []; }
}

/* Put restored quantities back into the visible card boxes. */
function restoreCardInputs() {
    document.querySelectorAll('.product-card .qty-input').forEach(inp => {
        const card = inp.closest('.product-card');
        const line = orderLines.find(l => l.pid === card.dataset.pid);
        inp.value = line ? line.qty : 0;
    });
}

let navTotalCenter, completeOrderBtn;

function refreshTotals() {
    const total = orderSubtotal();
    const hasItems = orderLines.length > 0;
    if (!brandLink) brandLink = document.getElementById('nav-brand');
    if (!navTotalCenter) navTotalCenter = document.getElementById('nav-total-center');
    if (!completeOrderBtn) completeOrderBtn = document.getElementById('complete-order');

    if (brandLink) {
        brandLink.classList.toggle('logo-centered', !hasItems);
    }

    if (navTotalCenter) {
        if (hasItems) {
            navTotalCenter.innerText = `TOTAL: $${total.toFixed(2)}`;
            navTotalCenter.style.display = 'block';
        } else {
            navTotalCenter.innerText = '';
            navTotalCenter.style.display = 'none';
        }
    }
    if (completeOrderBtn) {
        completeOrderBtn.style.display = hasItems ? 'inline-block' : 'none';
    }
    document.querySelectorAll('[data-lines-for]').forEach(renderLines);
    if (checkoutModal && checkoutModal.style.display === 'block') buildInvoice();
    saveCart();
}

/* ------------------------------------------------------------------
   Group the flat /api/products catalog back into cards. Products that
   share a `group` id collapse into one card whose variants are the
   member products (parent = the group member with no `variant` label);
   standalone products become a single-variant card. Placement (main
   section + sub-section) comes from cat + family metadata.
   ------------------------------------------------------------------ */
function buildProducts(items) {
    const groups = new Map();
    (items || []).forEach(it => {
        const key = it.group || it.id;
        if (!groups.has(key)) groups.set(key, { parent: null, kids: [] });
        const g = groups.get(key);
        if (it.group && !it.variant) g.parent = it;
        g.kids.push(it);
    });
    const out = [];
    groups.forEach((g, key) => {
        if (!g.kids.length) return;
        const parent = g.parent || g.kids[0];
        const variants = (g.parent ? g.kids.filter(k => k.variant) : g.kids).map(v => ({
            sku: v.priceId,
            price: v.price,
            size: v.variant || parent.name,
            variant: v.variant,
            finish: v.finish || '',
            gauge: v.gauge || '',
            shank: v.shank || '',
            stock: v.stock
        }));
        if (!variants.length) return;
        out.push({
            id: key,
            cat: parent.cat,
            sub: parent.sub,
            name: parent.name,
            detail: parent.description,
            badge: parent.badge,
            order: parent.order,
            thumb: parent.image,
            images: parent.images,
            variants
        });
    });
    return out.sort((a, b) => (a.order || 999) - (b.order || 999) || a.name.localeCompare(b.name));
}

/* Products whose cat/sub has no matching section in shop.html get a backing
   "OTHER" section appended to the bottom so nothing is ever invisible. */
function ensureCatalogSections() {
    const missing = products.filter(p => !document.getElementById(`grid-${p.sub}`));
    if (!missing.length) return;
    const main = document.querySelector('main');
    if (!main) return;
    const seen = new Set();
    main.insertAdjacentHTML('beforeend', `<section id="section-other" class="main-cat-section" data-cat="other" style="margin-bottom:100px;">
        <h2 class="main-category-title">OTHER</h2>
        ${missing.map(p => {
            const plain = p.sub.replace(/^other-/, '') || 'other';
            if (seen.has(p.sub)) return '';
            seen.add(p.sub);
            return `<div id="sub-${p.sub}" class="sub-section-anchor" data-sub="${plain}"><h3 class="sub-title-clean">${plain.toUpperCase()}</h3><div id="grid-${p.sub}" class="product-grid"></div></div>`;
        }).join('')}
    </section>`);
}

/* Hide sub-sections and whole categories that ended up empty so the page
   only shows what actually has products. Nav links to hidden targets go too. */
function cleanEmptySections() {
    document.querySelectorAll('.sub-section-anchor').forEach(a => {
        const grid = a.querySelector('.product-grid');
        if (grid && grid.children.length > 0) {
            a.style.display = 'block';
        } else {
            a.style.display = 'none';
        }
    });
    document.querySelectorAll('.main-cat-section').forEach(sec => {
        if (sec.querySelector('.product-card')) {
            sec.style.display = 'block';
        } else {
            sec.style.display = 'none';
        }
    });
    document.querySelectorAll('.nav-main-link').forEach(link => {
        const target = link.getAttribute('href').slice(1);
        const sec = document.getElementById(target);
        if (!sec || getComputedStyle(sec).display === 'none') {
            link.style.display = 'none';
        } else {
            link.style.display = 'inline-block';
        }
    });
}

/* ------------------------------------------------------------------
   Card rendering
   ------------------------------------------------------------------ */
const SIMPLE_MAX = 3;   // <= this many sizes: plain quantity box

/* Total tracked stock across a card's variants; '' when no variant tracks
   stock so untracked products show no (possibly wrong) number. */
function cardStockText(p) {
    const known = p.variants.filter(v => v.stock != null);
    if (!known.length) return '';
    const total = known.reduce((s, v) => s + v.stock, 0);
    return total > 0 ? total + ' IN STOCK' : 'SOLD OUT';
}

function renderCard(p) {
    const grid = document.getElementById(`grid-${p.sub}`);
    if (!grid) return;
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.pid = p.id;
    const many = p.variants.length > SIMPLE_MAX;
    const stockText = cardStockText(p);
    const stockHtml = stockText
        ? `<div class="${stockText === 'SOLD OUT' ? 'vstock soldout' : 'vstock'}">${stockText}</div>` : '';
    card.innerHTML = `
        <div class="product-img" onclick="openProductDetail('${p.id}')">
            <img src="${p.thumb}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.style.display='none'">
        </div>
        <div class="product-info-top" onclick="openProductDetail('${p.id}')">
            <h3>${p.name}</h3>
        </div>
        ${many ? `
            <div class="vsize-note">${p.variants.length} sizes available</div>
            ${stockHtml}
            <div class="vlines" data-lines-for="${p.id}"></div>
            <button type="button" class="vadd" onclick="openProductDetail('${p.id}')">+ ADD SIZE</button>
        ` : `
            ${p.cat === 'limited' || p.variants.length <= SIMPLE_MAX ? `<div class="product-price" data-price-for="${p.id}"></div>` : ''}
            ${stockHtml}
            <div class="qty-wrapper"><input type="number" value="0" min="0" ${p.cat === 'limited' ? 'max="1"' : ''} class="qty-input"
                onfocus="clearZero(this)" aria-label="Quantity of boxes"
                oninput="simpleAdd('${p.id}', this.value, this)"></div>
        `}
    `;
    grid.appendChild(card);
    paintCardPrice(card, p);
}

/* Prices are shown on the limited items, and on other categories for
   single-variant/simple listings where prices are shown inline. Show prices
   on all non-grouped/simple variants too (nails/bolts/screws single-card). */
function paintCardPrice(card, p) {
    const el = card.querySelector('.product-price');
    if (!el) return;
    const amt = p.variants.length > SIMPLE_MAX
        ? Math.min.apply(null, p.variants.map(v => priceFor(p, v)))
        : priceFor(p, p.variants[0]);
    el.textContent = '$' + amt.toFixed(2);
}

/* Hot items are one-per-order. Anything higher than 1 is refused with a popup
   and the quantity is clamped back down to 1. */
const isOneOnly = p => p && p.cat === 'limited';

window.showQtyLimitPopup = function (name, msg) {
    const pop = document.getElementById('qty-popup');
    if (!pop) return;
    document.getElementById('qty-popup-sub').textContent =
        msg || ((name ? name + ' is' : 'This item is') + ' limited to one per order.');
    pop.classList.add('is-open');
    pushOverlay();
};
function closeQtyLimitPopup() {
    const pop = document.getElementById('qty-popup');
    if (pop) pop.classList.remove('is-open');
}

/* Overlays take a history entry so the phone Back button closes them rather
   than navigating out of the shop mid-order. */
let overlayDepth = 0;
let overlayClosing = false;
function pushOverlay() {
    if (overlayDepth === 0) history.pushState({ overlay: 1 }, '');
    overlayDepth++;
}
function hideOverlays() {
    if (productModal) productModal.style.display = 'none';
    if (checkoutModal) checkoutModal.style.display = 'none';
    closeQtyLimitPopup();
}
/* A Back that arrives while an overlay is open is consumed by that overlay:
   clear the stack outright rather than peeling one entry off it. */
function popOverlay() {
    overlayDepth = 0;
    hideOverlays();
}
/* Closing by tap has to give the history entry back, otherwise the next
   Back press is swallowed and the one after that leaves the shop. The timer
   is a safety net: if no popstate comes back (entry already consumed, or a
   browser that will not traverse), close the overlay anyway. */
function dismissOverlay() {
    hideOverlays();
    if (overlayDepth === 0 || overlayClosing) return;
    overlayClosing = true;
    history.back();
    setTimeout(function () {
        overlayClosing = false;
        if (overlayDepth > 0) popOverlay();
    }, 150);
}
/* Acknowledging the limit should only close the warning. If the product
   detail popup is behind it, that stays open so the quantity can be fixed;
   if the warning came from a card, release the history entry it made. */
function acknowledgeQtyLimit() {
    closeQtyLimitPopup();
    if (!productModal || productModal.style.display !== 'block') dismissOverlay();
}
document.addEventListener('DOMContentLoaded', function () {
    const ok = document.getElementById('qty-popup-ok');
    const pop = document.getElementById('qty-popup');
    if (ok) ok.addEventListener('click', acknowledgeQtyLimit);
    if (pop) pop.addEventListener('click', e => { if (e.target === pop) acknowledgeQtyLimit(); });
});

/* Returns the quantity that is actually allowed. */
function clampQty(p, n, input) {
    if (!isOneOnly(p) || n <= 1) return n;
    window.showQtyLimitPopup(p.name);
    if (input) { input.value = 1; return 1; }
    return 1;
}

/* Simple path: one size, quantity box writes straight to state. */
window.simpleAdd = function (pid, val, input) {
    const p = findProduct(pid);
    const v = p.variants[0];
    let n = parseInt(val) || 0;
    if (n > 1 && isOneOnly(p)) {
        n = clampQty(p, n, input);
        val = String(n);
    }
    if (v.stock != null && n > v.stock) {
        window.showQtyLimitPopup(p.name, 'Only ' + v.stock + ' in stock — quantity adjusted.');
        n = v.stock;
        val = String(n);
        if (input) input.value = val;
    }
    orderLines = orderLines.filter(l => !(l.pid === pid && l.sku === v.sku));
    if (n > 0) orderLines.push({ pid, sku: v.sku, qty: n });
    refreshTotals();
};

window.clearZero = el => { if (el.value === '0') el.value = ''; };

/* Line list under a card, with per-line steppers and remove. */
function renderLines(box) {
    const pid = box.dataset.linesFor;
    const p = findProduct(pid);
    const mine = orderLines.filter(l => l.pid === pid);
    if (!mine.length) { box.innerHTML = ''; return; }
    let sum = 0;
    box.innerHTML = mine.map(l => {
        const v = findVariant(p, l.sku);
        const tot = priceFor(p, v) * l.qty;
        sum += tot;
        return `<div class="vline">
            <span class="vline-spec">${variantLabel(v)}</span>
            <span class="vline-qty">
                <button type="button" onclick="bumpLine('${pid}','${v.sku}',-1)">&minus;</button>
                <b>${l.qty}</b>
                <button type="button" onclick="bumpLine('${pid}','${v.sku}',1)">+</button>
            </span>
            <span class="vline-amt">$${tot.toFixed(2)}</span>
            <button type="button" class="vline-x" onclick="bumpLine('${pid}','${v.sku}',-${l.qty})">&times;</button>
        </div>`;
    }).join('') + `<div class="vline-total">LINE TOTAL $${sum.toFixed(2)}</div>`;
}

window.bumpLine = function (pid, sku, delta) {
    const line = orderLines.find(l => l.pid === pid && l.sku === sku);
    if (!line) return;
    setLineQty(pid, sku, line.qty + delta);
};

/* ------------------------------------------------------------------
   Detail / variant picker modal
   ------------------------------------------------------------------ */
let gallery = { srcs: [], index: 0 };

function gallerySrcs(p) {
    if (Array.isArray(p.images) && p.images.length) return p.images;
    return p.thumb ? [p.thumb] : [];
}

function openGallery(p) {
    const host = document.getElementById('modal-img-container');
    const srcs = gallerySrcs(p);
    gallery.srcs = srcs;
    gallery.index = 0;
    if (srcs.length <= 1) {
        host.innerHTML = `<img src="${srcs[0] || ''}" alt="${p.name}">`;
        return;
    }
    host.innerHTML = `
        <div class="gallery">
            <div class="gallery-stage">
                <img id="gallery-img" src="${srcs[0]}" alt="${p.name}">
                <button type="button" class="gallery-nav gallery-prev" aria-label="Previous image">&#10094;</button>
                <button type="button" class="gallery-nav gallery-next" aria-label="Next image">&#10095;</button>
            </div>
            <div class="gallery-bar">
                <div class="gallery-dots">
                    ${srcs.map((s, i) => `<button type="button" class="gallery-dot${i ? '' : ' is-active'}" data-gi="${i}" aria-label="Show image ${i + 1}"></button>`).join('')}
                </div>
                <span class="gallery-count" id="gallery-count">1 / ${srcs.length}</span>
            </div>
        </div>`;
    wireGallery();
}

function galleryGo(i) {
    const n = gallery.srcs.length;
    if (!n) return;
    gallery.index = ((i % n) + n) % n;
    const img = document.getElementById('gallery-img');
    if (img) img.src = gallery.srcs[gallery.index];
    document.querySelectorAll('.gallery-dot').forEach(d =>
        d.classList.toggle('is-active', +d.dataset.gi === gallery.index));
    const c = document.getElementById('gallery-count');
    if (c) c.textContent = (gallery.index + 1) + ' / ' + n;
}

function wireGallery() {
    const stage = document.querySelector('.gallery-stage');
    if (!stage) return;
    stage.querySelector('.gallery-prev').onclick = e => { e.stopPropagation(); galleryGo(gallery.index - 1); };
    stage.querySelector('.gallery-next').onclick = e => { e.stopPropagation(); galleryGo(gallery.index + 1); };
    document.querySelectorAll('.gallery-dot').forEach(d => {
        d.onclick = e => { e.stopPropagation(); galleryGo(+d.dataset.gi); };
    });
    let x0 = null;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) >= 40) galleryGo(gallery.index + (dx < 0 ? 1 : -1));
    }, { passive: true });
}

window.openProductDetail = function (pid) {
    const p = findProduct(pid);
    productModal.style.display = 'block';
    pushOverlay();
    document.getElementById('modal-title').innerText = p.name;
    document.getElementById('modal-desc').innerText = p.detail || '';
    openGallery(p);

    const host = document.getElementById('modal-variants');
    /* Every product gets the same modal shape: an optional price line, then
       the qty + ADD TO ORDER row. Multi-variant products get a size picker
       built straight from their Stripe variants. */
    const showPrice = p.cat === 'limited';
    if (p.variants.length <= SIMPLE_MAX) {
        const v = p.variants[0];
        selectedVariant = v;
        const priceLine = showPrice
            ? `<div class="vpreview"><span class="vprice">$${priceFor(p, v).toFixed(2)}</span></div>`
            : '';
        const maxStock = v.stock != null ? `max="${v.stock}"` : '';
        host.innerHTML = priceLine + `
            <div class="vaddrow">
                <input type="number" id="v-qty" value="1" min="1" ${showPrice ? 'max="1"' : ''} ${maxStock} class="qty-input">
                <button type="button" id="v-add" onclick="addFromModal('${p.id}')">ADD TO ORDER</button>
            </div>`;
        return;
    }
    host.innerHTML = `
        <div class="vselects">
            <label>AVAILABLE SIZES
                <select id="sel-var" onchange="onVariantChange('${pid}')">
                    ${p.variants.map((v, i) => `<option value="${i}">${variantLabel(v)}</option>`).join('')}
                </select>
            </label>
        </div>
        <div class="vpreview" id="vpreview"></div>
        <div class="vaddrow">
            <input type="number" id="v-qty" value="1" min="1" class="qty-input">
            <button type="button" id="v-add" onclick="addFromModal('${pid}')">ADD TO ORDER</button>
        </div>`;
    onVariantChange(pid);
};

window.onVariantChange = function (pid) {
    const p = findProduct(pid);
    const sel = document.getElementById('sel-var');
    const i = sel ? parseInt(sel.value, 10) : 0;
    const v = p.variants[i] || p.variants[0];
    selectedVariant = v;
    const prev = document.getElementById('vpreview');
    if (!prev) return;
    const parts = [];
    if (p.cat === 'limited') parts.push(`<span class="vprice">$${priceFor(p, v).toFixed(2)}</span>`);
    if (v.stock != null) parts.push(`<span class="vstock">${v.stock} IN STOCK</span>`);
    prev.innerHTML = parts.join('');
};

window.addFromModal = function (pid) {
    const p = findProduct(pid);
    const v = (p.variants.length <= SIMPLE_MAX) ? p.variants[0] : selectedVariant;
    if (!v) return;
    let qty = parseInt(document.getElementById('v-qty').value, 10) || 1;
    if (isOneOnly(p) && qty > 1) {
        clampQty(p, qty, document.getElementById('v-qty'));
        return;
    }
    if (v.stock != null && qty > v.stock) {
        window.showQtyLimitPopup(p.name, 'Only ' + v.stock + ' in stock — quantity adjusted.');
        qty = v.stock;
        document.getElementById('v-qty').value = qty;
    }
    addLine(pid, v.sku, qty);
    dismissOverlay();
};

/* ------------------------------------------------------------------
   Invoice - grouped by product so several sizes of one nail read as
   one item rather than unrelated rows. Includes live Edit & Delete actions.
   ------------------------------------------------------------------ */
let editingLineKey = null;

window.toggleEditInvoiceLine = function(pid, sku) {
    const key = `${pid}_${sku}`;
    editingLineKey = (editingLineKey === key) ? null : key;
    buildInvoice();
};

window.updateInvoiceQty = function(pid, sku, val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const p = findProduct(pid);
    const v = p && findVariant(p, sku);
    let qty = n;
    if (p && isOneOnly(p) && qty > 1) {
        qty = 1;
        window.showQtyLimitPopup(p.name);
    } else if (v && v.stock != null && qty > v.stock) {
        qty = v.stock;
        window.showQtyLimitPopup(p ? p.name : '', 'Only ' + v.stock + ' in stock — quantity adjusted.');
    }
    setLineQty(pid, sku, qty);
    editingLineKey = null;
    buildInvoice();
};

window.deleteInvoiceLine = function(pid, sku) {
    orderLines = orderLines.filter(l => !(l.pid === pid && l.sku === sku));
    refreshTotals();
    if (orderLines.length === 0) {
        dismissOverlay();
    } else {
        buildInvoice();
    }
};

function buildInvoice() {
    const tbody = document.getElementById('invoice-tbody');
    tbody.innerHTML = '';
    let subtotal = 0;

    const byProduct = new Map();
    orderLines.forEach(l => {
        if (!byProduct.has(l.pid)) byProduct.set(l.pid, []);
        byProduct.get(l.pid).push(l);
    });

    byProduct.forEach((lines, pid) => {
        const p = findProduct(pid);
        if (!p) return;
        lines.forEach(l => {
            const v = findVariant(p, l.sku);
            if (!v) return;
            const lineTotal = priceFor(p, v) * l.qty;
            subtotal += lineTotal;

            const key = `${pid}_${l.sku}`;
            const isEditing = (editingLineKey === key);

            // Build one compact label: product name + variant spec, truncated
            const vLabel = variantLabel(v);
            const fullLabel = vLabel ? `${p.name} · ${vLabel}` : p.name;
            const truncLabel = fullLabel.length > 38 ? fullLabel.slice(0, 36) + '…' : fullLabel;

            const qtyHtml = isEditing
                ? `<div class="inv-qty-edit-wrap">
                    <input type="number" min="1" value="${l.qty}" class="inv-qty-input" id="edit-qty-${pid}-${l.sku}">
                    <button type="button" class="inv-save-btn" onclick="updateInvoiceQty('${pid}','${l.sku}', document.getElementById('edit-qty-${pid}-${l.sku}').value)">&#10003;</button>
                   </div>`
                : `<b style="color:#000000; font-size: 1rem;">${l.qty}</b>`;

            const editIcon = isEditing ? '&#10005;' : '&#9998;';  // ✕ or ✎

            tbody.innerHTML += `<tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 6px 4px; white-space: nowrap;">
                    <button type="button" class="inv-icon-btn inv-edit-icon" title="Edit quantity" onclick="toggleEditInvoiceLine('${pid}','${l.sku}')">${editIcon}</button>
                    <button type="button" class="inv-icon-btn inv-del-icon" title="Remove item" onclick="deleteInvoiceLine('${pid}','${l.sku}')">&#128465;</button>
                </td>
                <td class="inv-spec" style="color: #000000; font-weight: 800; font-size: 0.85rem; max-width: 160px;" title="${fullLabel}">${truncLabel}</td>
                <td style="text-align:center; color: #000000;">${qtyHtml}</td>
                <td style="text-align:center; color: #000000; font-weight: 700;">$${priceFor(p, v).toFixed(2)}</td>
                <td style="text-align:right; font-weight:950; color: #000000;">$${lineTotal.toFixed(2)}</td>
            </tr>`;
        });
    });

    const phone = document.getElementById('customer-phone').value.trim();
    const discount = loyaltyDB[phone] ? subtotal * loyaltyDB[phone].discount : 0;
    const tax = (subtotal - discount) * 0.07;
    document.getElementById('inv-subtotal').innerText = `$${subtotal.toFixed(2)}`;
    document.getElementById('inv-loyalty-row').style.display = discount > 0 ? 'flex' : 'none';
    document.getElementById('inv-loyalty-discount').innerText = `-$${discount.toFixed(2)}`;
    document.getElementById('inv-tax').innerText = `$${tax.toFixed(2)}`;
    document.getElementById('inv-total').innerText = `$${(subtotal - discount + tax).toFixed(2)}`;
    document.getElementById('invoice-date-dynamic').innerText =
        'DATE: ' + new Date().toLocaleDateString();
}

/* GA4 ecommerce items — the Stripe price id is the item id. */
function orderLinesToGAItems() {
    const out = [];
    orderLines.forEach(l => {
        const p = findProduct(l.pid);
        const v = p && findVariant(p, l.sku);
        if (!v) return;
        out.push({
            item_id: v.sku,
            item_name: p.name,
            item_variant: variantLabel(v),
            price: priceFor(p, v),
            quantity: l.qty
        });
    });
    return out;
}

const triggerCheckout = (e) => {
    if (e) e.preventDefault();
    if (!orderLines.length) return alert('Select items first.');
    buildInvoice();
    checkoutModal.style.display = 'block';
    pushOverlay();
    if (typeof gtag === 'function') {
        gtag('event', 'begin_checkout', { currency: 'usd', value: orderSubtotal(), items: orderLinesToGAItems() });
    }
};
document.addEventListener('DOMContentLoaded', async () => {
    productModal = document.getElementById('product-modal');
    checkoutModal = document.getElementById('checkout-modal');
    brandLink = document.getElementById('nav-brand');
    navLogoCenter = document.getElementById('nav-logo-center');
    const dynamicSubLinks = document.getElementById('dynamic-sub-links');
    const mainSections = document.querySelectorAll('.main-cat-section');
    const subNav = document.getElementById('sub-nav-bar');
    const subSectionAnchors = document.querySelectorAll('.sub-section-anchor');
    const mainLinks = document.querySelectorAll('.nav-main-link');
    const mainNav = document.getElementById('main-nav');

    try {
        const catRes = await fetch('/api/products');
        const cat = await catRes.json();
        products = buildProducts(cat.products || []);
    } catch (e) {
        console.error('Catalog fetch failed:', e);
        products = buildProducts([]);
        const banner = document.createElement('div');
        banner.id = 'catalog-error-banner';
        banner.textContent = 'Catalog failed to load. Open this page as http://localhost:3000/shop.html (dev server) or the deployed Vercel URL — not as a local file.';
        banner.style.cssText = 'background:#b91c1c;color:#fff;padding:10px 16px;font:600 14px/1.4 sans-serif;text-align:center;position:sticky;top:0;z-index:9999;';
        document.body.prepend(banner);
    }
    ensureCatalogSections();
    products.forEach(renderCard);
    cleanEmptySections();
    refreshTotals();

    window.addEventListener('scroll', () => {
        let scrollPos = window.scrollY + 120;
        let currentMain = '';
        let currentSubId = '';
        mainSections.forEach(sec => { if (sec.offsetParent !== null && scrollPos >= sec.offsetTop) currentMain = sec.dataset.cat; });
        subSectionAnchors.forEach(sub => { if (sub.offsetParent !== null && scrollPos >= sub.offsetTop - 50) currentSubId = sub.id; });
        if (currentMain) {
            mainLinks.forEach(link => link.classList.toggle('active', link.dataset.target === currentMain));
            if (currentMain !== window.lastMain) {
                window.lastMain = currentMain;
                updateSubNav(currentMain);
            }
        }
        document.querySelectorAll('.nav-sub-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${currentSubId}`);
        });
        if (mainNav) mainNav.style.transform = 'translateY(0)';
        if (subNav) subNav.style.top = '60px';
    });

    function updateSubNav(cat) {
        dynamicSubLinks.innerHTML = '';
        (subSections[cat] || []).forEach(sub => {
            const anchor = document.getElementById(sub.id);
            if (anchor && anchor.offsetParent === null) return;   // empty sub-section, skip
            const link = document.createElement('a');
            link.href = `#${sub.id}`;
            link.className = 'nav-sub-link';
            link.innerText = sub.name;
            link.onclick = (e) => {
                e.preventDefault();
                window.scrollTo({ top: document.getElementById(sub.id).offsetTop - 120, behavior: 'smooth' });
            };
            dynamicSubLinks.appendChild(link);
        });
    }

    document.getElementById('complete-order').onclick = triggerCheckout;

    /* Order submission — POST /api/order, then a success screen. Stripe
       creates a DRAFT invoice; payment happens off-site when the shop
       sends it. */
    const orderForm = document.getElementById('order-form');
    if (orderForm) orderForm.addEventListener('submit', submitOrder);

    async function submitOrder(e) {
        e.preventDefault();
        const btn = orderForm.querySelector('button[type="submit"]');
        const payload = {
            lines: orderLines.map(l => ({ priceId: l.sku, qty: l.qty })),
            customer: {
                name: document.getElementById('cust-name').value.trim(),
                company: document.getElementById('cust-company').value.trim(),
                email: document.getElementById('cust-email').value.trim(),
                phone: document.getElementById('customer-phone').value.trim()
            },
            delivery: {
                address: document.getElementById('delivery-address').value.trim(),
                contact: document.getElementById('delivery-contact').value.trim(),
                phone: document.getElementById('delivery-phone').value.trim()
            },
            confirm: (document.querySelector('input[name="confirm_opt"]:checked') || {}).value || 'call'
        };

        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = 'SENDING…';
        try {
            const res = await fetch('/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 409) {
                const short = (data.items || []).map(i =>
                    (findProductFromPrice(i.priceId) ? findProductFromPrice(i.priceId).name : i.priceId) +
                    (i.available === 0 ? ' — sold out' : ` — only ${i.available} left`));
                alert('Some items are no longer available:\n\n' + short.join('\n') + '\n\nStock updated — please review your cart.');
                window.location.reload();
                return;
            }
            if (!res.ok) {
                alert('Order failed: ' + (data.error || 'server_error') + '. Please try again or call the shop.');
                return;
            }
            orderPlaced(data);
        } catch (err) {
            console.error('[order]', err);
            alert('Network error placing your order. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    const findProductFromPrice = priceId =>
        products.find(p => p.variants.some(v => v.sku === priceId));

    function orderPlaced(data) {
        if (typeof gtag === 'function') {
            gtag('event', 'purchase', {
                transaction_id: data.invoiceId,
                currency: data.currency || 'usd',
                value: orderSubtotal(),
                items: orderLinesToGAItems()
            });
        }
        const modalBox = checkoutModal.querySelector('.modal-content');
        const confirmNote = data.confirm === 'call' ? 'a phone call from the shop'
            : data.confirm === 'text' ? 'a text'
            : 'an email';
        modalBox.innerHTML = `
            <div style="text-align:center; padding: 30px 10px 10px;">
                <div style="font-size: 3rem; font-weight: 950; color: #15803d;">ORDER RECEIVED</div>
                <p style="font-size: 1.05rem; margin: 18px 0 8px; line-height:1.6;">Your order was placed. The shop will contact you to confirm
                   this draft <b>${data.invoiceId}</b> and arrange payment.</p>
                <p style="font-size: 0.9rem; color: #555; line-height:1.6;">
                   Confirmation via ${confirmNote}.<br>
                   Subtotal: <b>$${data.estimatedSubtotal.toFixed(2)}</b> ·
                   NC sales tax (${data.taxPercent}%): <b>$${data.estimatedTax.toFixed(2)}</b><br>
                   Estimated total: <b>$${data.estimatedTotal.toFixed(2)}</b><br>
                   <span style="color:#888; font-size:0.8rem;">Charged at ${data.taxLocation}. You can close this message now.</span></p>
                <button id="order-done" class="final-order-btn" style="margin-top: 22px;">DONE</button>
            </div>`;
        modalBox.querySelector('#order-done').onclick = dismissOverlay;
        clearLines();
    }

    /* Main category links used to navigate via href="#section-...", so every
       tap pushed a history entry and Back had to be pressed repeatedly before
       it would leave the page - overshooting straight out of the shop.
       Scroll manually instead and keep the URL out of the history stack. */
    mainLinks.forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const target = document.getElementById(link.getAttribute('href').slice(1));
            if (!target) return;
            window.scrollTo({ top: target.offsetTop - 120, behavior: 'smooth' });
            history.replaceState(null, '', link.getAttribute('href'));
        };
    });

    /* Overlays get a history entry so the phone Back button closes them
       instead of navigating out of the shop mid-order. */
    window.addEventListener('popstate', () => {
        overlayClosing = false;
        if (overlayDepth > 0) popOverlay();
    });

    document.querySelectorAll('.close-modal-btn').forEach(btn => btn.onclick = dismissOverlay);
    window.onclick = (e) => {
        if (e.target === productModal || e.target === checkoutModal) dismissOverlay();
    };

    document.addEventListener('keydown', e => {
        if (!productModal || productModal.style.display !== 'block') return;
        if (e.key === 'Escape') { dismissOverlay(); return; }
        if (gallery.srcs.length < 2) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); galleryGo(gallery.index - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); galleryGo(gallery.index + 1); }
    });

    loadCart();
    restoreCardInputs();
    refreshTotals();
});
