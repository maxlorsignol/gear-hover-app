/**
 * Gear Hover Reveal (robust version)
 * - Verifies Grey_.png + Colour.png are reachable via fetch()
 * - Adds cache buster to avoid Safari caching old files
 * - Supports items made of multiple connected components (skis/poles split etc.)
 */

const GREY_FILE = "Grey_.png";
const COLOR_FILE = "Colour.png";
const CACHE_BUST = `v=${Date.now()}`; // avoid caching issues during dev

const GREY_SRC = `${GREY_FILE}?${CACHE_BUST}`;
const COLOR_SRC = `${COLOR_FILE}?${CACHE_BUST}`;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const closeBtn = document.getElementById("closeBtn");

// ---- Items: use pts (one or more points per item). You'll tune these after it runs.
const ITEMS = [
  { key: "skis", title: "Skis", pts: [[0.198, 0.546],[0.153, 0.552]], message: "Skis — You 2 pairs now! One with skins and a fresh wax as well!" },
  { key: "poles", title: "Ski Poles", pts: [[0.106, 0.731],[0.080, 0.75]], message: "Poles — Having powder baskets is useful, height adjusted ones are not as necessary." },
  { key: "backpack", title: "Backpack", pts: [[0.33, 0.20]], message: "Backpack — You have a bunch of backpacks already... Perhaps one more?" },
  { key: "bib", title: "Snow Bib", pts: [[0.58, 0.60]], message: "Bib — I'm a bib fan." },
  { key: "jacket", title: "Bib and Jacket", pts: [[0.58, 0.32]], message: "The main protection against the elements. I'm a bib-lover but regular pants work fine. A good shell and mid layer make all the difference." },
  { key: "shovel", title: "Shovel", pts: [[0.296, 0.650]], message: "Shovel — Part of the essentials..." },
  { key: "probe", title: "Probe", pts: [[0.395, 0.48]], message: "Probe — Pokie pokie. Not too expensive." },
  { key: "beacon", title: "Transceiver", pts: [[0.290, 0.861]], message: "Transceiver — There are a bunch of different models, and they all do the same thing, as long as you know how to use it." },
  { key: "boots", title: "Ski Boots", pts: [[0.425, 0.73]], message: "Boots — You have tried a couple different ones on, perhaps you can have mine if I find a better pair..." },
  { key: "helmet", title: "Helmet", pts: [[0.755, 0.65]], message: "Helmet — I use my climbing helmet, or sometimes no helment, depending the day. I know you have one but it might be too bulky for backcountry." },
  { key: "gloves", title: "Gloves", pts: [[0.863, 0.696]], message: "Gloves — Either a pair of waterproof ones for rain, or heavier duty ones for skiing... Or both!" },
  { key: "goggles", title: "Goggles", pts: [[0.821, 0.360]], message: "Goggles — I think you have a decent pair already, take good care of them." },
  { key: "crampons", title: "Crampons", pts: [[0.898, 0.889]], message: "Crampons — These don't get used too often, but when you need them, its very handy to have." },
  { key: "axe", title: "Piolet", pts: [[0.736, 0.180]], message: "Piolet — I don't have one yet either." },
  { key: "rope", title: "Rope", pts: [[0.839, 0.184]], message: "Rope — Twin ropes could be really cool to have, but we have 2 ropes already..." },
  { key: "harness", title: "Harness", pts: [[0.798, 0.490]], message: "Harness — Perhaps something with better gear loops?" },
  { key: "socks", title: "Socks", pts: [[0.72, 0.89]], message: "Socks — One can never have enough socks. For skiing, compression socks can be really nice." },
];

// ---- Load helpers
async function mustFetch(url) {
  // We use GET because some servers don’t love HEAD.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return true;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed to load: ${src}`));
    img.src = src;
  });
}

function drawImageToData(img, W, H) {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const octx = off.getContext("2d", { willReadFrequently: true });
  octx.drawImage(img, 0, 0, W, H);
  return octx.getImageData(0, 0, W, H);
}

// ---- Segmentation (connected components on non-white pixels)
let W = 0, H = 0;
let greyData = null;
let colorData = null;
let compIdAt = null;     // Uint32Array, 0=background
let compCount = 0;

function isForeground(r, g, b) {
  // Treat almost-white as background
  if (r > 245 && g > 245 && b > 245) return false;
  const brightness = (r + g + b) / 3;
  return brightness < 245;
}

function buildComponentMap(greyImageData) {
  const data = greyImageData.data;
  compIdAt = new Uint32Array(W * H);

  let currentId = 0;
  const stack = [];

  const idx = (x, y) => y * W + x;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = idx(x, y);
      if (compIdAt[p] !== 0) continue;

      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      if (!isForeground(r, g, b)) {
        compIdAt[p] = 0;
        continue;
      }

      currentId++;
      compIdAt[p] = currentId;
      stack.push(p);

      while (stack.length) {
        const q = stack.pop();
        const qx = q % W;
        const qy = (q / W) | 0;

        const nbs = [
          [qx - 1, qy],
          [qx + 1, qy],
          [qx, qy - 1],
          [qx, qy + 1],
        ];

        for (const [nx, ny] of nbs) {
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const np = idx(nx, ny);
          if (compIdAt[np] !== 0) continue;

          const ni = np * 4;
          const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];

          if (!isForeground(nr, ng, nb)) {
            compIdAt[np] = 0;
            continue;
          }

          compIdAt[np] = currentId;
          stack.push(np);
        }
      }
    }
  }

  compCount = currentId;
}

// ---- Item mapping (item may contain multiple component IDs)
let compToItemKey = new Map();   // componentId -> itemKey
let itemKeyToInfo = new Map();   // itemKey -> {title, message}
let itemKeyToComps = new Map();  // itemKey -> Set(componentIds)

function buildItemMappings() {
  compToItemKey.clear();
  itemKeyToInfo.clear();
  itemKeyToComps.clear();

  for (const it of ITEMS) {
    itemKeyToInfo.set(it.key, { title: it.title, message: it.message });

    const set = new Set();
    for (const [nx, ny] of it.pts) {
      const px = Math.floor(nx * W);
      const py = Math.floor(ny * H);
      const id = compIdAt[py * W + px] || 0;
      if (id) set.add(id);
    }

    itemKeyToComps.set(it.key, set);
    for (const id of set) compToItemKey.set(id, it.key);
  }

  console.log(`Segmented components: ${compCount}`);
  console.log(
    "Mapped items:",
    [...itemKeyToComps.entries()].map(([k, s]) => `${k}:${s.size}`).join(", ")
  );
}

// ---- Interaction helpers
function componentAtClientXY(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((cx - rect.left) * (W / rect.width));
  const y = Math.floor((cy - rect.top) * (H / rect.height));
  if (x < 0 || x >= W || y < 0 || y >= H) return 0;
  return compIdAt[y * W + x] || 0;
}

let hoverItemKey = null;

function redraw() {
  ctx.putImageData(greyData, 0, 0);
  if (!hoverItemKey) return;

  const comps = itemKeyToComps.get(hoverItemKey);
  if (!comps || comps.size === 0) return;

  const out = ctx.getImageData(0, 0, W, H);
  const o = out.data;
  const c = colorData.data;

  for (let p = 0; p < W * H; p++) {
    if (comps.has(compIdAt[p])) {
      const i = p * 4;
      o[i] = c[i];
      o[i + 1] = c[i + 1];
      o[i + 2] = c[i + 2];
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ---- Modal
function openModal(itemKey) {
  const info = itemKeyToInfo.get(itemKey);
  if (!info) return;
  modalTitle.textContent = info.title;
  modalBody.textContent = info.message;
  modal.classList.remove("hidden");
}
function closeModal() {
  modal.classList.add("hidden");
}

// ---- Init
async function init() {
  try {
    // 1) Verify URLs (this will tell us EXACTLY if names/paths are wrong)
    await mustFetch(GREY_SRC);
    await mustFetch(COLOR_SRC);

    // 2) Load images
    const [greyImg, colorImg] = await Promise.all([loadImage(GREY_SRC), loadImage(COLOR_SRC)]);

    W = greyImg.naturalWidth;
    H = greyImg.naturalHeight;

    canvas.width = W;
    canvas.height = H;

    greyData = drawImageToData(greyImg, W, H);
    colorData = drawImageToData(colorImg, W, H);

    buildComponentMap(greyData);
    buildItemMappings();
    redraw();

    // Hover
    canvas.addEventListener("mousemove", (e) => {
      const comp = componentAtClientXY(e.clientX, e.clientY);
      const itemKey = compToItemKey.get(comp) || null;

      if (itemKey !== hoverItemKey) {
        hoverItemKey = itemKey;
        canvas.style.cursor = itemKey ? "pointer" : "default";
        redraw();
      }
    });

    canvas.addEventListener("mouseleave", () => {
      hoverItemKey = null;
      canvas.style.cursor = "default";
      redraw();
    });

    // Click (also logs coordinates to help you set pts perfectly)
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const comp = componentAtClientXY(e.clientX, e.clientY);

      console.log("CLICK pt:", nx.toFixed(3), ny.toFixed(3), "comp:", comp);

      const itemKey = compToItemKey.get(comp);
      if (itemKey) openModal(itemKey);
    });

    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  } catch (err) {
    console.error(err);
    alert(
      "Failed to load images.\n\n" +
      "Tried:\n" +
      `- ${GREY_FILE}\n` +
      `- ${COLOR_FILE}\n\n` +
      "Open these directly to test:\n" +
      `- http://localhost:8000/${GREY_FILE}\n` +
      `- http://localhost:8000/${COLOR_FILE}\n\n` +
      "Error:\n" + (err?.message || err)
    );
  }
}

init();
