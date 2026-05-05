let currentEditQuizId = "";
let currentEditQuestions = [];

/**
 * Fetches the current user's quizzes from Supabase and renders them.
 */
async function loadMyQuizzes() {
    const listContainer = document.getElementById('quizzesList');
    if (!listContainer) return;

    try {
        const session = await checkSession();
        if (!session) return;

        listContainer.innerHTML = `
            <div class="loading-wrapper" style="grid-column: 1/-1;">
                <div class="spinner"></div>
                <p>Loading your quizzes...</p>
            </div>
        `;

        const { data: quizzes, error } = await supabaseClient
            .from('quizzes')
            .select('*')
            .eq('creator_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!quizzes || quizzes.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">You haven\'t generated any quizzes yet.</p>';
            return;
        }

        listContainer.innerHTML = quizzes.map((quiz, index) => {
            const shareLink = `${window.location.origin}/play.html?quiz=${quiz.id}`;
            const questionCount = quiz.questions_json ? quiz.questions_json.length : 0;
            const quizTitle = quiz.title || quiz.topic; // Fallback to topic if title is null
            
            return `
                <div class="quiz-card" style="animation-delay: ${index * 0.1}s">
                    <button class="btn-edit" onclick="openEditModal('${quiz.id}')">✏️ Edit</button>
                    <div class="quiz-card-header">
                        <div class="quiz-card-topic">${quizTitle}</div>
                        <div class="quiz-card-meta">Topic: ${quiz.topic}</div>
                        <div class="quiz-card-meta">${quiz.difficulty.charAt(0).toUpperCase() + quiz.difficulty.slice(1)} • ${questionCount} Questions</div>
                    </div>
                    <div class="quiz-card-actions">
                        <button onclick="showStats('${quiz.id}', '${quizTitle.replace(/'/g, "\\'")}')" class="btn btn-primary">Stats</button>
                        <button onclick="copySpecificLink('${shareLink}')" class="btn btn-secondary">Copy Link</button>
                        <button onclick="deleteQuiz('${quiz.id}')" class="btn btn-danger">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading quizzes:', err);
        listContainer.innerHTML = '<p style="text-align: center; color: #dc2626; grid-column: 1/-1;">Failed to load your quizzes.</p>';
    }
}

/**
 * Deletes a quiz from Supabase after user confirmation.
 */
async function deleteQuiz(quizId) {
    if (!confirm("Are you sure you want to delete this quiz? This will also remove all player results and cannot be undone.")) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('quizzes')
            .delete()
            .eq('id', quizId);

        if (error) throw error;
        
        alert("Quiz deleted successfully.");
        loadMyQuizzes(); // Refresh the list
    } catch (err) {
        console.error('Error deleting quiz:', err);
        alert(`Failed to delete quiz: ${err.message}`);
    }
}

/**
 * Opens the Edit Modal and populates it with the current quiz questions.
 */
async function openEditModal(quizId) {
    currentEditQuizId = quizId;
    const modal = document.getElementById('editQuizModal');
    const container = document.getElementById('editFormContainer');
    const saveBtn = document.getElementById('saveEditBtn');

    container.innerHTML = '<p style="text-align: center;">Loading quiz content...</p>';
    saveBtn.disabled = true;
    modal.style.display = 'flex';

    try {
        const { data: quiz, error } = await supabaseClient
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .single();

        if (error) throw error;

        currentEditQuestions = quiz.questions_json;
        saveBtn.disabled = false;

        container.innerHTML = currentEditQuestions.map((q, qIndex) => `
            <div class="edit-q-block" data-index="${qIndex}">
                <h4>Question ${qIndex + 1}</h4>
                <div class="form-group">
                    <label>Question Text</label>
                    <input type="text" class="edit-q-text" value="${q.question.replace(/"/g, '&quot;')}">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    ${q.options.map((opt, oIndex) => `
                        <div class="form-group">
                            <label>Option ${oIndex + 1}</label>
                            <input type="text" class="edit-opt" data-opt-index="${oIndex}" value="${opt.replace(/"/g, '&quot;')}">
                        </div>
                    `).join('')}
                </div>
                <div class="form-group">
                    <label>Correct Answer</label>
                    <select class="edit-answer">
                        ${[0, 1, 2, 3].map(val => `<option value="${val}" ${q.answer == val ? 'selected' : ''}>Option ${val + 1}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Explanation</label>
                    <textarea class="edit-explanation" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; height: 80px;">${q.explanation || ''}</textarea>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error loading quiz for edit:', err);
        container.innerHTML = '<p style="color: #dc2626; text-align: center;">Failed to load quiz content.</p>';
    }
}

/**
 * Gathers the edited data and saves it back to Supabase.
 */
async function saveQuizEdits() {
    const saveBtn = document.getElementById('saveEditBtn');
    const blocks = document.querySelectorAll('.edit-q-block');
    const updatedQuestions = [];

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    try {
        blocks.forEach(block => {
            const question = block.querySelector('.edit-q-text').value.trim();
            const explanation = block.querySelector('.edit-explanation').value.trim();
            const answer = parseInt(block.querySelector('.edit-answer').value);
            const options = Array.from(block.querySelectorAll('.edit-opt')).map(input => input.value.trim());

            if (!question || options.some(o => !o)) {
                throw new Error("All questions and options must be filled out!");
            }

            updatedQuestions.push({ question, options, answer, explanation });
        });

        const { error } = await supabaseClient
            .from('quizzes')
            .update({ questions_json: updatedQuestions })
            .eq('id', currentEditQuizId);

        if (error) throw error;

        alert("Quiz updated successfully!");
        closeEditModal();
        loadMyQuizzes(); // Refresh cards

    } catch (err) {
        console.error('Error saving edits:', err);
        alert(`Failed to save: ${err.message}`);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "Save Changes";
    }
}

function closeEditModal() {
    document.getElementById('editQuizModal').style.display = 'none';
}

/**
 * Shows the Top 5 Leaderboard or all results for a specific quiz.
 */
async function showStats(quizId, topic, viewAll = false) {
    const modal = document.getElementById('statsModal');
    const container = document.getElementById('statsContainer');
    const title = document.getElementById('modalTitle');

    title.innerText = viewAll ? `All Scores: ${topic}` : `Top 5 Leaderboard: ${topic}`;
    container.innerHTML = '<p style="text-align: center;">Loading results...</p>';
    modal.style.display = 'flex';

    try {
        let query = supabaseClient
            .from('quiz_results')
            .select('*')
            .eq('quiz_id', quizId);
        
        if (viewAll) {
            // All results newest first
            query = query.order('created_at', { ascending: false });
        } else {
            // Top 5 by score
            query = query.order('score', { ascending: false })
                         .order('created_at', { ascending: true })
                         .limit(5);
        }

        const { data: results, error } = await query;

        if (error) throw error;

        const toggleBtnHtml = `
            <button onclick="showStats('${quizId}', '${topic.replace(/'/g, "\\'")}', ${!viewAll})" class="btn-secondary" style="margin-bottom: 1.5rem; width: auto; font-size: 0.8125rem; padding: 0.5rem 1rem;">
                ${viewAll ? '← Show Top 5 Leaderboard' : 'Show All Scores (By Time) →'}
            </button>
        `;

        if (!results || results.length === 0) {
            container.innerHTML = `
                ${toggleBtnHtml}
                <p style="text-align: center; color: var(--text-muted); padding: 2rem;">No one has played this quiz yet.</p>
            `;
            return;
        }

        container.innerHTML = `
            ${toggleBtnHtml}
            <table class="stats-table">
                <thead>
                    <tr>
                        ${viewAll ? '<th>Time</th>' : '<th>Rank</th>'}
                        <th>Player</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map((res, index) => `
                        <tr>
                            <td>${viewAll ? new Date(res.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : `<strong>#${index + 1}</strong>`}</td>
                            <td><strong>${res.player_name}</strong></td>
                            <td>${res.score}/${res.total_questions}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error('Error loading stats:', err);
        container.innerHTML = '<p style="color: #dc2626; text-align: center;">Failed to load stats.</p>';
    }
}

function closeStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
}

/**
 * Helper to copy a specific link to clipboard.
 */
function copySpecificLink(link) {
    navigator.clipboard.writeText(link);
    alert("Link copied to clipboard!");
}

// Load quizzes on initial page load
document.addEventListener('DOMContentLoaded', loadMyQuizzes);
