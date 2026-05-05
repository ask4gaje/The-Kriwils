let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let isAnswered = false;
let playerName = "";
let currentQuizId = "";

async function loadQuiz() {
    const urlParams = new URLSearchParams(window.location.search);
    currentQuizId = urlParams.get('quiz');

    if (!currentQuizId) {
        document.getElementById('loading').innerHTML = '<p style="color: #dc2626;">No quiz ID provided!</p>';
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('quizzes')
            .select('*')
            .eq('id', currentQuizId)
            .single();

        if (error) throw error;
        if (!data) throw new Error("Quiz not found");

        currentQuestions = data.questions_json;
        document.getElementById('loading').style.display = 'none';
        document.getElementById('namePrompt').style.display = 'block';
    } catch (err) {
        console.error("Error loading quiz:", err);
        document.getElementById('loading').innerHTML = `<p style="color: #dc2626;">Error: ${err.message}</p>`;
    }
}

function startQuiz() {
    playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
        alert("Please enter your name!");
        return;
    }

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

    const correctIndex = currentQuestions[currentIndex].answer;
    const allButtons = document.querySelectorAll('.option-btn');

    if (selectedIndex === correctIndex) {
        score++;
        btn.classList.add('correct');
    } else {
        btn.classList.add('wrong');
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
    
    if (percentage === 100) feedback = "Perfect! You're a genius! 🏆";
    else if (percentage >= 80) feedback = "Amazing job! 🌟";
    else if (percentage >= 60) feedback = "Good effort! 👍";
    else feedback = "Keep practicing! You'll get better. 💪";
    
    document.getElementById('feedbackText').innerText = feedback;

    // Save Score to Database
    try {
        const { error } = await supabaseClient
            .from('quiz_results')
            .insert({
                quiz_id: currentQuizId,
                player_name: playerName,
                score: score,
                total_questions: currentQuestions.length
            });

        if (error) throw error;
        console.log("Score saved successfully!");
    } catch (err) {
        console.error("Error saving score:", err);
    }
}

// Start
document.addEventListener('DOMContentLoaded', loadQuiz);
