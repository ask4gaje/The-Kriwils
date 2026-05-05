const GEMINI_API_KEY = 'AIzaSyA_gKJFHKVwXggzUm_Dpp_4qqf8WoRLJ3I';

document.getElementById('generateBtn').onclick = async function() {
    const topic = document.getElementById('quizTopic').value;
    const difficulty = document.getElementById('quizDifficulty').value;
    const resultsDiv = document.getElementById('quizResults');
    const generateBtn = document.getElementById('generateBtn');

    if (!topic) {
        alert("Please enter a topic!");
        return;
    }

    // UI Feedback
    generateBtn.disabled = true;
    generateBtn.innerText = "Generating Quiz...";
    resultsDiv.style.display = "block";
    resultsDiv.innerHTML = `<p style="text-align:center;">AI is crafting your questions for <strong>${topic}</strong> (${difficulty})...</p>`;

    try {
        // 1. Call Gemini API
        const prompt = `Generate a quiz about "${topic}" with ${difficulty} difficulty. 
        Return strictly a JSON array of 5 objects. 
        Each object must have: "question", "options" (array of 4 strings), and "answer" (index of correct option 0-3).
        Example: [{"question": "What is 1+1?", "options": ["1", "2", "3", "4"], "answer": 1}]`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text;
        
        // Clean up markdown code blocks if AI included them
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const questions = JSON.parse(text);

        // 2. Save to Supabase
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
                topic: topic,
                difficulty: difficulty,
                questions_json: questions
            })
            .select()
            .single();

        if (error) throw error;

        // 3. Display Success & Link
        const shareLink = `${window.location.origin}/play.html?quiz=${quizRecord.id}`;
        resultsDiv.innerHTML = `
            <div style="background: #ecfdf5; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #10b981; margin-top: 2rem;">
                <h3 style="color: #065f46; margin-bottom: 0.5rem;">✨ Quiz Generated Successfully!</h3>
                <p style="font-size: 0.875rem; color: #065f46; margin-bottom: 1rem;">Your quiz about <strong>${topic}</strong> is ready. Only you can see the results, but anyone with the link below can play it.</p>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" value="${shareLink}" readonly id="shareLinkInput" style="flex: 1; padding: 0.5rem; border: 1px solid #10b981; border-radius: 0.5rem;">
                    <button onclick="copyLink()" style="width: auto; padding: 0.5rem 1rem; background: #10b981;">Copy</button>
                </div>
                <p style="margin-top: 1rem; font-size: 0.875rem;"><a href="${shareLink}" target="_blank" style="color: #047857; font-weight: 600;">Play it now →</a></p>
            </div>
        `;

    } catch (err) {
        console.error('Generation Error:', err);
        resultsDiv.innerHTML = `<p style="color: #dc2626; text-align:center;">Failed to generate quiz: ${err.message}. Please try again.</p>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerText = "Generate Quiz";
    }
};

function copyLink() {
    const copyText = document.getElementById("shareLinkInput");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
    alert("Link copied to clipboard!");
}
