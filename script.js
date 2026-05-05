console.log('Website loaded successfully!');

// Login Modal Logic
const loginBtn = document.getElementById('loginBtn');
const loginModal = document.getElementById('loginModal');
const closeLogin = document.getElementById('closeLogin');

if (loginBtn && loginModal) {
    loginBtn.onclick = () => loginModal.style.display = 'block';
    closeLogin.onclick = () => loginModal.style.display = 'none';
}