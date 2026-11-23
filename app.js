// ============================================================================
// 1. KONFIGURASI SISTEM (DATA 100% DIAMBIL LANGSUNG DARI EXCEL ONLINE)
// ============================================================================
const SCRIPT_DATA_VERSION = "2.3";

const ADMIN_PASSWORD_HASH = "W1k1d14Ever@";
const STORAGE_KEY_CONFIG = "rab_kkn_config_v7";
const STORAGE_KEY_DATA = "rab_kkn_data_cache_v7";
const STORAGE_KEY_SCRIPT_VER = "rab_kkn_script_version_v7";

const DEFAULT_CONFIG = {
  excelUrl:
    "https://onedrive.live.com/:x:/g/personal/0A4873D3EB635F62/IQAxUwzNi4F6T6fH2heV9QpjAbR2TKqf3GP3fLmR2kK50kc?resid=0A4873D3EB635F62!scd0c5331818b4f7aa7c7da1795f50a63&ithint=file%2Cxlsx&e=GMcqhA&migratedtospo=true&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8wYTQ4NzNkM2ViNjM1ZjYyL0lRQXhVd3pOaTRGNlQ2ZkgyaGVWOVFwakFiUjJUS3FmM0dQM2ZMbVIya0s1MGtjP2U9R01jcWhB",
  relayUrl:
    "https://script.google.com/macros/s/AKfycbzzCptuldV9WBFTrDdcaTj-lBrw-_DG6tIKYZnX-unY7k5PXjkecpqXM643zUPUwau0/exec",
  syncInterval: 15000,
  corsMode: "auto",
  kknTitle: "RAB & Kas KKN",
  kknSubtitle: "Laporan Pemasukan & Pengeluaran Realtime",
  targetIuran: 1500000,
  logoPath: "logo.png",
  ketuaName: "AHMAD DANI SARKAWI",
  bendaharaName: "ULUL AZMI MAWARTI"
};

const SCRIPT_RAB_DATA = {
  lastUpdated: "Menunggu sinkronisasi Excel Online...",
  sourceMode: "empty",
  members: [],
  expenses: []
};

// ============================================================================
// 2. LOGIKA PENARIKAN DATA ONEDRIVE, CACHE OFFLINE & RENDERING UI
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
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim();
  str = str.replace(/rp/gi, "").replace(/\s+/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else {
    str = str.replace(/[^0-9.-]+/g, "");
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

function formatExcelDate(val) {
  if (!val) return "-";
  if (typeof val === "number" && val > 20000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  const str = String(val).trim();
  return str || "-";
}

function normText(val) {
  return String(val || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function showToast(msg) {
  const toast = document.getElementById("toastNotification");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    if (!parsed.relayUrl) parsed.relayUrl = DEFAULT_CONFIG.relayUrl;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(appConfig));
}

function loadSavedData() {
  try {
    const cachedVersion = localStorage.getItem(STORAGE_KEY_SCRIPT_VER);
    const rawCache = localStorage.getItem(STORAGE_KEY_DATA);

    if (cachedVersion !== SCRIPT_DATA_VERSION || !rawCache) {
      const fresh = structuredClone(SCRIPT_RAB_DATA);
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(fresh));
      localStorage.setItem(STORAGE_KEY_SCRIPT_VER, SCRIPT_DATA_VERSION);
      return fresh;
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

function getDirectDownloadUrls(rawUrl) {
  const url = (rawUrl || "").trim();
  if (!url) return [];
  const list = [];

  if (url.includes("docs.google.com/spreadsheets")) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      list.push(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`);
    }
  }

  if (url.includes("onedrive.live.com") || url.includes("1drv.ms")) {
    try {
      const directParam = new URL(url);
      directParam.searchParams.set("download", "1");
      list.push(directParam.toString());

      const redeem = directParam.searchParams.get("redeem");
      if (redeem) {
        try {
          const decodedRedeem = atob(redeem);
          list.push(`${decodedRedeem}${decodedRedeem.includes("?") ? "&" : "?"}download=1`);
        } catch {}
      }

      const resid = directParam.searchParams.get("resid");
      const authkey = directParam.searchParams.get("authkey");
      if (resid) {
        let dlUrl = `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}`;
        if (authkey) dlUrl += `&authkey=${encodeURIComponent(authkey)}`;
        list.push(dlUrl);
      }
    } catch {}
  }

  list.push(url);
  return [...new Set(list)];
}

function detectExpenseCategory(rawCell) {
  const t = normText(rawCell);
  if (!t || t.includes("TOTAL") || t.includes("REKAP") || t.includes("PEMASUKAN")) return null;
  if (t === "POSKO" || t.endsWith(" POSKO")) return "POSKO";
  if (t === "LAIN-LAIN" || t === "LAIN - LAIN" || t.includes("LAIN-LAIN") || t.includes("LAIN LAIN")) return "LAIN-LAIN";
  if (t === "PROKER" || t.endsWith(" PROKER")) return "PROKER";
  if (t === "PDD" || t.endsWith(" PDD")) return "PDD";
  if (t === "KONSUMSI" || t.endsWith(" KONSUMSI")) return "KONSUMSI";
  return null;
}

// Parser Dinamis Berbasis Deteksi Header Kolom RAB KKN.xlsx
function parseRabWorkbook(workbook) {
  const sheetName =
    workbook.SheetNames.find((n) => n.toUpperCase().includes("LAPORAN")) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const members = [];
  const expenses = [];

  // 1. Deteksi Tabel PEMASUKAN ANGGOTA
  let memberHeaderFound = false;
  for (let r = 0; r < rows.length && !memberHeaderFound; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 8); c++) {
      if (normText(row[c]) === "NAMA") {
        const namaCol = c;
        let noCol = Math.max(0, c - 1);
        let paidCol = -1;

        const scanRows = [rows[r] || [], rows[r + 1] || []];
        for (const sRow of scanRows) {
          for (let k = Math.max(0, c - 2); k <= Math.min(sRow.length - 1, c + 6); k++) {
            const h = normText(sRow[k]);
            if (h === "NO") noCol = k;
            if (h.includes("TOTAL") || h.includes("NOMINAL") || h.includes("JUMLAH")) {
              paidCol = k;
            } else if (paidCol === -1 && h.includes("IURAN")) {
              paidCol = k;
            }
          }
        }

        if (paidCol === -1) paidCol = namaCol + 2;

        const startDataRow =
          normText((rows[r + 1] || [])[namaCol]) === "" &&
          (normText((rows[r + 1] || [])[paidCol]).includes("TOTAL") ||
            normText((rows[r + 1] || [])[paidCol]).includes("IURAN"))
            ? r + 2
            : r + 1;

        for (let dr = startDataRow; dr < rows.length; dr++) {
          const dRow = rows[dr] || [];
          const cellNo = normText(dRow[noCol]);
          const cellName = String(dRow[namaCol] || "").trim();
          const normName = normText(cellName);

          if (cellNo.includes("TOTAL") || normName.includes("TOTAL") || normName.includes("JUMLAH")) {
            break;
          }

          if (cellName && normName !== "NAMA") {
            members.push({
              no: parseNumber(dRow[noCol]) || members.length + 1,
              name: cellName,
              note: "",
              paid: parseNumber(dRow[paidCol])
            });
          }
        }

        memberHeaderFound = true;
        break;
      }
    }
  }

  // 2. Deteksi 5 Blok Pengeluaran (POSKO, LAIN-LAIN, PROKER, PDD, KONSUMSI)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const category = detectExpenseCategory(row[c]);
      if (!category) continue;

      // Cari baris header kolom di 1..4 baris di bawah judul kategori
      let headerRowIdx = -1;
      let cols = null;

      for (let hr = r + 1; hr <= Math.min(rows.length - 1, r + 4); hr++) {
        const candidateRow = rows[hr] || [];
        const scanStart = Math.max(0, c - 2);
        const scanEnd = Math.min(candidateRow.length - 1, c + 8);

        let score = 0;
        let dateCol = -1;
        let nameCol = -1;
        let descCol = -1;
        let qtyCol = -1;
        let priceCol = -1;
        let totalCol = -1;
        let minCol = scanEnd;
        let maxCol = scanStart;

        for (let k = scanStart; k <= scanEnd; k++) {
          const h = normText(candidateRow[k]);
          if (!h) continue;

          const isHeaderWord =
            h === "NO" ||
            h.includes("TANGGAL") ||
            h.includes("TGL") ||
            h.includes("NAMA") ||
            h.includes("BARANG") ||
            h.includes("DESKRIPSI") ||
            h.includes("URAIAN") ||
            h.includes("JENIS") ||
            h.includes("KET") ||
            h.includes("JUMLAH") ||
            h.includes("QTY") ||
            h.includes("VOL") ||
            h.includes("HARGA") ||
            h.includes("SATUAN") ||
            h.includes("NOMINAL") ||
            h.includes("TOTAL");

          if (isHeaderWord) {
            score++;
            if (k < minCol) minCol = k;
            if (k > maxCol) maxCol = k;
          }

          if (h.includes("TANGGAL") || h.includes("TGL")) {
            dateCol = k;
          } else if (
            h.includes("NAMA") ||
            h.includes("BARANG") ||
            h.includes("DESKRIPSI") ||
            h.includes("URAIAN") ||
            h.includes("JENIS")
          ) {
            if (nameCol === -1) nameCol = k;
            else descCol = k;
          } else if (h.includes("KET")) {
            descCol = k;
          } else if ((h.includes("JUMLAH") || h.includes("QTY") || h.includes("VOL")) && !h.includes("HARGA")) {
            qtyCol = k;
          } else if (h.includes("HARGA") || h.includes("SATUAN")) {
            priceCol = k;
          } else if (h.includes("NOMINAL") || h.includes("TOTAL")) {
            totalCol = k;
          }
        }

        if (score >= 2 && maxCol >= minCol) {
          headerRowIdx = hr;
          cols = { dateCol, nameCol, descCol, qtyCol, priceCol, totalCol, minCol, maxCol };
          break;
        }
      }

      if (headerRowIdx === -1 || !cols) continue;

      // Baca baris item di bawah header sampai ketemu TOTAL atau judul kategori berikutnya
      for (let dr = headerRowIdx + 1; dr < rows.length; dr++) {
        const dRow = rows[dr] || [];
        let hitBoundary = false;

        for (let k = cols.minCol; k <= cols.maxCol; k++) {
          const cellVal = normText(dRow[k]);
          if (cellVal.includes("TOTAL") || detectExpenseCategory(cellVal)) {
            hitBoundary = true;
            break;
          }
        }
        if (hitBoundary) break;

        // Lewati jika baris ini adalah sisa sel gabungan header 2 baris
        const isSubHeader = [cols.nameCol, cols.descCol, cols.qtyCol, cols.priceCol, cols.totalCol].some((colIdx) => {
          if (colIdx === -1) return false;
          const v = normText(dRow[colIdx]);
          return v === "SATUAN" || v === "BARANG" || v === "HARGA SATUAN" || v === "NAMA BARANG";
        });
        if (isSubHeader) continue;

        const rawName = cols.nameCol !== -1 ? String(dRow[cols.nameCol] || "").trim() : "";
        const rawDesc = cols.descCol !== -1 ? String(dRow[cols.descCol] || "").trim() : "";
        const combinedName =
          rawName && rawDesc && rawName !== rawDesc
            ? `${rawName} - ${rawDesc}`
            : rawName || rawDesc;

        const dateVal = cols.dateCol !== -1 ? formatExcelDate(dRow[cols.dateCol]) : "-";
        const qtyVal = cols.qtyCol !== -1 ? parseNumber(dRow[cols.qtyCol]) : 0;
        const priceVal = cols.priceCol !== -1 ? parseNumber(dRow[cols.priceCol]) : 0;
        const totalVal =
          cols.totalCol !== -1
            ? parseNumber(dRow[cols.totalCol])
            : qtyVal > 0 && priceVal > 0
            ? qtyVal * priceVal
            : 0;

        if (combinedName || totalVal > 0) {
          expenses.push({
            category,
            date: dateVal,
            name: combinedName || `Item ${category}`,
            qty: qtyVal || (totalVal > 0 ? 1 : 0),
            unitPrice: priceVal,
            total: totalVal
          });
        }
      }
    }
  }

  if (members.length === 0 && expenses.length === 0) {
    throw new Error("Struktur tabel tidak ditemukan di lembar kerja.");
  }

  return {
    lastUpdated: new Date().toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "medium"
    }),
    sourceMode: "live-excel",
    members,
    expenses
  };
}

// Tarik workbook melalui Google Apps Script Relay (Base64 JSON)
async function fetchViaAppsScriptRelay(relayUrl, targetDownloadUrl) {
  const endpoint = `${relayUrl.trim()}?url=${encodeURIComponent(targetDownloadUrl)}&_t=${Date.now()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14000);

  const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
  clearTimeout(timeoutId);

  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload || !payload.ok || !payload.base64) return null;
  if (!payload.base64.startsWith("UEs")) return null;

  return XLSX.read(payload.base64, { type: "base64" });
}

// Tarik workbook biner langsung atau via proxy cadangan
async function fetchBinaryWorkbook(fetchUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 11000);

  const response = await fetch(fetchUrl, { signal: controller.signal, cache: "no-store" });
  clearTimeout(timeoutId);

  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  if (uint8.length < 4 || uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
    return null;
  }

  return XLSX.read(arrayBuffer, { type: "array" });
}

// Sinkronisasi Utama dari Excel Online
async function syncFromExcelOnline(silent = false) {
  const badge = document.getElementById("syncBadge");
  const badgeText = document.getElementById("syncStatusText");
  const syncBtn = document.getElementById("btnManualSync");

  badge.className = "sync-badge status-syncing";
  badgeText.textContent = "Menarik Excel...";
  syncBtn.classList.add("spinning");

  const downloadUrls = getDirectDownloadUrls(appConfig.excelUrl);
  let syncedSuccess = false;

  if (appConfig.relayUrl && appConfig.relayUrl.trim()) {
    for (const dlUrl of downloadUrls) {
      try {
        const workbook = await fetchViaAppsScriptRelay(appConfig.relayUrl, dlUrl);
        if (workbook) {
          rabData = parseRabWorkbook(workbook);
          saveDataToCache();
          syncedSuccess = true;
          break;
        }
      } catch {}
    }
  }

  if (!syncedSuccess) {
    const bust = `_t=${Date.now()}`;
    const candidateFetchUrls = [];

    for (const target of downloadUrls) {
      const bustedTarget = `${target}${target.includes("?") ? "&" : "?"}${bust}`;
      if (appConfig.corsMode === "direct") {
        candidateFetchUrls.push(bustedTarget);
      } else if (appConfig.corsMode === "corsproxy") {
        candidateFetchUrls.push(`https://corsproxy.io/?${encodeURIComponent(bustedTarget)}`);
      } else if (appConfig.corsMode === "allorigins") {
        candidateFetchUrls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(bustedTarget)}`);
      } else {
        candidateFetchUrls.push(bustedTarget);
        candidateFetchUrls.push(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(bustedTarget)}`);
        candidateFetchUrls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(bustedTarget)}`);
      }
    }

    for (const url of candidateFetchUrls) {
      try {
        const workbook = await fetchBinaryWorkbook(url);
        if (workbook) {
          rabData = parseRabWorkbook(workbook);
          saveDataToCache();
          syncedSuccess = true;
          break;
        }
      } catch {}
    }
  }

  syncBtn.classList.remove("spinning");

  if (syncedSuccess) {
    badge.className = "sync-badge status-live";
    badgeText.textContent = "Live Excel Aktif";
    if (!silent) showToast("Data terbaru berhasil ditarik dari Excel Online!");
  } else {
    badge.className = "sync-badge status-offline";
    badgeText.textContent = rabData.members.length > 0 ? "Cache Terakhir" : "Gagal Tarik Excel";
    if (!silent) {
      showToast("Gagal menarik Excel Online. Periksa pengaturan di menu Admin.");
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
  if (rabData.members.length === 0) {
    container.innerHTML = `<div class="empty-state">Menunggu data anggota dari Excel Online...</div>`;
    return;
  }

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
    container.innerHTML = `<div class="empty-state">Belum ada pengeluaran dengan nominal aktif di Excel Online.</div>`;
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

  if (rabData.members.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada data anggota. Tekan tombol sinkronisasi di kanan atas.</div>`;
    return;
  }

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
  const relayInput = document.getElementById("adminRelayUrl");
  if (relayInput) relayInput.value = appConfig.relayUrl || "";
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

document.addEventListener("DOMContentLoaded", () => {
  updateAdminLockBadge();
  renderAll();
  setupAutoSyncTimer();
  syncFromExcelOnline(false);

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

  document.getElementById("btnLockAdmin").addEventListener("click", () => {
    isAdminUnlocked = false;
    sessionStorage.removeItem("rab_admin_unlocked");
    updateAdminLockBadge();
    switchView("ringkasan");
    showToast("Panel Admin telah dikunci.");
  });

  document.getElementById("btnSaveAndSync").addEventListener("click", () => {
    appConfig.excelUrl = document.getElementById("adminExcelUrl").value.trim();
    const relayInput = document.getElementById("adminRelayUrl");
    if (relayInput) appConfig.relayUrl = relayInput.value.trim();
    appConfig.syncInterval = Number(document.getElementById("adminSyncInterval").value);
    appConfig.corsMode = document.getElementById("adminCorsProxy").value;
    saveConfig();
    setupAutoSyncTimer();
    syncFromExcelOnline(false);
  });

  document.getElementById("btnCopyScriptSnippet").addEventListener("click", () => {
    const exportedBlock = `const SCRIPT_RAB_DATA = ${JSON.stringify(rabData, null, 2)};`;
    copyTextToClipboard(
      exportedBlock,
      "Blok kode SCRIPT_RAB_DATA disalin! Tempelkan ke bagian atas app.js."
    );
  });

  document.getElementById("btnReloadFromScript").addEventListener("click", () => {
    rabData = structuredClone(SCRIPT_RAB_DATA);
    saveDataToCache();
    renderAll();
    showToast("Cache dikosongkan. Menarik ulang dari Excel Online...");
    syncFromExcelOnline(false);
  });

  document.getElementById("btnSaveIdentity").addEventListener("click", () => {
    appConfig.kknTitle = document.getElementById("adminKknTitle").value.trim() || DEFAULT_CONFIG.kknTitle;
    appConfig.kknSubtitle = document.getElementById("adminKknSubtitle").value.trim() || DEFAULT_CONFIG.kknSubtitle;
    appConfig.targetIuran = Number(document.getElementById("adminTargetIuran").value) || 0;
    appConfig.logoPath = document.getElementById("adminLogoPath").value.trim() || "logo.png";
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
    syncFromExcelOnline(false);
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
      timeStyle: "medium"
    });
    saveDataToCache();
    renderAll();
    showToast("Perubahan diterapkan dan disimpan ke cache.");
  });
});
