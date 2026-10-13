import { showAlert, showConfirm } from './custom-alert.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, where, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Konfigurasi Firebase Project back1-8cd96
const firebaseConfig = {
  apiKey: "AIzaSyBe-aGdn-RaNqupePv3DCFrQTZIuCsZMzs",
  authDomain: "back1-8cd96.firebaseapp.com",
  projectId: "back1-8cd96",
  storageBucket: "back1-8cd96.firebasestorage.app",
  messagingSenderId: "620374428695",
  appId: "1:620374428695:web:d4a43783ebe112519f2052",
  measurementId: "G-YGJDF44JZ8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error("Gagal mengatur persistensi auth:", error);
});

let currentPemilihanList = [];
let unvotedListCache = [];
let allVotersCache = [];

// ================= CEK STATUS LOGIN ADMIN =================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';

    await loadPemilihanDropdowns();
    loadHomeStats();
  } else {
    document.getElementById('admin-login-box').style.display = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';

    const emailInput = document.getElementById('admin-user');
    const passInput = document.getElementById('admin-pass');
    if(emailInput) emailInput.value = "";
    if(passInput) passInput.value = "";
  }
});

// ================= PROSES LOGIN ADMIN =================
document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerText = "Memproses...";

  const email = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';

    await loadPemilihanDropdowns();
    loadHomeStats();

    showAlert("Selamat Datang, Admin!", "Login Sukses");
  } catch (error) {
    console.error("Error Login Admin:", error);
    let pesanError = "Email atau Password salah!";
    
    if (error.code === 'auth/user-not-found') {
      pesanError = "Akun Admin tidak ditemukan di Firebase!";
    } else if (error.code === 'auth/wrong-password') {
      pesanError = "Password yang dimasukkan salah!";
    } else if (error.code === 'auth/invalid-email') {
      pesanError = "Format email tidak valid!";
    } else if (error.code === 'auth/unauthorized-domain') {
      pesanError = "Domain web belum diizinkan di Firebase Authentication!";
    }

    showAlert(pesanError, "Login Gagal");
    submitBtn.disabled = false;
    submitBtn.innerText = "Masuk Dashboard";
  }
});

// ================= TOMBOL LOGOUT =================
const logoutBtn = document.getElementById('logout-menu');
if(logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    showConfirm("Yakin ingin keluar dari panel admin?", async () => {
      try {
        await signOut(auth);
        window.location.href = "admin.html";
      } catch (err) {
        console.error("Gagal logout:", err);
        showAlert("Gagal melakukan logout.", "Error");
      }
    }, "Konfirmasi Logout");
  });
}

// ================= NAVIGASI MENU SIDEBAR =================
document.querySelectorAll('.sidebar .menu-item').forEach(item => {
  if(item.id === 'logout-menu') return;

  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar .menu-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    const target = item.getAttribute('data-target');
    const targetSection = document.getElementById(`section-${target}`);
    if(targetSection) targetSection.classList.add('active');

    if(target === 'home') loadHomeStats();
    if(target === 'kandidat') loadKandidatTable();
    if(target === 'voter') loadVoterTable();
    if(target === 'pemilihan') loadPemilihanTable();
    if(target === 'hasil') loadHasilSuaraChart();
  });
});

// ================= 3. PEMILIHAN =================
async function loadPemilihanDropdowns() {
  const snap = await getDocs(collection(db, "pemilihan"));
  currentPemilihanList = [];
  snap.forEach(d => currentPemilihanList.push({id: d.id, ...d.data()}));

  const optionsHtml = currentPemilihanList.map(p => `<option value="${p.id}">${p.judul}</option>`).join('');

  const kSelect = document.getElementById('k-pemilihan-select');
  const vSelect = document.getElementById('v-pemilihan-select');
  const vEditSelect = document.getElementById('v-pemilihan-edit-select');
  const hSelect = document.getElementById('hasil-pemilihan-select');
  const lSelect = document.getElementById('laporan-pemilihan-select');

  if(kSelect) kSelect.innerHTML = optionsHtml;
  if(vSelect) vSelect.innerHTML = optionsHtml;
  if(vEditSelect) vEditSelect.innerHTML = optionsHtml;
  if(hSelect) hSelect.innerHTML = optionsHtml;
  if(lSelect) lSelect.innerHTML = optionsHtml;
}

document.getElementById('save-pemilihan-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  const judul = document.getElementById('p-judul').value;
  const mulai = document.getElementById('p-mulai').value;
  const selesai = document.getElementById('p-selesai').value;
  if(!judul || !mulai || !selesai) return showAlert("Isi semua data acara terlebih dahulu!", "Peringatan");

  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  try {
    await addDoc(collection(db, "pemilihan"), { judul, mulai, selesai });
    showAlert("Acara Pemilihan berhasil dibuat!", "Sukses");
    document.getElementById('p-judul').value = "";
    document.getElementById('p-mulai').value = "";
    document.getElementById('p-selesai').value = "";
    loadPemilihanDropdowns();
    loadPemilihanTable();
  } catch(err) {
    showAlert("Gagal menyimpan acara.", "Error");
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Event";
  }
});

async function loadPemilihanTable() {
  const tbody = document.querySelector('#table-pemilihan tbody');
  if(!tbody) return;
  tbody.innerHTML = currentPemilihanList.map(p => `
    <tr>
      <td>${p.judul}</td>
      <td>${p.mulai.replace('T', ' ')}</td>
      <td>${p.selesai.replace('T', ' ')}</td>
      <td><button class="btn-danger" onclick="hapusPemilihan('${p.id}')">Hapus & Bersihkan</button></td>
    </tr>
  `).join('');
}

window.hapusPemilihan = function(id) {
  showConfirm("PERINGATAN! Ini akan menghapus acara pemilihan beserta SEMUA Votern
