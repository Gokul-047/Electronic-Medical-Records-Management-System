// index.js — Frontend logic for EMRSystem (Doctor & Patient Portal)

// =============== CONFIGURATION ===============
const CONTRACT_ADDRESS = ""; // Your contract address

// =============== ABI ===============
const CONTRACT_ABI = []; //Your contract abi

let web3;
let contract;
let accounts = [];

// ====================== HELPERS ======================
function showMessage(id, text, type = "info", autoHide = false) {
  const el = document.getElementById(id);
  if (!el) return;
  let color =
    type === "error"
      ? "text-red-400"
      : type === "success"
      ? "text-green-400"
      : "text-gray-300";
  el.innerHTML = `<p class="${color} mt-3">${text}</p>`;

  if (autoHide) {
    setTimeout(() => {
      el.innerHTML = "";
    }, 3000); // hide after 3s
  }
}

function clearFields(selector) {
  document.querySelectorAll(selector).forEach((input) => {
    if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") {
      input.value = "";
    }
  });
}

function enableDoctorFields() {
  document
    .querySelectorAll("#doctorDashboard input, #doctorDashboard button")
    .forEach((el) => {
      el.disabled = false;
      el.classList.remove("disabled");
    });
}

function enablePatientFields() {
  document
    .querySelectorAll("#patientDashboard input, #patientDashboard button")
    .forEach((el) => {
      el.disabled = false;
      el.classList.remove("disabled");
    });
}

function disableDoctorFields() {
  document
    .querySelectorAll("#doctorDashboard input, #doctorDashboard button")
    .forEach((el) => {
      if (el.id !== "connectDoctorWallet") {
        el.disabled = true;
        el.classList.add("disabled");
      }
    });
}

function disablePatientFields() {
  document
    .querySelectorAll("#patientDashboard input, #patientDashboard button")
    .forEach((el) => {
      if (el.id !== "connectPatientWallet") {
        el.disabled = true;
        el.classList.add("disabled");
      }
    });
}

// ====================== INIT WEB3 ======================
async function initWeb3() {
  if (window.ethereum) {
    web3 = new Web3(window.ethereum);
    try {
      accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
      return accounts[0];
    } catch (err) {
      console.error("MetaMask error:", err);
      return null;
    }
  } else {
    alert("MetaMask not detected. Please install it.");
    return null;
  }
}

// ====================== ROLE CHECK ======================
async function getRoles(address) {
  try {
    const doctor = await contract.methods.doctors(address).call();
    const patient = await contract.methods.patients(address).call();
    return {
      isDoctor: doctor.registered,
      isPatient: patient.registered,
    };
  } catch (e) {
    console.error("Role check failed:", e);
    return { isDoctor: false, isPatient: false };
  }
}

// ====================== DOCTOR PORTAL ======================
async function connectDoctor() {
  const addr = await initWeb3();
  if (!addr)
    return showMessage(
      "doctorConnectMsg",
      "MetaMask connection failed.",
      "error"
    );

  // 🛑 NEW: prevent admin (owner) from connecting as doctor
  const ownerAddress = await contract.methods.owner().call();
  if (addr.toLowerCase() === ownerAddress.toLowerCase()) {
    showMessage(
      "doctorConnectMsg",
      "⚠️ The admin/owner account cannot be used in the doctor portal. Please switch wallet.",
      "error"
    );
    return;
  }

  const { isDoctor, isPatient } = await getRoles(addr);

  if (isPatient) {
    showMessage(
      "doctorConnectMsg",
      "⚠️ This wallet is registered as a patient. Please use another account.",
      "error"
    );
    return;
  }

  enableDoctorFields();
  document.getElementById(
    "doctorWalletStatus"
  ).textContent = `✅ Connected: ${addr}`;
  document.getElementById("connectDoctorWallet").textContent = "🟢 Connected";
  showMessage(
    "doctorConnectMsg",
    "✅ Wallet connected! You can now register or manage records.",
    "success",
    true
  );
}

async function registerDoctor() {
  const name = document.getElementById("doctorName").value.trim();
  const spec = document.getElementById("doctorSpec").value.trim();
  if (!name || !spec)
    return showMessage("doctorMessage", "Please fill all fields.", "error");

  try {
    await contract.methods
      .registerDoctor(name, spec)
      .send({ from: accounts[0], gas: 3000000 });

    showMessage(
      "doctorMessage",
      "👨‍⚕️ Doctor successfully registered!",
      "success",
      true
    );
    clearFields("#doctorDashboard input");
  } catch (e) {
    if (e.code === 4001)
      return showMessage("doctorMessage", "Transaction rejected by user.", "error");
    showMessage("doctorMessage", "Registration failed.", "error");
  }
}

async function createRecord() {
  const patient = document.getElementById("recordPatientAddr").value.trim();
  const diag = document.getElementById("recordDiagnosis").value.trim();
  const treat = document.getElementById("recordTreatment").value.trim();
  const date = document.getElementById("recordDate").value.trim();
  const ipfs = document.getElementById("recordIPFS").value.trim();

  if (!patient || !diag || !treat || !date)
    return showMessage(
      "recordMessage",
      "All fields except IPFS are required.",
      "error"
    );

  try {
    const tx = await contract.methods
      .createRecord(patient, diag, treat, date, ipfs)
      .send({ from: accounts[0], gas: 3000000 });

    // extract event info
    const event = tx.events?.RecordCreated;
    if (event && event.returnValues) {
      const recordId = event.returnValues.recordId;
      const patientAddr = event.returnValues.patient;
      showMessage(
        "recordMessage",
        `🩺 Record #${recordId} created successfully for patient: ${patientAddr}`,
        "success",
        true
      );
    } else {
      showMessage(
        "recordMessage",
        "🩺 Record created successfully!",
        "success",
        true
      );
    }

    // clear input fields after success
    clearFields(
      "#recordPatientAddr, #recordDiagnosis, #recordTreatment, #recordDate, #recordIPFS"
    );
  } catch (e) {
    if (e.code === 4001)
      return showMessage(
        "recordMessage",
        "Transaction cancelled.",
        "error"
      );

    console.error("Record creation failed:", e);
    showMessage("recordMessage", "Failed to create record.", "error");
  }
}


async function viewRecord() {
  const id = document.getElementById("viewRecordId").value.trim();
  const detailsEl = document.getElementById("recordDetails");

  if (!id)
    return showMessage("recordDetails", "Please enter a record ID.", "error");

  try {
    const r = await contract.methods.viewRecord(id).call({ from: accounts[0] });

    // Build details nicely formatted
    const details = `
      <div class="p-4 bg-gray-800 rounded mb-2">
        <p><strong>🆔 Record ID:</strong> ${r.recordId}</p>
        <p><strong>👨‍⚕️ Doctor:</strong> ${r.doctor}</p>
        <p><strong>🧍 Patient:</strong> ${r.patient}</p>
        <p><strong>📋 Diagnosis:</strong> ${r.diagnosis}</p>
        <p><strong>💊 Treatment:</strong> ${r.treatment}</p>
        <p><strong>📅 Date:</strong> ${r.dateOfVisit}</p>
        <p><strong>🔗 IPFS:</strong> ${r.ipfsHash || "N/A"}</p>
      </div>
    `;

    // Display record info
    detailsEl.innerHTML = details;

    // Show short success notice below it
    const msg = document.createElement("p");
    msg.className = "text-green-400 mt-2";
    msg.textContent = "✅ Record fetched successfully!";
    detailsEl.appendChild(msg);

    // Clear field after success
    clearFields("#viewRecordId");

    // Auto-hide success text only (not the record info)
    setTimeout(() => {
      if (msg.parentNode) msg.remove();
    }, 3000);

  } catch (e) {
    console.error(e);
    showMessage("recordDetails", "Failed to fetch record.", "error");
  }
}


// ====================== PATIENT PORTAL ======================
async function connectPatient() {
  const addr = await initWeb3();
  if (!addr)
    return showMessage(
      "patientConnectMsg",
      "❌ MetaMask connection failed.",
      "error"
    );

  // 🛑 NEW: prevent admin (owner) from connecting as patient
  const ownerAddress = await contract.methods.owner().call();
  if (addr.toLowerCase() === ownerAddress.toLowerCase()) {
    showMessage(
      "patientConnectMsg",
      "⚠️ The admin/owner account cannot be used in the patient portal. Please switch wallet.",
      "error"
    );
    return;
  }

  const { isDoctor, isPatient } = await getRoles(addr);

  if (isDoctor) {
    showMessage(
      "patientConnectMsg",
      "⚠️ This wallet is registered as a doctor. Use another account.",
      "error"
    );
    return;
  }

  enablePatientFields();
  document.getElementById(
    "patientWalletStatus"
  ).textContent = `✅ Connected: ${addr}`;
  document.getElementById("connectPatientWallet").textContent = "🟢 Connected";
  showMessage(
    "patientConnectMsg",
    "✅ Wallet connected! You can now register as a patient.",
    "success",
    true
  );
}

async function registerPatient() {
  const name = document.getElementById("patientName").value.trim();
  if (!name)
    return showMessage("patientMessage", "Please enter your name.", "error");

  try {
    await contract.methods
     .registerPatient(name)
     .send({ from: accounts[0], gas: 3000000 });
    showMessage("patientMessage", "🧍 Patient registered successfully!", "success", true);
    clearFields("#patientName");
  } catch (e) {
    if (e.code === 4001)
      return showMessage("patientMessage", "Transaction rejected by user.", "error");
    showMessage("patientMessage", "Registration failed.", "error");
  }
}

async function viewMyRecords() {
  const list = document.getElementById("myRecordsList");
  list.innerHTML = "<p>Loading...</p>";

  try {
    const count = await contract.methods.recordCount().call();
    let html = "";
    for (let i = 1; i <= count; i++) {
      const r = await contract.methods.records(i).call();
      if (r.patient.toLowerCase() === accounts[0].toLowerCase()) {
        html += `
        <div class="p-4 bg-gray-800 rounded mb-2">
          <p><strong>ID:</strong> ${r.recordId}</p>
          <p><strong>Doctor:</strong> ${r.doctor}</p>
          <p><strong>Diagnosis:</strong> ${r.diagnosis}</p>
          <p><strong>Treatment:</strong> ${r.treatment}</p>
          <p><strong>Date:</strong> ${r.dateOfVisit}</p>
        </div>`;
      }
    }
    list.innerHTML = html || "<p>No records found.</p>";
  } catch (e) {
    showMessage("patientMessage", "Failed to fetch records.", "error");
  }
}

async function grantAccess() {
  const viewer = document.getElementById("viewerAddr").value.trim();
  if (!viewer) return showMessage("patientMessage", "Enter viewer address.", "error");

  try {
    await contract.methods
     .grantAccess(viewer)
     .send({ from: accounts[0], gas: 3000000 });

    showMessage("patientMessage", "✅ Access granted successfully!", "success", true);
    clearFields("#viewerAddr");
  } catch (e) {
    if (e.code === 4001)
      return showMessage("patientMessage", "Transaction cancelled.", "error");
    showMessage("patientMessage", "Failed to grant access.", "error");
  }
}

async function revokeAccess() {
  const viewer = document.getElementById("viewerAddr").value.trim();
  if (!viewer) return showMessage("patientMessage", "Enter viewer address.", "error");

  try {
    await contract.methods
     .revokeAccess(viewer)
     .send({ from: accounts[0], gas: 3000000 });

    showMessage("patientMessage", "🚫 Access revoked successfully!", "success", true);
    clearFields("#viewerAddr");
  } catch (e) {
    if (e.code === 4001)
      return showMessage("patientMessage", "Transaction cancelled.", "error");
    showMessage("patientMessage", "Failed to revoke access.", "error");
  }
}

// ====================== NAVIGATION ======================
window.addEventListener("DOMContentLoaded", () => {
  const landing = document.getElementById("landing");
  const doctorDashboard = document.getElementById("doctorDashboard");
  const patientDashboard = document.getElementById("patientDashboard");

  document.getElementById("doctorBtn").addEventListener("click", () => {
    landing.classList.add("hidden");
    doctorDashboard.classList.remove("hidden");
  });

  document.getElementById("patientBtn").addEventListener("click", () => {
    landing.classList.add("hidden");
    patientDashboard.classList.remove("hidden");
  });

  document.getElementById("backToLanding1").addEventListener("click", () => {
    doctorDashboard.classList.add("hidden");
    landing.classList.remove("hidden");
    disableDoctorFields();
  });

  document.getElementById("backToLanding2").addEventListener("click", () => {
    patientDashboard.classList.add("hidden");
    landing.classList.remove("hidden");
    disablePatientFields();
  });

  // Doctor events
  document.getElementById("connectDoctorWallet").addEventListener("click", connectDoctor);
  document.getElementById("registerDoctorBtn").addEventListener("click", registerDoctor);
  document.getElementById("createRecordBtn").addEventListener("click", createRecord);
  document.getElementById("viewRecordBtn").addEventListener("click", viewRecord);

  // Patient events
  document.getElementById("connectPatientWallet").addEventListener("click", connectPatient);
  document.getElementById("registerPatientBtn").addEventListener("click", registerPatient);
  document.getElementById("viewMyRecordsBtn").addEventListener("click", viewMyRecords);
  document.getElementById("grantAccessBtn").addEventListener("click", grantAccess);
  document.getElementById("revokeAccessBtn").addEventListener("click", revokeAccess);
});

