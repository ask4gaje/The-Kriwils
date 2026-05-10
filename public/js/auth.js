let supabaseClient;
let initPromise = null;

/**
 * Dynamically fetches Supabase configuration from the server.
 * This prevents keys from being hardcoded in the frontend.
 */
async function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            if (typeof supabase !== 'undefined') {
                supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
                console.log('Supabase client initialized dynamically');
                return supabaseClient;
            } else {
                console.error('Supabase library not found!');
                return null;
            }
        } catch (e) {
            console.error('Error fetching config or initializing Supabase:', e);
            return null;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

/**
 * Global getter to ensure Supabase is ready
 */
async function getSupabase() {
    if (supabaseClient) return supabaseClient;
    return await initSupabase();
}

// Helper to convert username to internal email
const getInternalEmail = (username) => `${username.toLowerCase()}@thekriwils.local`;

async function registerUser(username, password) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");
    
    const email = getInternalEmail(username);
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: { username: username }
        }
    });
    return { data, error };
}

async function loginUser(username, password) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

    const email = getInternalEmail(username);
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
}

async function logoutUser() {
    const client = await getSupabase();
    if (client) {
        const { error } = await client.auth.signOut();
        if (!error) window.location.href = 'login.html';
    } else {
        window.location.href = 'login.html';
    }
}

async function checkSession() {
    const client = await getSupabase();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    return session;
}

// Dynamic Navigation Logic
async function renderNavigation() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const session = await checkSession();
    // Improved path extraction to handle query params and root
    const fullPath = window.location.pathname;
    let currentPage = fullPath.split('/').pop() || 'join.html'; // Root is join.html on dev branch
    if (fullPath === '/' || fullPath === '') currentPage = 'join.html';

    if (session) {
        // Authenticated Menu: Create, Play, Quiz, About, Logout
        navLinks.innerHTML = `
            <li><a href="index.html" class="${currentPage === 'index.html' ? 'active' : ''}">Create</a></li>
            <li><a href="join.html" class="${currentPage === 'join.html' ? 'active' : ''}">Play</a></li>
            <li><a href="quizzes.html" class="${currentPage === 'quizzes.html' ? 'active' : ''}">Quiz</a></li>
            <li><a href="about.html" class="${currentPage === 'about.html' ? 'active' : ''}">About</a></li>
            <li><button onclick="logoutUser()" class="btn-logout">Logout</button></li>
        `;
    } else {
        // Unauthenticated Menu: Play, About, Login
        navLinks.innerHTML = `
            <li><a href="join.html" class="${currentPage === 'join.html' ? 'active' : ''}">Play</a></li>
            <li><a href="about.html" class="${currentPage === 'about.html' ? 'active' : ''}">About</a></li>
            <li><a href="login.html" class="btn-login">Login</a></li>
        `;
    }
}

// Global protection and nav rendering
document.addEventListener('DOMContentLoaded', async () => {
    const protectedPaths = ['index.html', 'quizzes.html'];
    // Extract clean path without query params
    const pathParts = window.location.pathname.split('/').pop().split('?');
    const currentPath = pathParts[0];

    // Ensure Supabase is initialized before checking session
    await initSupabase();

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
