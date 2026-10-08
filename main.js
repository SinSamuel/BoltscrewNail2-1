document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('dynamic-nav');
    const catalogItems = document.querySelectorAll('.cat-item');

    // Display Nav on Scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            nav.classList.add('visible');
        } else {
            nav.classList.remove('visible');
        }
    });

    // Reveal Catalog on Scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, {
        threshold: 0.1
    });

    catalogItems.forEach(item => {
        observer.observe(item);
    });

});

/* ------------------------------------------------------------------
   Landing "WHAT WE CARRY" detail modal. Cards stay standalone (no shop
   links); a click opens the full size/shank/finish lineup for that
   product. DETAILS order matches the card order in index.html.
   Finish codes: VC = Vinyl Coated, EG = Electro Galvanized,
   HDG = Hot Dipped Galvanized, SS = Stainless Steel.
   ------------------------------------------------------------------ */
const PRODUCT_DETAILS = [
    { t: '21° PLASTIC COLLATED NAILS', tag: 'Most Used',
      uses: 'Framing, decking, wall sheathing, fencing, siding. Flat head; fits most 21° strip nailers (Senco, Bostitch, Metabo, Duo-Fast, Porter-Cable).',
      rows: [
        ['1-1/2" × .148 (Teco)', 'Smooth', 'VC / EG / HDG'],
        ['2" × .113', 'Smooth / Ring', 'VC / EG / HDG'],
        ['2-1/8" × .148', 'Smooth', 'VC / HDG'],
        ['2-1/4" × .120', 'Hardened', 'HDG'],
        ['2-1/4" × .148', 'Smooth / Screw', 'VC / EG / HDG'],
        ['2-1/2" × .113', 'Casing', 'HDG'],
        ['2-1/2" × .120', 'Large head', 'EG / HDG'],
        ['2-1/2" × .131', 'Smooth / Ring / Screw', 'VC / EG / HDG'],
        ['2-1/2" × .148', 'Smooth / Ring', 'VC / HDG'],
        ['2-1/2" × .162', 'Smooth', 'VC'],
        ['2-3/8" × .113', 'Smooth / Ring / Screw', 'VC / EG / HDG / SS'],
        ['2-3/8" × .120', 'Smooth / Ring / Screw', 'VC / SS'],
        ['2-3/8" × .148', 'Smooth / Ring / Screw', 'VC / HDG'],
        ['3" × .120', 'Smooth / Ring / Screw', 'VC / EG / HDG / SS'],
        ['3" × .131', 'Smooth / Ring / Screw', 'VC / EG / HDG / SS'],
        ['3" × .148', 'Smooth / Screw', 'VC / HDG'],
        ['3-1/4" × .120', 'Ring / Screw', 'SS / HDG'],
        ['3-1/4" × .131', 'Smooth / Ring / Screw', 'VC / EG / HDG / SS'],
        ['3-1/4" × .148', 'Smooth / Screw', 'VC / HDG'],
        ['3-1/2" × .131', 'Smooth / Screw', 'VC / EG / HDG'],
        ['3-1/2" × .135 / .162', 'Smooth', 'VC / HDG'],
        ['4" × .135', 'Screw', 'HDG'],
        ['4-1/2" × .148', 'Smooth', 'VC / HDG'],
        ['5-1/8" × .165', 'Smooth', 'VC / HDG'],
      ] },
    { t: '15° WIRE COLLATED COIL FRAMING NAILS', tag: 'Nails',
      uses: 'Framing, sheathing, decking, subfloor. High-count coils for coil framing nailers.',
      rows: [
        ['1-1/4" × .099', 'Smooth / Ring', 'VC / EG / HDG'],
        ['1-1/2" × .099', 'Smooth / Ring', 'VC / EG / HDG'],
        ['2" × .099 / .113', 'Smooth / Ring / Screw', 'VC / EG / HDG'],
        ['2-1/4" × .099 / .113', 'Smooth / Ring', 'VC / EG / HDG'],
        ['2-1/2" × .099 / .113 / .131', 'Smooth / Ring / Screw', 'VC / EG / HDG'],
        ['2-3/4" × .113 / .131', 'Smooth / Ring', 'VC / EG / HDG'],
        ['3-1/4" × .120', 'Ring', 'VC / EG / HDG'],
        ['3-1/2" × .131', 'Ring', 'VC / EG / HDG'],
      ] },
    { t: '34° PAPER COLLATED CLIPPED HEAD NAILS', tag: 'Nails',
      uses: 'Framing, trusses, high-volume nailing. Paper tape collation = more nails per strip, less cleanup.',
      rows: [
        ['2" × .113', 'Smooth / Ring', 'VC / EG / HDG'],
        ['2-3/8" × .113 / .131', 'Smooth / Ring', 'VC / EG / HDG'],
        ['2-1/2" × .131', 'Smooth / Ring / Screw', 'VC / EG / HDG'],
        ['3" × .120 / .131', 'Smooth / Ring / Screw', 'VC / EG / HDG'],
        ['3-1/4" × .120 / .131', 'Smooth / Ring', 'VC / EG / HDG'],
      ] },
    { t: '15° WIRE COLLATED COIL ROOFING NAILS', tag: 'Nails',
      uses: 'Asphalt shingles, roofing felt, siding. Large flat head, coil-fed for roofing nailers.',
      rows: [
        ['3/4" × .120', 'Ring', 'EG / HDG'],
        ['7/8" × .120', 'Ring', 'EG / HDG'],
        ['1" × .120', 'Ring', 'EG / HDG'],
        ['1-1/4" × .120', 'Ring', 'EG / HDG'],
        ['1-1/2" × .120', 'Ring', 'EG / HDG'],
        ['1-3/4" × .120', 'Ring', 'EG / HDG'],
      ] },
    { t: '0° PLASTIC COLLATED COIL SIDING / FENCING', tag: 'Nails',
      uses: 'Siding, fencing, soffit, decking. Rust-resistant finishes for exterior exposure.',
      rows: [
        ['1-1/4"', 'Ring / Screw', 'VC / EG / HDG / SS'],
        ['1-1/2"', 'Ring / Screw', 'VC / EG / HDG / SS'],
        ['2"', 'Ring / Screw', 'VC / EG / HDG / SS'],
        ['2-1/2"', 'Ring / Screw', 'VC / EG / HDG / SS'],
      ] },
    { t: '15° WIRE COLLATED COIL SIDING / FENCING', tag: 'Nails',
      uses: 'Siding, fencing, decking, pallets. Coil count keeps the gun firing longer.',
      rows: [
        ['1-1/4" × .099', 'Ring / Screw', 'VC / EG / HDG'],
        ['1-1/2" × .099', 'Ring / Screw', 'VC / EG / HDG'],
        ['2" × .099 / .113', 'Ring / Screw', 'VC / EG / HDG'],
        ['2-1/2" × .099 / .131', 'Ring / Screw', 'VC / EG / HDG'],
      ] },
    { t: 'BULK COMMON NAILS', tag: 'Nails',
      uses: 'Framing and general construction. Full-round head, heavy shank, hand-drive or gun.',
      rows: [
        ['6d — 2"', 'Smooth', 'Bright / VC / HDG'],
        ['8d — 2-1/2"', 'Smooth', 'Bright / VC / HDG'],
        ['10d — 3"', 'Smooth', 'Bright / VC / HDG'],
        ['12d — 3-1/4"', 'Smooth', 'Bright / VC / HDG'],
        ['16d — 3-1/2"', 'Smooth', 'Bright / VC / HDG'],
        ['20d — 4"', 'Smooth', 'Bright / VC / HDG'],
        ['30d — 4-1/2"', 'Smooth', 'Bright / HDG'],
        ['40d — 5"', 'Smooth', 'Bright / HDG'],
        ['60d — 6"', 'Smooth', 'Bright / HDG'],
      ] },
    { t: 'BULK BOX NAILS', tag: 'Nails',
      uses: 'Light framing and trim-adjacent work. Thinner shank = less splitting.',
      rows: [
        ['3d — 1-1/4"', 'Smooth, thin', 'Bright / VC'],
        ['4d — 1-1/2"', 'Smooth, thin', 'Bright / VC'],
        ['6d — 2"', 'Smooth, thin', 'Bright / VC'],
        ['8d — 2-1/2"', 'Smooth, thin', 'Bright / VC'],
        ['10d — 3"', 'Smooth, thin', 'Bright / VC'],
        ['16d — 3-1/2"', 'Smooth, thin', 'Bright / VC'],
        ['20d — 4"', 'Smooth, thin', 'Bright / VC'],
      ] },
    { t: 'BULK CEDAR SHAKE NAILS', tag: 'Nails',
      uses: 'Cedar shakes, shingles, siding. Corrosion-resistant for tannin-rich cedar.',
      rows: [
        ['3/4" × .120', 'Ring', 'EG / HDG / SS'],
        ['7/8" × .120', 'Ring', 'EG / HDG / SS'],
        ['1" × .120', 'Ring', 'EG / HDG / SS'],
        ['1-1/4" × .120', 'Ring', 'EG / HDG / SS'],
        ['1-1/2" × .120', 'Ring', 'EG / HDG / SS'],
        ['2" × .120', 'Ring', 'EG / HDG / SS'],
      ] },
    { t: 'GSW-TYPE WIDE CROWN 16 GAUGE STAPLES', tag: 'Staples',
      uses: 'Sheathing, subfloor, fencing, pallets, crates. Wide crown = serious holding power.',
      rows: [
        ['16 ga × 3/4" leg', 'Wide crown', 'Galvanized / SS'],
        ['16 ga × 1" leg', 'Wide crown', 'Galvanized / SS'],
        ['16 ga × 1-1/4" leg', 'Wide crown', 'Galvanized / SS'],
        ['16 ga × 1-1/2" leg', 'Wide crown', 'Galvanized / SS'],
        ['16 ga × 1-3/4" leg', 'Wide crown', 'Galvanized / SS'],
        ['16 ga × 2" leg', 'Wide crown', 'Galvanized / SS'],
      ] },
    { t: 'BULK PLASTIC CAP NAILS', tag: 'Nails',
      uses: 'Housewrap, roofing felt, foam board. 1" cap holds sheet goods without tearing.',
      rows: [
        ['1" + 1" cap', 'Ring', 'EG'],
        ['1-1/4" + 1" cap', 'Ring', 'EG'],
        ['1-1/2" + 1" cap', 'Ring', 'EG'],
        ['2" + 1" cap', 'Ring', 'EG'],
      ] },
    { t: 'BULK ROOF NAILS', tag: 'Nails',
      uses: 'Asphalt shingles, roofing felt. Barbed and ring options for pull-through resistance.',
      rows: [
        ['3/4" × .120', 'Ring / Barbed', 'EG / HDG'],
        ['7/8" × .120', 'Ring / Barbed', 'EG / HDG'],
        ['1" × .120', 'Ring / Barbed', 'EG / HDG'],
        ['1-1/4" × .120', 'Ring / Barbed', 'EG / HDG'],
        ['1-1/2" × .120', 'Ring / Barbed', 'EG / HDG'],
        ['1-3/4" × .120', 'Ring / Barbed', 'EG / HDG'],
      ] },
];

document.addEventListener('DOMContentLoaded', () => {
    const cards = Array.from(document.querySelectorAll('#catalog .card'));
    const modal = document.getElementById('lmodal');
    if (!cards.length || !modal) return;
    const mImg = document.getElementById('lmodal-img');
    const mTag = document.getElementById('lmodal-tag');
    const mTitle = document.getElementById('lmodal-title');
    const mUses = document.getElementById('lmodal-uses');
    const mRows = document.getElementById('lmodal-rows');

    function openDetail(i) {
        const d = PRODUCT_DETAILS[i];
        if (!d) return;
        const img = cards[i].querySelector('img');
        mImg.src = img ? img.src : '';
        mImg.alt = d.t;
        mTag.textContent = d.tag;
        mTitle.textContent = d.t;
        mUses.textContent = d.uses;
        mRows.innerHTML = d.rows.map(r =>
            `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
        modal.style.display = 'block';
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (typeof gtag === 'function') {
            gtag('event', 'view_item', { items: [{ item_id: 'landing-' + i, item_name: d.t }] });
        }
    }
    function closeDetail() {
        modal.style.display = 'none';
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    cards.forEach((card, i) => card.addEventListener('click', () => openDetail(i)));
    document.getElementById('lmodal-close').addEventListener('click', closeDetail);
    modal.addEventListener('click', e => { if (e.target === modal) closeDetail(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
});
