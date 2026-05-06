let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let isAnswered = false;
let playerName = "";
let currentQuizId = "";
let userAnswers = []; // Tracks selected option index for each question
let quizSettings = { is_replayable: true, is_reviewable: true };

async function loadQuiz() {
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const shortCode = pathParts[pathParts.indexOf('play') + 1];
    
    currentQuizId = urlParams.get('quiz');

    if (!currentQuizId && !shortCode) {
        document.getElementById('loading').innerHTML = '<p style="color: #dc2626;">No quiz ID or code provided!</p>';
        return;
    }

    try {
        let query = supabaseClient.from('quizzes').select('*');
        
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
            is_reviewable: data.is_reviewable ?? true 
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
        document.getElementById('loading').innerHTML = `<p style="color: #dc2626;">Error: ${err.message}</p>`;
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
        alert("Please enter your name!");
        return;
    }

    // Save name for next time
    localStorage.setItem('playerName_' + currentQuizId, playerName);

    document.getElementById('namePrompt').style.display = 'none';
    document.getElementById('quizApp').style.display = 'block';
    showQuestion();
}

function showQuestion() {
    isAnswered = false;
    const question = currentQuestions[currentIndex];
    
    // Update progress
    const progress = ((currentIndex) / currentQuestions.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('questionCounter').innerText = `Question ${currentIndex + 1} of ${currentQuestions.length}`;

    // Set text
    document.getElementById('questionText').innerText = question.question;
    
    // Clear and fill options
    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';
    
    question.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(index, btn);
        grid.appendChild(btn);
    });
}

function handleAnswer(selectedIndex, btn) {
    if (isAnswered) return;
    isAnswered = true;

    // Track user answer
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

    setTimeout(() => {
        currentIndex++;
        if (currentIndex < currentQuestions.length) {
            showQuestion();
        } else {
            showResults();
        }
    }, 1500);
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

    // Save Score to Database (High Score Only)
    try {
        // 1. Check for existing score
        const { data: existing, error: fetchError } = await supabaseClient
            .from('quiz_results')
            .select('id, score')
            .eq('quiz_id', currentQuizId)
            .eq('player_name', playerName)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (existing) {
            // 2. Update if higher
            if (score > existing.score) {
                const { error: updateError } = await supabaseClient
                    .from('quiz_results')
                    .update({ 
                        score: score,
                        created_at: new Date().toISOString() // Update timestamp to newest high score
                    })
                    .eq('id', existing.id);
                if (updateError) throw updateError;
                console.log("High score updated!");
            } else {
                console.log("Existing score is higher or equal. Not updating.");
            }
        } else {
            // 3. New record
            const { error: insertError } = await supabaseClient
                .from('quiz_results')
                .insert({
                    quiz_id: currentQuizId,
                    player_name: playerName,
                    score: score,
                    total_questions: currentQuestions.length
                });
            if (insertError) throw insertError;
            console.log("Score saved successfully!");
        }
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
                <div class="review-q">${index + 1}. ${q.question}</div>
                <div class="review-answer-box ${isCorrect ? 'correct' : 'wrong'}">
                    <strong>Your Answer:</strong> ${userAnsText} 
                    ${!isCorrect ? `<br><strong>Correct Answer:</strong> ${correctAnsText}` : ''}
                </div>
                <div class="review-explanation">
                    <strong>Explanation:</strong> ${q.explanation || 'No explanation available.'}
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
