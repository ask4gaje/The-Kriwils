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

async function registerUser(email, password, displayName) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: { display_name: displayName || email }
        }
    });
    return { data, error };
}

async function resendConfirmationEmail(email) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

    const { error } = await client.auth.resend({ type: 'signup', email });
    if (error) throw error;
    return { success: true };
}

async function setPasswordFromRecovery(newPassword) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { success: true };
}

async function loginUser(email, password) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

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
        if (!error) window.location.href = '/login';
    } else {
        window.location.href = '/login';
    }
}

async function resetPassword(email) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");
    const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/updatepassword`
    });
    if (error) throw error;
}

async function deleteAccount() {
    const session = await checkSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');
    await client.auth.signOut();
    return data;
}

async function confirmDeleteAccount() {
    const input = prompt('Type DELETE to permanently remove your account and all data:');
    if (input !== 'DELETE') {
        showToast('Account deletion cancelled.', 'info');
        return;
    }

    try {
        showToast('Deleting account...', 'info');
        await deleteAccount();
        localStorage.clear();
        showToast('Account deleted permanently.', 'success');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (err) {
        showToast(err.message, 'error');
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
    const fullPath = window.location.pathname;
    const rawPage = fullPath.replace(/\/$/, '').split('/').pop() || 'join';
    const currentPage = rawPage.replace('.html', '').split('?')[0].split('#')[0];
    const themeIcon = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';

    if (session) {
        const displayName = session.user.user_metadata?.display_name || session.user.email || 'Account';
        const nameParts = displayName.trim().split(/\s+/);
        const initials = nameParts.length > 1
            ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
            : displayName.slice(0, 2).toUpperCase();

        navLinks.innerHTML = `
            <li><a href="/create" class="${currentPage === 'create' ? 'active' : ''}">Create</a></li>
            <li><a href="/join" class="${currentPage === 'join' ? 'active' : ''}">Play</a></li>
            <li><a href="/quizzes" class="${currentPage === 'quizzes' ? 'active' : ''}">Quiz</a></li>
            <li><a href="/about" class="${currentPage === 'about' ? 'active' : ''}">About</a></li>
            <li class="account-dropdown">
                <button onclick="toggleAccountDropdown(event)" class="btn-account${currentPage === 'account' ? ' active' : ''}">
                    <span class="avatar">${escapeHtml(initials)}</span>
                    <span class="account-name">${escapeHtml(displayName)}</span>
                    <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="account-dropdown-menu">
                    <a href="/account">Account</a>
                    <hr class="dropdown-divider">
                    <button onclick="logoutUser()" class="dropdown-logout">Logout</button>
                </div>
            </li>
            <li><button onclick="toggleTheme()" class="btn-theme" aria-label="Toggle theme">${themeIcon}</button></li>
        `;
    } else {
        navLinks.innerHTML = `
            <li><a href="/join" class="${currentPage === 'join' ? 'active' : ''}">Play</a></li>
            <li><a href="/about" class="${currentPage === 'about' ? 'active' : ''}">About</a></li>
            <li><a href="/login" class="btn-login">Login</a></li>
            <li><button onclick="toggleTheme()" class="btn-theme" aria-label="Toggle theme">${themeIcon}</button></li>
        `;
    }
}

function toggleAccountDropdown(event) {
    event.stopPropagation();
    event.currentTarget.closest('.account-dropdown').classList.toggle('open');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.account-dropdown')) {
        document.querySelectorAll('.account-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    const btn = document.querySelector('.btn-theme');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// Global protection and nav rendering
document.addEventListener('DOMContentLoaded', async () => {
    const protectedPaths = ['create', 'quizzes', 'account'];
    const fullPath = window.location.pathname;
    const pathParts = fullPath.split('/').pop().replace('.html', '').split('?');
    const currentPath = pathParts[0];

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;

    await initSupabase();

    checkSession().then(session => {
        // 1. Handle root redirection for logged-in users
        if ((fullPath === '/' || fullPath === '') && session) {
            if (window.location.hash && window.location.hash.includes('type=recovery')) {
                window.location.href = '/updatepassword' + window.location.hash;
                return;
            }
            window.location.href = '/create';
            return;
        }

        // 2. Handle protection
        if (protectedPaths.includes(currentPath) && !session) {
            window.location.href = '/login';
            return;
        }
        
        document.body.style.visibility = 'visible';
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
        container.setAttribute('aria-live', 'polite');
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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
    } else {
        input.type = 'password';
        btn.textContent = 'Show';
    }
}
