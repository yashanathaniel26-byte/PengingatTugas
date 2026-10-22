# ⚡ Tenggat Kuliah — Vercel UI Task Reminder

Aplikasi modern pelacak dan pengingat deadline perkuliahan berbasis **Next.js + React** dengan desain **Vercel UI Design System** (Geist typography, dark/light theme, high-contrast badges, live countdown).

Mendukung sinkronisasi otomatis kalender iCal dari **LMS Telkom University** (Moodle) dan penambahan tugas manual secara mandiri.

---

## ✨ Fitur Unggulan

- **🎨 Vercel Design Aesthetic**: Tampilan minimalis berstandar Vercel (Dark & Light theme, Geist font, border halus, badge warna per jenis kegiatan).
- **⏱️ Live Countdown Timer**: Hitung mundur waktu tersisa (hari, jam, menit, detik) secara realtime untuk tenggat paling dekat.
- **🔄 Sinkronisasi Otomatis iCal**: Membaca jadwal tugas, kuis, forum, dan kelompok langsung dari ekspor kalender LMS tanpa perlu login/cookie.
- **📝 Tambah Tugas Manual**: Bisa menambahkan tugas non-LMS (proyek mandiri, revisi, praktikum) yang langsung tersimpan di browser (`localStorage`).
- **📊 Ringkasan Statistik**: Metrik instan untuk total deadline, tugas < 24 jam, terlambat (*overdue*), dan tugas yang sudah selesai.
- **🔍 Pencarian & Filter Cepat**: Filter berdasarkan jenis (Tugas, Kuis, Forum, Kelompok, Manual) dan pencarian instan nama mata kuliah.
- **🔔 Notifikasi & Audio Chime**: Pengingat browser sebelum deadline tiba dan efek suara saat menandai tugas selesai.
- **🚀 Siap Deploy ke Vercel**: 100% kompatibel dengan Vercel Serverless Functions (`/api/deadlines`).

---

## 🚀 Menjalankan Secara Lokal

```bash
# Instal dependensi (jika belum)
npm install

# Jalankan server pengembangan
npm run dev
```

Buka **[http://localhost:3000](http://localhost:3000)** di browser Anda.

---

## 📌 Menghubungkan Kalender LMS Telkom University

1. Buka browser dan login ke **[lms.telkomuniversity.ac.id/calendar/view.php](https://lms.telkomuniversity.ac.id/calendar/view.php)**.
2. Scroll ke bagian paling bawah dan klik tombol **"Export calendar"**.
3. Pilih opsi:
   - **Events to export**: *All events*
   - **Time period**: *Recent and next 60 days*
4. Klik tombol **"Get calendar URL"** dan salin tautannya.
5. Di website ini, klik ikon **Pengaturan (Gear)** di kanan atas, tempelkan link URL tersebut, lalu klik **"Simpan & Sinkronkan"**.

Atau, Anda juga bisa memasukkannya ke dalam file `.env.local`:
```env
ICAL_URL=https://lms.telkomuniversity.ac.id/calendar/export_execute.php?userid=...&authtoken=...&preset_what=all&preset_time=custom
```

---

## 🤖 Menghubungkan Bot Telegram Pengingat Tugas

1. **Buat Bot**: Buka Telegram dan cari **[@BotFather](https://t.me/BotFather)**, lalu kirim `/newbot`. Ikuti petunjuk untuk mendapatkan **Bot Token**.
2. **Dapatkan Chat ID**: Cari **[@userinfobot](https://t.me/userinfobot)** di Telegram, klik *Start*, lalu salin angka **Id** Anda.
3. **Mulai Chat dengan Bot**: Buka bot baru Anda di Telegram, lalu klik tombol **Start**.
4. **Hubungkan di Web**: Di dashboard web, klik ikon **Pengaturan (Gear)** > tab **Bot Telegram**, masukkan Token & Chat ID, lalu klik **Kirim Pesan Uji Coba ke Telegram**.
5. **Aktifkan Interaksi Dua Arah (Webhook)**: Klik tombol **Sinkronkan Webhook Otomatis** di menu pengaturan untuk mengaktifkan perintah Telegram (`/tugas`, `/tertinggal`, `/catatan`, `/tambah`, dan tombol centang selesai).

---

## 🌐 Deploy ke Vercel & Otomasi Cron 24/7

Aplikasi ini sudah dilengkapi dengan file `vercel.json` untuk menjalankan pengecekan pengingat deadline di cloud secara otomatis tanpa bergantung pada browser yang terbuka:
- **Setiap 15 Menit**: Pengecekan tenggat tugas mendesak (peringatan H-24 jam & H-3 jam).
- **Setiap 07:00 WIB (00:00 UTC)**: Pengiriman ringkasan agenda pagi (*Morning Briefing*).

### Langkah Deploy:
1. Push repository ini ke GitHub.
2. Import project ke **[Vercel Dashboard](https://vercel.com)**.
3. Masukkan Environment Variables di Vercel:
   - `ICAL_URL`: Link kalender export iCal LMS Telkom University.
   - `TELEGRAM_BOT_TOKEN`: Token bot dari @BotFather.
   - `TELEGRAM_CHAT_ID`: Chat ID akun Telegram Anda.
   - `CRON_SECRET`: Kunci rahasia untuk mengamankan Vercel Cron.
4. Klik **Deploy**!
5. Setelah terdeploy, buka website Anda di Vercel, masuk ke **Pengaturan > Bot Telegram**, lalu klik **Sinkronkan Webhook Otomatis**. Bot Telegram Anda kini aktif 24/7!
