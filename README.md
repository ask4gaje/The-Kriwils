# Project: Tubes-Tekplat

Ini adalah proyek website statis sederhana.

## Cara Menjalankan

### Opsi 1: Nginx (Paling Scalable)
1. Download Nginx untuk Windows di [nginx.org](https://nginx.org/en/download.html).
2. Ekstrak folder Nginx.
3. Jalankan perintah ini di terminal (ganti `PATH_KE_NGINX` dengan lokasi folder nginx.exe):
   ```bash
   PATH_KE_NGINX\nginx.exe -c "D:\Kuliah\Semester 4\TekPlat\Gemini CLI\Tubes-Tekplat\nginx.conf"
   ```

### Opsi 2: Python (Instan)
```bash
python -m http.server 6767
```

Lalu buka [http://localhost:6767](http://localhost:6767) di browser Anda.