let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let isAnswered = false;
let playerName = "";
let currentQuizId = "";
let userAnswers = []; // Tracks selected option index for each question
let quizSettings = { is_replayable: true, is_reviewable: true };
let timeLeft = 0;
let timerInterval = null;

function showErrorUI(message) {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.className = ''; // remove loading-wrapper styling
    loadingDiv.innerHTML = `
        <div class="quiz-container" style="text-align: center; max-width: 400px; margin: 0 auto; border-top: 4px solid #ef4444;">
            <div style="font-size: 3.5rem; margin-bottom: 1rem;">🤔</div>
            <h2 style="color: #111827; margin-bottom: 0.75rem;">Oops! Quiz Not Found</h2>
            <p style="color: var(--text-muted); margin-bottom: 2rem;">${escapeHtml(message)}</p>
            <button onclick="window.location.href='/join.html'" style="background: #111827; width: 100%;">Try Another Code</button>
        </div>
    `;
}

async function loadQuiz() {
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const shortCode = pathParts[pathParts.indexOf('play') + 1];
    
    currentQuizId = urlParams.get('quiz');

    if (!currentQuizId && !shortCode) {
        showErrorUI("No quiz ID or code provided. Please enter a valid 6-digit code.");
        return;
    }

    try {
        const client = await getSupabase();
        if (!client) throw new Error("Database connection failed");

        let query = client.from('quizzes').select('*');
        
        if (shortCode) {
            query = query.eq('short_code', shortCode);
        } else {
            query = query.eq('id', currentQuizId);
        }

        const { data, error } = await query.single();

        if (error) throw error;
        if (!data) throw new Error("Quiz not found");

        // Important: Store the full ID for database operations
        currentQuizId = data.id; 
        
        // Store settings and questions
        quizSettings = { 
            is_replayable: data.is_replayable ?? true, 
            is_reviewable: data.is_reviewable ?? true,
            time_limit_seconds: data.time_limit_seconds || 0
        };
        currentQuestions = data.questions_json;

        // 1. Replay Check
        if (quizSettings.is_replayable === false && localStorage.getItem('played_' + currentQuizId)) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('alreadyPlayed').style.display = 'block';
            return;
        }

        // 2. Set Title
        const titleDisplay = document.getElementById('quizTitleDisplay');
        if (titleDisplay) {
            titleDisplay.innerText = data.title || data.topic;
            titleDisplay.style.display = 'block';
        }

        document.getElementById('loading').style.display = 'none';
        
        // 3. Name Retention Check
        const savedName = localStorage.getItem('playerName_' + currentQuizId);
        if (savedName) {
            playerName = savedName;
            document.getElementById('namePrompt').innerHTML = `
                <h2 style="margin-bottom: 1rem;">Selamat Datang Kembali, ${playerName}!</h2>
                <p style="margin-bottom: 2rem;">Siap untuk mencoba lagi dan meningkatkan skor Anda?</p>
                <button onclick="startQuiz()">Mulai Kuis</button>
                <p style="margin-top: 1.5rem; font-size: 0.8125rem; color: var(--text-muted); cursor: pointer; text-decoration: underline;" onclick="clearSavedName()">Bukan Anda? Ganti Nama</p>
            `;
        }

        document.getElementById('namePrompt').style.display = 'block';
    } catch (err) {
        console.error("Error loading quiz:", err);
        const displayMsg = (err.message === "Quiz not found" || err.code === "PGRST116") 
            ? "The 6-character code you entered is invalid or the quiz has been deleted." 
            : err.message;
        showErrorUI(displayMsg);
    }
}

function clearSavedName() {
    localStorage.removeItem('playerName_' + currentQuizId);
    location.reload();
}

function startQuiz() {
    const nameInput = document.getElementById('playerName');
    if (nameInput) {
        playerName = nameInput.value.trim();
    }
    
    if (!playerName) {
        showToast("Please enter your name!", 'error');
        return;
    }

    // Save name for next time
    localStorage.setItem('playerName_' + currentQuizId, playerName);

    document.getElementById('namePrompt').style.display = 'none';
    document.getElementById('quizApp').style.display = 'block';
    if (quizSettings.time_limit_seconds) {
        document.getElementById('timerDisplay').style.display = 'block';
        startTimer();
    }
    showQuestion();
}

function showQuestion() {
    isAnswered = false;
    clearInterval(timerInterval);
    const question = currentQuestions[currentIndex];

    const progress = ((currentIndex) / currentQuestions.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('questionCounter').innerText = `Question ${currentIndex + 1} of ${currentQuestions.length}`;

    document.getElementById('questionText').innerText = question.question;

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    question.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(index, btn);
        grid.appendChild(btn);
    });

    if (quizSettings.time_limit_seconds) {
        startTimer();
    }
}

function handleAnswer(selectedIndex, btn) {
    if (isAnswered) return;
    isAnswered = true;
    clearInterval(timerInterval);

    userAnswers[currentIndex] = selectedIndex;

    const correctIndex = currentQuestions[currentIndex].answer;
    const allButtons = document.querySelectorAll('.option-btn');

    if (selectedIndex === correctIndex) {
        score++;
        btn.classList.add('correct', 'animate-correct');
    } else {
        btn.classList.add('wrong', 'animate-wrong');
        allButtons[correctIndex].classList.add('correct');
    }

    setTimeout(() => advanceQuestion(), 1500);
}

function advanceQuestion() {
    currentIndex++;
    if (currentIndex < currentQuestions.length) {
        showQuestion();
    } else {
        showResults();
    }
}

function startTimer() {
    const total = quizSettings.time_limit_seconds;
    timeLeft = total;
    const bar = document.getElementById('timerBarFill');
    bar.style.width = '100%';
    bar.style.background = 'var(--primary-color)';
    const startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timeLeft = Math.max(0, total - elapsed);
        const pct = (timeLeft / total) * 100;
        bar.style.width = `${pct}%`;
        if (timeLeft <= 5) {
            bar.style.background = '#ef4444';
        }
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 50);
}

function handleTimeout() {
    if (isAnswered) return;
    isAnswered = true;
    userAnswers[currentIndex] = -1;

    const correctIndex = currentQuestions[currentIndex].answer;
    const allButtons = document.querySelectorAll('.option-btn');
    allButtons[correctIndex].classList.add('correct');

    setTimeout(() => advanceQuestion(), 1500);
}

async function showResults() {
    document.getElementById('quizApp').style.display = 'none';
    document.getElementById('resultsArea').style.display = 'block';
    
    document.getElementById('finalScore').innerText = `${score}/${currentQuestions.length}`;
    
    let feedback = "";
    const percentage = (score / currentQuestions.length) * 100;
    
    if (percentage === 100) {
        feedback = "Perfect! You're a genius! 🏆";
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#4f46e5', '#6366f1', '#10b981']
        });
    } else if (percentage >= 80) feedback = "Amazing job! 🌟";
    else if (percentage >= 60) feedback = "Good effort! 👍";
    else feedback = "Keep practicing! You'll get better. 💪";
    
    document.getElementById('feedbackText').innerText = feedback;

    // Show Review button if enabled
    if (quizSettings.is_reviewable) {
        document.getElementById('reviewBtn').style.display = 'block';
    }

    // Hide Replay button if disabled
    if (quizSettings.is_replayable === false) {
        document.getElementById('replayBtn').style.display = 'none';
    }

    // Save Replay status to local storage
    localStorage.setItem('played_' + currentQuizId, 'true');
    localStorage.setItem('highlightPlayer_' + currentQuizId, playerName);

    // Save Score via server
    try {
        const response = await fetch('/api/submit-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quiz_id: currentQuizId,
                player_name: playerName,
                score: score,
                total_questions: currentQuestions.length
            })
        });
        const result = await response.json();
        if (!response.ok) console.warn('Score save:', result.error || result.message);
        else console.log(result.message);
    } catch (err) {
        console.error("Error saving score:", err);
    }
}

function showReview() {
    document.getElementById('resultsArea').style.display = 'none';
    document.getElementById('reviewArea').style.display = 'block';
    
    const list = document.getElementById('reviewList');
    list.innerHTML = currentQuestions.map((q, index) => {
        const userAnsIndex = userAnswers[index];
        const isCorrect = userAnsIndex === q.answer;
        const userAnsText = q.options[userAnsIndex] || "Skipped";
        const correctAnsText = q.options[q.answer];

        return `
            <div class="review-item">
                <div class="review-q">${index + 1}. ${escapeHtml(q.question)}</div>
                <div class="review-answer-box ${isCorrect ? 'correct' : 'wrong'}">
                    <strong>Your Answer:</strong> ${escapeHtml(userAnsText)} 
                    ${!isCorrect ? `<br><strong>Correct Answer:</strong> ${escapeHtml(correctAnsText)}` : ''}
                </div>
                <div class="review-explanation">
                    <strong>Explanation:</strong> ${escapeHtml(q.explanation || 'No explanation available.')}
                </div>
            </div>
        `;
    }).join('');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideReview() {
    document.getElementById('reviewArea').style.display = 'none';
    document.getElementById('resultsArea').style.display = 'block';
}

// Start
document.addEventListener('DOMContentLoaded', loadQuiz);
