// admin.js
// Frontend logic for EMRSystem admin.html
// Requirements: admin.html must include web3.js (we used web3@latest in the html).
// Make sure to set CONTRACT_ADDRESS to your deployed EMRSystem contract address.

const CONTRACT_ADDRESS = ""; // Your contract address
const ABI = [];  // Your contract abi

// admin.js — complete admin dashboard with Connect MetaMask added

// preserve your globals
let web3;
let contract;
let accounts = [];
let currentAccount = null;
let contractOwner = null;

const el = id => document.getElementById(id);

// ---------------------- Helper utilities ----------------------
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(text, n) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n) + "…" : text;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied to clipboard: " + text);
  }).catch(err => {
    console.error("Clipboard failed:", err);
    prompt("Copy manually:", text);
  });
}

// ---------------------- Record modal ----------------------
async function viewRecordModal(recordId) {
  try {
    const rec = await contract.methods.viewRecord(recordId).call({ from: currentAccount });

    // Remove any previous modal if open
    const oldModal = document.getElementById("recordModal");
    if (oldModal) oldModal.remove();

    // Create the modal backdrop
    const modal = document.createElement("div");
    modal.id = "recordModal";
    modal.className =
      "fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4";

    // Create the modal content
    modal.innerHTML = `
      <div class="bg-gray-900 glass max-w-lg w-full rounded-2xl shadow-2xl p-6 relative animate-fadeIn">
        <button id="closeModal" class="absolute top-3 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        <h2 class="text-2xl font-semibold mb-4 text-teal-300">Record #${rec.recordId}</h2>
        
        <div class="space-y-3 text-gray-200">
          <p><span class="text-gray-400">📅 Date:</span> ${escapeHtml(rec.dateOfVisit || "—")}</p>
          <p><span class="text-gray-400">👨‍⚕️ Doctor:</span> <span class="font-mono">${rec.doctor}</span></p>
          <p><span class="text-gray-400">🧍 Patient:</span> <span class="font-mono">${rec.patient}</span></p>
          <p><span class="text-gray-400">📋 Diagnosis:</span><br>${escapeHtml(rec.diagnosis || "—")}</p>
          <p><span class="text-gray-400">💊 Treatment:</span><br>${escapeHtml(rec.treatment || "—")}</p>
          <p><span class="text-gray-400">🔗 IPFS:</span> ${
            rec.ipfsHash
              ? `<a href="https://ipfs.io/ipfs/${encodeURIComponent(rec.ipfsHash)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline">${escapeHtml(rec.ipfsHash)}</a>`
              : "—"
          }</p>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button class="btn px-4 py-2" id="copyRecordDoctor">Copy Doctor</button>
          <button class="btn px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white" id="closeBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById("closeModal").onclick = () => modal.remove();
    document.getElementById("closeBtn").onclick = () => modal.remove();
    document.getElementById("copyRecordDoctor").onclick = () =>
      copyToClipboard(rec.doctor);

  } catch (err) {
    console.error("Failed to fetch record", recordId, err);
    alert("Failed to fetch record: " + (err?.message || err));
  }
}
// ---------------------- Rendering functions ----------------------
async function renderOverviewStats() {
  try {
    const totalRecords = await contract.methods.recordCount().call();
    el("totalRecords").innerText = String(totalRecords);

    const doctorEvents = await contract.getPastEvents("DoctorRegistered", { fromBlock: 0, toBlock: "latest" });
    const patientEvents = await contract.getPastEvents("PatientRegistered", { fromBlock: 0, toBlock: "latest" });

    const uniqueDoctors = [...new Set(doctorEvents.map(e => e.returnValues.doctor.toLowerCase()))];
    const uniquePatients = [...new Set(patientEvents.map(e => e.returnValues.patient.toLowerCase()))];

    el("totalDoctors").innerText = String(uniqueDoctors.length);
    el("totalPatients").innerText = String(uniquePatients.length);
  } catch (err) {
    console.error("Error rendering overview stats:", err);
  }
}

async function renderDoctors() {
  const container = el("doctorList");
  container.innerHTML = "";
  try {
    const events = await contract.getPastEvents("DoctorRegistered", { fromBlock: 0, toBlock: "latest" });
    if (!events.length) {
      container.innerHTML = `<div class="glass p-4">No doctors registered yet.</div>`;
      return;
    }

    const map = new Map();
    events.forEach(ev => {
      const addr = ev.returnValues.doctor;
      map.set(addr.toLowerCase(), { address: addr, name: ev.returnValues.name, specialization: ev.returnValues.specialization });
    });

    for (const [addrLower, info] of map) {
      let reg = { name: info.name, specialization: info.specialization, registered: true };
      try {
        const doc = await contract.methods.doctors(info.address).call();
        if (doc.registered === false) reg.registered = false;
        else {
          reg.name = doc.name || reg.name;
          reg.specialization = doc.specialization || reg.specialization;
          reg.registered = doc.registered;
        }
      } catch (err) {
        console.warn("doctors getter failed for", info.address, err);
      }

      const card = document.createElement("div");
      card.className = "glass p-4 flex items-center justify-between";
      card.innerHTML = `
        <div>
          <div class="text-sm text-gray-300">Address</div>
          <div class="font-mono text-sm mb-1">${info.address}</div>
          <div class="text-xl font-semibold">${escapeHtml(reg.name || "—")}</div>
          <div class="text-sm text-gray-400">${escapeHtml(reg.specialization || "—")}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-gray-300">Registered</div>
          <div class="text-lg font-bold ${reg.registered ? 'text-teal-300' : 'text-red-300'}">${reg.registered ? 'Yes' : 'No'}</div>
          <button class="btn mt-3 px-4 py-2" onclick="copyToClipboard('${info.address}')">Copy</button>
        </div>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    console.error("Error rendering doctors:", err);
    container.innerHTML = `<div class="glass p-4">Failed to load doctors (see console).</div>`;
  }
}

async function renderPatients() {
  const container = el("patientList");
  container.innerHTML = "";
  try {
    const events = await contract.getPastEvents("PatientRegistered", { fromBlock: 0, toBlock: "latest" });
    if (!events.length) {
      container.innerHTML = `<div class="glass p-4">No patients registered yet.</div>`;
      return;
    }

    const map = new Map();
    events.forEach(ev => {
      const addr = ev.returnValues.patient;
      map.set(addr.toLowerCase(), { address: addr, name: ev.returnValues.name });
    });

    for (const [addrLower, info] of map) {
      let reg = { name: info.name, registered: true };
      try {
        const pat = await contract.methods.patients(info.address).call();
        if (pat.registered === false) reg.registered = false;
        else reg.name = pat.name || reg.name;
      } catch (err) {
        console.warn("patients getter failed for", info.address, err);
      }

      const card = document.createElement("div");
      card.className = "glass p-4 flex items-center justify-between";
      card.innerHTML = `
        <div>
          <div class="text-sm text-gray-300">Address</div>
          <div class="font-mono text-sm mb-1">${info.address}</div>
          <div class="text-xl font-semibold">${escapeHtml(reg.name || "—")}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-gray-300">Registered</div>
          <div class="text-lg font-bold ${reg.registered ? 'text-teal-300' : 'text-red-300'}">${reg.registered ? 'Yes' : 'No'}</div>
          <button class="btn mt-3 px-4 py-2" onclick="copyToClipboard('${info.address}')">Copy</button>
        </div>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    console.error("Error rendering patients:", err);
    container.innerHTML = `<div class="glass p-4">Failed to load patients (see console).</div>`;
  }
}

async function renderRecords() {
  const container = el("recordList");
  container.innerHTML = "";
  try {
    const totalRecords = parseInt(await contract.methods.recordCount().call());
    if (!totalRecords) {
      container.innerHTML = `<div class="glass p-4">No records created yet.</div>`;
      return;
    }

    for (let i = 1; i <= totalRecords; i++) {
      try {
        const rec = await contract.methods.viewRecord(i).call({ from: currentAccount });
        const card = document.createElement("div");
        card.className = "glass p-4 hover:bg-gray-800/60 transition-all rounded-xl shadow-lg";
        card.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <div class="text-sm text-gray-400">Record #${rec.recordId} • ${escapeHtml(rec.dateOfVisit || "Unknown date")}</div>
              <div class="text-xl font-semibold mt-2 text-white">${escapeHtml(truncate(rec.diagnosis || "—", 120))}</div>
              <div class="text-sm text-gray-400 mt-1">Treatment: ${escapeHtml(truncate(rec.treatment || "—", 160))}</div>
              <div class="text-xs text-gray-500 mt-2">Doctor: <span class="font-mono">${rec.doctor}</span></div>
              <div class="text-xs text-gray-500">Patient: <span class="font-mono">${rec.patient}</span></div>
            </div>
            <div class="text-right">
              <button class="btn px-3 py-2 mb-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg transition-all" onclick="viewRecordModal(${rec.recordId})">View</button>
              <button class="btn px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg" onclick="copyToClipboard('${rec.doctor}')">Copy</button>
            </div>
          </div>
        `;
        container.appendChild(card);
      } catch (err) {
        console.warn("Could not load record", i, err);
        const card = document.createElement("div");
        card.className = "glass p-4 text-red-300";
        card.innerHTML = `<div>Record #${i} — failed to load. See console for details.</div>`;
        container.appendChild(card);
      }
    }
  } catch (err) {
    console.error("Error rendering records:", err);
    container.innerHTML = `<div class="glass p-4 text-red-400">Failed to load records (see console).</div>`;
  }
}

// ---------------------- UI: show/hide sections ----------------------
function showSection(sectionId) {
  const sections = ["overviewSection","doctorsSection","patientsSection","recordsSection","ownershipSection"];
  sections.forEach(s => {
    const elSec = document.getElementById(s);
    if (!elSec) return;
    if (s === sectionId) elSec.classList.remove("hidden");
    else elSec.classList.add("hidden");
  });
}

// ---------------------- loadOwner, warnings ----------------------
async function loadOwner() {
  try {
    contractOwner = await contract.methods.owner().call();
    if (currentAccount && contractOwner.toLowerCase() !== currentAccount.toLowerCase()) {
      showAdminWarning();
    } else {
      hideAdminWarning();
    }
  } catch (err) {
    console.error("Failed to load owner:", err);
  }
}

function showAdminWarning() {
  if (!document.getElementById("ownerWarning")) {
    const main = document.querySelector("main");
    const warn = document.createElement("div");
    warn.id = "ownerWarning";
    warn.className = "glass p-3 mb-4 text-yellow-200";
    warn.innerHTML = `<strong>Not owner:</strong> You are connected as <span style="font-family:monospace">${currentAccount}</span>. Admin actions will fail unless you switch to the contract owner account.`;
    main.prepend(warn);
  }
}

function hideAdminWarning() {
  const w = document.getElementById("ownerWarning");
  if (w) w.remove();
}

// ---------------------- refresh and data flow ----------------------
async function refreshAllData() {
  if (!contract || !currentAccount) return;
  console.log("Connected account:", currentAccount);
  await loadOwner();
  await Promise.all([
    renderOverviewStats(),
    renderDoctors(),
    renderPatients(),
    renderRecords()
  ]);
}

// ---------------------- Init and Connect logic ----------------------
async function init() {
  // Do not auto-request accounts on page load; bind UI and wait for explicit connect
  if (!window.ethereum) {
    alert("MetaMask (or another injected web3 provider) is required to use this admin dashboard.");
    setupUIBindings(); // still set up bindings so user can see UI messages
    return;
  }

  web3 = new Web3(window.ethereum);
  contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

  setupUIBindings();

  // Listen for account/chain changes
  window.ethereum.on("accountsChanged", async (accs) => {
    accounts = accs;
    currentAccount = accounts[0] || null;
    updateAdminConnectionUI();
    if (currentAccount) {
      try {
        // make sure contract is initialized
        if (!contract) contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
        await refreshAllData();
      } catch (err) {
        console.error("MetaMask connection failed:", err);
        el("adminConnectMsg").innerText = "❌ Connection failed or denied by user.";
      }
    }
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

// Explicit connect triggered by button
async function connectAdminWallet() {
  if (!window.ethereum) {
    el("adminConnectMsg").innerText = "🦊 Please install MetaMask.";
    return;
  }

  try {
    accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    currentAccount = accounts[0];
    web3 = new Web3(window.ethereum);
    contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    await loadOwner();

    // Prevent admin wallet from also being a registered doctor/patient
    try {
      const doc = await contract.methods.doctors(currentAccount).call();
      const pat = await contract.methods.patients(currentAccount).call();
      if (doc.registered || pat.registered) {
        el("adminConnectMsg").innerText = "❌ This address is already registered as a doctor or patient.";
        el("adminWalletAddress").innerText = "";
        return;
      }
    } catch (err) {
      // If calls fail, still allow but notify
      console.warn("Role check failed:", err);
    }

    // Update UI
    el("adminWalletAddress").innerText = `Connected: ${currentAccount}`;
    el("connectAdminWallet").textContent = "🟢 Connected";
    if (currentAccount && contractOwner && currentAccount.toLowerCase() !== contractOwner.toLowerCase()) {
      el("adminConnectMsg").innerText = "⚠️ Warning: You are not the contract owner.";
    } else {
      el("adminConnectMsg").innerText = "✅ Connected as admin (owner).";
    }

    // Refresh data
    await refreshAllData();
  } catch (err) {
    console.error("MetaMask connection failed:", err);
    el("adminConnectMsg").innerText = "❌ Connection failed or denied by user.";
  }
}

// ---------------------- UI Bindings ----------------------
function setupUIBindings() {
  // Connect Admin button (added to HTML)
  const connectBtn = el("connectAdminWallet");
  if (connectBtn) connectBtn.addEventListener("click", connectAdminWallet);

  // Sidebar buttons
  if (el("btnOverview")) el("btnOverview").addEventListener("click", showSection.bind(null, "overviewSection"));
  if (el("btnDoctors")) el("btnDoctors").addEventListener("click", showSection.bind(null, "doctorsSection"));
  if (el("btnPatients")) el("btnPatients").addEventListener("click", showSection.bind(null, "patientsSection"));
  if (el("btnRecords")) el("btnRecords").addEventListener("click", showSection.bind(null, "recordsSection"));
  if (el("btnTransferOwnership")) el("btnTransferOwnership").addEventListener("click", showSection.bind(null, "ownershipSection"));

  // Transfer owner
  if (el("transferBtn")) {
    el("transferBtn").addEventListener("click", async () => {
      const newOwner = el("newOwner").value.trim();
      if (!web3.utils.isAddress(newOwner)) {
        alert("Please enter a valid Ethereum address.");
        return;
      }
      try {
        await contract.methods.transferOwnership(newOwner).send({ from: currentAccount });
        alert("Ownership transferred successfully.");
        await loadOwner();
        await refreshAllData();
        el("newOwner").value = "";
        el("transferMsg").innerText = "✅ Ownership transferred successfully!";
        setTimeout(() => (el("transferMsg").innerText = ""), 4000);
      } catch (err) {
        console.error(err);
        alert("Transfer failed: " + (err?.message || err));
      }
    });
  }
}

// ---------------------- on-load ----------------------
window.addEventListener("load", async () => {
  try {
    await init();
  } catch (err) {
    console.error("Initialization failed", err);
  }
});

// expose helpers used by inline HTML
window.viewRecordModal = viewRecordModal;
window.copyToClipboard = copyToClipboard;


