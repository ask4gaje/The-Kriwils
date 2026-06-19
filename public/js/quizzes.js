let currentEditQuizId = "";
let currentEditQuestions = [];

async function api(method, path, body = null) {
    const session = await checkSession();
    if (!session) throw new Error('Session expired. Please login again.');

    const opts = {
        method,
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data;
}

/**
 * Fetches the current user's quizzes from Supabase and renders them.
 */
async function loadMyQuizzes() {
    const listContainer = document.getElementById('quizzesList');
    if (!listContainer) return;

    try {
        if (listContainer.innerHTML.includes('spinner') && !listContainer.querySelector('.quiz-card')) {
            listContainer.innerHTML = `
                <div class="loading-wrapper loading-wrapper-full">
                    <div class="spinner"></div>
                    <p>Loading your quizzes...</p>
                </div>
            `;
        }

        const data = await api('GET', '/api/my-quizzes');
        let quizzes = data.quizzes || [];

        if (!quizzes || quizzes.length === 0) {
            listContainer.innerHTML = `
                <div class="stats-empty quizzes-empty">
                    <div class="stats-empty-emoji">*</div>
                    <p class="stats-empty-text">No quizzes yet, create your first one!</p>
                    <button onclick="window.location.href='/create'" class="empty-state-btn">Create your first quiz</button>
                </div>
            `;
            return;
        }

        const search = document.getElementById('quizSearch').value.trim().toLowerCase();
        const sort = document.getElementById('quizSort').value;

        if (search) {
            quizzes = quizzes.filter(q => {
                const title = (q.title || '').toLowerCase();
                const topic = (q.topic || '').toLowerCase();
                return title.includes(search) || topic.includes(search);
            });
        }

        if (sort === 'questions') {
            quizzes.sort((a, b) => (b.questions_json || []).length - (a.questions_json || []).length);
        } else if (sort === 'hardest') {
            const order = { hard: 3, medium: 2, easy: 1 };
            quizzes.sort((a, b) => (order[b.difficulty] || 0) - (order[a.difficulty] || 0));
        } else {
            quizzes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        listContainer.innerHTML = quizzes.map((quiz, index) => {
            const isPending = quiz.status === 'pending';
            const quizTitle = quiz.title || quiz.topic || "Untitled Quiz";
            const questionCount = quiz.questions_json ? quiz.questions_json.length : 0;
            const shareLink = quiz.short_code 
                ? `${window.location.origin}/play/${quiz.short_code}`
                : `${window.location.origin}/play?quiz=${quiz.id}`;
            const diffClass = `quiz-card-difficulty-${quiz.difficulty || 'medium'}`;

            if (isPending) {
                return `
                    <div class="quiz-card quiz-card-pending ${diffClass}" style="animation-delay: ${index * 0.1}s">
                        <div class="quiz-card-header">
                            <div class="quiz-card-topic quiz-card-pending-topic">Generating: ${escapeHtml(quizTitle)}</div>
                            <div class="quiz-card-meta">AI is writing your questions...</div>
                            <div class="spinner quiz-card-pending-spinner"></div>
                        </div>
                        <div class="quiz-card-actions">
                            <button disabled class="btn btn-secondary quiz-card-pending-btn">Please wait...</button>
                        </div>
                    </div>
                `;
            }

            const createdTime = quiz.created_at ? timeAgo(quiz.created_at) : '';

            return `
                <div class="quiz-card ${diffClass}" style="animation-delay: ${index * 0.1}s">
                    <div class="card-top-actions">
                        <button class="btn-edit" onclick="openEditModal('${quiz.id}')">Edit</button>
                        <button class="btn-utility" onclick="exportToPDF('${quiz.id}')">Print</button>
                    </div>
                    <div class="quiz-card-header">
                        <div class="quiz-card-topic">${escapeHtml(quizTitle)}</div>
                        <div class="quiz-card-meta">Topic: ${escapeHtml(quiz.topic)}</div>
                        ${quiz.short_code ? `<div class="quiz-card-meta">Code: ${escapeHtml(quiz.short_code)}</div>` : ''}
                        <div class="quiz-card-meta">${quiz.difficulty.charAt(0).toUpperCase() + quiz.difficulty.slice(1)} • ${questionCount} Questions</div>
                        ${createdTime ? `<div class="quiz-card-timestamp">Created ${createdTime}</div>` : ''}
                    </div>
                    <div class="quiz-card-actions">
                        <button onclick="showStats('${quiz.id}', '${quizTitle.replace(/'/g, "\\'")}')" class="btn btn-primary">Stats</button>
                        <button onclick="copySpecificLink('${shareLink}')" class="btn btn-secondary">Copy Link</button>
                        <button onclick="deleteQuiz('${quiz.id}')" class="btn btn-danger">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        if (quizzes.some(q => q.status === 'pending')) {
            setTimeout(loadMyQuizzes, 5000);
        }

    } catch (err) {
        console.error('Error loading quizzes:', err);
        listContainer.innerHTML = '<p class="error-state">Failed to load your quizzes.</p>';
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
        await api('DELETE', '/api/quiz/' + quizId);
        showToast("Quiz deleted successfully.", 'success');
        loadMyQuizzes();
    } catch (err) {
        console.error('Error deleting quiz:', err);
        showToast(`Failed to delete quiz: ${err.message}`, 'error');
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

    container.innerHTML = '<p class="loading-text-centered">Loading quiz content...</p>';
    saveBtn.disabled = true;
    modal.style.display = 'flex';

    try {
        const data = await api('GET', '/api/quiz/' + quizId);
        const quiz = data.quiz;

        currentEditQuestions = quiz.questions_json;
        saveBtn.disabled = false;

        let html = `
            <div class="edit-q-block edit-settings-block">
                <h4>General Settings</h4>
                <div class="form-group">
                    <label>Quiz Title</label>
                    <input type="text" id="editQuizTitle" value="${(quiz.title || quiz.topic || "").replace(/"/g, '&quot;')}">
                </div>
                <div class="checkbox-group edit-margin-top">
                    <label>
                        <input type="checkbox" id="editIsReplayable" ${quiz.is_replayable ? 'checked' : ''}> Allow students to replay this quiz
                    </label>
                    <label>
                        <input type="checkbox" id="editIsReviewable" ${quiz.is_reviewable ? 'checked' : ''}> Allow students to review answers
                    </label>
                </div>

            </div>
        `;

        html += currentEditQuestions.map((q, qIndex) => `
            <div class="edit-q-block" data-index="${qIndex}">
                <h4>Question ${qIndex + 1}</h4>
                <div class="form-group">
                    <label>Question Text</label>
                    <input type="text" class="edit-q-text" value="${q.question.replace(/"/g, '&quot;')}">
                </div>
                <div class="edit-options-grid">
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
                        ${[0, 1, 2, 3].map(val => `<option value="${val}" ${q.answer === val ? 'selected' : ''}>Option ${val + 1}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Explanation</label>
                    <textarea class="edit-explanation">${q.explanation || ''}</textarea>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading quiz for edit:', err);
        container.innerHTML = '<p class="error-state">Failed to load quiz content.</p>';
    }
}

/**
 * Gathers the edited data and saves it back to Supabase.
 */
async function saveQuizEdits() {
    const saveBtn = document.getElementById('saveEditBtn');
    const blocks = document.querySelectorAll('.edit-q-block[data-index]'); // Only question blocks
    const updatedTitle = document.getElementById('editQuizTitle').value.trim();
    const updatedIsReplayable = document.getElementById('editIsReplayable').checked;
    const updatedIsReviewable = document.getElementById('editIsReviewable').checked;

    const updatedQuestions = [];

    if (!updatedTitle) {
        showToast("Quiz Title cannot be empty!", 'error');
        return;
    }

    saveBtn.disabled = true;
    setButtonLoading(saveBtn, 'Saving...');

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

        await api('PATCH', '/api/quiz/' + currentEditQuizId, {
            title: updatedTitle,
            is_replayable: updatedIsReplayable,
            is_reviewable: updatedIsReviewable,

            questions_json: updatedQuestions
        });

        showToast("Quiz updated successfully!", 'success');
        closeEditModal();
        loadMyQuizzes(); // Refresh cards

    } catch (err) {
        console.error('Error saving edits:', err);
        showToast(`Failed to save: ${err.message}`, 'error');
    } finally {
        resetButton(saveBtn, 'Save Changes');
    }
}

function closeEditModal() {
    document.getElementById('editQuizModal').style.display = 'none';
}

function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

const RESULTS_PER_PAGE = 20;

/**
 * Shows the Top 5 Leaderboard or all results for a specific quiz.
 */
async function showStats(quizId, topic, viewAll = false, page = 1) {
    const modal = document.getElementById('statsModal');
    const container = document.getElementById('statsContainer');
    const modalTitle = document.getElementById('modalTitle');

    modalTitle.innerText = viewAll ? `All Scores: ${topic}` : `Top 5 Leaderboard: ${topic}`;
    container.innerHTML = '<p class="loading-text-centered">Loading results...</p>';
    modal.style.display = 'flex';

    try {
        const client = await getSupabase();
        if (!client) throw new Error("Database connection failed");

        // Summary query
        const { data: allData } = await client
            .from('quiz_results')
            .select('score, total_questions')
            .eq('quiz_id', quizId);

        const totalAttempts = allData ? allData.length : 0;
        let summaryHtml = '';
        if (allData && totalAttempts > 0) {
            const avgPct = Math.round(allData.reduce((s, r) => s + (r.score / r.total_questions) * 100, 0) / totalAttempts);
            const maxPct = Math.round(Math.max(...allData.map(r => (r.score / r.total_questions) * 100)));
            summaryHtml = `<div class="stats-summary">
                <div class="stat-tile">
                    <span class="stat-value">${totalAttempts}</span>
                    <span class="stat-label">attempts</span>
                </div>
                <div class="stat-tile">
                    <span class="stat-value">${avgPct}%</span>
                    <span class="stat-label">average</span>
                </div>
                <div class="stat-tile">
                    <span class="stat-value">${maxPct}%</span>
                    <span class="stat-label">highest</span>
                </div>
            </div>`;
        }

        // Main query
        let query = client.from('quiz_results').select('*').eq('quiz_id', quizId);

        if (viewAll) {
            const from = (page - 1) * RESULTS_PER_PAGE;
            const to = from + RESULTS_PER_PAGE - 1;
            query = query.order('created_at', { ascending: false }).range(from, to);
        } else {
            query = query.order('score', { ascending: false })
                         .order('created_at', { ascending: true })
                         .limit(5);
        }

        const { data: results, error } = await query;
        if (error) throw error;

        const escapedTopic = topic.replace(/'/g, "\\'");

        if (!results || results.length === 0) {
            container.innerHTML = `
                <div class="stats-empty">
                    <div class="stats-empty-emoji">-</div>
                    <p class="stats-empty-text">No one has played this quiz yet.</p>
                    <p class="stats-empty-subtext">Share the quiz code to get started!</p>
                </div>
            `;
            return;
        }

        const highlightName = localStorage.getItem('highlightPlayer_' + quizId) || '';

        function scoreClass(pct) {
            if (pct >= 80) return 'score-high';
            if (pct >= 50) return 'score-mid';
            return 'score-low';
        }

        const tableRows = results.map((res, index) => {
            const pct = Math.round((res.score / res.total_questions) * 100);
            const isHighlighted = highlightName && res.player_name.toLowerCase() === highlightName.toLowerCase();

            let rankCell;
            if (viewAll) {
                rankCell = timeAgo(res.created_at);
            } else {
                const rankNum = index + 1;
                rankCell = `<strong>#${rankNum}</strong>`;
            }

            return `
                <tr${isHighlighted ? ' class="highlight"' : ''}>
                    <td class="stats-rank">${rankCell}</td>
                    <td><strong>${escapeHtml(res.player_name)}</strong></td>
                    <td class="stats-score ${scoreClass(pct)}">${pct}%</td>
                </tr>
            `;
        }).join('');

        // Pagination for All Scores
        let paginationHtml = '';
        if (viewAll && totalAttempts > RESULTS_PER_PAGE) {
            const totalPages = Math.ceil(totalAttempts / RESULTS_PER_PAGE);
            paginationHtml = `<div class="pagination">
                <button ${page <= 1 ? 'disabled' : `onclick="showStats('${quizId}', '${escapedTopic}', true, ${page - 1})"`}>← Prev</button>
                <span>Page ${page} of ${totalPages}</span>
                <button ${page >= totalPages ? 'disabled' : `onclick="showStats('${quizId}', '${escapedTopic}', true, ${page + 1})"`}>Next →</button>
            </div>`;
        }

        container.innerHTML = `
            <div class="stats-toolbar">
                <button onclick="showStats('${quizId}', '${escapedTopic}', ${!viewAll}, 1)" class="btn-secondary stats-toggle-btn">
                    ${viewAll ? 'Show Leaderboard' : 'Show All Scores'}
                </button>
            </div>
            ${summaryHtml}
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>${viewAll ? 'Time' : 'Rank'}</th>
                        <th>Player</th>
                        <th class="stats-score-header">Score</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            ${paginationHtml}
        `;
    } catch (err) {
        console.error('Error loading stats:', err);
        container.innerHTML = '<p class="error-state">Failed to load stats.</p>';
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
    showToast("Link copied to clipboard!", 'info');
}

/**
 * Dynamically generates a printable HTML layout and triggers the browser print dialog.
 */
async function exportToPDF(quizId) {
    try {
        const quizData = await api('GET', '/api/quiz/' + quizId);
        const quiz = quizData.quiz;
        const quizTitle = quiz.title || quiz.topic;
        const questions = quiz.questions_json;
        if (!questions || questions.length === 0) {
            showToast("This quiz has no questions to print.", 'error');
            return;
        }

        // Construct the printable HTML document
        let printHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(quizTitle)} - Exam</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #ccc;
                    }
                    .student-info {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 30px;
                        font-size: 1.1em;
                    }
                    .question-block {
                        margin-bottom: 25px;
                        page-break-inside: avoid;
                    }
                    .question-text {
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .options-list {
                        list-style-type: upper-alpha;
                        margin-left: 20px;
                    }
                    .option-item {
                        margin-bottom: 5px;
                    }
                    .page-break {
                        page-break-before: always;
                    }
                    .answer-key-block {
                        margin-bottom: 15px;
                    }
                    @media print {
                        body { padding: 2cm; }
                        @page { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${escapeHtml(quizTitle)}</h1>
                    <p>Topic: ${escapeHtml(quiz.topic)}</p>
                </div>
                
                <div class="student-info">
                    <div>Name: __________________________________</div>
                    <div>Date: ____________________</div>
                </div>
        `;

        // Generate Questions
        questions.forEach((q, index) => {
            printHtml += `
                <div class="question-block">
                    <div class="question-text">${index + 1}. ${escapeHtml(q.question)}</div>
                    <ol class="options-list">
                        ${q.options.map(opt => `<li class="option-item">${escapeHtml(opt)}</li>`).join('')}
                    </ol>
                </div>
            `;
        });

        // Answer Key Page
        printHtml += `
                <div class="page-break"></div>
                <div class="header">
                    <h1>Answer Key - DO NOT DISTRIBUTE</h1>
                    <p>${escapeHtml(quizTitle)}</p>
                </div>
        `;

        questions.forEach((q, index) => {
            const correctOptionLetter = String.fromCharCode(65 + q.answer); // 0 -> A, 1 -> B
            printHtml += `
                <div class="answer-key-block">
                    <strong>${index + 1}. Correct Answer: ${correctOptionLetter}</strong> (${escapeHtml(q.options[q.answer])})
                    <br>
                    <em>Explanation:</em> ${escapeHtml(q.explanation || 'No explanation provided.')}
                </div>
            `;
        });

        printHtml += `
            </body>
            </html>
        `;

        // Open in a new window and print
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showToast("Please allow pop-ups to print the exam.", 'error');
            return;
        }

        printWindow.document.open();
        printWindow.document.write(printHtml);
        printWindow.document.close();

        // Wait for content to load before calling print
        printWindow.onload = function() {
            printWindow.focus();
            printWindow.print();
        };

    } catch (err) {
        console.error('Error generating PDF:', err);
        showToast(`Failed to generate printable exam: ${err.message}`, 'error');
    }
}

let isListView = false;

function toggleView() {
    const grid = document.getElementById('quizzesList');
    const btn = document.getElementById('viewToggle');
    isListView = !isListView;
    if (isListView) {
        grid.classList.add('list-view');
        btn.textContent = 'Grid';
    } else {
        grid.classList.remove('list-view');
        btn.textContent = 'List';
    }
}

async function loadActivityFeed() {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    try {
        const data = await api('GET', '/api/my-quizzes');
        const quizzes = data.quizzes || [];
        if (!quizzes.length) return;

        const client = await getSupabase();
        const ids = quizzes.map(q => q.id);
        const { data: results } = await client
            .from('quiz_results')
            .select('player_name, score, total_questions, created_at, quiz_id')
            .in('quiz_id', ids)
            .order('created_at', { ascending: false })
            .limit(10);

        if (!results || !results.length) return;

        container.classList.remove('hidden');
        const quizMap = {};
        quizzes.forEach(q => { quizMap[q.id] = q.title || q.topic; });

        container.innerHTML = '<h2>Recent Activity</h2>' + results.map(r => {
            const pct = Math.round((r.score / r.total_questions) * 100);
            const quizTitle = quizMap[r.quiz_id] || 'a quiz';
            return `
                <div class="activity-item">
                    <span class="activity-icon">${pct >= 80 ? '*' : pct >= 50 ? '+' : '-'}</span>
                    <span class="activity-text"><strong>${escapeHtml(r.player_name)}</strong> scored ${pct}% on ${escapeHtml(quizTitle)}</span>
                    <span class="activity-time">${timeAgo(r.created_at)}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading activity:', err);
    }
}

// Load quizzes on initial page load
document.addEventListener('DOMContentLoaded', () => {
    loadMyQuizzes();
    loadActivityFeed();

    const searchInput = document.getElementById('quizSearch');
    const sortSelect = document.getElementById('quizSort');

    if (searchInput) {
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadMyQuizzes, 300);
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', loadMyQuizzes);
    }
});
