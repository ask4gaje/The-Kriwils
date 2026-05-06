const GEMINI_API_KEY = 'AIzaSyA_gKJFHKVwXggzUm_Dpp_4qqf8WoRLJ3I';

/**
 * Calls Gemini API with a retry mechanism and model fallback.
 * Primary: gemini-flash-latest, Fallback: gemini-pro-latest
 */
async function askGeminiWithRetry(prompt, retries = 3, delay = 2000) {
    const models = ['gemini-flash-latest', 'gemini-pro-latest'];
    
    for (const model of models) {
        console.log(`Attempting generation with model: ${model}`);
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });

                const data = await response.json();

                // Handle 503 Service Unavailable or "high demand" errors
                if (response.status === 503 || (data.error && data.error.code === 503) || (data.error && data.error.message.includes("high demand"))) {
                    console.warn(`Model ${model} is busy (Attempt ${i + 1}/${retries}). Retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2; // Exponential backoff
                    continue;
                }

                if (!response.ok || data.error) {
                    throw new Error(data.error ? data.error.message : `HTTP error! status: ${response.status}`);
                }

                return data;
            } catch (err) {
                // If it's the last retry of the last model, throw the error
                if (i === retries - 1 && model === models[models.length - 1]) throw err;
                console.error(`Attempt ${i + 1} for ${model} failed:`, err.message);
            }
        }
        console.warn(`Model ${model} failed after ${retries} attempts. Trying fallback model...`);
    }
}

/**
 * Generates a random 6-character short code for Pretty URLs.
 */
function generateShortCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

document.getElementById('generateBtn').onclick = async function() {
    const title = document.getElementById('quizTitle').value.trim();
    const topic = document.getElementById('quizTopic').value.trim();
    const difficulty = document.getElementById('quizDifficulty').value;
    const count = document.getElementById('quizCount').value;
    const isReplayable = document.getElementById('isReplayable').checked;
    const isReviewable = document.getElementById('isReviewable').checked;
    const resultsDiv = document.getElementById('quizResults');
    const generateBtn = document.getElementById('generateBtn');

    if (!title) {
        alert("Please enter a Quiz Title!");
        return;
    }

    if (!topic) {
        alert("Please enter a topic!");
        return;
    }

    // UI Feedback
    generateBtn.disabled = true;
    generateBtn.innerText = "Generating Quiz...";
    resultsDiv.style.display = "block";
    resultsDiv.innerHTML = `
        <div class="loading-wrapper">
            <div class="spinner"></div>
            <p>AI is crafting your questions for <strong>${title}</strong>...<br><small>This may take a few retries if the server is busy.</small></p>
        </div>
    `;

    try {
        // 1. Prepare Prompt
        const prompt = `Generate a quiz about "${topic}" with ${difficulty} difficulty. 
        Return strictly a JSON array of ${count} objects. 
        All content (questions, options, explanations) MUST be in Indonesian language.
        Each object must have: "question", "options" (array of 4 strings), and "answer" (index of correct option 0-3), and "explanation" (a brief explanation in Indonesian of why the answer is correct).
        Example: [{"question": "Apa itu 1+1?", "options": ["1", "2", "3", "4"], "answer": 1, "explanation": "1 tambah 1 adalah 2."}]`;

        // 2. Call Gemini API with Retry
        const data = await askGeminiWithRetry(prompt);

        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("AI failed to generate a response. Please try a different topic.");
        }

        let text = data.candidates[0].content.parts[0].text;
        
        // Robust JSON extraction (finds the first '[' and last ']')
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start === -1 || end === -1) {
            throw new Error("AI returned an invalid data format. Please try again.");
        }

        const questions = JSON.parse(text.substring(start, end + 1));

        // 3. Save to Supabase
        const session = await checkSession();
        if (!session) {
            alert("Session expired. Please log in again.");
            window.location.href = 'login.html';
            return;
        }

        const { data: quizRecord, error } = await supabaseClient
            .from('quizzes')
            .insert({
                creator_id: session.user.id,
                title: title,
                topic: topic,
                difficulty: difficulty,
                questions_json: questions,
                is_replayable: isReplayable,
                is_reviewable: isReviewable,
                short_code: generateShortCode()
            })
            .select()
            .single();

        if (error) throw error;

        // 4. Display Success & Link
        const shareLink = `${window.location.origin}/play/${quizRecord.short_code}`;
        resultsDiv.innerHTML = `
            <div style="background: #ecfdf5; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #10b981; margin-top: 2rem;">
                <h3 style="color: #065f46; margin-bottom: 0.5rem;">✨ Quiz Generated Successfully!</h3>
                <p style="font-size: 0.875rem; color: #065f46; margin-bottom: 1rem;">Your quiz <strong>${title}</strong> is ready. You can share the link below with anyone.</p>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" value="${shareLink}" readonly id="shareLinkInput" style="flex: 1; padding: 0.5rem; border: 1px solid #10b981; border-radius: 0.5rem;">
                    <button onclick="copyLink()" style="width: auto; padding: 0.5rem 1rem; background: #10b981;">Copy</button>
                </div>
                <p style="margin-top: 1rem; font-size: 0.875rem;"><a href="${shareLink}" target="_blank" style="color: #047857; font-weight: 600;">Play it now →</a></p>
            </div>
        `;

    } catch (err) {
        console.error('Final Generation Error:', err);
        resultsDiv.innerHTML = `<p style="color: #dc2626; text-align:center;">Failed after multiple retries: ${err.message}. Please wait a minute and try again.</p>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerText = "Generate Quiz";
    }
};

function copyLink() {
    const copyText = document.getElementById("shareLinkInput");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("Link copied to clipboard!");
}
