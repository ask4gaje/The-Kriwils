let supabaseClient;
let initPromise = null;

function renderAuthSplash(subtitle) {
    var el = document.querySelector('.auth-splash');
    if (!el) return;
    el.innerHTML = '' +
        '<div class="splash-blob" aria-hidden="true"></div>' +
        '<div class="splash-blob" aria-hidden="true"></div>' +
        '<div class="splash-blob" aria-hidden="true"></div>' +
        '<svg class="splash-constellation" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
        '<svg class="splash-constellation" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
        '<svg class="splash-constellation" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
        '<svg class="splash-constellation" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
        '<svg class="splash-constellation" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="splash-particle" aria-hidden="true"></div>' +
        '<div class="auth-splash-content">' +
            '<svg class="brand-logo-splash" viewBox="0 0 32 36" fill="none" aria-hidden="true">' +
                '<defs>' +
                    '<linearGradient id="logoGradA" x1="0" y1="0" x2="1" y2="1">' +
                        '<stop offset="0%" stop-color="#818cf8"/>' +
                        '<stop offset="100%" stop-color="#a5b4fc"/>' +
                    '</linearGradient>' +
                '</defs>' +
                '<path d="M8 10C8 6 11 2 16 2C21 2 24 6 24 10C24 14 22 17 18 19L17 20V24" stroke="url(#logoGradA)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
                '<circle cx="17" cy="31" r="2.5" fill="url(#logoGradA)"/>' +
            '</svg>' +
            '<div class="auth-splash-brand">The Kriwils</div>' +
            '<div class="auth-splash-tagline">AI-Powered Quiz Platform</div>' +
            (subtitle ? '<div class="auth-splash-subtitle">' + escapeHtml(subtitle) + '</div>' : '') +
        '</div>';
}

var _errorMap = {
    'Invalid login credentials': 'The email or password you entered is incorrect.',
    'Email not confirmed': 'Please verify your email before logging in. Check your inbox for the confirmation link.',
    'User already registered': 'An account with this email already exists. Try logging in instead.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
    'New password should be different from the old password': 'Your new password must be different from your current password.',
    'Email rate limit exceeded': 'Too many attempts. Please wait a moment before trying again.',
    'For security purposes, you can only request this after': 'Please wait before requesting another reset link.',
    'Token has expired or is invalid': 'This link has expired or is no longer valid. Please request a new one.',
    'Invalid request': 'This link is invalid or has expired. Please request a new one.',
    'User not found': 'No account found with this email address.',
    'Could not connect to database': 'Unable to reach our servers. Please check your connection and try again.'
};

var _errorLowerKeys = Object.keys(_errorMap).reduce(function(acc, key) {
    acc[key.toLowerCase()] = _errorMap[key];
    return acc;
}, {});

function humanizeError(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    var msg = (err.message || String(err)).toLowerCase();
    for (var i = 0; i < Object.keys(_errorLowerKeys).length; i++) {
        var key = Object.keys(_errorLowerKeys)[i];
        if (msg.indexOf(key) !== -1) return _errorLowerKeys[key];
    }
    return err.message || 'An unexpected error occurred. Please try again.';
}

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

async function changePassword(email, currentPassword, newPassword) {
    const client = await getSupabase();
    if (!client) throw new Error("Could not connect to database. Please refresh.");

    const { error: signInError } = await client.auth.signInWithPassword({
        email,
        password: currentPassword
    });
    if (signInError) throw signInError;

    const { error: updateError } = await client.auth.updateUser({
        password: newPassword
    });
    if (updateError) throw updateError;

    return { success: true };
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

    if (session) {
        const displayName = session.user.user_metadata?.display_name || session.user.email || 'Account';
        const avatarUrl = session.user.user_metadata?.avatar_url;
        const nameParts = displayName.trim().split(/\s+/);
        const initials = nameParts.length > 1
            ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
            : displayName.slice(0, 2).toUpperCase();

        const avatarContent = avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" alt="" class="avatar-img">`
            : escapeHtml(initials);

        navLinks.innerHTML = `
            <li><a href="/create" class="${currentPage === 'create' ? 'active' : ''}">Create</a></li>
            <li><a href="/join" class="${currentPage === 'join' ? 'active' : ''}">Play</a></li>
            <li><a href="/quizzes" class="${currentPage === 'quizzes' ? 'active' : ''}">Quiz</a></li>
            <li><a href="/about" class="${currentPage === 'about' ? 'active' : ''}">About</a></li>
            <li class="account-dropdown">
                <button onclick="toggleAccountDropdown(event)" class="btn-account${currentPage === 'account' ? ' active' : ''}">
                    <span class="avatar">${avatarContent}</span>
                    <span class="account-name">${escapeHtml(displayName)}</span>
                    <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="account-dropdown-menu">
                    <a href="/account">Account</a>
                    <hr class="dropdown-divider">
                    <button onclick="logoutUser()" class="dropdown-logout">Logout</button>
                </div>
            </li>
        `;
    } else {
        navLinks.innerHTML = `
            <li><a href="/join" class="${currentPage === 'join' ? 'active' : ''}">Play</a></li>
            <li><a href="/about" class="${currentPage === 'about' ? 'active' : ''}">About</a></li>
            <li><a href="/login" class="btn-login">Login</a></li>
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

document.addEventListener('DOMContentLoaded', async () => {
    const protectedPaths = ['create', 'quizzes', 'account'];
    const fullPath = window.location.pathname;
    const pathParts = fullPath.split('/').pop().replace('.html', '').split('?');
    const currentPath = pathParts[0];

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

function setButtonLoading(btn, text) {
    if (!btn) return;
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.classList.add('btn-loading');
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    btn.textContent = '';
    btn.appendChild(spinner);
    btn.appendChild(document.createTextNode(text));
}

function resetButton(btn, text) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = text || btn.dataset.originalText || '';
}
