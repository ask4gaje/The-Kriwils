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
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

// Global protection for index.html (Dashboard)
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
    checkSession().then(session => {
        if (!session) {
            window.location.href = 'login.html';
        }
    });
}
