// Extend existing mediaRecorder variable from app.js rather than redeclaring
let mediaStream = null;
let audioContext = null;
let recognizer = null;
let isListening = false;
let isUsingCamera = false;

// Initialize speech recognition
if ('webkitSpeechRecognition' in window) {
    recognizer = new webkitSpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';

    recognizer.onresult = function(event) {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
            const transcript = lastResult[0].transcript;
            displaySubtitle(transcript);
            
            // Get the AI response time setting
            const aiResponseTime = parseFloat(localStorage.getItem('aiResponseTime') || 1.5);
            
            // Enhanced viewer reaction system with configurable timing
            if (window.generateAIResponseToUserMessage) {
                // Initial immediate reactions (2-3 viewers)
                setTimeout(() => {
                    window.generateAIResponseToUserMessage(transcript);
                }, aiResponseTime * 1000);

                // Second wave of responses with deeper context (3-4 viewers)
                setTimeout(() => {
                    window.extraUserMessageForAI = `[Responding to streamer saying: "${transcript}"]`;
                    window.generateAIResponseToUserMessage(transcript);
                    
                    // Also trigger general chat generation for ambient reactions
                    if (window.captureAndGenerateMessages) {
                        window.captureAndGenerateMessages();
                    }
                }, (aiResponseTime * 2 + 0.5) * 1000);

                // Third wave of responses - more thoughtful/detailed (2-3 viewers)
                setTimeout(() => {
                    window.extraUserMessageForAI = `[Continuing discussion about: "${transcript}"]`;
                    window.generateAIResponseToUserMessage(transcript);
                }, (aiResponseTime * 3 + 1) * 1000);

                // Final wave - wrap-up thoughts and reactions (1-2 viewers)
                setTimeout(() => {
                    if (Math.random() < 0.7) { // 70% chance for final reactions
                        window.extraUserMessageForAI = `[Final thoughts on streamer saying: "${transcript}"]`;
                        window.generateAIResponseToUserMessage(transcript);
                    }
                }, (aiResponseTime * 4 + 1.5) * 1000);

                // Occasional follow-up questions from viewers
                setTimeout(() => {
                    if (Math.random() < 0.4) { // 40% chance for follow-up questions
                        generateFollowUpQuestions(transcript);
                    }
                }, (aiResponseTime * 5 + 2) * 1000);
            }
        }
    };

    recognizer.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        stopListening();
    };
}

// New function to generate follow-up questions from viewers
async function generateFollowUpQuestions(originalStatement) {
    if (!window.websim || !window.websim.chat) return;

    try {
        const completion = await window.websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You're generating 2-3 follow-up questions that Twitch chat viewers might ask in response to what a streamer just said.
                    Questions should be genuine, thoughtful, and show interest in the topic.
                    Keep questions brief (under 60 chars) and conversational.
                    Generate unique usernames for each question.
                    
                    Respond directly with JSON, following this schema:
                    {
                        "questions": [
                            {"username": "username1", "question": "question1"},
                            {"username": "username2", "question": "question2"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: `Generate follow-up questions to the streamer saying: "${originalStatement}"`
                }
            ],
            json: true
        });

        const result = JSON.parse(completion.content);
        
        // Add questions to chat with delays
        result.questions.forEach((item, index) => {
            setTimeout(() => {
                const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                window.addMessageToChat(item.username, item.question, colorClass);
            }, index * 1200); // Spread out questions
        });

    } catch (error) {
        console.error('Error generating follow-up questions:', error);
    }
}

// Function to start camera 
async function startCamera() {
    try {
        if (mediaStream) {
            stopCamera();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        const preview = document.getElementById('preview');
        preview.srcObject = stream;
        mediaStream = stream;
        isUsingCamera = true;

        // Update UI to show camera is active
        const startCameraBtn = document.getElementById('startCameraBtn');
        if (startCameraBtn) {
            startCameraBtn.textContent = 'Stop Camera';
            startCameraBtn.classList.add('active');
        }

        // Start timer and AI chat generation like in regular streaming
        const timerElement = document.getElementById('timer');
        if (timerElement) timerElement.textContent = '00:00';
        
        window.startTime = Date.now();
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        window.timerInterval = setInterval(() => {
            const elapsedTime = Date.now() - window.startTime;
            const seconds = Math.floor((elapsedTime / 1000) % 60);
            const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);

        if (window.startAIChatGeneration) {
            window.startAIChatGeneration();
        }
        if (window.initializeViewerCount) {
            window.initializeViewerCount();
        }
        if (window.startDonations) {
            window.startDonations();
        }

        // Update recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.textContent = "Camera streaming...";
        }

        // Disable/enable relevant buttons
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (downloadBtn) downloadBtn.disabled = true;

    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Failed to access camera. Please ensure you have granted camera permissions.');
    }
}

// Function to stop camera
function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        const preview = document.getElementById('preview');
        preview.srcObject = null;
        mediaStream = null;
        isUsingCamera = false;

        // Update UI to show camera is inactive
        const startCameraBtn = document.getElementById('startCameraBtn');
        if (startCameraBtn) {
            startCameraBtn.textContent = 'Start Camera';
            startCameraBtn.classList.remove('active');
        }

        // Stop timer and AI chat generation
        if (window.clearInterval && window.timerInterval) {
            window.clearInterval(window.timerInterval);
        }
        if (window.stopAIChatGeneration) {
            window.stopAIChatGeneration();
        }
        if (window.clearInterval && window.viewerCountTimer) {
            window.clearInterval(window.viewerCountTimer);
        }
        if (window.stopDonations) {
            window.stopDonations();
        }

        // Reset recording status and buttons
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.textContent = "Ready to record";
        }

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }
}

// Function to toggle camera
function toggleCamera() {
    if (isUsingCamera) {
        stopCamera();
    } else {
        startCamera();
    }
}

// Function to start listening to microphone
async function startListening() {
    if (!recognizer) {
        alert('Speech recognition is not supported in your browser. Please use Chrome.');
        return;
    }

    try {
        recognizer.start();
        isListening = true;

        // Update UI to show microphone is active
        const startMicBtn = document.getElementById('startMicBtn');
        if (startMicBtn) {
            startMicBtn.textContent = 'Stop Microphone';
            startMicBtn.classList.add('active');
        }
    } catch (error) {
        console.error('Error starting speech recognition:', error);
        alert('Failed to start speech recognition. Please try again.');
    }
}

// Function to stop listening to microphone
function stopListening() {
    if (recognizer && isListening) {
        recognizer.stop();
        isListening = false;

        // Update UI to show microphone is inactive
        const startMicBtn = document.getElementById('startMicBtn');
        if (startMicBtn) {
            startMicBtn.textContent = 'Start Microphone';
            startMicBtn.classList.remove('active');
        }
    }
}

// Function to toggle microphone
function toggleMicrophone() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

// Function to display subtitle in the UI
function displaySubtitle(text) {
    const subtitlesContainer = document.getElementById('subtitlesContainer');
    if (!subtitlesContainer) return;

    const subtitleElement = document.createElement('div');
    subtitleElement.className = 'subtitle';
    subtitleElement.textContent = text;

    // Clear previous subtitles and add new one
    subtitlesContainer.innerHTML = '';
    subtitlesContainer.appendChild(subtitleElement);

    // Send subtitle to popup chat if it exists
    if (window.chatPopupWindow && !window.chatPopupWindow.closed) {
        window.chatPopupWindow.postMessage({
            type: 'newSubtitle',
            text: text
        }, '*');
    }

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (subtitlesContainer.contains(subtitleElement)) {
            subtitleElement.style.opacity = '0';
            subtitleElement.style.transform = 'translateY(5px)';
            subtitleElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            setTimeout(() => {
                if (subtitlesContainer.contains(subtitleElement)) {
                    subtitlesContainer.removeChild(subtitleElement);
                }
            }, 500);
        }
    }, 3000);
}

// Clean up function to stop all media streams
function cleanupMedia() {
    stopCamera();
    stopListening();
}

// Export functions to be used in other files
window.mediaControls = {
    startCamera,
    stopCamera,
    toggleCamera,
    startListening,
    stopListening,
    toggleMicrophone,
    cleanupMedia
};

// Add event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add camera and microphone buttons to the controls section
    const controls = document.querySelector('.controls');
    if (controls) {
        const cameraBtn = document.createElement('button');
        cameraBtn.id = 'startCameraBtn';
        cameraBtn.className = 'btn';
        cameraBtn.textContent = 'Start Camera';
        cameraBtn.onclick = toggleCamera;

        const micBtn = document.createElement('button');
        micBtn.id = 'startMicBtn';
        micBtn.className = 'btn';
        micBtn.textContent = 'Start Microphone';
        micBtn.onclick = toggleMicrophone;

        controls.appendChild(cameraBtn);
        controls.appendChild(micBtn);
    }

    // Clean up media streams when the page is unloaded
    window.addEventListener('beforeunload', cleanupMedia);
});