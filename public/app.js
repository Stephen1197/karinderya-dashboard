// Karinderya Dashboard - front end
const API = "/api/dishes";
const LOW_STOCK = 5;

const $ = (id) => document.getElementById(id);

const el = {
  tableBody: $("tableBody"),
  empty: $("emptyMsg"),
  search: $("search"),
  chips: $("chips"),
  menuCount: $("menuCount"),
  banner: $("banner"),
  bannerText: $("bannerText"),
  retryBtn: $("retryBtn"),
  today: $("today"),
  addBtn: $("addBtn"),
  overlay: $("overlay"),
  form: $("dishForm"),
  modalTitle: $("modalTitle"),
  formError: $("formError"),
  cancelBtn: $("cancelBtn"),
  saveBtn: $("saveBtn"),
  confirmOverlay: $("confirmOverlay"),
  confirmText: $("confirmText"),
  confirmCancel: $("confirmCancel"),
  confirmDelete: $("confirmDelete"),
  toasts: $("toasts"),
};

const fields = {
  id: $("dishId"),
  name: $("name"),
  category: $("category"),
  price: $("price"),
  stock: $("stock"),
};

// ---------- State ----------
let dishes = [];
let loading = true;
let loadFailed = false;
let saving = false;
let activeCategory = "All";
let pendingDelete = null;
let lastFocus = null;

// ---------- Helpers ----------
const peso = (n) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Escape text so names cannot inject HTML (also safe inside attributes)
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

// One place for every request: turns network and server problems into readable messages
async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error(
      "Can’t reach the server. Open this page from the address where the app is running " +
      "(for example http://localhost:3000), not from Live Server or a saved file, " +
      "and make sure npm start is still running."
    );
  }

  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }

  if (!res.ok) {
    if (body && body.error) throw new Error(body.error);
    if (res.status === 404 || res.status === 405) {
      throw new Error(
        "This page isn’t connected to the Karinderya server. Open it from the address " +
        "shown after npm start (for example http://localhost:3000)."
      );
    }
    throw new Error(`The server returned an error (${res.status}). Try again in a moment.`);
  }
  if (body === null) {
    throw new Error("The server sent an unexpected reply. Open the app from the address where npm start is running.");
  }
  return body;
}

// ---------- Toasts + banner ----------
function toast(message, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  el.toasts.appendChild(t);
  setTimeout(() => t.remove(), type === "error" ? 6000 : 3000);
}

function showBanner(message) {
  el.bannerText.textContent = message;
  el.banner.hidden = false;
}
function hideBanner() {
  el.banner.hidden = true;
}

// ---------- Load ----------
async function loadDishes() {
  try {
    const data = await api(API);
    if (!Array.isArray(data)) throw new Error("The server sent an unexpected reply.");
    dishes = data;
    loadFailed = false;
    hideBanner();
  } catch (err) {
    loadFailed = true;
    showBanner(err.message);
  } finally {
    loading = false;
    render();
  }
}

// ---------- Render ----------
function categoryList() {
  const list = Array.from(fields.category.options)
    .filter((o) => !o.dataset.extra)
    .map((o) => o.value);
  dishes.forEach((d) => { if (!list.includes(d.category)) list.push(d.category); });
  return list;
}

function renderChips() {
  const counts = {};
  dishes.forEach((d) => { counts[d.category] = (counts[d.category] || 0) + 1; });
  const items = [["All", dishes.length], ...categoryList().map((c) => [c, counts[c] || 0])];

  el.chips.innerHTML = items
    .map(([name, n]) => {
      const on = name === activeCategory;
      return `<button type="button" class="chip${on ? " active" : ""}" data-cat="${esc(name)}" aria-pressed="${on}">${esc(name)} <span>${n}</span></button>`;
    })
    .join("");
}

function stockBadge(stock) {
  if (stock === 0) return '<span class="stock out">Sold out</span>';
  if (stock <= LOW_STOCK) return `<span class="stock low">${stock} left</span>`;
  return `<span class="stock ok">${stock}</span>`;
}

function rowHtml(d) {
  return `
    <tr>
      <td data-label="#">${d.id}</td>
      <td data-label="Dish" class="dish-name">${esc(d.name)}</td>
      <td data-label="Category"><span class="cat cat-${slug(d.category)}">${esc(d.category)}</span></td>
      <td data-label="Price">${peso(d.price)}</td>
      <td data-label="Stock">${stockBadge(d.stock)}</td>
      <td data-label="" class="right actions-cell">
        <button type="button" class="btn small" data-edit="${d.id}" aria-label="Edit ${esc(d.name)}">Edit</button>
        <button type="button" class="btn small danger" data-delete="${d.id}" aria-label="Delete ${esc(d.name)}">Delete</button>
      </td>
    </tr>`;
}

function renderEmpty(count, q) {
  if (count > 0) {
    el.empty.hidden = true;
    return;
  }
  let html;
  if (loading) {
    html = "<span>Loading the menu…</span>";
  } else if (loadFailed) {
    html = "<strong>The menu couldn’t be loaded</strong><span>Check the message at the top, then try again.</span>";
  } else if (dishes.length === 0) {
    html =
      "<strong>No dishes yet</strong><span>Add what you’re cooking today and it will show up here.</span>" +
      '<button type="button" class="btn primary" data-action="add">Add your first dish</button>';
  } else {
    const what = q ? `Nothing found for “${esc(q)}”.` : "No dishes in this category yet.";
    html =
      `<strong>No matches</strong><span>${what}</span>` +
      '<button type="button" class="btn" data-action="clear">Clear search and filter</button>';
  }
  el.empty.innerHTML = html;
  el.empty.hidden = false;
}

function render() {
  // If the active category no longer exists, fall back to All
  if (activeCategory !== "All" && !categoryList().includes(activeCategory)) activeCategory = "All";

  const q = el.search.value.trim().toLowerCase();
  const list = dishes.filter(
    (d) =>
      (activeCategory === "All" || d.category === activeCategory) &&
      (d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
  );

  renderChips();
  el.tableBody.innerHTML = list.map(rowHtml).join("");
  el.menuCount.textContent = loading || loadFailed
    ? ""
    : list.length === dishes.length
      ? `${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}`
      : `Showing ${list.length} of ${dishes.length} dishes`;
  renderEmpty(list.length, q);
  updateStats();
}

function updateStats() {
  const total = dishes.length;
  const stock = dishes.reduce((sum, d) => sum + d.stock, 0);
  const avg = total ? dishes.reduce((sum, d) => sum + d.price, 0) / total : 0;
  const low = dishes.filter((d) => d.stock <= LOW_STOCK).length;

  $("statDishes").textContent = total;
  $("statStock").textContent = stock;
  $("statPrice").textContent = peso(avg);
  $("statLow").textContent = low;
  $("statLowWrap").classList.toggle("alert", low > 0);
}

// ---------- Overlay helpers ----------
function openOverlay(overlay, focusEl) {
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add("modal-open");
  if (focusEl) focusEl.focus();
}

function closeOverlay(overlay) {
  overlay.hidden = true;
  if (el.overlay.hidden && el.confirmOverlay.hidden) {
    document.body.classList.remove("modal-open");
  }
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

function openModal(dish) {
  el.formError.hidden = true;
  // remove a leftover custom category option from a previous edit
  Array.from(fields.category.options).forEach((o) => { if (o.dataset.extra) o.remove(); });

  if (dish) {
    el.modalTitle.textContent = "Edit dish";
    fields.id.value = dish.id;
    fields.name.value = dish.name;
    if (!Array.from(fields.category.options).some((o) => o.value === dish.category)) {
      const extra = new Option(dish.category, dish.category);
      extra.dataset.extra = "1";
      fields.category.add(extra);
    }
    fields.category.value = dish.category;
    fields.price.value = dish.price;
    fields.stock.value = dish.stock;
  } else {
    el.modalTitle.textContent = "Add dish";
    el.form.reset();
    fields.id.value = "";
  }
  openOverlay(el.overlay, fields.name);
}

function closeModal() {
  closeOverlay(el.overlay);
}

function setSaving(on) {
  saving = on;
  el.saveBtn.disabled = on;
  el.cancelBtn.disabled = on;
  el.saveBtn.textContent = on ? "Saving…" : "Save dish";
}

// ---------- Create + update ----------
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (saving) return;

  // Friendly client-side check before asking the server
  if (!fields.name.value.trim()) {
    el.formError.textContent = "Enter a dish name.";
    el.formError.hidden = false;
    fields.name.focus();
    return;
  }
  if (!el.form.checkValidity()) {
    el.form.reportValidity();
    return;
  }

  const id = fields.id.value;
  const payload = {
    name: fields.name.value,
    category: fields.category.value,
    price: fields.price.value,
    stock: fields.stock.value,
  };

  el.formError.hidden = true;
  setSaving(true);
  try {
    await api(id ? `${API}/${id}` : API, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeModal();
    toast(id ? "Dish updated" : "Dish added");
    await loadDishes();
  } catch (err) {
    el.formError.textContent = err.message;
    el.formError.hidden = false;
  } finally {
    setSaving(false);
  }
});

// ---------- Delete ----------
function askDelete(dish) {
  pendingDelete = dish;
  el.confirmText.textContent = `“${dish.name}” will be removed from the menu. This can’t be undone.`;
  openOverlay(el.confirmOverlay, el.confirmCancel);
}

function cancelDelete() {
  pendingDelete = null;
  closeOverlay(el.confirmOverlay);
}

el.confirmDelete.addEventListener("click", async () => {
  if (!pendingDelete) return;
  const dish = pendingDelete;
  el.confirmDelete.disabled = true;
  el.confirmDelete.textContent = "Deleting…";
  try {
    await api(`${API}/${dish.id}`, { method: "DELETE" });
    pendingDelete = null;
    closeOverlay(el.confirmOverlay);
    toast("Dish deleted");
    await loadDishes();
  } catch (err) {
    pendingDelete = null;
    closeOverlay(el.confirmOverlay);
    toast(err.message, "error");
  } finally {
    el.confirmDelete.disabled = false;
    el.confirmDelete.textContent = "Delete dish";
  }
});

// ---------- Events ----------
el.tableBody.addEventListener("click", (e) => {
  const editBtn = e.target.closest("button[data-edit]");
  const delBtn = e.target.closest("button[data-delete]");

  if (editBtn) {
    const dish = dishes.find((d) => d.id === Number(editBtn.dataset.edit));
    if (dish) openModal(dish);
  } else if (delBtn) {
    const dish = dishes.find((d) => d.id === Number(delBtn.dataset.delete));
    if (dish) askDelete(dish);
  }
});

el.chips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeCategory = chip.dataset.cat;
  render();
});

el.empty.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "add") openModal(null);
  if (btn.dataset.action === "clear") {
    el.search.value = "";
    activeCategory = "All";
    render();
  }
});

el.addBtn.addEventListener("click", () => openModal(null));
el.cancelBtn.addEventListener("click", closeModal);
el.confirmCancel.addEventListener("click", cancelDelete);
el.retryBtn.addEventListener("click", loadDishes);
el.search.addEventListener("input", render);

// Click on the dark backdrop closes a dialog
el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay && !saving) closeModal();
});
el.confirmOverlay.addEventListener("click", (e) => {
  if (e.target === el.confirmOverlay) cancelDelete();
});

// Escape closes whichever dialog is open
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!el.confirmOverlay.hidden) cancelDelete();
  else if (!el.overlay.hidden && !saving) closeModal();
});

// ---------- Start ----------
el.today.textContent = new Date().toLocaleDateString("en-PH", {
  weekday: "long", month: "long", day: "numeric",
});
render();
loadDishes();