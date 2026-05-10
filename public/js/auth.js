// Supabase Configuration
const SUPABASE_URL = 'https://ynebeknksjncpuhznngp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InluZWJla25rc2puY3B1aHpubmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTgzMDUsImV4cCI6MjA5MzUzNDMwNX0.OmwDA8fApYKnkH9mOmZBkl51qN9-XOTCHVa9UgMXM0s';

let supabaseClient;

try {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
    } else {
        console.error('Supabase library not found! Make sure the CDN script is loaded.');
    }
} catch (e) {
    console.error('Error initializing Supabase:', e);
}

// Helper to convert username to internal email
const getInternalEmail = (username) => `${username.toLowerCase()}@thekriwils.local`;

async function registerUser(username, password) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");
    const email = getInternalEmail(username);
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: { username: username }
        }
    });
    return { data, error };
}

async function loginUser(username, password) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");
    const email = getInternalEmail(username);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
}

async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (!error) window.location.href = 'login.html';
}

async function checkSession() {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

// Dynamic Navigation Logic
async function renderNavigation() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const session = await checkSession();
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (session) {
        // Authenticated Menu: Home, Play, Quiz, About, Logout
        navLinks.innerHTML = `
            <li><a href="index.html" class="${currentPage === 'index.html' ? 'active' : ''}">Home</a></li>
            <li><a href="join.html" class="${currentPage === 'join.html' ? 'active' : ''}">Play</a></li>
            <li><a href="quizzes.html" class="${currentPage === 'quizzes.html' ? 'active' : ''}">Quiz</a></li>
            <li><a href="about.html" class="${currentPage === 'about.html' ? 'active' : ''}">About</a></li>
            <li><button onclick="logoutUser()" class="btn-logout">Logout</button></li>
        `;
    } else {
        // Unauthenticated Menu: About, Login
        navLinks.innerHTML = `
            <li><a href="about.html" class="${currentPage === 'about.html' ? 'active' : ''}">About</a></li>
            <li><a href="login.html" class="${currentPage === 'login.html' ? 'active' : ''}">Login</a></li>
        `;
    }
}

// Global protection and nav rendering
document.addEventListener('DOMContentLoaded', () => {
    const protectedPaths = ['index.html', 'quizzes.html'];
    const currentPath = window.location.pathname.split('/').pop();

    checkSession().then(session => {
        // Handle protection
        if (protectedPaths.includes(currentPath) && !session) {
            window.location.href = 'login.html';
            return;
        }
        
        // Render Nav
        renderNavigation();
    });
});

/**
 * Custom Toast Notification System
 * @param {string} message 
 * @param {'success' | 'error' | 'info'} type 
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Create content element
    const content = document.createElement('div');
    content.className = 'toast-content';
    content.innerText = message;
    
    // Calculate dynamic font size based on message length
    // Short text (e.g. "Saved") will be large (1.8rem)
    // Long text (e.g. "Error: Something went wrong") will be smaller (1rem)
    let fontSize = 1.125; // Default base size
    const length = message.length;
    
    if (length < 15) {
        fontSize = 1.75;
    } else if (length < 30) {
        fontSize = 1.4;
    } else if (length < 50) {
        fontSize = 1.1;
    } else {
        fontSize = 0.9;
    }
    
    content.style.fontSize = `${fontSize}rem`;

    toast.appendChild(content);
    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

