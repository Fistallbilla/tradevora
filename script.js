import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyAdCB2Vke4iXLm1zPj43cNQwC65gZlQ6Ns",
  authDomain: "journal-38e0e.firebaseapp.com",
  databaseURL: "https://journal-38e0e-default-rtdb.firebaseio.com",
  projectId: "journal-38e0e",
  storageBucket: "journal-38e0e.firebasestorage.app",
  messagingSenderId: "382226906837",
  appId: "1:382226906837:web:38df881c0f7beb24256c5c",
  measurementId: "G-R6LXDMQ9K2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: "select_account"
});


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,
  trades: [],
  settings: {
    startingBalance: 0,
    currency: "USD",
    displayName: ""
  },
  editingId: null,
  calendarDate: new Date(),
  selectedCalendarDate: null
};


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timestampToDate(value) {

  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function parseDateOnly(value) {

  if (!value) return null;

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {

    const [y, m, d] = value
      .split("-")
      .map(Number);

    return new Date(y, m - 1, d);
  }

  return timestampToDate(value);
}

function dateString(date) {

  if (!date) return "";

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function todayString() {
  return dateString(new Date());
}

function formatDate(value) {

  const d = parseDateOnly(value);

  if (!d) return "-";

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatMoney(value) {

  const n = num(value);

  const currency = state.settings.currency || "USD";

  try {

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(n);

  } catch {

    return `${currency} ${n.toFixed(2)}`;
  }
}

function formatPct(value) {
  return `${num(value).toFixed(1)}%`;
}

function formatRR(value) {

  const n = num(value);

  if (!n) return "-";

  return `1:${n.toFixed(2)}`;
}

function getTradeDate(trade) {

  const date = parseDateOnly(trade.date);

  if (date) return date;

  return timestampToDate(trade.createdAt);
}

function getTradeDateString(trade) {

  const date = getTradeDate(trade);

  return date ? dateString(date) : "";
}

function showToast(message) {

  const toast = $("toast");

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeResult(value) {

  if (!value) return "Break Even";

  const v = String(value).trim().toLowerCase();

  if (
    v === "win" ||
    v === "won" ||
    v === "profit"
  ) {
    return "Win";
  }

  if (
    v === "loss" ||
    v === "lost" ||
    v === "lose"
  ) {
    return "Loss";
  }

  return "Break Even";
}

function normalizeRR(value) {

  if (typeof value === "number") {
    return value;
  }

  if (!value) return 0;

  const text = String(value);

  if (text.includes(":")) {

    const parts = text.split(":");

    const n = Number(parts[1]);

    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(text);

  return Number.isFinite(n) ? n : 0;
}

function normalizeTrade(data, docId, source) {

  const pair =
    data.pair ??
    data.symbol ??
    data.instrument ??
    "XAUUSD";

  const tradingType =
    data.tradingType ??
    data.tradeType ??
    data.type ??
    "Scalping";

  const strategy =
    data.strategy ??
    data.setup ??
    "Other";

  const profitLoss =
    data.profitLoss ??
    data.pnl ??
    data.pl ??
    0;

  const riskAmount =
    data.riskAmount ??
    data.risk ??
    0;

  const sl =
    data.sl ??
    data.stopLoss ??
    0;

  const tp =
    data.tp ??
    data.takeProfit ??
    0;

  const date =
    data.date ??
    data.tradeDate ??
    "";

  const result =
    normalizeResult(data.result);

  const direction =
    data.direction ||
    "Buy";

  return {

    ...data,

    _docId: docId,
    _source: source,

    tradeId:
      data.tradeId ||
      docId,

    date,
    pair: String(pair).toUpperCase(),
    tradingType,
    direction,
    strategy,

    session:
      data.session ||
      "Asian",

    bias:
      data.bias ||
      data.marketBias ||
      "Neutral",

    entry: num(data.entry),
    sl: num(sl),
    tp: num(tp),

    rr: normalizeRR(
      data.rr ??
      data.riskReward
    ),

    riskAmount: num(riskAmount),

    lotSize:
      num(data.lotSize),

    result,

    profitLoss: num(profitLoss),

    confidence:
      data.confidence ||
      "3/5",

    emotion:
      data.emotion ||
      "Neutral",

    mistake:
      data.mistake ||
      "None",

    notes:
      data.notes ||
      "",

    createdAt:
      data.createdAt ||
      null,

    updatedAt:
      data.updatedAt ||
      null
  };
}


/* =========================================================
   AUTH
========================================================= */

$("googleLoginBtn").addEventListener(
  "click",
  async () => {

    const button = $("googleLoginBtn");

    button.disabled = true;

    button.innerHTML =
      `<span class="google-icon">G</span><span>Signing in...</span>`;

    $("loginError").textContent = "";

    try {

      await signInWithPopup(
        auth,
        provider
      );

    } catch (error) {

      console.error(
        "Google Login Error:",
        error
      );

      if (
        error.code ===
        "auth/popup-blocked"
      ) {

        $("loginError").textContent =
          "Popup was blocked. Allow popups for this website.";

      } else if (
        error.code ===
        "auth/popup-closed-by-user"
      ) {

        $("loginError").textContent =
          "Login window was closed.";

      } else if (
        error.code ===
        "auth/unauthorized-domain"
      ) {

        $("loginError").textContent =
          "This website domain is not authorized in Firebase.";

      } else if (
        error.code ===
        "auth/operation-not-allowed"
      ) {

        $("loginError").textContent =
          "Google login is not enabled in Firebase.";

      } else if (
        error.code ===
        "auth/network-request-failed"
      ) {

        $("loginError").textContent =
          "Network error. Check your internet connection.";

      } else {

        $("loginError").textContent =
          error.message ||
          "Google login failed.";
      }

    } finally {

      button.disabled = false;

      button.innerHTML =
        `<span class="google-icon">G</span><span>Continue with Google</span>`;
    }
  }
);


getRedirectResult(auth)
  .catch(error => {

    if (error) {
      console.error(
        "Redirect auth error:",
        error
      );
    }

  });


onAuthStateChanged(
  auth,
  async user => {

    if (user) {

      state.user = user;

      $("loginScreen")
        .classList
        .add("hidden");

      $("app")
        .classList
        .remove("hidden");

      updateUserUI();

      await loadUserData();

    } else {

      state.user = null;

      $("loginScreen")
        .classList
        .remove("hidden");

      $("app")
        .classList
        .add("hidden");
    }
  }
);


$("logoutBtn").addEventListener(
  "click",
  async () => {

    try {

      await signOut(auth);

      showToast("Logged out");

    } catch (error) {

      console.error(error);

    }
  }
);


/* =========================================================
   USER UI
========================================================= */

function updateUserUI() {

  if (!state.user) return;

  const name =
    state.user.displayName ||
    "Trader";

  const email =
    state.user.email ||
    "-";

  const photo =
    state.user.photoURL ||
    "logo.png";

  $("sidebarUserName").textContent =
    name;

  $("sidebarUserEmail").textContent =
    email;

  $("sidebarUserPhoto").src =
    photo;

  $("settingsEmail").textContent =
    email;

  $("settingsPhoto").src =
    photo;

  $("settingsName").value =
    state.settings.displayName ||
    name;
}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadUserData() {

  if (!state.user) return;

  await loadSettings();
  await loadTrades();

  renderEverything();
}


/* =========================================================
   SETTINGS LOAD
========================================================= */

async function loadSettings() {

  try {

    const ref = doc(
      db,
      "users",
      state.user.uid,
      "settings",
      "profile"
    );

    const snap = await getDoc(ref);

    if (snap.exists()) {

      const data = snap.data();

      state.settings = {
        startingBalance:
          num(data.startingBalance),

        currency:
          data.currency ||
          "USD",

        displayName:
          data.displayName ||
          ""
      };

    }

    $("startingBalance").value =
      state.settings.startingBalance;

    $("currency").value =
      state.settings.currency;

    updateUserUI();

  } catch (error) {

    console.error(
      "Settings load error:",
      error
    );

  }
}


/* =========================================================
   TRADES LOAD
========================================================= */

async function loadTrades() {

  if (!state.user) return;

  const uid =
    state.user.uid;

  const loaded = [];

  try {

    /* Nested user trades */

    const nestedRef =
      collection(
        db,
        "users",
        uid,
        "trades"
      );

    const nestedSnap =
      await getDocs(nestedRef);

    nestedSnap.forEach(
      snap => {

        loaded.push(
          normalizeTrade(
            snap.data(),
            snap.id,
            "nested"
          )
        );

      }
    );


    /* Top-level userId */

    try {

      const q1 = query(
        collection(db, "trades"),
        where("userId", "==", uid)
      );

      const snap1 =
        await getDocs(q1);

      snap1.forEach(
        snap => {

          loaded.push(
            normalizeTrade(
              snap.data(),
              snap.id,
              "top-userId"
            )
          );

        }
      );

    } catch (error) {

      console.warn(
        "top userId query failed",
        error
      );
    }


    /* Top-level uid */

    try {

      const q2 = query(
        collection(db, "trades"),
        where("uid", "==", uid)
      );

      const snap2 =
        await getDocs(q2);

      snap2.forEach(
        snap => {

          loaded.push(
            normalizeTrade(
              snap.data(),
              snap.id,
              "top-uid"
            )
          );

        }
      );

    } catch (error) {

      console.warn(
        "top uid query failed",
        error
      );
    }


    /* Deduplicate */

    const map =
      new Map();

    for (const trade of loaded) {

      const key =
        trade.tradeId ||
        `${trade._source}-${trade._docId}`;

      if (!map.has(key)) {

        map.set(
          key,
          trade
        );

      } else {

        const existing =
          map.get(key);

        if (
          existing._source !== "nested" &&
          trade._source === "nested"
        ) {

          map.set(
            key,
            trade
          );
        }
      }
    }

    state.trades =
      Array.from(map.values());

    sortTrades();

    console.log(
      "Loaded trades:",
      state.trades.length
    );

  } catch (error) {

    console.error(
      "Trade load error:",
      error
    );

    showToast(
      "Could not load trades."
    );
  }
}


function sortTrades() {

  state.trades.sort(
    (a,b) => {

      const da =
        getTradeDate(a)?.getTime() || 0;

      const db =
        getTradeDate(b)?.getTime() || 0;

      return db - da;
    }
  );
}


/* =========================================================
   NAVIGATION
========================================================= */

document
  .querySelectorAll(".nav-item")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        showPage(page);

        closeSidebar();
      }
    );
  });


function showPage(pageId) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove(
        "active-page"
      );
    });

  const page =
    $(pageId);

  if (page) {
    page.classList.add(
      "active-page"
    );
  }

  document
    .querySelectorAll(".nav-item")
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.page === pageId
      );

    });

  if (pageId === "analyticsPage") {
    renderAnalytics();
  }

  if (pageId === "calendarPage") {
    renderCalendar();
  }
}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

$("menuBtn").addEventListener(
  "click",
  () => {

    $("sidebar")
      .classList
      .add("open");

    $("sidebarOverlay")
      .classList
      .add("show");
  }
);

$("sidebarOverlay").addEventListener(
  "click",
  closeSidebar
);

function closeSidebar() {

  $("sidebar")
    .classList
    .remove("open");

  $("sidebarOverlay")
    .classList
    .remove("show");
}


/* =========================================================
   ADD TRADE BUTTONS
========================================================= */

document
  .querySelectorAll(".add-trade-btn")
  .forEach(button => {

    button.addEventListener(
      "click",
      openAddTradeModal
    );

  });


document
  .querySelector(".mobile-add")
  .addEventListener(
    "click",
    openAddTradeModal
  );


function generateTradeId() {

  const d =
    new Date();

  const date =
    dateString(d)
      .replaceAll("-", "");

  const random =
    Math.random()
      .toString(36)
      .substring(2,6)
      .toUpperCase();

  return `UJRF-${date}-${random}`;
}


function openAddTradeModal() {

  state.editingId = null;

  $("tradeModalTitle").textContent =
    "Add Trade";

  $("saveTradeBtn").textContent =
    "Save Trade";

  $("tradeForm").reset();

  $("tradeId").value =
    generateTradeId();

  $("tradeDate").value =
    todayString();

  $("pair").value =
    "XAUUSD";

  $("tradingType").value =
    "Scalping";

  $("direction").value =
    "Buy";

  $("strategy").value =
    "Liquidity Sweep";

  $("session").value =
    "London";

  $("bias").value =
    "Bullish";

  $("result").value =
    "Win";

  $("confidence").value =
    "3/5";

  $("emotion").value =
    "Calm";

  $("mistake").value =
    "None";

  $("riskAmount").value =
    "";

  $("profitLoss").value =
    "";

  $("rr").value =
    "";

  $("tradeError").textContent =
    "";

  $("tradeModal")
    .classList
    .remove("hidden");

  calculateTradeRR();
}


/* =========================================================
   CLOSE MODAL
========================================================= */

$("closeTradeModal")
  .addEventListener(
    "click",
    closeTradeModal
  );

$("cancelTrade")
  .addEventListener(
    "click",
    closeTradeModal
  );

document
  .querySelector(".modal-backdrop")
  .addEventListener(
    "click",
    closeTradeModal
  );


function closeTradeModal() {

  $("tradeModal")
    .classList
    .add("hidden");

  state.editingId = null;
}


/* =========================================================
   RR
========================================================= */

function calculateTradeRR() {

  const entry =
    num($("entry").value);

  const sl =
    num($("sl").value);

  const tp =
    num($("tp").value);

  const direction =
    $("direction").value;

  if (
    entry <= 0 ||
    sl <= 0 ||
    tp <= 0
  ) {

    $("rr").value = "";

    return 0;
  }

  let risk = 0;
  let reward = 0;

  if (direction === "Buy") {

    risk =
      entry - sl;

    reward =
      tp - entry;

  } else {

    risk =
      sl - entry;

    reward =
      entry - tp;
  }

  if (
    risk <= 0 ||
    reward <= 0
  ) {

    $("rr").value =
      "Invalid";

    return 0;
  }

  const rr =
    reward / risk;

  $("rr").value =
    `1:${rr.toFixed(2)}`;

  return rr;
}


["entry","sl","tp","direction"]
  .forEach(id => {

    $(id).addEventListener(
      "input",
      calculateTradeRR
    );

    $(id).addEventListener(
      "change",
      calculateTradeRR
    );
  });


/* =========================================================
   P/L
========================================================= */

function normalizeProfitLossByResult() {

  const result =
    $("result").value;

  const input =
    $("profitLoss");

  if (
    result === "Break Even"
  ) {

    input.value = "0";

    return;
  }

  if (input.value === "") {
    return;
  }

  const value =
    Number(input.value);

  if (!Number.isFinite(value)) {
    return;
  }

  if (
    result === "Win"
  ) {

    input.value =
      Math.abs(value);

  }

  if (
    result === "Loss"
  ) {

    input.value =
      -Math.abs(value);
  }
}


function getNormalizedPL() {

  const result =
    $("result").value;

  const raw =
    $("profitLoss").value;

  if (
    result === "Break Even"
  ) {

    return 0;
  }

  if (raw === "") {
    return null;
  }

  const value =
    Number(raw);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (
    result === "Win"
  ) {

    return Number(
      Math.abs(value)
        .toFixed(2)
    );
  }

  if (
    result === "Loss"
  ) {

    return Number(
      -Math.abs(value)
        .toFixed(2)
    );
  }

  return Number(
    value.toFixed(2)
  );
}


$("result")
  .addEventListener(
    "change",
    normalizeProfitLossByResult
  );

$("profitLoss")
  .addEventListener(
    "blur",
    normalizeProfitLossByResult
  );


/* =========================================================
   SAVE / UPDATE TRADE
========================================================= */

$("tradeForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!state.user) return;

      $("tradeError").textContent =
        "";

      const rr =
        calculateTradeRR();

      if (
        $("entry").value &&
        $("sl").value &&
        $("tp").value &&
        (
          !rr ||
          $("rr").value === "Invalid"
        )
      ) {

        $("tradeError").textContent =
          "Please check Entry, Stop Loss and Take Profit.";

        return;
      }


      const riskRaw =
        $("riskAmount")
          .value
          .trim();

      const riskAmount =
        riskRaw === ""
          ? 0
          : Number(riskRaw);

      if (
        !Number.isFinite(riskAmount) ||
        riskAmount < 0
      ) {

        $("tradeError").textContent =
          "Risk Amount must be a valid positive number.";

        return;
      }


      const pl =
        getNormalizedPL();

      if (pl === null) {

        $("tradeError").textContent =
          "Please enter P/L.";

        return;
      }


      const trade = {

        tradeId:
          $("tradeId").value,

        date:
          $("tradeDate").value,

        pair:
          $("pair").value
            .trim()
            .toUpperCase() ||
          "XAUUSD",

        tradingType:
          $("tradingType").value,

        direction:
          $("direction").value,

        strategy:
          $("strategy").value,

        session:
          $("session").value,

        bias:
          $("bias").value,

        entry:
          num($("entry").value),

        sl:
          num($("sl").value),

        tp:
          num($("tp").value),

        rr,

        riskAmount,

        lotSize:
          num($("lotSize").value),

        result:
          $("result").value,

        profitLoss:
          pl,

        confidence:
          $("confidence").value,

        emotion:
          $("emotion").value,

        mistake:
          $("mistake").value,

        notes:
          $("notes").value.trim(),

        userId:
          state.user.uid,

        updatedAt:
          serverTimestamp()
      };


      try {

        if (state.editingId) {

          const existing =
            state.trades.find(
              t =>
                t._docId ===
                state.editingId
            );

          if (!existing) {
            throw new Error(
              "Trade not found."
            );
          }

          let tradeRef;

          if (
            existing._source ===
            "nested"
          ) {

            tradeRef =
              doc(
                db,
                "users",
                state.user.uid,
                "trades",
                existing._docId
              );

          } else {

            tradeRef =
              doc(
                db,
                "trades",
                existing._docId
              );
          }

          await updateDoc(
            tradeRef,
            trade
          );

          showToast(
            "Trade updated successfully."
          );

        } else {

          trade.createdAt =
            serverTimestamp();

          const ref =
            await addDoc(
              collection(
                db,
                "users",
                state.user.uid,
                "trades"
              ),
              trade
            );

          showToast(
            "Trade saved successfully."
          );
        }


        closeTradeModal();

        await loadTrades();

        renderEverything();

      } catch (error) {

        console.error(
          "Save trade error:",
          error
        );

        $("tradeError").textContent =
          error.message ||
          "Could not save trade.";
      }
    }
  );


/* =========================================================
   EDIT TRADE
========================================================= */

function editTrade(id) {

  const trade =
    state.trades.find(
      t => t._docId === id
    );

  if (!trade) return;

  state.editingId =
    trade._docId;

  $("tradeModalTitle").textContent =
    "Edit Trade";

  $("saveTradeBtn").textContent =
    "Update Trade";

  $("tradeId").value =
    trade.tradeId || "";

  $("tradeDate").value =
    getTradeDateString(trade);

  $("pair").value =
    trade.pair || "XAUUSD";

  $("tradingType").value =
    trade.tradingType || "Scalping";

  $("direction").value =
    trade.direction || "Buy";

  $("strategy").value =
    trade.strategy || "Other";

  $("session").value =
    trade.session || "Asian";

  $("bias").value =
    trade.bias || "Neutral";

  $("entry").value =
    trade.entry || "";

  $("sl").value =
    trade.sl || "";

  $("tp").value =
    trade.tp || "";

  $("riskAmount").value =
    trade.riskAmount || "";

  $("lotSize").value =
    trade.lotSize || "";

  $("result").value =
    trade.result || "Break Even";

  $("profitLoss").value =
    trade.profitLoss ?? 0;

  $("confidence").value =
    trade.confidence || "3/5";

  $("emotion").value =
    trade.emotion || "Neutral";

  $("mistake").value =
    trade.mistake || "None";

  $("notes").value =
    trade.notes || "";

  calculateTradeRR();

  $("tradeModal")
    .classList
    .remove("hidden");
}


/* =========================================================
   DELETE TRADE
========================================================= */

async function deleteTrade(id) {

  const trade =
    state.trades.find(
      t => t._docId === id
    );

  if (!trade) return;

  const confirmed =
    confirm(
      "Delete this trade?"
    );

  if (!confirmed) return;

  try {

    let ref;

    if (
      trade._source ===
      "nested"
    ) {

      ref =
        doc(
          db,
          "users",
          state.user.uid,
          "trades",
          trade._docId
        );

    } else {

      ref =
        doc(
          db,
          "trades",
          trade._docId
        );
    }

    await deleteDoc(ref);

    state.trades =
      state.trades.filter(
        t =>
          t._docId !==
          id
      );

    renderEverything();

    showToast(
      "Trade deleted."
    );

  } catch (error) {

    console.error(
      "Delete error:",
      error
    );

    showToast(
      "Could not delete trade."
    );
  }
}


window.editTrade =
  editTrade;

window.deleteTrade =
  deleteTrade;


/* =========================================================
   CALCULATE ANALYTICS
========================================================= */

function calculateAnalytics(trades) {

  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  let totalPL = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  let rrSum = 0;
  let rrCount = 0;

  let riskSum = 0;
  let riskCount = 0;

  let realizedRSum = 0;
  let realizedRCount = 0;

  let bestTrade = 0;
  let worstTrade = 0;

  const chronological =
    [...trades].sort(
      (a,b) =>
        (
          getTradeDate(a)?.getTime() || 0
        ) -
        (
          getTradeDate(b)?.getTime() || 0
        )
    );


  for (const trade of chronological) {

    const pl =
      num(trade.profitLoss);

    totalPL += pl;

    if (trade.result === "Win") {

      wins++;

      grossProfit +=
        Math.max(0, pl);

    } else if (
      trade.result === "Loss"
    ) {

      losses++;

      grossLoss +=
        Math.abs(
          Math.min(0, pl)
        );

    } else {

      breakeven++;
    }


    if (pl > bestTrade) {
      bestTrade = pl;
    }

    if (pl < worstTrade) {
      worstTrade = pl;
    }


    if (
      trade.rr > 0
    ) {

      rrSum +=
        trade.rr;

      rrCount++;
    }


    if (
      trade.riskAmount > 0
    ) {

      riskSum +=
        trade.riskAmount;

      riskCount++;


      if (
        Number.isFinite(pl)
      ) {

        realizedRSum +=
          pl /
          trade.riskAmount;

        realizedRCount++;
      }
    }
  }


  const total =
    trades.length;

  const winRate =
    total > 0
      ? (wins / total) * 100
      : 0;

  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Infinity
        : 0;

  const averagePL =
    total > 0
      ? totalPL / total
      : 0;

  const averageWin =
    wins > 0
      ? grossProfit / wins
      : 0;

  const averageLoss =
    losses > 0
      ? -(grossLoss / losses)
      : 0;

  const averageRR =
    rrCount > 0
      ? rrSum / rrCount
      : 0;

  const averageRisk =
    riskCount > 0
      ? riskSum / riskCount
      : 0;

  const averageRealizedR =
    realizedRCount > 0
      ? realizedRSum /
        realizedRCount
      : 0;


  /* Drawdown */

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  const equityPoints = [];
  const drawdownPoints = [];

  const startingBalance =
    num(
      state.settings.startingBalance
    );

  for (const trade of chronological) {

    cumulative +=
      num(trade.profitLoss);

    const equity =
      startingBalance +
      cumulative;

    peak =
      Math.max(
        peak,
        cumulative
      );

    const drawdown =
      peak -
      cumulative;

    maxDrawdown =
      Math.max(
        maxDrawdown,
        drawdown
      );

    equityPoints.push(
      equity
    );

    drawdownPoints.push(
      -drawdown
    );
  }


  const maxDrawdownPct =
    startingBalance > 0
      ? (
          maxDrawdown /
          startingBalance
        ) * 100
      : 0;


  const recoveryFactor =
    maxDrawdown > 0
      ? totalPL /
        maxDrawdown
      : 0;


  const payoffRatio =
    averageLoss !== 0
      ? averageWin /
        Math.abs(averageLoss)
      : 0;


  /* Streaks */

  let currentWinStreak = 0;
  let currentLossStreak = 0;

  let bestWinStreak = 0;
  let bestLossStreak = 0;

  let tempWin = 0;
  let tempLoss = 0;

  for (
    const trade of chronological
  ) {

    if (
      trade.result === "Win"
    ) {

      tempWin++;
      tempLoss = 0;

      bestWinStreak =
        Math.max(
          bestWinStreak,
          tempWin
        );

    } else if (
      trade.result === "Loss"
    ) {

      tempLoss++;
      tempWin = 0;

      bestLossStreak =
        Math.max(
          bestLossStreak,
          tempLoss
        );

    } else {

      tempWin = 0;
      tempLoss = 0;
    }
  }


  for (
    let i =
      chronological.length - 1;
    i >= 0;
    i--
  ) {

    if (
      chronological[i].result ===
      "Win"
    ) {

      currentWinStreak++;

    } else {

      break;
    }
  }


  for (
    let i =
      chronological.length - 1;
    i >= 0;
    i--
  ) {

    if (
      chronological[i].result ===
      "Loss"
    ) {

      currentLossStreak++;

    } else {

      break;
    }
  }


  /* Risk */

  const risks =
    trades
      .map(t =>
        num(t.riskAmount)
      )
      .filter(n => n > 0);

  let riskStd = 0;

  if (risks.length) {

    const mean =
      risks.reduce(
        (a,b) => a + b,
        0
      ) /
      risks.length;

    const variance =
      risks.reduce(
        (sum,value) =>
          sum +
          Math.pow(
            value - mean,
            2
          ),
        0
      ) /
      risks.length;

    riskStd =
      Math.sqrt(variance);
  }


  const highestRisk =
    risks.length
      ? Math.max(...risks)
      : 0;

  const lowestRisk =
    risks.length
      ? Math.min(...risks)
      : 0;

  const aboveAverageRisk =
    risks.length
      ? risks.filter(
          r =>
            r > averageRisk
        ).length
      : 0;


  return {

    total,
    wins,
    losses,
    breakeven,

    winRate,

    totalPL,
    grossProfit,
    grossLoss,

    profitFactor,

    averagePL,
    averageWin,
    averageLoss,

    averageRR,
    averageRisk,

    averageRealizedR,

    bestTrade,
    worstTrade,

    maxDrawdown,
    maxDrawdownPct,

    recoveryFactor,
    payoffRatio,

    currentWinStreak,
    currentLossStreak,
    bestWinStreak,
    bestLossStreak,

    risks,
    highestRisk,
    lowestRisk,
    riskStd,
    aboveAverageRisk,

    chronological,
    equityPoints,
    drawdownPoints
  };
}


/* =========================================================
   FILTER ANALYTICS PERIOD
========================================================= */

function filterAnalyticsPeriod() {

  const period =
    $("analyticsPeriod").value;

  const now =
    new Date();

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  if (period === "all") {
    return [...state.trades];
  }


  return state.trades.filter(
    trade => {

      const d =
        getTradeDate(trade);

      if (!d) return false;

      const date =
        new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate()
        );


      if (period === "7") {

        const start =
          new Date(today);

        start.setDate(
          start.getDate() - 6
        );

        return date >= start &&
               date <= today;
      }


      if (period === "30") {

        const start =
          new Date(today);

        start.setDate(
          start.getDate() - 29
        );

        return date >= start &&
               date <= today;
      }


      if (period === "month") {

        return (
          date.getFullYear() ===
            today.getFullYear() &&
          date.getMonth() ===
            today.getMonth()
        );
      }


      if (period === "year") {

        return (
          date.getFullYear() ===
          today.getFullYear()
        );
      }


      return true;
    }
  );
}


/* =========================================================
   ANALYTICS RENDER
========================================================= */

function renderAnalytics() {

  const trades =
    filterAnalyticsPeriod();

  const stats =
    calculateAnalytics(
      trades
    );


  /* KPIs */

  $("aTotalTrades").textContent =
    stats.total;

  $("aWinRate").textContent =
    formatPct(
      stats.winRate
    );

  $("aNetPL").textContent =
    formatMoney(
      stats.totalPL
    );

  $("aProfitFactor").textContent =
    Number.isFinite(
      stats.profitFactor
    )
      ? stats.profitFactor.toFixed(2)
      : "∞";

  $("aExpectancy").textContent =
    formatMoney(
      stats.averagePL
    );

  $("aMaxDD").textContent =
    formatMoney(
      -stats.maxDrawdown
    );

  $("aAvgRR").textContent =
    formatRR(
      stats.averageRR
    );

  $("aAvgRisk").textContent =
    formatMoney(
      stats.averageRisk
    );


  /* Streaks */

  $("currentWinStreak").textContent =
    stats.currentWinStreak;

  $("currentLossStreak").textContent =
    stats.currentLossStreak;

  $("bestWinStreak").textContent =
    stats.bestWinStreak;

  $("bestLossStreak").textContent =
    stats.bestLossStreak;


  /* Charts */

  drawLineChart(
    $("analyticsEquityChart"),
    stats.equityPoints,
    {
      baseline:
        state.settings.startingBalance,

      positiveBaseline: true
    }
  );


  drawLineChart(
    $("analyticsDrawdownChart"),
    stats.drawdownPoints,
    {
      positiveBaseline: false
    }
  );


  /* Seven horizontal charts */

  renderHorizontalCategory(
    "chartTradingType",
    trades,
    "tradingType"
  );

  renderHorizontalCategory(
    "chartPair",
    trades,
    "pair"
  );

  renderHorizontalCategory(
    "chartDirection",
    trades,
    "direction"
  );

  renderHorizontalCategory(
    "chartStrategy",
    trades,
    "strategy"
  );

  renderHorizontalCategory(
    "chartSession",
    trades,
    "session"
  );

  renderHorizontalCategory(
    "chartEmotion",
    trades,
    "emotion"
  );

  renderHorizontalCategory(
    "chartMistake",
    trades,
    "mistake"
  );


  renderBreakdownTable(
    trades
  );

  renderDayOfWeek(
    trades
  );

  renderMonthly(
    trades
  );

  renderRiskAnalysis(
    stats
  );

  renderInsights(
    trades,
    stats
  );
}


/* =========================================================
   CATEGORY GROUPING
========================================================= */

function groupByCategory(
  trades,
  key
) {

  const groups =
    new Map();

  for (const trade of trades) {

    let value =
      trade[key];

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      value =
        key === "mistake"
          ? "None"
          : "Unknown";
    }

    value =
      String(value);

    if (!groups.has(value)) {

      groups.set(
        value,
        []
      );
    }

    groups
      .get(value)
      .push(trade);
  }

  return Array.from(
    groups.entries()
  )
    .map(
      ([category, list]) => {

        const stats =
          calculateAnalytics(
            list
          );

        return {
          category,
          trades: list.length,
          wins: stats.wins,
          losses: stats.losses,
          winRate: stats.winRate,
          pl: stats.totalPL,
          avgPL: stats.averagePL,
          avgRR: stats.averageRR
        };
      }
    )
    .sort(
      (a,b) =>
        b.trades -
        a.trades
    );
}


/* =========================================================
   HORIZONTAL BAR CHART
========================================================= */

function renderHorizontalCategory(
  containerId,
  trades,
  key
) {

  const container =
    $(containerId);

  if (!container) return;

  container.innerHTML = "";

  const groups =
    groupByCategory(
      trades,
      key
    );

  if (!groups.length) {

    container.innerHTML =
      `<div class="chart-empty">
        No trade data for this period.
      </div>`;

    return;
  }


  const maxTrades =
    Math.max(
      ...groups.map(
        g => g.trades
      )
    );


  for (
    const group of groups
  ) {

    const width =
      maxTrades > 0
        ? (
            group.trades /
            maxTrades
          ) * 100
        : 0;

    const plClass =
      group.pl > 0
        ? "positive"
        : group.pl < 0
          ? "negative"
          : "";


    const row =
      document.createElement(
        "div"
      );

    row.className =
      "hbar-row";


    row.innerHTML = `

      <div class="hbar-top">

        <span
          class="hbar-name"
          title="${escapeHTML(group.category)}"
        >
          ${escapeHTML(group.category)}
        </span>

        <span class="hbar-meta">
          ${group.trades} trades
        </span>

      </div>


      <div class="hbar-track">

        <div
          class="hbar-fill"
          style="width:${width}%"
        ></div>

      </div>


      <div class="hbar-bottom">

        <span>
          Win Rate:
          ${formatPct(group.winRate)}
        </span>

        <span class="${plClass}">
          P/L:
          ${formatMoney(group.pl)}
        </span>

      </div>
    `;


    container.appendChild(
      row
    );
  }
}


/* =========================================================
   BREAKDOWN TABLE
========================================================= */

function renderBreakdownTable(
  trades
) {

  const key =
    $("analyticsBreakdown").value;

  const labels = {

    tradingType:
      "Trading Type",

    pair:
      "Pair",

    direction:
      "Direction",

    strategy:
      "Strategy",

    session:
      "Session",

    emotion:
      "Emotion",

    mistake:
      "Mistake"
  };

  $("breakdownTitle").textContent =
    `${labels[key] || "Category"} Performance`;


  const body =
    $("breakdownBody");

  body.innerHTML = "";


  const groups =
    groupByCategory(
      trades,
      key
    );


  if (!groups.length) {

    body.innerHTML =
      `<tr>
        <td class="empty" colspan="8">
          No data available.
        </td>
      </tr>`;

    return;
  }


  for (
    const group of groups
  ) {

    const row =
      document.createElement(
        "tr"
      );

    const plClass =
      group.pl > 0
        ? "win"
        : group.pl < 0
          ? "loss"
          : "neutral";


    row.innerHTML = `

      <td>
        ${escapeHTML(group.category)}
      </td>

      <td>
        ${group.trades}
      </td>

      <td class="win">
        ${group.wins}
      </td>

      <td class="loss">
        ${group.losses}
      </td>

      <td>
        ${formatPct(group.winRate)}
      </td>

      <td class="${plClass}">
        ${formatMoney(group.pl)}
      </td>

      <td class="${group.avgPL >= 0 ? "win" : "loss"}">
        ${formatMoney(group.avgPL)}
      </td>

      <td>
        ${formatRR(group.avgRR)}
      </td>
    `;

    body.appendChild(row);
  }
}


/* =========================================================
   DAY OF WEEK
========================================================= */

function renderDayOfWeek(
  trades
) {

  const body =
    $("dayOfWeekBody");

  body.innerHTML = "";

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  const groups =
    days.map(
      day => ({
        day,
        trades: []
      })
    );


  for (
    const trade of trades
  ) {

    const d =
      getTradeDate(trade);

    if (!d) continue;

    let index =
      d.getDay() - 1;

    if (index < 0) {
      index = 6;
    }

    groups[index].trades.push(
      trade
    );
  }


  for (
    const group of groups
  ) {

    const stats =
      calculateAnalytics(
        group.trades
      );

    const row =
      document.createElement(
        "tr"
      );

    row.innerHTML = `

      <td>
        ${group.day}
      </td>

      <td>
        ${stats.total}
      </td>

      <td class="win">
        ${stats.wins}
      </td>

      <td>
        ${formatPct(stats.winRate)}
      </td>

      <td class="${stats.totalPL >= 0 ? "win" : "loss"}">
        ${formatMoney(stats.totalPL)}
      </td>

      <td class="${stats.averagePL >= 0 ? "win" : "loss"}">
        ${formatMoney(stats.averagePL)}
      </td>

    `;

    body.appendChild(
      row
    );
  }
}


/* =========================================================
   MONTHLY
========================================================= */

function renderMonthly(
  trades
) {

  const body =
    $("monthlyBody");

  body.innerHTML = "";


  const groups =
    new Map();


  for (
    const trade of trades
  ) {

    const d =
      getTradeDate(trade);

    if (!d) continue;

    const key =
      `${d.getFullYear()}-${String(
        d.getMonth() + 1
      ).padStart(2,"0")}`;


    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups
      .get(key)
      .push(trade);
  }


  const entries =
    Array.from(
      groups.entries()
    )
      .sort(
        (a,b) =>
          b[0].localeCompare(
            a[0]
          )
      );


  if (!entries.length) {

    body.innerHTML =
      `<tr>
        <td class="empty" colspan="5">
          No monthly data available.
        </td>
      </tr>`;

    return;
  }


  for (
    const [month, list]
    of entries
  ) {

    const stats =
      calculateAnalytics(
        list
      );

    const d =
      new Date(
        Number(month.slice(0,4)),
        Number(month.slice(5,7)) - 1,
        1
      );

    const label =
      d.toLocaleDateString(
        undefined,
        {
          month: "long",
          year: "numeric"
        }
      );


    const row =
      document.createElement(
        "tr"
      );

    row.innerHTML = `

      <td>
        ${label}
      </td>

      <td>
        ${stats.total}
      </td>

      <td>
        ${formatPct(stats.winRate)}
      </td>

      <td class="${stats.totalPL >= 0 ? "win" : "loss"}">
        ${formatMoney(stats.totalPL)}
      </td>

      <td class="${stats.averagePL >= 0 ? "win" : "loss"}">
        ${formatMoney(stats.averagePL)}
      </td>

    `;

    body.appendChild(
      row
    );
  }
}


/* =========================================================
   RISK ANALYSIS
========================================================= */

function renderRiskAnalysis(
  stats
) {

  $("riskAvg").textContent =
    formatMoney(
      stats.averageRisk
    );

  $("riskHighest").textContent =
    formatMoney(
      stats.highestRisk
    );

  $("riskLowest").textContent =
    formatMoney(
      stats.lowestRisk
    );

  $("riskStd").textContent =
    formatMoney(
      stats.riskStd
    );

  $("riskAboveAvg").textContent =
    stats.aboveAverageRisk;

  $("avgRealizedR").textContent =
    `${stats.averageRealizedR.toFixed(2)}R`;
}


/* =========================================================
   INSIGHTS
========================================================= */

function renderInsights(
  trades,
  stats
) {

  const container =
    $("analyticsInsights");

  container.innerHTML = "";


  if (!trades.length) {

    container.innerHTML =
      `<div class="insight">
        Add some trades to generate analytics insights.
      </div>`;

    return;
  }


  const insights = [];


  insights.push(
    `You have recorded <strong>${stats.total}</strong> trades in the selected period.`
  );


  insights.push(
    `Your recorded win rate is <strong>${formatPct(stats.winRate)}</strong> with ${stats.wins} wins and ${stats.losses} losses.`
  );


  insights.push(
    `Your total P/L for this period is <strong>${formatMoney(stats.totalPL)}</strong>.`
  );


  if (stats.total > 0) {

    insights.push(
      `Your average P/L per trade is <strong>${formatMoney(stats.averagePL)}</strong>.`
    );
  }


  if (stats.averageWin) {

    insights.push(
      `Your average winning trade is <strong>${formatMoney(stats.averageWin)}</strong>.`
    );
  }


  if (stats.averageLoss) {

    insights.push(
      `Your average losing trade is <strong>${formatMoney(stats.averageLoss)}</strong>.`
    );
  }


  if (stats.averageRisk) {

    insights.push(
      `Your average recorded risk is <strong>${formatMoney(stats.averageRisk)}</strong>.`
    );
  }


  if (stats.bestTrade) {

    insights.push(
      `Your highest individual P/L in this period is <strong>${formatMoney(stats.bestTrade)}</strong>.`
    );
  }


  if (stats.worstTrade) {

    insights.push(
      `Your lowest individual P/L in this period is <strong>${formatMoney(stats.worstTrade)}</strong>.`
    );
  }


  if (stats.maxDrawdown) {

    insights.push(
      `The maximum recorded drawdown is <strong>${formatMoney(stats.maxDrawdown)}</strong>.`
    );
  }


  const categories = [
    ["Trading Type","tradingType"],
    ["Pair","pair"],
    ["Direction","direction"],
    ["Strategy","strategy"],
    ["Session","session"],
    ["Emotion","emotion"],
    ["Mistake","mistake"]
  ];


  for (
    const [label,key]
    of categories
  ) {

    const groups =
      groupByCategory(
        trades,
        key
      );

    if (!groups.length) continue;

    const highestCount =
      groups[0];

    insights.push(
      `Your highest trade count for <strong>${label}</strong> is <strong>${escapeHTML(highestCount.category)}</strong> with ${highestCount.trades} trades.`
    );
  }


  for (
    const text
    of insights
  ) {

    const div =
      document.createElement(
        "div"
      );

    div.className =
      "insight";

    div.innerHTML =
      text;

    container.appendChild(
      div
    );
  }
}


/* =========================================================
   CANVAS LINE CHART
========================================================= */

function drawLineChart(
  canvas,
  values,
  options = {}
) {

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      300,
      Math.floor(rect.width)
    );

  const height =
    Math.max(
      190,
      Math.floor(rect.height)
    );

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  if (!values.length) {

    ctx.fillStyle =
      "#8c929e";

    ctx.font =
      "12px Arial";

    ctx.textAlign =
      "center";

    ctx.fillText(
      "No data available",
      width / 2,
      height / 2
    );

    return;
  }


  const padding = {
    left: 12,
    right: 12,
    top: 20,
    bottom: 25
  };


  let min =
    Math.min(...values);

  let max =
    Math.max(...values);


  if (
    options.positiveBaseline &&
    Number.isFinite(
      options.baseline
    )
  ) {

    min =
      Math.min(
        min,
        options.baseline
      );

    max =
      Math.max(
        max,
        options.baseline
      );
  }


  if (min === max) {

    min -= 1;
    max += 1;
  }


  const range =
    max - min;


  /* grid */

  ctx.strokeStyle =
    "rgba(255,255,255,.06)";

  ctx.lineWidth =
    1;

  for (
    let i = 0;
    i < 5;
    i++
  ) {

    const y =
      padding.top +
      (
        i / 4
      ) *
      (
        height -
        padding.top -
        padding.bottom
      );

    ctx.beginPath();

    ctx.moveTo(
      padding.left,
      y
    );

    ctx.lineTo(
      width -
      padding.right,
      y
    );

    ctx.stroke();
  }


  /* baseline */

  if (
    options.positiveBaseline &&
    Number.isFinite(
      options.baseline
    )
  ) {

    const y =
      padding.top +
      (
        max -
        options.baseline
      ) /
      range *
      (
        height -
        padding.top -
        padding.bottom
      );

    ctx.strokeStyle =
      "rgba(214,174,85,.35)";

    ctx.beginPath();

    ctx.moveTo(
      padding.left,
      y
    );

    ctx.lineTo(
      width -
      padding.right,
      y
    );

    ctx.stroke();
  }


  const plotWidth =
    width -
    padding.left -
    padding.right;

  const plotHeight =
    height -
    padding.top -
    padding.bottom;


  const points =
    values.map(
      (value,index) => {

        const x =
          values.length === 1
            ? width / 2
            : padding.left +
              (
                index /
                (values.length - 1)
              ) *
              plotWidth;

        const y =
          padding.top +
          (
            max -
            value
          ) /
          range *
          plotHeight;

        return {
          x,
          y
        };
      }
    );


  /* area */

  ctx.beginPath();

  ctx.moveTo(
    points[0].x,
    height -
    padding.bottom
  );

  for (
    const p of points
  ) {

    ctx.lineTo(
      p.x,
      p.y
    );
  }

  ctx.lineTo(
    points[points.length - 1].x,
    height -
    padding.bottom
  );

  ctx.closePath();

  ctx.fillStyle =
    "rgba(214,174,85,.08)";

  ctx.fill();


  /* line */

  ctx.beginPath();

  points.forEach(
    (p,index) => {

      if (index === 0) {

        ctx.moveTo(
          p.x,
          p.y
        );

      } else {

        ctx.lineTo(
          p.x,
          p.y
        );
      }
    }
  );

  ctx.strokeStyle =
    "#d6ae55";

  ctx.lineWidth =
    2;

  ctx.stroke();


  /* last point */

  const last =
    points[points.length - 1];

  ctx.beginPath();

  ctx.arc(
    last.x,
    last.y,
    3,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#f0cf79";

  ctx.fill();
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const stats =
    calculateAnalytics(
      state.trades
    );

  $("dashTotalTrades").textContent =
    stats.total;

  $("dashWinRate").textContent =
    formatPct(
      stats.winRate
    );

  $("dashTotalPL").textContent =
    formatMoney(
      stats.totalPL
    );

  $("dashProfitFactor").textContent =
    Number.isFinite(
      stats.profitFactor
    )
      ? stats.profitFactor.toFixed(2)
      : "∞";

  $("dashAvgPL").textContent =
    formatMoney(
      stats.averagePL
    );

  $("dashDrawdown").textContent =
    formatMoney(
      -stats.maxDrawdown
    );


  drawLineChart(
    $("dashboardEquityChart"),
    stats.equityPoints,
    {
      baseline:
        state.settings.startingBalance,

      positiveBaseline: true
    }
  );


  const body =
    $("recentTradesBody");

  body.innerHTML = "";


  const recent =
    state.trades
      .slice(0,8);


  if (!recent.length) {

    body.innerHTML =
      `<tr>
        <td colspan="5" class="empty">
          No trades yet.
        </td>
      </tr>`;

    return;
  }


  for (
    const trade of recent
  ) {

    const row =
      document.createElement(
        "tr"
      );

    const pl =
      num(trade.profitLoss);

    const resultClass =
      trade.result === "Win"
        ? "win"
        : trade.result === "Loss"
          ? "loss"
          : "neutral";


    row.innerHTML = `

      <td>
        ${formatDate(
          trade.date
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.pair
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.tradingType
        )}
      </td>

      <td class="${resultClass}">
        ${escapeHTML(
          trade.result
        )}
      </td>

      <td class="${pl >= 0 ? "win" : "loss"}">
        ${formatMoney(pl)}
      </td>

    `;

    body.appendChild(
      row
    );
  }
}


/* =========================================================
   JOURNAL FILTERS
========================================================= */

[
  "filterResult",
  "filterTradingType",
  "filterPair",
  "filterDate",
  "filterSearch"
]
  .forEach(id => {

    $(id).addEventListener(
      "input",
      renderJournal
    );

    $(id).addEventListener(
      "change",
      renderJournal
    );
  });


$("clearFilters")
  .addEventListener(
    "click",
    () => {

      $("filterResult").value =
        "";

      $("filterTradingType").value =
        "";

      $("filterPair").value =
        "";

      $("filterDate").value =
        "";

      $("filterSearch").value =
        "";

      renderJournal();
    }
  );


function populatePairFilter() {

  const select =
    $("filterPair");

  const current =
    select.value;

  const pairs =
    [...new Set(
      state.trades
        .map(
          t => t.pair
        )
        .filter(Boolean)
    )]
      .sort();


  select.innerHTML =
    `<option value="">All</option>`;


  for (
    const pair
    of pairs
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      pair;

    option.textContent =
      pair;

    select.appendChild(
      option
    );
  }


  if (
    pairs.includes(current)
  ) {

    select.value =
      current;
  }
}


function getFilteredJournalTrades() {

  const result =
    $("filterResult").value;

  const type =
    $("filterTradingType").value;

  const pair =
    $("filterPair").value;

  const date =
    $("filterDate").value;

  const search =
    $("filterSearch").value
      .trim()
      .toLowerCase();


  return state.trades.filter(
    trade => {

      if (
        result &&
        trade.result !== result
      ) {
        return false;
      }

      if (
        type &&
        trade.tradingType !== type
      ) {
        return false;
      }

      if (
        pair &&
        trade.pair !== pair
      ) {
        return false;
      }

      if (
        date &&
        getTradeDateString(
          trade
        ) !== date
      ) {
        return false;
      }


      if (search) {

        const text =
          [
            trade.tradeId,
            trade.pair,
            trade.tradingType,
            trade.direction,
            trade.strategy,
            trade.session,
            trade.emotion,
            trade.mistake,
            trade.notes
          ]
            .join(" ")
            .toLowerCase();

        if (
          !text.includes(search)
        ) {
          return false;
        }
      }


      return true;
    }
  );
}


function renderJournal() {

  populatePairFilter();

  const trades =
    getFilteredJournalTrades();

  const body =
    $("journalBody");

  body.innerHTML = "";


  if (!trades.length) {

    body.innerHTML =
      `<tr>
        <td class="empty" colspan="11">
          No trades found.
        </td>
      </tr>`;

    return;
  }


  for (
    const trade
    of trades
  ) {

    const row =
      document.createElement(
        "tr"
      );

    const pl =
      num(trade.profitLoss);

    const resultClass =
      trade.result === "Win"
        ? "win"
        : trade.result === "Loss"
          ? "loss"
          : "neutral";


    row.innerHTML = `

      <td>
        ${escapeHTML(
          trade.tradeId
        )}
      </td>

      <td>
        ${formatDate(
          trade.date
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.pair
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.tradingType
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.direction
        )}
      </td>

      <td>
        ${escapeHTML(
          trade.strategy
        )}
      </td>

      <td>
        ${trade.entry || "-"}
      </td>

      <td>
        ${formatRR(
          trade.rr
        )}
      </td>

      <td class="${resultClass}">
        ${escapeHTML(
          trade.result
        )}
      </td>

      <td class="${pl >= 0 ? "win" : "loss"}">
        ${formatMoney(pl)}
      </td>

      <td>

        <div class="action-buttons">

          <button
            class="action-btn"
            onclick="editTrade('${escapeHTML(trade._docId)}')"
          >
            Edit
          </button>

          <button
            class="action-btn delete"
            onclick="deleteTrade('${escapeHTML(trade._docId)}')"
          >
            Delete
          </button>

        </div>

      </td>

    `;

    body.appendChild(
      row
    );
  }
}


/* =========================================================
   RISK CALCULATOR
========================================================= */

[
  "calcBalance",
  "calcRiskPercent",
  "calcEntry",
  "calcSL",
  "calcTP",
  "calcDirection"
]
  .forEach(id => {

    $(id).addEventListener(
      "input",
      calculateRisk
    );

    $(id).addEventListener(
      "change",
      calculateRisk
    );
  });


function calculateRisk() {

  const balance =
    num(
      $("calcBalance").value
    );

  const riskPercent =
    num(
      $("calcRiskPercent").value
    );

  const entry =
    num(
      $("calcEntry").value
    );

  const sl =
    num(
      $("calcSL").value
    );

  const tp =
    num(
      $("calcTP").value
    );

  const direction =
    $("calcDirection").value;


  const riskAmount =
    balance *
    riskPercent /
    100;


  const stopDistance =
    Math.abs(
      entry - sl
    );


  let rr = 0;


  if (
    entry > 0 &&
    sl > 0 &&
    tp > 0
  ) {

    let risk = 0;
    let reward = 0;

    if (
      direction === "Buy"
    ) {

      risk =
        entry - sl;

      reward =
        tp - entry;

    } else {

      risk =
        sl - entry;

      reward =
        entry - tp;
    }

    if (
      risk > 0 &&
      reward > 0
    ) {

      rr =
        reward /
        risk;
    }
  }


  const lot =
    stopDistance > 0
      ? riskAmount /
        (
          stopDistance *
          100
        )
      : 0;


  $("calcRiskAmount").textContent =
    formatMoney(
      riskAmount
    );

  $("calcStopDistance").textContent =
    stopDistance
      ? stopDistance.toFixed(3)
      : "0";

  $("calcRR").textContent =
    rr
      ? `1:${rr.toFixed(2)}`
      : "0";

  $("calcLot").textContent =
    lot
      ? lot.toFixed(2)
      : "0.00";
}


/* =========================================================
   CALENDAR
========================================================= */

$("prevMonth")
  .addEventListener(
    "click",
    () => {

      state.calendarDate.setMonth(
        state.calendarDate.getMonth() - 1
      );

      renderCalendar();
    }
  );


$("nextMonth")
  .addEventListener(
    "click",
    () => {

      state.calendarDate.setMonth(
        state.calendarDate.getMonth() + 1
      );

      renderCalendar();
    }
  );


function renderCalendar() {

  const date =
    state.calendarDate;

  const year =
    date.getFullYear();

  const month =
    date.getMonth();


  $("calendarMonthTitle")
    .textContent =
    date.toLocaleDateString(
      undefined,
      {
        month: "long",
        year: "numeric"
      }
    );


  const grid =
    $("calendarGrid");

  grid.innerHTML = "";


  const first =
    new Date(
      year,
      month,
      1
    );

  const days =
    new Date(
      year,
      month + 1,
      0
    ).getDate();


  let start =
    first.getDay() - 1;

  if (start < 0) {
    start = 6;
  }


  for (
    let i = 0;
    i < start;
    i++
  ) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "calendar-day empty";

    grid.appendChild(
      empty
    );
  }


  for (
    let day = 1;
    day <= days;
    day++
  ) {

    const dateObj =
      new Date(
        year,
        month,
        day
      );

    const dateKey =
      dateString(
        dateObj
      );


    const trades =
      state.trades.filter(
        trade =>
          getTradeDateString(
            trade
          ) === dateKey
      );


    const pl =
      trades.reduce(
        (sum,trade) =>
          sum +
          num(
            trade.profitLoss
          ),
        0
      );


    const wins =
      trades.filter(
        t =>
          t.result === "Win"
      ).length;

    const losses =
      trades.filter(
        t =>
          t.result === "Loss"
      ).length;


    const cell =
      document.createElement(
        "div"
      );

    cell.className =
      "calendar-day";


    if (
      dateKey ===
      todayString()
    ) {

      cell.classList.add(
        "today"
      );
    }


    if (
      state.selectedCalendarDate ===
      dateKey
    ) {

      cell.classList.add(
        "selected"
      );
    }


    if (
      trades.length
    ) {

      if (
        pl > 0
      ) {

        cell.classList.add(
          "day-win"
        );

      } else if (
        pl < 0
      ) {

        cell.classList.add(
          "day-loss"
        );
      }
    }


    cell.innerHTML = `

      <div class="day-number">
        ${day}
      </div>

      ${
        trades.length
          ? `
            <div class="day-count">
              ${trades.length} trade${trades.length > 1 ? "s" : ""}
            </div>

            <div class="day-count">
              ${wins}W / ${losses}L
            </div>

            <div class="day-pl ${pl >= 0 ? "win" : "loss"}">
              ${formatMoney(pl)}
            </div>
          `
          : ""
      }

    `;


    cell.addEventListener(
      "click",
      () => {

        state.selectedCalendarDate =
          dateKey;

        renderCalendar();

        renderCalendarDetails(
          dateKey
        );
      }
    );


    grid.appendChild(
      cell
    );
  }


  if (
    state.selectedCalendarDate
  ) {

    renderCalendarDetails(
      state.selectedCalendarDate
    );

  } else {

    $("calendarDetails").innerHTML =
      `<div class="empty">
        Select a date to view trades.
      </div>`;
  }
}


function renderCalendarDetails(
  dateKey
) {

  const trades =
    state.trades.filter(
      trade =>
        getTradeDateString(
          trade
        ) === dateKey
    );


  $("selectedDateTitle")
    .textContent =
    formatDate(
      dateKey
    );


  const container =
    $("calendarDetails");


  if (!trades.length) {

    container.innerHTML =
      `<div class="empty">
        No trades on this date.
      </div>`;

    return;
  }


  container.innerHTML =
    `<div class="calendar-detail-list"></div>`;


  const list =
    container.firstElementChild;


  for (
    const trade
    of trades
  ) {

    const item =
      document.createElement(
        "div"
      );

    const pl =
      num(
        trade.profitLoss
      );


    item.className =
      "calendar-detail-item";


    item.innerHTML = `

      <div>

        <strong>
          ${escapeHTML(
            trade.pair
          )}
        </strong>

        <div class="muted-small">
          ${escapeHTML(
            trade.tradingType
          )}
          ·
          ${escapeHTML(
            trade.strategy
          )}
          ·
          ${escapeHTML(
            trade.direction
          )}
        </div>

      </div>

      <strong class="${pl >= 0 ? "win" : "loss"}">
        ${formatMoney(pl)}
      </strong>

    `;


    list.appendChild(
      item
    );
  }
}


/* =========================================================
   SETTINGS SAVE
========================================================= */

$("saveSettingsBtn")
  .addEventListener(
    "click",
    async () => {

      if (!state.user) return;

      const startingBalance =
        num(
          $("startingBalance")
            .value
        );

      const currency =
        $("currency").value;

      const displayName =
        $("settingsName")
          .value
          .trim();


      try {

        await setDoc(
          doc(
            db,
            "users",
            state.user.uid,
            "settings",
            "profile"
          ),
          {
            startingBalance,
            currency,
            displayName,
            updatedAt:
              serverTimestamp()
          },
          {
            merge: true
          }
        );


        state.settings = {
          startingBalance,
          currency,
          displayName
        };


        updateUserUI();

        renderEverything();

        showToast(
          "Settings saved."
        );

      } catch (error) {

        console.error(
          error
        );

        showToast(
          "Could not save settings."
        );
      }
    }
  );


/* =========================================================
   CSV EXPORT
========================================================= */

function exportCSV() {

  if (!state.trades.length) {

    showToast(
      "No trades to export."
    );

    return;
  }


  const headers = [
    "Trade ID",
    "Date",
    "Pair",
    "Trading Type",
    "Direction",
    "Strategy",
    "Session",
    "Market Bias",
    "Entry",
    "SL",
    "TP",
    "RR",
    "Risk Amount",
    "Lot Size",
    "Result",
    "P/L",
    "Confidence",
    "Emotion",
    "Mistake",
    "Notes"
  ];


  const rows =
    state.trades.map(
      trade => [

        trade.tradeId,
        trade.date,
        trade.pair,
        trade.tradingType,
        trade.direction,
        trade.strategy,
        trade.session,
        trade.bias,
        trade.entry,
        trade.sl,
        trade.tp,
        trade.rr,
        trade.riskAmount,
        trade.lotSize,
        trade.result,
        trade.profitLoss,
        trade.confidence,
        trade.emotion,
        trade.mistake,
        trade.notes
      ]
    );


  const csv = [
    headers,
    ...rows
  ]
    .map(
      row =>
        row
          .map(
            value =>
              `"${String(
                value ?? ""
              ).replaceAll(
                '"',
                '""'
              )}"`
          )
          .join(",")
    )
    .join("\n");


  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );

  a.href =
    url;

  a.download =
    `ujr-fx-trading-journal-${todayString()}.csv`;

  a.click();

  URL.revokeObjectURL(
    url
  );
}


/* =========================================================
   RENDER EVERYTHING
========================================================= */

function renderEverything() {

  renderDashboard();

  renderJournal();

  renderAnalytics();

  renderCalendar();

  calculateRisk();
}


/* =========================================================
   WINDOW RESIZE
========================================================= */

let resizeTimer;

window.addEventListener(
  "resize",
  () => {

    clearTimeout(
      resizeTimer
    );

    resizeTimer =
      setTimeout(
        () => {

          renderDashboard();

          if (
            $("analyticsPage")
              .classList
              .contains(
                "active-page"
              )
          ) {

            renderAnalytics();
          }

        },
        120
      );
  }
);


/* =========================================================
   STARTUP
========================================================= */

$("tradeDate").value =
  todayString();

calculateRisk();
