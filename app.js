// ============================================================================
// 1. KONFIGURASI & DATA UTAMA (DAPAT DIEDIT LANGSUNG DI DALAM SCRIPT INI)
// ============================================================================
// Ubah nilai SCRIPT_DATA_VERSION (misal: "1.1", "1.2") setiap kali kamu
// mengubah isi SCRIPT_RAB_DATA di bawah agar cache browser otomatis terbarui.
const SCRIPT_DATA_VERSION = "1.0";

const ADMIN_PASSWORD_HASH = "W1k1d14Ever@";
const STORAGE_KEY_CONFIG = "rab_kkn_config_v3";
const STORAGE_KEY_DATA = "rab_kkn_data_cache_v3";
const STORAGE_KEY_SCRIPT_VER = "rab_kkn_script_version_v3";

const DEFAULT_CONFIG = {
  excelUrl:
    "https://onedrive.live.com/:x:/g/personal/0A4873D3EB635F62/IQAxUwzNi4F6T6fH2heV9QpjAbR2TKqf3GP3fLmR2kK50kc?resid=0A4873D3EB635F62!scd0c5331818b4f7aa7c7da1795f50a63&ithint=file%2Cxlsx&e=GMcqhA&migratedtospo=true&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8wYTQ4NzNkM2ViNjM1ZjYyL0lRQXhVd3pOaTRGNlQ2ZkgyaGVWOVFwakFiUjJUS3FmM0dQM2ZMbVIya0s1MGtjP2U9R01jcWhB",
  syncInterval: 30000,
  corsMode: "auto",
  kknTitle: "RAB & Kas KKN",
  kknSubtitle: "Laporan Pemasukan & Pengeluaran Realtime",
  targetIuran: 1500000,
  logoPath: "main/logo.png",
  ketuaName: "AHMAD DANI SARKAWI",
  bendaharaName: "ULUL AZMI MAWARTI"
};

// Data RAB yang dapat kamu ubah langsung di dalam script ini kapan saja
const SCRIPT_RAB_DATA = {
  lastUpdated: "23 Nov 2026, 19.00",
  sourceMode: "script-cache",
  members: [
    { no: 1, name: "AHMAD DANI SARKAWI", note: "", paid: 500000 },
    { no: 2, name: "IDA AYU PUTU MAHESWARI", note: "", paid: 0 },
    { no: 3, name: "ULUL AZMI MAWARTI", note: "", paid: 0 },
    { no: 4, name: "AHMAD DZULAL FAZA AZMAN", note: "", paid: 1500000 },
    { no: 5, name: "SYAFTA EKA PUTRA", note: "", paid: 0 },
    { no: 6, name: "FISA FAJRIYAH RAHMAN", note: "", paid: 900000 },
    { no: 7, name: "HAULA PURRASADA", note: "", paid: 300000 },
    { no: 8, name: "ALIYAH ROFIFAH ALKATIRI", note: "", paid: 900000 },
    { no: 9, name: "MAYA MARTANIATI", note: "", paid: 300000 },
    { no: 10, name: "I MD ANDIKA PUTRA WIJAYA", note: "", paid: 900000 }
  ],
  expenses: [
    { category: "LAIN-LAIN", date: "-", name: "PDH", qty: 10, unitPrice: 0, total: 0 },
    { category: "LAIN-LAIN", date: "-", name: "Kaos", qty: 10, unitPrice: 0, total: 0 },
    { category: "LAIN-LAIN", date: "-", name: "Lanyard", qty: 10, unitPrice: 0, total: 0 },
    { category: "LAIN-LAIN", date: "-", name: "Id Card", qty: 10, unitPrice: 223000, total: 2230000 }
  ]
};

// ============================================================================
// 2. LOGIKA CACHE, SINKRONISASI EXCEL ONLINE & RENDERING UI
// ============================================================================
const CATEGORY_META = {
  POSKO: { label: "Posko", color: "#0284c7" },
  PDD: { label: "PDD", color: "#7c3aed" },
  KONSUMSI: { label: "Konsumsi", color: "#d97706" },
  "LAIN-LAIN": { label: "Lain-Lain", color: "#0f766e" },
  PROKER: { label: "Proker", color: "#e11d48" }
};

let appConfig = loadConfig();
let rabData = loadSavedData();
let selectedExpenseCat = "ALL";
let syncTimerId = null;
let isAdminUnlocked = sessionStorage.getItem("rab_admin_unlocked") === "true";

function formatRupiah(num) {
  const value = Number(num) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function parseNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  return Number(cleaned) || 0;
}

function formatExcelDate(val) {
  if (!val) return "-";
  if (typeof val === "number" && val > 20000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(val).trim() || "-";
}

function showToast(msg) {
  const toast = document.getElementById("toastNotification");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(appConfig));
}

// Memuat data dari cache lokal, atau otomatis memperbarui cache jika versi script berubah
function loadSavedData() {
  try {
    const cachedVersion = localStorage.getItem(STORAGE_KEY_SCRIPT_VER);
    const rawCache = localStorage.getItem(STORAGE_KEY_DATA);

    if (cachedVersion !== SCRIPT_DATA_VERSION || !rawCache) {
      const freshFromScript = structuredClone(SCRIPT_RAB_DATA);
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(freshFromScript));
      localStorage.setItem(STORAGE_KEY_SCRIPT_VER, SCRIPT_DATA_VERSION);
      return freshFromScript;
    }

    return JSON.parse(rawCache);
  } catch {
    return structuredClone(SCRIPT_RAB_DATA);
  }
}

function saveDataToCache() {
  localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(rabData));
  localStorage.setItem(STORAGE_KEY_SCRIPT_VER, SCRIPT_DATA_VERSION);
}

// Konversi Tautan OneDrive / Excel Online menjadi URL Unduhan Langsung
function buildCandidateUrls(rawUrl, mode) {
  const url = (rawUrl || "").trim();
  if (!url) return [];
  const candidates = [];

  if (url.includes("docs.google.com/spreadsheets")) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      candidates.push(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`);
    }
  }

  if (url.includes("onedrive.live.com")) {
    try {
      const parsed = new URL(url);
      const resid = parsed.searchParams.get("resid");
      const authkey = parsed.searchParams.get("authkey");
      const redeem = parsed.searchParams.get("redeem");

      if (resid) {
        let dlUrl = `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}`;
        if (authkey) dlUrl += `&authkey=${encodeURIComponent(authkey)}`;
        candidates.push(dlUrl);
      }
      if (redeem) {
        try {
          const decodedRedeem = atob(redeem);
          candidates.push(`${decodedRedeem}${decodedRedeem.includes("?") ? "&" : "?"}download=1`);
        } catch {}
      }
      const directParam = new URL(url);
      directParam.searchParams.set("download", "1");
      candidates.push(directParam.toString());
    } catch {}
  }

  candidates.push(url);

  const finalUrls = [];
  for (const target of [...new Set(candidates)]) {
    if (mode === "direct") {
      finalUrls.push(target);
    } else if (mode === "corsproxy") {
      finalUrls.push(`https://corsproxy.io/?${encodeURIComponent(target)}`);
    } else if (mode === "allorigins") {
      finalUrls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
    } else {
      finalUrls.push(target);
      finalUrls.push(`https://corsproxy.io/?${encodeURIComponent(target)}`);
      finalUrls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
    }
  }
  return [...new Set(finalUrls)];
}

// Parser Khusus Struktur Sheet RAB KKN.xlsx
function parseRabWorkbook(workbook) {
  const sheetName =
    workbook.SheetNames.find((n) => n.toUpperCase().includes("LAPORAN")) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const members = [];
  const expenses = [];

  let inMembers = false;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const colB = String(row[1] || "").trim().toUpperCase();
    const colC = String(row[2] || "").trim().toUpperCase();

    if (colB === "NO" && colC === "NAMA") {
      inMembers = true;
      continue;
    }
    if (inMembers) {
      if (colB.includes("TOTAL") || colC.includes("TOTAL")) {
        inMembers = false;
        continue;
      }
      const name = String(row[2] || "").trim();
      if (name) {
        members.push({
          no: parseNumber(row[1]) || members.length + 1,
          name,
          note: String(row[3] || "").trim(),
          paid: parseNumber(row[4])
        });
      }
    }
  }

  function extractExpenseBlock(headerRowIdx, startCol, categoryName, isKonsumsi = false, isProker = false) {
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const firstCell = String(row[startCol] || "").trim().toUpperCase();
      const secondCell = String(row[startCol + 1] || "").trim().toUpperCase();
      const thirdCell = String(row[startCol + 2] || "").trim().toUpperCase();

      if (
        firstCell.includes("TOTAL") ||
        secondCell.includes("TOTAL") ||
        thirdCell.includes("TOTAL")
      ) {
        break;
      }

      if (isProker) {
        const jenis = String(row[startCol] || "").trim();
        const ket = String(row[startCol + 1] || "").trim();
        const qty = parseNumber(row[startCol + 2]);
        const unitPrice = parseNumber(row[startCol + 3]);
        const total = parseNumber(row[startCol + 4]) || parseNumber(row[startCol + 5]) || qty * unitPrice;

        if (jenis || ket || total > 0) {
          expenses.push({
            category: categoryName,
            date: "-",
            name: jenis && ket ? `${jenis} - ${ket}` : jenis || ket,
            qty: qty || 1,
            unitPrice,
            total
          });
        }
      } else if (isKonsumsi) {
        const itemName = String(row[startCol + 2] || "").trim();
        const unitPrice = parseNumber(row[startCol + 3]);
        const qty = parseNumber(row[startCol + 4]);
        const total = parseNumber(row[startCol + 5]) || qty * unitPrice;

        if (itemName || total > 0) {
          expenses.push({
            category: categoryName,
            date: formatExcelDate(row[startCol + 1]),
            name: itemName || "Item Konsumsi",
            qty: qty || 1,
            unitPrice,
            total
          });
        }
      } else {
        const itemName = String(row[startCol + 2] || "").trim();
        const qty = parseNumber(row[startCol + 3]);
        const unitPrice = parseNumber(row[startCol + 4]);
        const total = parseNumber(row[startCol + 5]) || qty * unitPrice;

        if (itemName || total > 0) {
          expenses.push({
            category: categoryName,
            date: formatExcelDate(row[startCol + 1]),
            name: itemName || `Item ${categoryName}`,
            qty: qty || 1,
            unitPrice,
            total
          });
        }
      }
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").trim().toUpperCase();
      if (cell === "POSKO" && r + 1 < rows.length) {
        extractExpenseBlock(r + 1, 7, "POSKO", false, false);
      } else if (cell === "LAIN-LAIN" && r + 1 < rows.length) {
        extractExpenseBlock(r + 1, 7, "LAIN-LAIN", false, false);
      } else if (cell === "PROKER" && r + 1 < rows.length) {
        extractExpenseBlock(r + 1, 7, "PROKER", false, true);
      } else if (cell === "PDD" && r + 1 < rows.length) {
        extractExpenseBlock(r + 1, 14, "PDD", false, false);
      } else if (cell === "KONSUMSI" && r + 1 < rows.length) {
        extractExpenseBlock(r + 1, 14, "KONSUMSI", true, false);
      }
    }
  }

  if (members.length === 0 && expenses.length === 0) {
    throw new Error("Format tabel RAB tidak dikenali pada lembar kerja.");
  }

  return {
    lastUpdated: new Date().toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    }),
    sourceMode: "live-cached",
    members: members.length > 0 ? members : rabData.members,
    expenses
  };
}

// Sinkronisasi dari Excel Online & Simpan ke Cache
async function syncFromExcelOnline(silent = false) {
  const badge = document.getElementById("syncBadge");
  const badgeText = document.getElementById("syncStatusText");
  const syncBtn = document.getElementById("btnManualSync");

  badge.className = "sync-badge status-syncing";
  badgeText.textContent = "Menyinkronkan...";
  syncBtn.classList.add("spinning");

  const urls = buildCandidateUrls(appConfig.excelUrl, appConfig.corsMode);
  let syncedSuccess = false;

  for (const targetUrl of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      if (uint8.length < 4 || uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
        continue;
      }

      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const parsed = parseRabWorkbook(workbook);
      rabData = parsed;
      saveDataToCache();
      syncedSuccess = true;
      break;
    } catch {
      // Lanjut ke kandidat URL berikutnya
    }
  }

  syncBtn.classList.remove("spinning");

  if (syncedSuccess) {
    badge.className = "sync-badge status-live";
    badgeText.textContent = "Live & Tersimpan";
    if (!silent) showToast("Data berhasil disinkronkan dari Excel Online & disimpan ke cache.");
  } else {
    badge.className = "sync-badge status-cached";
    badgeText.textContent = `Cache (v${SCRIPT_DATA_VERSION})`;
    if (!silent) {
      showToast("Menampilkan data cache lokal. Kamu bisa edit langsung di script atau unggah .xlsx.");
    }
  }

  renderAll();
}

function computeSummary() {
  const totalIncome = rabData.members.reduce((sum, m) => sum + (Number(m.paid) || 0), 0);
  const totalExpense = rabData.expenses.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  const balance = totalIncome - totalExpense;
  const paidMembersCount = rabData.members.filter((m) => m.paid > 0).length;
  const activeExpenseItems = rabData.expenses.filter((e) => e.total > 0);

  const byCategory = {
    POSKO: 0,
    PDD: 0,
    KONSUMSI: 0,
    "LAIN-LAIN": 0,
    PROKER: 0
  };

  rabData.expenses.forEach((item) => {
    const cat = item.category.toUpperCase();
    if (byCategory[cat] !== undefined) {
      byCategory[cat] += Number(item.total) || 0;
    } else {
      byCategory["LAIN-LAIN"] += Number(item.total) || 0;
    }
  });

  return {
    totalIncome,
    totalExpense,
    balance,
    paidMembersCount,
    totalMembersCount: rabData.members.length,
    activeExpenseItems,
    byCategory
  };
}

function renderAll() {
  document.getElementById("headerTitle").textContent = appConfig.kknTitle;
  document.getElementById("headerSubtitle").textContent = appConfig.kknSubtitle;
  document.getElementById("lastUpdatedTime").textContent = rabData.lastUpdated;
  document.getElementById("displayTargetIuran").textContent = formatRupiah(appConfig.targetIuran);

  const logoImg = document.getElementById("brandLogoImg");
  if (logoImg && logoImg.getAttribute("src") !== appConfig.logoPath) {
    logoImg.style.display = "block";
    document.getElementById("logoFallback").style.display = "none";
    logoImg.src = appConfig.logoPath;
  }

  const stats = computeSummary();

  document.getElementById("kpiTotalPemasukan").textContent = formatRupiah(stats.totalIncome);
  document.getElementById("kpiSubPemasukan").textContent = `${stats.paidMembersCount} dari ${stats.totalMembersCount} anggota sudah setor`;

  document.getElementById("kpiTotalPengeluaran").textContent = formatRupiah(stats.totalExpense);
  document.getElementById("kpiSubPengeluaran").textContent = `${stats.activeExpenseItems.length} item aktif dari ${rabData.expenses.length} baris`;

  document.getElementById("kpiSisaSaldo").textContent = formatRupiah(stats.balance);
  const ratio = stats.totalIncome > 0 ? Math.round((stats.totalExpense / stats.totalIncome) * 100) : 0;
  document.getElementById("kpiSubSaldo").textContent = `Serapan dana ${ratio}% dari total kas masuk`;

  renderCategoryBars(stats);
  renderMembersPreview();
  renderRecentItems(stats.activeExpenseItems);
  renderMembersDetail();
  renderExpensesDetail();
  populateAdminFields();
}

function renderCategoryBars(stats) {
  const container = document.getElementById("categorySummaryList");
  const maxRef = Math.max(stats.totalExpense, 1);

  container.innerHTML = Object.entries(CATEGORY_META)
    .map(([key, meta]) => {
      const amount = stats.byCategory[key] || 0;
      const pct = stats.totalExpense > 0 ? Math.round((amount / maxRef) * 100) : 0;
      return `
        <div class="cat-bar-item">
          <div class="cat-bar-top">
            <span class="cat-name">
              <span class="cat-dot" style="background:${meta.color}"></span>
              ${meta.label}
            </span>
            <span class="cat-amount">${formatRupiah(amount)} <small style="color:#64748b;font-weight:500;">(${pct}%)</small></span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%; background:${meta.color}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderMembersPreview() {
  const container = document.getElementById("summaryMembersPreview");
  container.innerHTML = rabData.members
    .map((m) => {
      const isPaid = m.paid > 0;
      return `
        <div class="compact-member-row">
          <div class="member-name-wrap">
            <span class="member-no">${m.no}</span>
            <span class="member-name-text">${m.name}</span>
          </div>
          <strong style="color:${isPaid ? "#059669" : "#94a3b8"}; font-size:0.82rem;">
            ${isPaid ? formatRupiah(m.paid) : "Belum"}
          </strong>
        </div>
      `;
    })
    .join("");
}

function renderRecentItems(activeItems) {
  const container = document.getElementById("recentItemsContainer");
  if (activeItems.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada pengeluaran dengan nominal aktif.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="expense-cards-mobile">
      ${activeItems
        .map(
          (item) => `
        <div class="expense-item-card">
          <div class="exp-card-header">
            <span class="exp-item-name">${item.name}</span>
            <span class="exp-cat-tag">${item.category}</span>
          </div>
          <div class="exp-card-details">
            <span>${item.qty} × ${formatRupiah(item.unitPrice)}</span>
            <span class="exp-total-price">${formatRupiah(item.total)}</span>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Pos Anggaran</th>
            <th>Tanggal</th>
            <th>Nama Barang / Keterangan</th>
            <th class="text-right">Jumlah</th>
            <th class="text-right">Harga Satuan</th>
            <th class="text-right">Nominal</th>
          </tr>
        </thead>
        <tbody>
          ${activeItems
            .map(
              (item) => `
            <tr>
              <td><span class="exp-cat-tag">${item.category}</span></td>
              <td>${item.date}</td>
              <td><strong>${item.name}</strong></td>
              <td class="text-right">${item.qty}</td>
              <td class="text-right">${formatRupiah(item.unitPrice)}</td>
              <td class="text-right"><strong>${formatRupiah(item.total)}</strong></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMembersDetail() {
  const container = document.getElementById("membersDetailContainer");
  const query = (document.getElementById("searchMemberInput").value || "").toLowerCase();
  const statusFilter = document.getElementById("filterMemberStatus").value;
  const target = Number(appConfig.targetIuran) || 1500000;

  const filtered = rabData.members.filter((m) => {
    const matchName = m.name.toLowerCase().includes(query);
    if (!matchName) return false;
    if (statusFilter === "paid") return m.paid > 0;
    if (statusFilter === "unpaid") return m.paid <= 0;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Tidak ada anggota yang sesuai pencarian.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((m) => {
      const pct = target > 0 ? Math.min(100, Math.round((m.paid / target) * 100)) : m.paid > 0 ? 100 : 0;
      let badgeClass = "badge-unpaid";
      let badgeText = "Belum Setor";

      if (m.paid >= target && target > 0) {
        badgeClass = "badge-paid";
        badgeText = m.paid > target ? "Lebih Setor" : "Lunas";
      } else if (m.paid > 0) {
        badgeClass = "badge-partial";
        badgeText = `Cicilan ${pct}%`;
      }

      return `
        <div class="member-detail-card">
          <div class="member-card-top">
            <div>
              <div style="font-size:0.72rem;color:#64748b;font-weight:700;">ANGGOTA #${m.no}</div>
              <div class="member-card-title">${m.name}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%; background:${m.paid >= target ? "#059669" : "#d97706"}"></div>
          </div>
          <div class="member-card-meta">
            <span>Terkumpul: <strong style="color:#0f172a">${formatRupiah(m.paid)}</strong></span>
            <span>Target: ${formatRupiah(target)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderExpensesDetail() {
  const container = document.getElementById("expenseDetailContainer");
  const query = (document.getElementById("searchExpenseInput").value || "").toLowerCase();

  const filtered = rabData.expenses.filter((item) => {
    const matchCat = selectedExpenseCat === "ALL" || item.category.toUpperCase() === selectedExpenseCat;
    const matchQuery = item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    return matchCat && matchQuery;
  });

  const subtotal = filtered.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  document.getElementById("selectedCatLabel").textContent =
    selectedExpenseCat === "ALL" ? "Semua Pos" : selectedExpenseCat;
  document.getElementById("selectedCatTotal").textContent = formatRupiah(subtotal);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada item pengeluaran pada kategori ini.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="expense-cards-mobile">
      ${filtered
        .map(
          (item, idx) => `
        <div class="expense-item-card">
          <div class="exp-card-header">
            <div>
              <div style="font-size:0.72rem;color:#64748b;">#${idx + 1} • ${item.date}</div>
              <div class="exp-item-name">${item.name}</div>
            </div>
            <span class="exp-cat-tag">${item.category}</span>
          </div>
          <div class="exp-card-details">
            <span>Qty: <strong>${item.qty}</strong> × ${formatRupiah(item.unitPrice)}</span>
            <span class="exp-total-price">${formatRupiah(item.total)}</span>
          </div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="desktop-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Kategori</th>
            <th>Tanggal</th>
            <th>Nama Barang / Uraian</th>
            <th class="text-right">Jumlah</th>
            <th class="text-right">Harga Satuan</th>
            <th class="text-right">Total Nominal</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><span class="exp-cat-tag">${item.category}</span></td>
              <td>${item.date}</td>
              <td><strong>${item.name}</strong></td>
              <td class="text-right">${item.qty}</td>
              <td class="text-right">${formatRupiah(item.unitPrice)}</td>
              <td class="text-right"><strong>${formatRupiah(item.total)}</strong></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Generator Pesan Laporan Kas Grup WhatsApp
function generateWhatsAppReportText() {
  const stats = computeSummary();
  const lines = [];

  lines.push(`*LAPORAN KAS & REALISASI ${appConfig.kknTitle.toUpperCase()}*`);
  lines.push(`_${appConfig.kknSubtitle}_`);
  lines.push(`Update: ${rabData.lastUpdated}`);
  lines.push(`-----------------------------------`);
  lines.push(`*RINGKASAN SALDO KAS*`);
  lines.push(`• Total Pemasukan : *${formatRupiah(stats.totalIncome)}*`);
  lines.push(`• Total Pengeluaran : *${formatRupiah(stats.totalExpense)}*`);
  lines.push(`• Sisa Saldo Kas : *${formatRupiah(stats.balance)}*`);
  lines.push(`-----------------------------------`);
  lines.push(`*REKAP PENGELUARAN PER POS*`);

  Object.entries(CATEGORY_META).forEach(([key, meta]) => {
    lines.push(`• ${meta.label} : ${formatRupiah(stats.byCategory[key] || 0)}`);
  });

  if (stats.activeExpenseItems.length > 0) {
    lines.push(``);
    lines.push(`*RINCIAN BELANJA TEREALISASI*`);
    stats.activeExpenseItems.forEach((item, i) => {
      lines.push(`${i + 1}. [${item.category}] ${item.name} (${item.qty}x) = ${formatRupiah(item.total)}`);
    });
  }

  lines.push(`-----------------------------------`);
  lines.push(`*STATUS IURAN ANGGOTA (${stats.paidMembersCount}/${stats.totalMembersCount})*`);
  rabData.members.forEach((m) => {
    const statusIcon = m.paid > 0 ? "✅" : "⏳";
    const nominalText = m.paid > 0 ? formatRupiah(m.paid) : "Belum setor";
    lines.push(`${statusIcon} ${m.no}. ${m.name} — ${nominalText}`);
  });

  lines.push(`-----------------------------------`);
  lines.push(`Pantau RAB secara realtime melalui web dashboard KKN.`);

  return lines.join("\n");
}

async function copyTextToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    showToast(successMessage);
  }
}

function copyWhatsAppReport() {
  copyTextToClipboard(
    generateWhatsAppReportText(),
    "Laporan kas WhatsApp berhasil disalin ke papan klip!"
  );
}

function sendWhatsAppReport() {
  const text = generateWhatsAppReportText();
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank", "noopener");
}

// Ekspor Ringkasan RAB ke PDF
function loadLogoAsDataUrl(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 120;
        canvas.height = img.naturalHeight || 120;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function exportRabToPdf() {
  if (!window.jspdf) {
    showToast("Pustaka PDF belum siap, periksa koneksi internet.");
    return;
  }

  showToast("Menyiapkan dokumen PDF...");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const stats = computeSummary();

  const logoDataUrl = await loadLogoAsDataUrl(appConfig.logoPath);
  let headerTextX = 14;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 14, 12, 16, 16);
    headerTextX = 34;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 118, 110);
  doc.text(appConfig.kknTitle.toUpperCase(), headerTextX, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(appConfig.kknSubtitle, headerTextX, 23.5);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, headerTextX, 28.5);

  doc.setDrawColor(203, 213, 225);
  doc.line(14, 32, 196, 32);

  const boxY = 36;
  const boxes = [
    { label: "TOTAL PEMASUKAN", val: formatRupiah(stats.totalIncome), color: [5, 150, 105] },
    { label: "TOTAL PENGELUARAN", val: formatRupiah(stats.totalExpense), color: [225, 29, 72] },
    { label: "SISA SALDO KAS", val: formatRupiah(stats.balance), color: [15, 118, 110] }
  ];

  boxes.forEach((b, idx) => {
    const x = 14 + idx * 62;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, boxY, 58, 18, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 4, boxY + 6);

    doc.setFontSize(11);
    doc.setTextColor(...b.color);
    doc.text(b.val, x + 4, boxY + 13.5);
  });

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Rekapitulasi Anggaran per Pos", 14, 62);

  doc.autoTable({
    startY: 65,
    head: [["Pos Anggaran", "Jumlah Nominal", "Persentase"]],
    body: Object.entries(CATEGORY_META).map(([key, meta]) => {
      const val = stats.byCategory[key] || 0;
      const pct = stats.totalExpense > 0 ? `${Math.round((val / stats.totalExpense) * 100)}%` : "0%";
      return [meta.label, formatRupiah(val), pct];
    }),
    foot: [["TOTAL PENGELUARAN", formatRupiah(stats.totalExpense), "100%"]],
    theme: "grid",
    headStyles: { fillColor: [15, 118, 110], fontSize: 8.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }
  });

  const nextY1 = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text("2. Rincian Belanja & Kebutuhan RAB", 14, nextY1);

  doc.autoTable({
    startY: nextY1 + 3,
    head: [["No", "Pos", "Tanggal", "Nama Barang / Uraian", "Qty", "Harga Satuan", "Nominal"]],
    body: rabData.expenses.map((item, i) => [
      i + 1,
      item.category,
      item.date,
      item.name,
      item.qty,
      formatRupiah(item.unitPrice),
      formatRupiah(item.total)
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" }
    }
  });

  const nextY2 = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text("3. Daftar Pemasukan Iuran Anggota", 14, nextY2);

  doc.autoTable({
    startY: nextY2 + 3,
    head: [["No", "Nama Anggota", "Status", "Nominal Setoran"]],
    body: rabData.members.map((m) => [
      m.no,
      m.name,
      m.paid >= appConfig.targetIuran ? "Lunas" : m.paid > 0 ? "Sebagian" : "Belum Setor",
      formatRupiah(m.paid)
    ]),
    foot: [["", "TOTAL PEMASUKAN ANGGOTA", "", formatRupiah(stats.totalIncome)]],
    theme: "grid",
    headStyles: { fillColor: [5, 150, 105], fontSize: 8 },
    footStyles: { fillColor: [209, 250, 229], textColor: [6, 95, 70], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: { 3: { halign: "right" } }
  });

  let signY = doc.lastAutoTable.finalY + 14;
  if (signY > 265) {
    doc.addPage();
    signY = 24;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Mengetahui,", 30, signY);
  doc.text("Ketua Kelompok KKN", 30, signY + 5);
  doc.setFont("helvetica", "bold");
  doc.text(appConfig.ketuaName, 30, signY + 22);

  doc.setFont("helvetica", "normal");
  doc.text("Dibuat oleh,", 140, signY);
  doc.text("Bendahara KKN", 140, signY + 5);
  doc.setFont("helvetica", "bold");
  doc.text(appConfig.bendaharaName, 140, signY + 22);

  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`Ringkasan_RAB_KKN_${fileDate}.pdf`);
  showToast("Ringkasan RAB berhasil diekspor ke PDF.");
}

// Navigasi & Autentikasi Admin
function switchView(viewName) {
  if (viewName === "admin" && !isAdminUnlocked) {
    openAuthModal();
    return;
  }

  document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  document.querySelectorAll(".mobile-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAuthModal() {
  const modal = document.getElementById("adminAuthModal");
  const input = document.getElementById("adminPasswordInput");
  const err = document.getElementById("authErrorMsg");
  err.style.display = "none";
  input.value = "";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => input.focus(), 80);
}

function closeAuthModal() {
  const modal = document.getElementById("adminAuthModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function updateAdminLockBadge() {
  const icon = document.getElementById("desktopLockIcon");
  if (icon) icon.textContent = isAdminUnlocked ? "🔓" : "🔒";
}

function populateAdminFields() {
  document.getElementById("adminExcelUrl").value = appConfig.excelUrl;
  document.getElementById("adminSyncInterval").value = String(appConfig.syncInterval);
  document.getElementById("adminCorsProxy").value = appConfig.corsMode;
  document.getElementById("adminKknTitle").value = appConfig.kknTitle;
  document.getElementById("adminKknSubtitle").value = appConfig.kknSubtitle;
  document.getElementById("adminTargetIuran").value = appConfig.targetIuran;
  document.getElementById("adminLogoPath").value = appConfig.logoPath;
  document.getElementById("adminKetuaName").value = appConfig.ketuaName;
  document.getElementById("adminBendaharaName").value = appConfig.bendaharaName;
  refreshQuickEditOptions();
}

function refreshQuickEditOptions() {
  const type = document.getElementById("editTypeSelect").value;
  const targetSelect = document.getElementById("editCategoryOrMember");
  const nameInput = document.getElementById("editItemName");
  const qtyInput = document.getElementById("editItemQty");

  if (type === "expense") {
    targetSelect.innerHTML = Object.keys(CATEGORY_META)
      .map((cat) => `<option value="${cat}">${cat}</option>`)
      .join("");
    nameInput.style.display = "block";
    qtyInput.style.display = "block";
  } else {
    targetSelect.innerHTML = rabData.members
      .map((m) => `<option value="${m.no}">${m.no}. ${m.name}</option>`)
      .join("");
    nameInput.style.display = "none";
    qtyInput.style.display = "none";
  }
}

function setupAutoSyncTimer() {
  if (syncTimerId) clearInterval(syncTimerId);
  const interval = Number(appConfig.syncInterval);
  if (interval > 0) {
    syncTimerId = setInterval(() => syncFromExcelOnline(true), interval);
  }
}

// Inisialisasi Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  updateAdminLockBadge();
  renderAll();
  setupAutoSyncTimer();
  syncFromExcelOnline(true);

  document.querySelectorAll(".nav-tab, .mobile-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("btnManualSync").addEventListener("click", () => syncFromExcelOnline(false));
  document.getElementById("btnCopyWA").addEventListener("click", copyWhatsAppReport);
  document.getElementById("btnSendWA").addEventListener("click", sendWhatsAppReport);
  document.getElementById("btnExportPDF").addEventListener("click", exportRabToPdf);

  document.getElementById("searchMemberInput").addEventListener("input", renderMembersDetail);
  document.getElementById("filterMemberStatus").addEventListener("change", renderMembersDetail);
  document.getElementById("searchExpenseInput").addEventListener("input", renderExpensesDetail);

  document.querySelectorAll("#expenseCategoryPills .pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#expenseCategoryPills .pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedExpenseCat = pill.dataset.cat;
      renderExpensesDetail();
    });
  });

  // Modal Autentikasi Admin
  document.getElementById("adminAuthForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = document.getElementById("adminPasswordInput").value;
    if (entered === ADMIN_PASSWORD_HASH) {
      isAdminUnlocked = true;
      sessionStorage.setItem("rab_admin_unlocked", "true");
      updateAdminLockBadge();
      closeAuthModal();
      switchView("admin");
      showToast("Akses Admin berhasil dibuka.");
    } else {
      document.getElementById("authErrorMsg").style.display = "block";
    }
  });

  document.getElementById("btnCloseAuthModal").addEventListener("click", closeAuthModal);
  document.getElementById("btnCancelAuth").addEventListener("click", closeAuthModal);

  document.getElementById("btnTogglePassword").addEventListener("click", () => {
    const input = document.getElementById("adminPasswordInput");
    input.type = input.type === "password" ? "text" : "password";
  });

  // Aksi Panel Admin
  document.getElementById("btnLockAdmin").addEventListener("click", () => {
    isAdminUnlocked = false;
    sessionStorage.removeItem("rab_admin_unlocked");
    updateAdminLockBadge();
    switchView("ringkasan");
    showToast("Panel Admin telah dikunci.");
  });

  document.getElementById("btnSaveAndSync").addEventListener("click", () => {
    appConfig.excelUrl = document.getElementById("adminExcelUrl").value.trim();
    appConfig.syncInterval = Number(document.getElementById("adminSyncInterval").value);
    appConfig.corsMode = document.getElementById("adminCorsProxy").value;
    saveConfig();
    setupAutoSyncTimer();
    syncFromExcelOnline(false);
  });

  // Salin blok kode SCRIPT_RAB_DATA siap tempel ke app.js
  document.getElementById("btnCopyScriptSnippet").addEventListener("click", () => {
    const exportedBlock = `const SCRIPT_RAB_DATA = ${JSON.stringify(rabData, null, 2)};`;
    copyTextToClipboard(
      exportedBlock,
      "Blok kode SCRIPT_RAB_DATA disalin! Tempelkan ke bagian atas app.js."
    );
  });

  // Muat ulang cache langsung dari isi SCRIPT_RAB_DATA di app.js
  document.getElementById("btnReloadFromScript").addEventListener("click", () => {
    rabData = structuredClone(SCRIPT_RAB_DATA);
    saveDataToCache();
    renderAll();
    showToast("Cache diperbarui sesuai isi data di dalam app.js.");
  });

  document.getElementById("btnSaveIdentity").addEventListener("click", () => {
    appConfig.kknTitle = document.getElementById("adminKknTitle").value.trim() || DEFAULT_CONFIG.kknTitle;
    appConfig.kknSubtitle = document.getElementById("adminKknSubtitle").value.trim() || DEFAULT_CONFIG.kknSubtitle;
    appConfig.targetIuran = Number(document.getElementById("adminTargetIuran").value) || 0;
    appConfig.logoPath = document.getElementById("adminLogoPath").value.trim() || "main/logo.png";
    appConfig.ketuaName = document.getElementById("adminKetuaName").value.trim() || DEFAULT_CONFIG.ketuaName;
    appConfig.bendaharaName = document.getElementById("adminBendaharaName").value.trim() || DEFAULT_CONFIG.bendaharaName;
    saveConfig();
    renderAll();
    showToast("Pengaturan identitas dan laporan disimpan.");
  });

  document.getElementById("btnResetDefault").addEventListener("click", () => {
    appConfig = { ...DEFAULT_CONFIG };
    rabData = structuredClone(SCRIPT_RAB_DATA);
    saveConfig();
    saveDataToCache();
    setupAutoSyncTimer();
    renderAll();
    showToast("Pengaturan dan cache dikembalikan ke bawaan script.");
  });

  document.getElementById("adminUploadXlsx").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      rabData = parseRabWorkbook(workbook);
      rabData.sourceMode = "manual-file-cached";
      saveDataToCache();
      renderAll();
      showToast(`File "${file.name}" dimuat & disimpan ke cache.`);
    } catch (err) {
      showToast(`Gagal membaca file: ${err.message}`);
    }
    e.target.value = "";
  });

  document.getElementById("editTypeSelect").addEventListener("change", refreshQuickEditOptions);
  document.getElementById("btnApplyQuickEdit").addEventListener("click", () => {
    const type = document.getElementById("editTypeSelect").value;
    const targetVal = document.getElementById("editCategoryOrMember").value;
    const price = Number(document.getElementById("editItemPrice").value) || 0;

    if (type === "expense") {
      const name = document.getElementById("editItemName").value.trim();
      const qty = Math.max(1, Number(document.getElementById("editItemQty").value) || 1);
      if (!name) {
        showToast("Isi nama barang atau keterangan terlebih dahulu.");
        return;
      }
      rabData.expenses.push({
        category: targetVal,
        date: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        name,
        qty,
        unitPrice: price,
        total: qty * price
      });
      document.getElementById("editItemName").value = "";
      document.getElementById("editItemPrice").value = "";
    } else {
      const member = rabData.members.find((m) => String(m.no) === String(targetVal));
      if (member) {
        member.paid = price;
      }
    }

    rabData.lastUpdated = new Date().toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    });
    saveDataToCache();
    renderAll();
    showToast("Perubahan diterapkan dan disimpan ke cache.");
  });
});
