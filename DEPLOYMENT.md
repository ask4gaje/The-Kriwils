# Deployment Guide: The Kriwils

This guide explains how to set up the **Production Server** and sync changes from your **Development Laptop**.

## 1. Initial Server Setup
On your server device (the one that will stay on 24/7):

1. **Install Prerequisites**:
   - Node.js (Latest LTS)
   - Git
   - PM2: `npm install -g pm2 pm2-windows-startup`

2. **Clone the Project**:
   ```powershell
   git clone <your-repository-url>
   cd The-Kriwils
   npm install
   ```

3. **Configure Environment**:
   - Ensure your `.env` (if any) or Supabase credentials in `public/js/auth.js` are correct for production.

4. **Start the App**:
   ```powershell
   pm2 start server.js --name "the-kriwils-prod"
   pm2-startup install
   pm2 save
   ```

---

## 2. Cloudflare Tunnel Setup (External Access)
On the server device:

1. **Install cloudflared**: [Download here](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi).
2. **Login**: `cloudflared tunnel login`
3. **Create Tunnel**: `cloudflared tunnel create kriwils-tunnel`
4. **Route DNS**: `cloudflared tunnel route dns kriwils-tunnel quiz.yourdomain.com`
5. **Run Tunnel**:
   Create a `config.yml`:
   ```yaml
   url: http://localhost:6767
   tunnel: <TUNNEL_ID>
   credentials-file: C:\Users\<USER>\.cloudflared\<TUNNEL_ID>.json
   ```
   Run it: `cloudflared tunnel run`

---

## 3. Workflow: Syncing Changes
When you finish a feature on your **Development Laptop**:

1. **Laptop**: 
   ```powershell
   git add .
   git commit -m "feat: description"
   git push origin main
   ```

2. **Server**:
   ```powershell
   git pull
   pm2 restart the-kriwils-prod
   ```

---

## 4. Best Practices
- **Database**: Use a separate Supabase Project for production if you want to keep test data away from real users.
- **Monitoring**: Check logs on the server using `pm2 logs`.
- **Security**: Never share your `.json` credentials file from the `.cloudflared` folder.
