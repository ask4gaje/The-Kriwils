# Project: The Kriwils

An AI-powered quiz platform where you can generate, play, edit, and share custom quizzes in Indonesian.

## Features
- **AI Quiz Generation**: Create quizzes on any topic using Gemini 1.5/2.5.
- **Indonesian Localization**: All AI-generated content and explanations are in Indonesian.
- **Quiz Player**: Interactive gameplay with real-time feedback and scoring.
- **Advanced Stats**: Toggles between a "Top 5 Leaderboard" and a full chronological list of results.
- **Content Editing**: Creators can manually edit quiz questions, options, and explanations.
- **Settings**: Toggle whether a quiz can be replayed or reviewed.

## Cara Menjalankan

### Opsi 1: Node.js (Paling Mudah)
1. Buka terminal di folder proyek.
2. Jalankan perintah:
   ```bash
   node server.js
   ```
3. Buka [http://localhost:6767](http://localhost:6767).

### Opsi 2: Nginx (Recommended)
1. Download Nginx untuk Windows di [nginx.org](https://nginx.org/en/download.html).
2. Jalankan perintah ini (sesuaikan path ke file `nginx.conf` proyek ini):
   ```bash
   nginx.exe -c "D:\Kuliah\Semester 4\TekPlat\Gemini CLI\The-Kriwils\nginx.conf"
   ```

### Opsi 3: Python (Instant)
```bash
python -m http.server 6767 --directory public
```