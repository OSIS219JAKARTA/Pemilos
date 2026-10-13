import { showAlert, showConfirm } from './custom-alert.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, where, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Konfigurasi Firebase Proyek Backup (back1-8cd96)
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
    showAlert("Selamat Datang, Admin!", "Login Sukses");
  } catch (error) {
    console.error("Error:", error);
    showAlert("Email atau Password salah!", "Login Gagal");
    submitBtn.disabled = false;
    submitBtn.innerText = "Masuk Dashboard";
  }
});

// ================= TOMBOL LOGOUT KHUSUS =================
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

// ================= NAVIGATION MENU LAINNYA =================
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
  showConfirm("PERINGATAN! Ini akan menghapus acara pemilihan beserta SEMUA Voternya dan Kandidat di dalamnya! Lanjutkan?", async () => {
    try {
      const cSnap = await getDocs(query(collection(db, "candidates"), where("pemilihanId", "==", id)));
      cSnap.forEach(d => deleteDoc(doc(db, "candidates", d.id)));

      const vSnap = await getDocs(query(collection(db, "voters"), where("pemilihanId", "==", id)));
      vSnap.forEach(d => deleteDoc(doc(db, "voters", d.id)));

      await deleteDoc(doc(db, "pemilihan", id));

      showAlert("Data event berhasil dihapus total.", "Sukses");
      await loadPemilihanDropdowns();
      loadPemilihanTable();
    } catch(e) { showAlert("Error menghapus event.", "Gagal"); }
  }, "Hapus Acara Pemilihan");
}

// ================= 0. HOME STATS =================
async function loadHomeStats() {
  const votersSnap = await getDocs(collection(db, "voters"));
  let total = 0, sudah = 0, belum = 0;
  unvotedListCache = [];

  votersSnap.forEach(docSnap => {
    total++;
    const data = docSnap.data();
    if(data.sudahVote) {
      sudah++;
    } else {
      belum++;
      unvotedListCache.push(data);
    }
  });

  const elTotal = document.getElementById('stat-total-akun');
  const elSudah = document.getElementById('stat-sudah-vote');
  const elBelum = document.getElementById('stat-belum-vote');
  const elSuara = document.getElementById('stat-total-suara');

  if(elTotal) elTotal.innerText = total;
  if(elSudah) elSudah.innerText = sudah;
  if(elBelum) elBelum.innerText = belum;
  if(elSuara) elSuara.innerText = sudah;

  renderUnvotedTable(unvotedListCache);
}

function renderUnvotedTable(dataArray) {
  const tbody = document.querySelector('#table-belum-vote tbody');
  if(!tbody) return;
  tbody.innerHTML = dataArray.map(v => `<tr><td>${v.nis}</td><td>${v.nama}</td><td>${v.kelas || '-'}</td></tr>`).join('');
}

const searchBelumVote = document.getElementById('search-belum-vote');
if(searchBelumVote) {
  searchBelumVote.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = unvotedListCache.filter(v => String(v.nis).toLowerCase().includes(val) || v.nama.toLowerCase().includes(val));
    renderUnvotedTable(filtered);
  });
}

// ================= 1. KANDIDAT =================
document.getElementById('btn-toggle-kandidat').addEventListener('click', () => {
  document.getElementById('form-kandidat-box').style.display = 'block';
  document.getElementById('k-id').value = '';
});
document.getElementById('cancel-kandidat-btn').addEventListener('click', () => {
  document.getElementById('form-kandidat-box').style.display = 'none';
});

document.getElementById('save-kandidat-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  const id = document.getElementById('k-id').value;
  const data = {
    noUrut: parseInt(document.getElementById('k-nourut').value),
    nama: document.getElementById('k-nama').value,
    visi: document.getElementById('k-visi').value,
    proker: document.getElementById('k-proker').value,
    foto: document.getElementById('k-foto').value || 'Assets/img/logo_osis.png',
    pemilihanId: document.getElementById('k-pemilihan-select').value,
    suara: 0
  };

  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  try {
    if(id) {
      delete data.suara;
      await updateDoc(doc(db, "candidates", id), data);
    } else {
      await addDoc(collection(db, "candidates"), data);
    }

    showAlert("Data kandidat berhasil disimpan!", "Sukses");
    document.getElementById('form-kandidat-box').style.display = 'none';
    loadKandidatTable();
  } catch(err) {
    showAlert("Gagal menyimpan kandidat.", "Error");
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Kandidat";
  }
});

async function loadKandidatTable() {
  const snap = await getDocs(collection(db, "candidates"));
  const tbody = document.querySelector('#table-kandidat tbody');
  if(!tbody) return;
  let html = '';
  snap.forEach(d => {
    const data = d.data();
    const eventName = currentPemilihanList.find(p => p.id === data.pemilihanId)?.judul || 'Tidak Diketahui';

    const visiEscaped = (data.visi || '').replace(/'/g, "\\'").replace(/\n/g, "\\n");
    const prokerEscaped = (data.proker || '').replace(/'/g, "\\'").replace(/\n/g, "\\n");

    html += `<tr>
      <td>${data.noUrut}</td>
      <td>${data.nama}</td>
      <td>${eventName}</td>
      <td>
        <button class="btn-warning" onclick="editKandidat('${d.id}', '${data.noUrut}', '${data.nama}', '${visiEscaped}', '${prokerEscaped}', '${data.foto}', '${data.pemilihanId}')">Edit</button>
        <button class="btn-danger" onclick="hapusKandidat('${d.id}')">Hapus</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

window.editKandidat = function(id, noUrut, nama, visi, proker, foto, pemilihanId) {
  document.getElementById('form-kandidat-box').style.display = 'block';
  document.getElementById('k-id').value = id;
  document.getElementById('k-nourut').value = noUrut;
  document.getElementById('k-nama').value = nama;
  document.getElementById('k-visi').value = visi;
  document.getElementById('k-proker').value = proker;
  document.getElementById('k-foto').value = foto;
  document.getElementById('k-pemilihan-select').value = pemilihanId;
}

window.hapusKandidat = function(id) {
  showConfirm("Apakah Anda yakin ingin menghapus kandidat ini?", async () => {
    await deleteDoc(doc(db, "candidates", id));
    showAlert("Kandidat berhasil dihapus!", "Sukses");
    loadKandidatTable();
  }, "Hapus Kandidat");
}

// ================= 2. VOTER =================
document.getElementById('v-role').addEventListener('change', (e) => {
  const disable = e.target.value !== "Siswa";
  document.getElementById('v-kelas').disabled = disable;
  document.getElementById('v-absen').disabled = disable;
  if(disable) {
    document.getElementById('v-kelas').value = "-";
    document.getElementById('v-absen').value = "-";
  } else {
    document.getElementById('v-kelas').value = "";
    document.getElementById('v-absen').value = "";
  }
});

document.getElementById('btn-add-voter').addEventListener('click', () => {
  document.getElementById('form-voter-title').innerText = "Buat Akun Voter Manual";
  document.getElementById('v-id').value = ""; 
  document.getElementById('v-nis').value = "";
  document.getElementById('v-nama').value = "";
  document.getElementById('v-kelas').value = "";
  document.getElementById('v-absen').value = "";
  document.getElementById('v-password').value = "";

  const topSelectVal = document.getElementById('v-pemilihan-select').value;
  if(topSelectVal) document.getElementById('v-pemilihan-edit-select').value = topSelectVal;

  document.getElementById('form-voter-box').style.display = 'block';
});

document.getElementById('cancel-voter-btn').addEventListener('click', () => {
  document.getElementById('form-voter-box').style.display = 'none';
});

document.getElementById('save-voter-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  const id = document.getElementById('v-id').value;
  const role = document.getElementById('v-role').value;
  const pemId = document.getElementById('v-pemilihan-edit-select').value;

  if(!pemId) return showAlert("Pilih Event Pemilihan terlebih dahulu!", "Peringatan");

  btn.disabled = true;
  btn.innerText = "Menyimpan...";

  let rawPassword = document.getElementById('v-password').value;
  if(rawPassword.length !== 64) {
      rawPassword = await hashPassword(rawPassword);
  }

  const voterData = {
    nis: document.getElementById('v-nis').value,
    nama: document.getElementById('v-nama').value,
    role: role,
    kelas: role === "Siswa" ? document.getElementById('v-kelas').value : "-",
    absen: role === "Siswa" ? document.getElementById('v-absen').value : "-",
    password: rawPassword,
    pemilihanId: pemId
  };

  try {
    if(id) {
      await updateDoc(doc(db, "voters", id), voterData);
      showAlert("Data Voter berhasil diperbarui!", "Sukses");
    } else {
      voterData.status = "aktif";
      voterData.sudahVote = false;
      await addDoc(collection(db, "voters"), voterData);
      showAlert("Akun Voter ditambahkan!", "Sukses");
    }
    document.getElementById('form-voter-box').style.display = 'none';
    loadVoterTable();
  } catch (error) {
    showAlert("Terjadi kesalahan sistem saat menyimpan.", "Error");
  } finally {
    btn.disabled = false;
    btn.innerText = "Simpan Data Voter";
  }
});

window.editVoter = function(id, nis, nama, role, kelas, absen, password, pemId) {
  document.getElementById('form-voter-title').innerText = "Edit Akun Voter";
  document.getElementById('form-voter-box').style.display = 'block';

  document.getElementById('v-id').value = id;
  document.getElementById('v-nis').value = nis;
  document.getElementById('v-nama').value = nama;
  document.getElementById('v-role').value = role;
  document.getElementById('v-password').value = password;

  if(pemId && pemId !== "undefined") {
    document.getElementById('v-pemilihan-edit-select').value = pemId;
  }

  const disable = role !== "Siswa";
  document.getElementById('v-kelas').disabled = disable;
  document.getElementById('v-absen').disabled = disable;
  document.getElementById('v-kelas').value = kelas;
  document.getElementById('v-absen').value = absen;
}

document.getElementById('csv-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const pemilihanId = document.getElementById('v-pemilihan-select').value;
  if(!pemilihanId) return showAlert("Pilih Event Pemilihan dulu sebelum import CSV!", "Peringatan");

  const reader = new FileReader();
  reader.onload = async function(event) {
    const lines = event.target.result.split('\n');
    let count = 0;
    for(let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if(cols.length >= 5) {
        let role = cols[2].trim();
        let kls = role === 'Siswa' ? cols[3].trim() : '-';
        let abs = role === 'Siswa' ? cols[4].trim() : '-';

        let rawPwd = cols[5] ? cols[5].trim() : cols[0].trim();
        let hashedPwd = await hashPassword(rawPwd);

        await addDoc(collection(db, "voters"), {
          nis: cols[0].trim(),
          nama: cols[1].trim(),
          role: role,
          kelas: kls,
          absen: abs,
          password: hashedPwd,
          pemilihanId: pemilihanId,
          status: "aktif",
          sudahVote: false
        });
        count++;
      }
    }
    showAlert(`${count} Akun Voter berhasil diimport!`, "Sukses");
    loadVoterTable();
  };
  reader.readAsText(file);
});

async function loadVoterTable() {
  const snap = await getDocs(collection(db, "voters"));
  allVotersCache = [];
  snap.forEach(d => allVotersCache.push({id: d.id, ...d.data()}));
  renderVoterTable(allVotersCache);
}

function renderVoterTable(dataArray) {
  const tbody = document.querySelector('#table-voter tbody');
  if(!tbody) return;
  tbody.innerHTML = dataArray.map(v => `
    <tr>
      <td>${v.nis}</td>
      <td>${v.nama}</td>
      <td>${v.role}</td>
      <td>${v.kelas}</td>
      <td>
        <span style="color:${v.status === 'aktif' ? 'green' : 'red'}; font-weight:bold;">
          ${v.status.toUpperCase()}
        </span>
      </td>
      <td>
        <button class="btn-warning" style="margin-bottom:5px;" onclick="editVoter('${v.id}', '${v.nis}', '${v.nama}', '${v.role}', '${v.kelas}', '${v.absen}', '${v.password}', '${v.pemilihanId}')">Edit</button>
        ${v.status === 'nonaktif' 
          ? `<button class="btn-primary" style="margin-bottom:5px;" onclick="aktifkanAkun('${v.id}', '${v.choosedCandidate}')">Aktifkan</button>` 
          : `<button class="btn-danger" style="margin-bottom:5px;" onclick="hapusVoter('${v.id}')">Hapus</button>`}
      </td>
    </tr>
  `).join('');
}

const searchVoter = document.getElementById('search-voter');
if(searchVoter) {
  searchVoter.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = allVotersCache.filter(v => String(v.nis).toLowerCase().includes(val) || v.nama.toLowerCase().includes(val));
    renderVoterTable(filtered);
  });
}

window.hapusVoter = function(id) {
  showConfirm("Hapus akun voter ini?", async () => {
    await deleteDoc(doc(db, "voters", id));
    showAlert("Voter berhasil dihapus!", "Sukses");
    loadVoterTable();
  }, "Hapus Voter");
}

window.aktifkanAkun = function(voterId, candId) {
  showConfirm("Akun ini akan diaktifkan ulang. Suara kandidat yang dipilih sebelumnya akan dikurangi. Lanjutkan?", async () => {
    try {
      if(candId && candId !== "null" && candId !== "undefined") {
        const candidateRef = doc(db, "candidates", candId);
        const candidateSnap = await getDoc(candidateRef);

        if (candidateSnap.exists()) {
          const currentSuara = candidateSnap.data().suara || 0;
          if (currentSuara > 0) {
            await updateDoc(candidateRef, { suara: increment(-1) });
          }
        }
      }

      await updateDoc(doc(db, "voters", voterId), {
        status: "aktif",
        sudahVote: false,
        choosedCandidate: null,
        waktuVote: null
      });

      showAlert("Akun berhasil diaktifkan kembali.", "Sukses");
      loadVoterTable();
    } catch(e) { 
      console.error(e);
      showAlert("Gagal mereset akun.", "Error"); 
    }
  }, "Aktifkan Ulang Akun");
}

// ================= 4. HASIL SUARA & CHART =================
let myAdminChart = null;
const hasilSelect = document.getElementById('hasil-pemilihan-select');
if(hasilSelect) {
  hasilSelect.addEventListener('change', loadHasilSuaraChart);
}

async function loadHasilSuaraChart() {
  const pemId = document.getElementById('hasil-pemilihan-select').value;
  if(!pemId) return;

  const canvas = document.getElementById('adminBarChart');
  const cardsContainer = document.getElementById('admin-hasil-cards-container');
  const totalDisplay = document.getElementById('admin-total-suara-display');

  if(!canvas) return;
  const ctx = canvas.getContext('2d');

  try {
    const snap = await getDocs(query(collection(db, "candidates"), where("pemilihanId", "==", pemId)));

    let candidates = [];
    let totalSuaraMasuk = 0;

    snap.forEach(d => {
      const data = d.data();
      const suara = data.suara || 0;
      totalSuaraMasuk += suara;
      candidates.push({ ...data, suara: suara });
    });

    candidates.sort((a,b) => a.noUrut - b.noUrut);

    let labels = candidates.map(c => `No. Urut ${c.noUrut}`);
    let dataPersentase = candidates.map(c => {
      if (totalSuaraMasuk === 0) return 0;
      return parseFloat(((c.suara / totalSuaraMasuk) * 100).toFixed(1));
    });

    if (totalDisplay) {
      totalDisplay.innerText = `Total Suara Masuk: ${totalSuaraMasuk} Suara`;
    }

    if(myAdminChart) myAdminChart.destroy();

    myAdminChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Persentase Suara (%)',
          data: dataPersentase,
          backgroundColor: '#1b4f91',
          borderRadius: 6
        }]
      },
      options: { 
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const index = context.dataIndex;
                const rawVote = candidates[index].suara;
                return `${context.parsed.y}% (${rawVote} suara)`;
              }
            }
          }
        },
        scales: { 
          y: { 
            beginAtZero: true,
            max: 100,
            ticks: { 
              callback: function(value) {
                return value + "%";
              }
            } 
          } 
        } 
      }
    });

    if (cardsContainer) {
      cardsContainer.innerHTML = '';
      candidates.forEach(c => {
        const imagePath = c.foto && c.foto.trim() !== '' ? c.foto : `Assets/img/paslon${c.noUrut}.jpg`;
        const persentase = totalSuaraMasuk > 0 ? ((c.suara / totalSuaraMasuk) * 100).toFixed(1) : 0;

        cardsContainer.innerHTML += `
          <div class="hasil-card">
            <img src="${imagePath}" onError="this.src='Assets/img/logo_osis.png'" alt="Foto Paslon">
            <h4 style="margin: 5px 0;">No. Urut ${c.noUrut}</h4>
            <p style="font-size: 0.9rem; font-weight: bold; margin: 5px 0; color: #333;">${c.nama}</p>
            <div class="percentage-badge">${persentase}%</div>
            <div class="vote-detail">(${c.suara} dari ${totalSuaraMasuk} suara)</div>
          </div>
        `;
      });
    }

  } catch(err) {
    console.error("Gagal memuat chart admin:", err);
    showAlert("Terjadi kesalahan saat memuat grafik hasil suara.", "Error");
  }
}

const exportHasilBtn = document.getElementById('export-hasil-excel-btn');
if(exportHasilBtn) {
  exportHasilBtn.addEventListener('click', async () => {
    const pemId = document.getElementById('hasil-pemilihan-select').value;
    const snap = await getDocs(query(collection(db, "candidates"), where("pemilihanId", "==", pemId)));

    let resultData = [];
    snap.forEach(d => {
      let dt = d.data();
      resultData.push({ "Nomor Urut": dt.noUrut, "Nama Paslon": dt.nama, "Total Suara": dt.suara || 0 });
    });

    const worksheet = XLSX.utils.json_to_sheet(resultData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Suara");
    XLSX.writeFile(workbook, "Hasil_Pemilihan.xlsx");
  });
}

// ================= 5. LAPORAN =================
const exportLaporanBtn = document.getElementById('export-laporan-btn');
if(exportLaporanBtn) {
  exportLaporanBtn.addEventListener('click', async () => {
    const pemId = document.getElementById('laporan-pemilihan-select').value;
    if(!pemId) return showAlert("Pilih event terlebih dahulu!", "Peringatan");

    const snap = await getDocs(query(collection(db, "voters"), where("pemilihanId", "==", pemId)));
    let laporanData = [];

    snap.forEach(d => {
      const v = d.data();
      laporanData.push({
        "NIS/Identitas": v.nis,
        "Nama": v.nama,
        "Role": v.role,
        "Kelas": v.kelas || '-',
        "No Absen": v.absen || '-',
        "Tanggal & Waktu Memilih": v.waktuVote || 'Belum Memilih',
        "Status Voting": v.sudahVote ? '1' : '0'
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(laporanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Partisipasi");
    XLSX.writeFile(workbook, "Laporan_Partisipasi_OSIS.xlsx");
  });
}
