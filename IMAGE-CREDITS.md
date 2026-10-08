# Catalog image credits

Placeholder photography from Pexels (Pexels License: free for commercial use,
no attribution required). Swap these for your own product photos as they arrive.

| file | product | pexels photo id | source |
|---|---|---|---|
| assets/img/catalog/common-nail.webp | COMMON NAIL | 36398239 | https://www.pexels.com/photo/36398239/ |
| assets/img/catalog/plastic-framing.webp | 21° PLASTIC FRAMING | 8487728 | https://www.pexels.com/photo/8487728/ |
| assets/img/catalog/coil-roofing.webp | 15° COIL ROOFING | 29442625 | https://www.pexels.com/photo/29442625/ |
| assets/img/catalog/joist-hanger.webp | JOIST HANGER NAIL | 8481348 | https://www.pexels.com/photo/8481348/ |
| assets/img/catalog/finish-16ga.webp | 16 GA FINISH | 190101 | https://www.pexels.com/photo/190101/ |
| assets/img/catalog/paper-framing.webp | 30° PAPER FRAMING | 7790669 | https://www.pexels.com/photo/7790669/ |
| assets/img/catalog/brad-18ga.webp | 18 GA BRAD | 36398239 | https://www.pexels.com/photo/36398239/ |
| assets/img/catalog/staples.webp | STAPLES | 5279361 | https://www.pexels.com/photo/5279361/ |
| assets/img/catalog/drywall-screw.webp | DRYWALL SCREW | 8832029 | https://www.pexels.com/photo/8832029/ |
| assets/img/catalog/deck-screw.webp | DECK SCREW | 5583073 | https://www.pexels.com/photo/5583073/ |
| assets/img/catalog/masonry-screw.webp | MASONRY SCREW | 29751916 | https://www.pexels.com/photo/29751916/ |
| assets/img/catalog/structural-screw.webp | STRUCTURAL SCREW | 5583084 | https://www.pexels.com/photo/5583084/ |
| assets/img/catalog/particle-screw.webp | PARTICLE BOARD SCREW | 39785074 | https://www.pexels.com/photo/39785074/ |
| assets/img/catalog/sheet-metal-screw.webp | SHEET METAL SCREW | 5583074 | https://www.pexels.com/photo/5583074/ |
| assets/img/catalog/hex-cap.webp | HEX CAP GRADE 8 | 30496227 | https://www.pexels.com/photo/30496227/ |
| assets/img/catalog/carriage-bolt.webp | CARRIAGE BOLT GALV | 28119521 | https://www.pexels.com/photo/28119521/ |
| assets/img/catalog/wedge-anchor.webp | WEDGE ANCHOR | 5583051 | https://www.pexels.com/photo/5583051/ |
| assets/img/catalog/lag-bolt.webp | LAG BOLT | 28215411 | https://www.pexels.com/photo/28215411/ |
| assets/img/catalog/eye-bolt.webp | EYE BOLT | 17373000 | https://www.pexels.com/photo/17373000/ |

NOTE: these are generic stock photos, not photographs of the actual product.
Confirm the item looks right before publishing, or replace with a real photo.

---

## PLACEHOLDER ARTWORK - bolts & screws (NOT photographs, NOT for publishing)

The 30 images in `assets/img/Bolts/` and `assets/img/Screw/` are **drawn
placeholders**, generated in-house. They are illustrations of each fastener type,
not product photography, and they carry no third-party licence because none was
used.

**Why:** openly-licensed photo search was tried and rejected. Openverse (CC
commercial-use) and Wikimedia Commons returned amateur in-situ shots rather than
product photography - e.g. an eyebolt photographed in snow, and a result titled
"Hole" for drywall screws. Putting those on a product page would misrepresent the
item, so accurate illustrations were drawn instead.

**Status:** UI placeholders only, used while a fastener distributor is being
sourced. **Do not publish these.** Replace with real product photography once a
supplier is chosen - each product maps to exactly one file:

| file pattern | product ids |
|---|---|
| `assets/img/Bolts/<type>.jpg` | b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15 |
| `assets/img/Screw/<type>.jpg` | s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15 |

To swap: drop the real photo in with the same filename, or point the product's
`thumb:` in `shop.js` at the new path. Suggested spec: square, pure white
background, 600x600.

The 19 Pexels files listed above are unused by the current site (the landing page
now uses real product images from `assets/img/Nails/`).
