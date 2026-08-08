# Audit UI/UX — 一起點餐 / Order Together

**Tanggal audit:** 8 Agustus 2026  
**Ruang lingkup:** implementasi produk Next.js di `src/nextjs`. Folder `src/vanilla` dan `src/nuxtjs` masih berupa LIFF Starter template, sehingga tidak dinilai sebagai pengalaman produk utama.

## Ringkasan eksekutif

Produk sudah memiliki fondasi yang baik untuk use case *group ordering* di LINE: daftar tenant, input pesanan, undangan, menu gambar, dan arsip. UI juga sudah responsif secara dasar dan memisahkan aksi owner dari anggota.

Hambatan terbesar saat ini bukan visual, melainkan kejelasan alur dan kepercayaan saat mengambil keputusan: pengguna tidak melihat total biaya order aktif, status pesanan pribadi, batas waktu, atau dampak dari tombol **Order Finish**. Di layar mobile—konteks utama LIFF—informasi pesanan juga tersebar dalam kartu dan tabel yang cukup padat.

**Arah desain:** jadikan setiap tenant sebagai satu “order room” yang menjawab dengan cepat: *sedang pesan dari mana, kapan ditutup, siapa sudah pesan, berapa totalnya, dan apa aksi saya berikutnya.*

## Persona dan tugas utama

| Persona | Tujuan utama | Hambatan saat ini |
| --- | --- | --- |
| Anggota | Membaca menu dan menambahkan/mengubah pesanannya dalam waktu singkat | Tidak ada penanda “pesanan saya”, total pribadi, atau status order room |
| Owner / koordinator | Membuat room, mengundang orang, memantau kelengkapan, lalu menutup order | `Order Finish` terlihat setara dengan aksi lain; tidak ada ringkasan nominal atau checklist kesiapan |
| Pengguna baru dari tautan LINE | Memahami room yang baru dimasuki dan langsung berkontribusi | Tidak ada onboarding atau konfirmasi join yang eksplisit |

## Temuan prioritas

| Prioritas | Temuan | Dampak | Arahan perubahan |
| --- | --- | --- | --- |
| P0 | Tidak ada total harga di order aktif; harga per item dikumpulkan tetapi hanya muncul setelah diarsipkan. | Owner sulit memastikan nominal sebelum checkout; rawan salah bayar. | Tampilkan **total grup**, jumlah item, dan—bila harga diisi—**total pesanan saya** di header/ringkasan sticky. Gunakan format mata uang dan label mata uang yang konsisten. |
| P0 | Aksi `Order Finish` ambigu dan final: order dihapus dari layar aktif, tenant dipindah ke Archive. | Risiko owner menutup room terlalu dini atau mengira hanya menandai selesai. | Ubah menjadi `Tutup & arsipkan pesanan`; tampilkan modal dengan ringkasan total, jumlah item, dan penjelasan bahwa peserta tidak dapat menambah pesanan lagi. Beri konfirmasi eksplisit. |
| P0 | Semua baris memiliki `Edit` dan `Delete`, walaupun anggota hanya boleh mengubah pesanannya sendiri. | Ekspektasi UI bertentangan dengan izin backend dan menghasilkan error yang dapat dihindari. | Kirim identitas/flag `canEdit` dari API dan hanya tampilkan aksi pada pesanan yang dapat diedit. Tambahkan label kecil `Pesanan saya` pada baris milik pengguna. |
| P1 | Hierarki mobile lemah: tabel berubah menjadi kartu, tetapi informasi penting (menu, jumlah, pemesan, catatan) memiliki bobot hampir sama. | Scan cepat pada daftar panjang menjadi lambat. | Gunakan *order card* mobile: **nama menu + jumlah** sebagai heading, pemesan dan catatan sebagai metadata, serta total baris di sisi kanan. Sediakan aksi kebab/overflow untuk edit-hapus. |
| P1 | Navigasi hanya `Order` dan `Archive`, sementara satu layar dapat berisi banyak tenant/order room. | Pengguna harus memindai kartu panjang tanpa cara mencari atau melihat mana yang masih aktif/relevan. | Ganti label menjadi `Aktif` dan `Riwayat`; tampilkan badge jumlah. Tambahkan filter ringan (`Milik saya`, `Perlu tindakan`) bila volume tenant bertambah. |
| P1 | Campuran bahasa Inggris, Mandarin, dan Indonesia (`Order`, `Tenant`, `Who order`, `Say Something`, fallback Mandarin). | Menurunkan kejelasan dan kesan produk yang matang. | Pilih satu bahasa utama (disarankan Bahasa Indonesia untuk konteks ini), lalu lokalisasi seluruh label, empty state, error, dan format tanggal. Atur `lang="id"` pada dokumen. |
| P1 | Menu gambar hanya tampil sebagai thumbnail dan tidak membantu input pesanan. | Pengguna berpindah konteks antara gambar dan form; rawan salah ketik menu/harga. | Saat modal tambah pesanan terbuka, sediakan tombol `Lihat menu` yang membuka viewer; tahap berikutnya dapat memakai daftar menu terstruktur/autocomplete. |
| P1 | Empty state hanya mengatakan tidak ada tenant/order. | Tidak memberi langkah berikutnya, khususnya untuk owner baru. | Tambahkan ilustrasi sederhana dan CTA spesifik: `Buat room pesanan pertama` atau `Undang teman untuk mulai pesan`. |
| P2 | Tombol owner (`Invite`, upload menu, finish) tersebar di baris kecil di bawah header. | Aksi utama tidak jelas, terutama pada layar sempit. | Tetapkan satu CTA utama sesuai status: awal `Undang teman`, berjalan `Tambah pesanan`, siap checkout `Tutup pesanan`. Tempatkan aksi sekunder di menu `Kelola`. |
| P2 | Tidak ada deadline, status room, atau catatan pengambilan/pembayaran. | Koordinasi tetap berpindah ke chat dan produk kehilangan konteks penting. | Tambahkan field opsional: `Ditutup pada`, `Catatan pengambilan`, `Cara bayar`. Tampilkan status `Dibuka` / `Segera ditutup` / `Ditutup`. |

## Rekomendasi struktur layar

### 1. Tab Aktif

Setiap order room sebaiknya memiliki urutan informasi berikut:

1. **Status + nama merchant** — misalnya `DIBUKA · Chatime`.
2. **Ringkasan keputusan** — deadline, `12 item dari 5 orang`, dan total grup.
3. **Aksi utama berdasarkan peran** — anggota: `Tambah pesanan`; owner: `Bagikan undangan` saat room masih kosong, lalu `Tutup pesanan` ketika siap.
4. **Pesanan** — baris/card dengan pesanan milik pengguna diberi label dan posisi yang mudah ditemukan.
5. **Menu & pengaturan** — konten pendukung, tidak mengalahkan daftar pesanan.

Contoh wireframe ringkas (mobile):

```text
← Aktif (2)                         Riwayat

[ DIBUKA ]  Chatime                         ⋯
Tutup hari ini, 12.00
12 item · 5 orang                  Rp 486.000

[ + Tambah pesanan ]

PESANAN SAYA
Brown Sugar Boba Milk        2x    Rp 80.000
Less ice · Lina                         Edit

PESANAN GRUP (10)
…

[ Lihat menu ]
```

### 2. Form tambah/edit pesanan

- Tampilkan menu sebagai field pertama; pertahankan placeholder yang jelas.
- Ubah `Price` menjadi `Harga satuan (Rp)` dan tampilkan *helper text* “opsional” bila memang tidak wajib.
- Tambahkan preview `Total pesanan ini: Rp …` setelah jumlah dan harga terisi.
- Gunakan `inputMode="numeric"` pada quantity/harga untuk keyboard mobile yang tepat.
- Tombol submit harus spesifik: `Tambahkan pesanan` dan `Simpan perubahan`.
- Setelah sukses, gunakan toast singkat: “Pesanan ditambahkan ke Chatime”, lalu kembalikan fokus ke baris baru.

### 3. Penutupan dan arsip

- Modal tutup harus berisi merchant, jumlah pemesan, jumlah item, total nominal, dan peringatan singkat.
- Setelah sukses, tampilkan *success state* dengan CTA `Lihat riwayat`; jangan hanya menutup modal dan membuat kartu menghilang.
- Riwayat perlu tanggal/waktu lokal, total, daftar item, dan idealnya kemampuan ekspor/salin ringkasan untuk dikirim ke chat.

## Sistem visual

### Yang dipertahankan

- Palet biru, permukaan putih, dan radius yang lembut sudah cocok untuk produk koordinasi yang ringan.
- Kontras struktur desktop dan transformasi tabel ke blok mobile sudah menjadi fondasi responsif yang baik.
- Loader serta konfirmasi aksi destruktif sudah ada.

### Yang perlu dirapikan

- Definisikan token semantik: `--color-primary`, `--color-danger`, `--color-text-secondary`, `--surface-subtle`, dan state `hover/focus/disabled`, bukan nilai warna tersebar.
- Pastikan area sentuh tombol minimal 44 × 44 px di mobile. Tombol aksi tabel dan `Edit` saat ini tampak lebih kecil dari target tersebut.
- Tambahkan `:focus-visible` konsisten untuk seluruh tombol, tab, input, summary, dan close button—not hanya preview menu.
- Gunakan satu skala tipografi: body minimal 14–16 px di mobile; label 12 px masih boleh jika kontras dan line-height memadai.
- Jangan mengandalkan biru/merah saja untuk membedakan status; sertakan teks/ikon (`Ditutup`, `Hapus`).

## Aksesibilitas dan kualitas interaksi

1. Modal form dan konfirmasi belum memiliki `role="dialog"`, `aria-modal`, fokus awal/terkunci, serta dukungan tombol Escape. Terapkan dialog yang fokusnya kembali ke pemicu saat ditutup.
2. Tombol `Edit`/`Delete` perlu accessible name yang menyebut item, misalnya `Hapus Brown Sugar Boba Milk`, bukan hanya “Delete”.
3. Status loading sudah memakai `role="status"`; ubah pesan error menjadi `role="alert"` agar terbaca pembaca layar.
4. Tambahkan `aria-current="page"` atau pola tab WAI-ARIA yang lengkap untuk navigasi Aktif/Riwayat.
5. Gambar menu sebaiknya punya alt lebih informatif jika mengandung informasi penting, contoh `Menu Chatime, diperbarui 8 Agustus`; bila hanya dekoratif, gunakan alt kosong.
6. Uji kontras teks abu-abu dan tombol biru muda terhadap WCAG AA. Warna CTA tenant saat ini tampak lebih lemah dibanding CTA utama.

## Roadmap implementasi

### Sprint 1 — kurangi risiko transaksi

- Tambahkan subtotal per baris, total grup, total pribadi, dan format `Rp`.
- Perjelas alur `Tutup & arsipkan pesanan` beserta ringkasan dan success state.
- Sembunyikan aksi edit/hapus yang tidak diizinkan dan beri penanda `Pesanan saya`.
- Seragamkan bahasa Indonesia dan copy tombol.

### Sprint 2 — percepat pengisian pesanan di mobile

- Ubah daftar pesanan mobile menjadi card yang mudah dipindai.
- Tata ulang header order room dan CTA berdasarkan status/peran.
- Buka menu dari form dan tambahkan total langsung di form.
- Perbaiki empty state dan onboarding setelah invite diterima.

### Sprint 3 — tingkatkan koordinasi dan aksesibilitas

- Tambah deadline, instruksi pengambilan, dan cara bayar.
- Terapkan modal aksesibel, focus states, dan target sentuh 44 px.
- Tambahkan salin/bagikan ringkasan checkout ke LINE.
- Evaluasi menu terstruktur untuk merchant yang sering digunakan.

## Metrik keberhasilan

| Tujuan | Metrik | Indikasi sukses |
| --- | --- | --- |
| Pengisian lebih cepat | Median waktu dari buka room sampai pesanan pertama | Turun ≥20% |
| Lebih sedikit kesalahan | Rasio edit/hapus dalam 5 menit setelah membuat pesanan | Turun setelah form dan menu diperjelas |
| Checkout lebih aman | Jumlah pembatalan pada modal `Tutup pesanan` dan error terkait | Pembatalan yang terinformasi naik awalnya, lalu error turun |
| Koordinasi lebih tuntas | Persentase room yang memiliki total dan berhasil diarsipkan | Naik tanpa peningkatan support/chat follow-up |
| Aksesibilitas | Audit keyboard, focus, dan kontras | Tidak ada blocker WCAG AA pada alur inti |

## Catatan teknis yang terkait UX

- Data harga sudah disimpan dan total dihitung saat archive di `src/nextjs/pages/api/app.js`; endpoint state perlu mengirim atau klien menghitung agregat untuk menampilkan total sebelum penutupan.
- API sudah menegakkan izin edit/hapus per pengguna, tetapi UI di `src/nextjs/pages/index.js` belum mencerminkan izin itu. Ekspos `canModify` per order atau bandingkan dengan ID pengguna yang aman dikirim ke klien.
- Uji end-to-end perlu mencakup: member mencoba mengedit order orang lain, owner menutup order, undangan kedaluwarsa, serta kondisi menu belum diunggah.

## Keputusan desain yang disarankan

Prioritaskan **kejelasan checkout** sebelum menambah fitur baru. Untuk aplikasi group order, total, status, deadline, dan kepemilikan pesanan adalah informasi yang lebih penting daripada dekorasi visual tambahan. Setelah itu, fokuskan optimasi pada satu tangan dan pemindaian cepat di konteks LINE mobile.
