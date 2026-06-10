const MAX_TOPIC_LENGTH = 150;
let isGenerating = false;

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    const pagesToRead = Math.min(pdf.numPages, 50);
    console.log(`Reading ${pagesToRead} pages from PDF...`);

    for (let i = 1; i <= pagesToRead; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(" ") + "\n";
    }

    return fullText;
}

async function getPageCount(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function setupDropZone() {
    const dropZone = document.getElementById('pdfDropZone');
    const fileInput = document.getElementById('pdfUpload');
    const dropContent = document.getElementById('dropZoneContent');
    const dropFile = document.getElementById('dropZoneFile');
    const dzFileName = document.getElementById('dzFileName');
    const dzFileSize = document.getElementById('dzFileSize');
    const dzRemove = document.getElementById('dzRemove');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            updateDropZoneFile(fileInput.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            updateDropZoneFile(fileInput.files[0]);
        } else {
            resetDropZone();
        }
    });

    dzRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        resetDropZone();
    });

    async function updateDropZoneFile(file) {
        dzFileName.textContent = file.name;
        dzFileSize.textContent = formatFileSize(file.size);

        if (typeof pdfjsLib !== 'undefined') {
            try {
                const pages = await getPageCount(file);
                dzFileSize.textContent = formatFileSize(file.size) + ' / ' + pages + ' pages';
            } catch (e) {
                // ignore page count errors
            }
        }

        dropContent.classList.add('hidden');
        dropFile.classList.remove('hidden');
    }

    function resetDropZone() {
        dropContent.classList.remove('hidden');
        dropFile.classList.add('hidden');
    }
}

function showStatusBar(state, title, code) {
    const resultsDiv = document.getElementById('quizResults');
    if (!resultsDiv) return;

    resultsDiv.style.display = 'block';

    if (state === 'loading') {
        resultsDiv.innerHTML = `
            <div class="generator-status generator-status--visible generator-status--loading">
                <span class="generator-status-text">Generating questions for "${escapeHtml(title)}"...</span>
            </div>`;
    } else if (state === 'pending') {
        resultsDiv.innerHTML = `
            <div class="generator-status generator-status--visible generator-status--pending">
                <div class="spinner generator-status-spinner"></div>
                <span class="generator-status-text">Building "${escapeHtml(title)}"...</span>
            </div>`;
    } else if (state === 'complete') {
        const shareLink = `${window.location.origin}/play/${code}`;
        resultsDiv.innerHTML = `
            <div class="generator-status generator-status--visible generator-status--complete">
                <span class="generator-status-text">Ready! Code: <span class="generator-status-code">${escapeHtml(code)}</span></span>
                <div class="generator-status-actions">
                    <button onclick="copyToClipboard('${shareLink}')">Copy Link</button>
                    <a href="${shareLink}" target="_blank"><button class="btn-secondary">Open Quiz</button></a>
                </div>
                <button class="generator-status-reset" id="resetCreateBtn">Create another quiz?</button>
            </div>`;
        document.getElementById('resetCreateBtn').addEventListener('click', resetCreateForm);
    } else if (state === 'error') {
        resultsDiv.innerHTML = `
            <div class="generator-status generator-status--visible generator-status--error">
                <span class="generator-status-text">Failed to generate quiz. Please try again.</span>
            </div>`;
    }

    setTimeout(() => {
        const statusEl = resultsDiv.querySelector('.generator-status');
        if (statusEl) {
            statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 50);
}

function hideStatusBar() {
    const resultsDiv = document.getElementById('quizResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = '';
    }
}

function repopulateForm(quiz) {
    document.getElementById('quizTitle').value = quiz.title || '';
    document.getElementById('quizTopic').value = quiz.topic || '';
    document.getElementById('quizDifficulty').value = quiz.difficulty || 'medium';
    document.getElementById('quizTimeLimit').value = quiz.time_limit_seconds || '0';
    document.getElementById('isReplayable').checked = quiz.is_replayable || false;
    document.getElementById('isReviewable').checked = quiz.is_reviewable !== false;
}

function resetCreateForm() {
    hideStatusBar();
    isGenerating = false;

    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) resetButton(generateBtn, 'Generate Quiz');

    document.getElementById('quizTitle').value = '';
    document.getElementById('quizTopic').value = '';
    document.getElementById('quizDifficulty').value = 'medium';
    document.getElementById('quizCount').value = '5';
    document.getElementById('quizTimeLimit').value = '0';
    document.getElementById('isReplayable').checked = false;
    document.getElementById('isReviewable').checked = true;

    const fileInput = document.getElementById('pdfUpload');
    if (fileInput) {
        fileInput.value = '';
        const dzContent = document.getElementById('dropZoneContent');
        const dzFile = document.getElementById('dropZoneFile');
        if (dzContent) dzContent.classList.remove('hidden');
        if (dzFile) dzFile.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const topicInput = document.getElementById('quizTopic');
    if (topicInput) topicInput.maxLength = MAX_TOPIC_LENGTH;

    setupDropZone();

    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.onclick = handleGenerateQuiz;
        await checkAndDisplayPendingQuiz();
    }
});

async function checkAndDisplayPendingQuiz() {
    try {
        const session = await checkSession();
        if (!session) return;

        const client = await getSupabase();
        if (!client) return;

        const { data: pendingQuizzes, error } = await client
            .from('quizzes')
            .select('id, title, topic, difficulty, time_limit_seconds, is_replayable, is_reviewable')
            .eq('creator_id', session.user.id)
            .eq('status', 'pending');

        if (error) throw error;

        if (pendingQuizzes && pendingQuizzes.length > 0) {
            const pendingQuiz = pendingQuizzes[0];
            const title = pendingQuiz.title || pendingQuiz.topic || "Your Quiz";

            repopulateForm(pendingQuiz);
            setButtonLoading(document.getElementById('generateBtn'), 'Generation in Progress...');
            showStatusBar('pending', title);
            setTimeout(() => pollQuizStatus(pendingQuiz.id, title), 3000);
        }
    } catch (e) {
        console.error("Error checking pending quiz:", e);
    }
}

async function pollQuizStatus(quizId, title) {
    try {
        const client = await getSupabase();
        if (!client) return;

        const { data: quiz, error } = await client
            .from('quizzes')
            .select('status, short_code')
            .eq('id', quizId)
            .single();

        if (error) throw error;

        if (quiz.status === 'completed') {
            isGenerating = false;

            const generateBtn = document.getElementById('generateBtn');
            if (generateBtn) {
                resetButton(generateBtn, 'Generate Quiz');
            }

            showStatusBar('complete', title, quiz.short_code);
        } else if (quiz.status === 'failed' || !quiz) {
            throw new Error("Quiz failed or deleted");
        } else {
            setTimeout(() => pollQuizStatus(quizId, title), 3000);
        }
    } catch (err) {
        console.error("Polling error (might be deleted):", err);
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) resetButton(generateBtn, 'Generate Quiz');
        showStatusBar('error');
    }
}

async function handleGenerateQuiz(event) {
    event.preventDefault();
    const title = document.getElementById('quizTitle').value.trim();
    const topic = document.getElementById('quizTopic').value.trim();
    const difficulty = document.getElementById('quizDifficulty').value;
    const count = document.getElementById('quizCount').value;
    const isReplayable = document.getElementById('isReplayable').checked;
    const isReviewable = document.getElementById('isReviewable').checked;
    const pdfFile = document.getElementById('pdfUpload').files[0];
    const generateBtn = document.getElementById('generateBtn');

    if (pdfFile && typeof pdfjsLib === 'undefined') {
        showToast("PDF library is still loading or failed to load. Please refresh and try again.", 'error');
        return;
    }

    if (!title) {
        showToast("Please enter a Quiz Title!", 'error');
        return;
    }

    if (!topic && !pdfFile) {
        showToast("Please enter a topic or upload a PDF!", 'error');
        return;
    }

    const session = await checkSession();
    if (!session) {
        showToast("Please login first!", 'error');
        return;
    }

    isGenerating = true;
    setButtonLoading(generateBtn, 'Generating questions...');
    showStatusBar('loading', title);

    try {
        let pdfContext = "";
        if (pdfFile) {
            setButtonLoading(generateBtn, 'Reading PDF...');
            pdfContext = await extractTextFromPDF(pdfFile);
            setButtonLoading(generateBtn, 'Generating questions...');
        }

        const response = await fetch('/api/enqueue-quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                title,
                topic,
                difficulty,
                count,
                timeLimit: parseInt(document.getElementById('quizTimeLimit').value, 10) || 0,
                isReplayable,
                isReviewable,
                pdfContext
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Server Error');
        }

        showStatusBar('pending', title);
        setTimeout(() => pollQuizStatus(data.quizId, title), 3000);

    } catch (err) {
        console.error('Generation Error:', err);
        showToast(err.message, 'error');
        showStatusBar('error');

        isGenerating = false;
        resetButton(generateBtn, 'Generate Quiz');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Link copied to clipboard!", 'info');
    }).catch(err => {
        console.error('Copy failed', err);
    });
}
