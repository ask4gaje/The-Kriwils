# Project: The Kriwils

An AI-powered quiz platform where you can generate, play, edit, and share custom quizzes in Indonesian.

## Features
- **AI Quiz Generation**: Create quizzes on any topic using Gemini 1.5/2.5.
- **PDF-to-Quiz**: Upload a PDF (max 50 pages) to generate highly contextualized questions.
- **Indonesian Localization**: All AI-generated content and explanations are in Indonesian.
- **Smart High Scores**: Players are remembered by name; only their best attempt is saved to the leaderboard.
- **Pretty URLs**: Modern, shareable links like `/play/ABC123` for every quiz.
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