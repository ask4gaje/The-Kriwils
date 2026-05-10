const MAX_TOPIC_LENGTH = 150;
let isGenerating = false;

// PDF.js worker setup
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

/**
 * Extracts text from a PDF file using PDF.js (Max 50 pages)
 */
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

// Enforce topic length limit on load and bind handlers
document.addEventListener('DOMContentLoaded', () => {
    const topicInput = document.getElementById('quizTopic');
    if (topicInput) topicInput.maxLength = MAX_TOPIC_LENGTH;

    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.onclick = handleGenerateQuiz;
    }
});

// Warn user if they try to leave while generating (Optional now, but good for feedback)
window.onbeforeunload = function() {
    if (isGenerating) {
        return "Your quiz is being started in the background. You can stay or leave.";
    }
};

/**
 * Main handler for the Generate Quiz button
 */
async function handleGenerateQuiz() {
    const title = document.getElementById('quizTitle').value.trim();
    const topic = document.getElementById('quizTopic').value.trim();
    const difficulty = document.getElementById('quizDifficulty').value;
    const count = document.getElementById('quizCount').value;
    const isReplayable = document.getElementById('isReplayable').checked;
    const isReviewable = document.getElementById('isReviewable').checked;
    const pdfFile = document.getElementById('pdfUpload').files[0];
    const resultsDiv = document.getElementById('quizResults');
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

    // UI Feedback
    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.innerText = "Starting...";
    resultsDiv.style.display = "block";
    resultsDiv.innerHTML = `
        <div class="loading-wrapper">
            <div class="spinner"></div>
            <p id="loadingStatus">Initializing background generation for <strong>${title}</strong>...</p>
        </div>
    `;

    // Auto-scroll to results
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
        let pdfContext = "";
        if (pdfFile) {
            document.getElementById('loadingStatus').innerText = "Reading your PDF file...";
            pdfContext = await extractTextFromPDF(pdfFile);
        }

        // Call the background enqueue endpoint
        const response = await fetch('/api/enqueue-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt: session.access_token,
                title,
                topic,
                difficulty,
                count,
                isReplayable,
                isReviewable,
                pdfContext
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Server Error');
        }

        // SUCCESS: The quiz has started in the background
        showToast("Success! Your quiz is being built in the background.", 'success');
        
        resultsDiv.innerHTML = `
            <div style="background: #ecfdf5; padding: 2rem; border-radius: 1rem; border: 1px solid #10b981; margin-top: 2rem; text-align: center;">
                <h3 style="color: #065f46; margin-bottom: 0.5rem;">🚀 Background Generation Started!</h3>
                <p style="font-size: 0.875rem; color: #065f46; margin-bottom: 1.5rem;">
                    We are crafting <strong>${title}</strong> right now. 
                    You can safely leave this page or stay here.
                </p>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                    <button onclick="window.location.href='quizzes.html'" style="width: auto; padding: 0.75rem 1.5rem; background: #10b981; color: white; border-radius: 0.5rem; font-weight: 600; border: none; cursor: pointer;">
                        View Progress in "My Quizzes"
                    </button>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('Generation Error:', err);
        showToast(err.message, 'error');
        resultsDiv.innerHTML = `<p style="color: #dc2626; text-align:center; padding: 1rem;">Error: ${err.message}</p>`;
    } finally {
        isGenerating = false;
        generateBtn.disabled = false;
        generateBtn.innerText = "Generate Quiz";
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Link copied to clipboard!", 'info');
    }).catch(err => {
        console.error('Copy failed', err);
    });
}
