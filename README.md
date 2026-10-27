\# Sistem Nilai — Zero Trust Security



Proyek praktikum individu Keamanan Informasi.



\## Arsitektur



\- API Gateway: port 3000, sebagai Policy Enforcement Point.

\- Policy Engine: modul keputusan akses di dalam gateway.

\- Service Nilai: port 3001.

\- Service Transkrip: port 3002.

\- Database SQLite bersama.

\- Audit log ditulis oleh gateway.



Seluruh akses resource, termasuk sinkronisasi antar-service,

melewati gateway. Kedua service memeriksa gateway secret

dan memverifikasi ulang JWT.



\## Instalasi



Gunakan Node.js dan npm.

Lingkungan pengembangan menggunakan Node.js v24.15.0.



Dari folder proyek:



```bat

npm ci

npm run init-env

npm run seed

```



`init-env` membuat konfigurasi dan secret acak jika .env belum ada.

`seed` mengisi data awal jika database belum berisi user.



\## Menjalankan



Gunakan tiga terminal terpisah pada folder proyek:



```bat

npm run gateway

```



```bat

npm run nilai

```



```bat

npm run transkrip

```



Gunakan terminal tambahan untuk pengujian.



\## Akun Demo



Password seluruh akun demo: `Praktikum123!`



| Username | Role | NIM | Device ID |

|---|---|---|---|

| admin | admin | - | device-admin |

| dosen1 | dosen | - | device-dosen1 |

| dosen2 | dosen | - | device-dosen2 |

| mhs1 | mahasiswa | 247006111001 | device-mhs1 |

| mhs2 | mahasiswa | 247006111002 | device-mhs2 |

| mhs3 | mahasiswa | 247006111003 | device-mhs3 |



Kelas 1 diampu dosen1. Kelas 2 diampu dosen2.



\## Kontrol Akses



\- Mahasiswa hanya melihat nilai dan transkrip sendiri.

\- Dosen hanya mengelola nilai kelas yang diampunya.

\- Admin dapat melihat transkrip mahasiswa.

\- Nilai final tidak dapat diubah.

\- Sinkronisasi transkrip hanya menerima token Service Nilai.

\- User membawa X-Device-ID sesuai device terdaftar.

\- Gateway memeriksa kepemilikan dan konteks dari database.



Access token berlaku 10 menit.

Refresh token berlaku 1 hari dan dapat dicabut saat logout.

Token service berlaku 5 menit.



Logout mencabut refresh token sesi, bukan access token

yang sudah diterbitkan.



\## Jam Akses



Konfigurasi normal dalam .env:



```env

ACCESS\_START=07:00

ACCESS\_END=21:00

```



Zona waktu: Asia/Jakarta.

Batas awal termasuk, batas akhir tidak termasuk.



Untuk demo di luar jam normal, rentang dapat diubah sementara.

Restart gateway setelah mengubah konfigurasi jam.

Kembalikan rentang normal setelah demo.



Jangan memasukkan .env atau secret asli ke repository.



\## Pengujian



Pastikan ketiga server berjalan:



```bat

npm test

```



Pengujian tambahan:



```bat

node scripts/test-policy.js

node scripts/test-gateway-transkrip.js

node scripts/test-security-extra.js

node scripts/test-finalisasi.js

npm run audit

```



Perhatikan kondisi awal:

\- test-policy membutuhkan kelas 1 belum final dan jam konfigurasi normal.

\- test-gateway-transkrip membutuhkan kelas 1 belum final.

\- test-security-extra membutuhkan kelas 2 belum final dan jam akses aktif.

\- test-finalisasi memfinalisasi kelas 1 dan membutuhkan jam akses aktif.

\- Pemeriksaan audit dijalankan setelah pengujian finalisasi.



\## Reset Data Demo



Lihat penjelasan tanpa perubahan:



```bat

npm run reset-demo

```



Untuk reset sungguhan, hentikan ketiga server dahulu:



```bat

npm run reset-demo -- --confirm

```



Script membuat backup, membuka kembali kedua kelas,

memulihkan empat nilai awal, serta mengosongkan transkrip,

refresh token, dan audit log.



Akun, device, serta konfigurasi tidak diubah.

Access token yang sudah diterbitkan tidak dicabut oleh reset.

Jalankan kembali server dan gunakan login baru untuk demo.



\## Audit



Audit berisi waktu, subjek, method, endpoint, device,

keputusan allow/deny, dan alasan.



Timestamp database menggunakan UTC.

Request service dapat memiliki device bernilai null.



Allow berarti policy mengizinkan request diteruskan,

bukan jaminan operasi pada service berhasil.



\## Batasan



Implementasi ini untuk praktikum lokal, bukan klaim keamanan produksi.



\- Komunikasi lokal menggunakan HTTP.

\- Gateway secret merupakan shared secret, bukan mTLS.

\- Device ID berbasis header bukan bukti kriptografis kepemilikan perangkat.

\- Access token tidak dicabut sebelum kedaluwarsa.

\- Sinkronisasi belum memiliki retry otomatis.



Jika sinkronisasi gagal setelah finalisasi, kelas tetap final.

Dosen dapat mengulang finalisasi dalam jam akses.

UPSERT mencegah duplikat pasangan kelas dan mahasiswa.

