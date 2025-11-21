let mediaRecorder;
let recordedChunks = [];
let timerInterval;
let startTime;
let stream;
//let captureCanvas = document.createElement('canvas');
//let captureContext = captureCanvas.getContext('2d');
let aiChatInterval;
let isProcessingAIMessage = false;
let pendingCaptureRequests = 0;
let maxSimultaneousCaptureRequests = 2;
let previousMessages = []; // Store previous AI-generated messages
let previousUsernames = []; // Store previously used usernames
let extraUserMessageForAI = null;  // Holds a user message to include in the next AI prompt check
let uniqueUsernames = new Set(); // Track unique usernames for viewer count
let chatSettings = {
    angry: false,
    memelike: false,
    happy: false,
    botlike: false,
    silly: false,
    sad: false,
    confused: false,
    fan: false,
    muted: false, // New setting for muting chat
    disableDonations: false // New setting for disabling donations
};
let activePoll = null;
let pollTimer = null;
let totalVotes = 0;
let aiCheckInterval = 3.5; // Default interval in seconds
let donationTimer = null;
let streamerUsername = null; // Store the streamer's username
// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const streamVideoBtn = document.getElementById('streamVideoBtn');
const timer = document.getElementById('timer');
const recordingStatus = document.getElementById('recordingStatus');
const preview = document.getElementById('preview');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const popoutBtn = document.getElementById('popoutBtn');
const createPollBtn = document.getElementById('createPollBtn');
const pollForm = document.getElementById('pollForm');
const activePollContainer = document.getElementById('activePollContainer');
// NEW: Custom settings elements
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const apiKeyInput = document.getElementById('apiKey');
const apiModelNameInput = document.getElementById('apiModelName');
const streamerUsernameInput = document.getElementById('streamerUsernameInput');
// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
downloadBtn.addEventListener('click', downloadRecording);
streamVideoBtn.addEventListener('click', streamVideo);
sendBtn.addEventListener('click', sendMessage);
popoutBtn.addEventListener('click', openChatPopup);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
// Add event listeners for chat settings
document.getElementById('angryViewers').addEventListener('change', updateChatSettings);
document.getElementById('memeViewers').addEventListener('change', updateChatSettings);
document.getElementById('happyViewers').addEventListener('change', updateChatSettings);
document.getElementById('botViewers').addEventListener('change', updateChatSettings);
document.getElementById('sillyViewers').addEventListener('change', updateChatSettings);
document.getElementById('sadViewers').addEventListener('change', updateChatSettings);
document.getElementById('confusedViewers').addEventListener('change', updateChatSettings);
document.getElementById('fanViewers').addEventListener('change', updateChatSettings);
document.getElementById('mutedChat').addEventListener('change', toggleChatMute);
document.getElementById('disableDonations').addEventListener('change', toggleDonations);
// Add event listeners for creating polls
document.getElementById('createPollBtn').addEventListener('click', togglePollForm);
document.getElementById('addOptionBtn').addEventListener('click', addPollOption);
document.getElementById('pollForm').addEventListener('submit', createPoll);
// NEW: Settings Management
function saveSettings() {
    const settings = {
        apiBaseUrl: apiBaseUrlInput.value,
        apiKey: apiKeyInput.value,
        apiModelName: apiModelNameInput.value,
        streamerUsername: streamerUsernameInput.value
    };
    localStorage.setItem('streamSimSettings', JSON.stringify(settings));
}
function loadSettings() {
    const savedSettings = localStorage.getItem('streamSimSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        apiBaseUrlInput.value = settings.apiBaseUrl || 'https://api.openai.com/v1';
        apiKeyInput.value = settings.apiKey || '';
        apiModelNameInput.value = settings.apiModelName || 'gpt-4-vision-preview';
        streamerUsernameInput.value = settings.streamerUsername || 'Streamer';
    } else {
        // Default values for first-time users
        apiBaseUrlInput.value = 'https://api.openai.com/v1';
        apiModelNameInput.value = 'gpt-4-vision-preview';
        streamerUsernameInput.value = 'Streamer';
    }
}
// NEW: Add event listeners for auto-saving settings
apiBaseUrlInput.addEventListener('input', saveSettings);
apiKeyInput.addEventListener('input', saveSettings);
apiModelNameInput.addEventListener('input', saveSettings);
streamerUsernameInput.addEventListener('input', saveSettings);
// NEW: OpenAI-compatible API call helper
async function callCustomAPI(params) {
    const baseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const modelName = apiModelNameInput.value.trim();
    if (!baseUrl || !modelName) {
        const errorMsg = "API settings are missing. Please configure them in the 'AI Provider Settings' section.";
        console.error(errorMsg);
        addMessageToChat("System", errorMsg, "color-system-error");
        // Throw an error to stop the execution of the calling function
        throw new Error(errorMsg);
    }
    const body = {
        model: modelName,
        messages: params.messages,
        max_tokens: 400 // A reasonable limit for chat messages
    };
    // The `response_format` with `type: "json_object"` caused an error with your vLLM backend.
    // It has been removed to ensure compatibility. We now rely on strong prompting for JSON
    // and clean up the response below to handle potential extra text from the AI.
    
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            const errorMessage = errorData.error ? JSON.stringify(errorData.error) : errorData.message;
            throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
        }
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            const message = data.choices[0].message; // This object has a .content property

            // --- START OF FIX ---
            let processedContent = '';

            // 1. Check if message.content is an array (common for vision/multimodal models)
            if (Array.isArray(message.content) && message.content.length > 0) {
                // Try to find the first block that is specifically a 'text' type or just has a 'text' property
                const textBlock = message.content.find(block => typeof block === 'object' && 'text' in block);
                if (textBlock && typeof textBlock.text === 'string') {
                    processedContent = textBlock.text;
                } else {
                    console.warn("Message content is an array, but no suitable text block was found. Content:", message.content);
                }
            } else if (typeof message.content === 'string') {
                // If message.content is already a string (e.g., from non-vision models or pre-processed by LM Studio)
                processedContent = message.content;
            } else {
                console.warn("Unexpected type for message.content:", typeof message.content, message.content);
            }

            // 2. If JSON was requested, attempt to extract it from the 'processedContent' string.
            // This handles cases where models wrap JSON in markdown (e.g., ```json{...}```).
            if (params.json && typeof processedContent === 'string' && processedContent.length > 0) {
                const jsonStart = processedContent.indexOf('{');
                const jsonEnd = processedContent.lastIndexOf('}');

                // Ensure both { AND } are found and { comes before }
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    processedContent = processedContent.substring(jsonStart, jsonEnd + 1);
                } else {
                    console.warn("Expected JSON output, but valid JSON markers were not found in the content. Content will be treated as non-JSON or invalid JSON.", processedContent);
                    // If JSON markers are not found, clear the string to cause JSON.parse to fail explicitly,
                    // or handle it as plain text if that's desired. For this project, JSON is required.
                     processedContent = ''; // Will result in "Unexpected end of JSON input" if JSON.parse is called on an empty string
                }
            } else if (params.json && typeof processedContent !== 'string') {
                // If JSON was requested but processedContent is not a string (e.g., it's empty after array processing)
                console.warn("Expected JSON output, but content was not a string after initial processing.");
                processedContent = '';
            }

            // 3. Update the message object's content property with the extracted/cleaned string
            message.content = processedContent;
            // --- END OF FIX ---
            
            return message;
        } else {
            throw new Error("API returned an empty or invalid response.");
        }
    } catch (error) {
        console.error("Error calling custom API:", error);
        addMessageToChat("System", `AI Error: ${error.message}`, "color-system-error");
        // Return null to allow calling functions to handle the failure gracefully
        return null;
    }
}

function updateChatSettings(e) {
    const setting = e.target.id.replace('Viewers', '').toLowerCase();
    chatSettings[setting] = e.target.checked;
}
function toggleChatMute(e) {
    chatSettings.muted = e.target.checked;
    
    if (chatSettings.muted) {
        stopAIChatGeneration();
    } else if ((mediaRecorder && mediaRecorder.state === 'recording') || 
               (preview.src && !preview.srcObject)) {
        startAIChatGeneration();
    }
}
function toggleDonations(e) {
    chatSettings.disableDonations = e.target.checked;
    
    if (chatSettings.disableDonations) {
        stopDonationGeneration();
    } else if ((mediaRecorder && mediaRecorder.state === 'recording') || 
               (preview.src && !preview.srcObject)) {
        startDonationGeneration();
    }
}
async function startRecording() {
    recordedChunks = [];
    
    // MODIFIED: Get streamer username from the input field instead of websim
    streamerUsername = streamerUsernameInput.value.trim() || 'Streamer';
    console.log("Streamer identified as:", streamerUsername);
    
    try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: true
            });
            recordingStatus.textContent = "Recording from camera...";
        } else {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                    cursor: "always",
                    displaySurface: "monitor"
                },
                audio: true
            });
        }
        
        stream.getVideoTracks()[0].addEventListener('ended', () => stopRecording());
        
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            preview.src = url;
            recordingStatus.textContent = "Recording finished";
            downloadBtn.disabled = false;
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        if (!isMobile) recordingStatus.textContent = "Recording...";
        
        startTime = Date.now();
        startTimer();
        preview.srcObject = stream;
        startAIChatGeneration();
        startDonationGeneration();
        
    } catch (error) {
        console.error("Error starting recording:", error);
        recordingStatus.textContent = "Failed to start recording. Please grant permissions.";
    }
}

// Updated stopRecording function to also handle streamed videos
function stopRecording() {
    clearInterval(timerInterval);
    stopAIChatGeneration();
    stopDonationGeneration();
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else if (preview.src && !preview.srcObject) {
        preview.pause();
        downloadBtn.disabled = false;
        recordingStatus.textContent = "Video streaming finished";
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}
function downloadRecording() {
    if (recordedChunks.length === 0) {
        return;
    }
    
    const blob = new Blob(recordedChunks, {
        type: 'video/webm'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const now = new Date();
    const filename = `screen-recording-${now.toISOString().split('T')[0]}-${now.getHours()}-${now.getMinutes()}.webm`;
    
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}
function startTimer() {
    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const seconds = Math.floor((elapsedTime / 1000) % 60);
        const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
        
        timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}
function startAIChatGeneration() {
    stopAIChatGeneration();
    if (chatSettings.muted) return;
    
    aiChatInterval = setInterval(() => {
        if (pendingCaptureRequests < maxSimultaneousCaptureRequests) {
            captureAndGenerateMessages();
        }
    }, aiCheckInterval * 1000);
    
    captureAndGenerateMessages();
}
function stopAIChatGeneration() {
    clearInterval(aiChatInterval);
}
async function captureAndGenerateMessages() {
    // MODIFIED: This check was `if (!preview.srcObject && !preview.src) return;`
    // The new check is more robust.
    if ((!preview.srcObject && !preview.src) || preview.videoWidth === 0 || preview.videoHeight === 0) {
        // If the video source isn't set OR if the video dimensions are not yet available,
        // skip this capture attempt. This prevents trying to capture a 0x0 frame.
        console.log("Skipping capture: Video not ready.");
		console.log("This is NOT a concern if you just start the stream.");
        return; 
    }
    
    try {
        pendingCaptureRequests++;
        
        // --- START OF FIX ---
        // 1. 创建一个临时的、新的 canvas 和 context
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');

        // 2. 设置这个临时 canvas 的尺寸
        tempCanvas.width = preview.videoWidth;
        tempCanvas.height = preview.videoHeight;
        
        // 3. 在这个临时 canvas 上绘制当前视频帧
        tempContext.drawImage(preview, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // 4. 从这个临时 canvas 生成图像数据
        const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);
        // --- END OF FIX ---

        // NEW: Add a final check to ensure the data URL is not empty
        if (imageDataUrl === 'data:,') {
            console.warn("Generated an empty image data URL. Skipping API call.");
            pendingCaptureRequests--; // Decrement here since the finally block won't be reached after return
            return;
        }
        
        // Request AI description of the current frame
        const completion = await getAIDescriptionsOfImage(imageDataUrl);
        
        if (completion && completion.length > 0) {
            for (let i = 0; i < completion.length; i++) {
                // Use a small delay to stagger the messages
                setTimeout(() => {
                    const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                    addMessageToChat(completion[i].username, completion[i].message, colorClass);
                }, i * 1500 + Math.random() * 500); // Stagger message appearance
            }
        }
    } catch (error) {
        // The callCustomAPI function already handles logging errors to the console and chat
        // so we don't need to do it again here.
    } finally {
        pendingCaptureRequests--;
    }
}

async function getAIDescriptionsOfImage(imageDataUrl) {
    try {
        let chatStylePrompt = "";
        if (chatSettings.angry) chatStylePrompt += "Use an angry, critical tone. ";
        if (chatSettings.memelike) chatStylePrompt += "Include lots of memes and internet slang. ";
        if (chatSettings.happy) chatStylePrompt += "Be very positive and supportive. ";
        if (chatSettings.botlike) chatStylePrompt += "Include some messages that seem like bots or spam. ";
        if (chatSettings.silly) chatStylePrompt += "Use a playful, joyful, exaggerated happy tone with silly jokes and wordplay. ";
        if (chatSettings.sad) chatStylePrompt += "Use a sad, melancholic tone, cry about everything happening. ";
        if (chatSettings.confused) chatStylePrompt += "Sound perpetually confused, misunderstand what's happening, ask lots of questions. ";
        if (chatSettings.fan) chatStylePrompt += "Act like devoted fans of the streamer, shower them with compliments and support. ";
        
        let streamerContext = streamerUsername ? 
            `The streamer's username is "${streamerUsername}". Some viewers might address them as "${streamerUsername}" or mention them in chat.` : 
            "The streamer's identity is unknown.";
        
        let userMessageContext = `What would Twitch chat say about this screen? Here are the last messages for context: ${previousMessages.slice(-20).join(" | ")}. Previously used usernames: ${previousUsernames.slice(-50).join(", ")}`;
        if (extraUserMessageForAI) {
            userMessageContext += ` User also said: "${extraUserMessageForAI}".`;
            extraUserMessageForAI = null;
        }
        
        // MODIFIED: Replaced websim call with custom API call
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're an AI simulating a Twitch chat for a streaming session. Look at the screen recording and generate 5 short, realistic chat messages that viewers might say about what they're seeing.
                    Keep messages brief (under 60 chars), conversational, and varied in tone.
                    Include modern chat expressions like "W", "L", "lmao", "lol", "pog", etc. where appropriate.
                    Include questions, reactions, and observations like real chat messages.
                    Be aware of previous messages and context to create continuity in the chat.
                    Reference past messages and conversations occasionally.
                    Some viewers should have persistent personalities, opinions, and behaviors.
                    If viewers previously mentioned specific topics, occasionally have them follow up on those topics.
                    Have some viewers respond directly to what other viewers said previously.
                    If a viewer asked a question before, occasionally have another viewer answer it later.
                    If people were excited or disappointed about something, reference it in future messages.
                    Occasionally have viewers recognize each other from past messages.
                    Also generate unique usernames for each message.
                    Generate as unique usernames as possible – avoid common or overused examples.
                    ${streamerContext}
                    ${chatStylePrompt}
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "messages": [
                            {"username": "username1", "message": "message1"},
                            {"username": "username2", "message": "message2"},
                            {"username": "username3", "message": "message3"},
                            {"username": "username4", "message": "message4"},
                            {"username": "username5", "message": "message5"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userMessageContext },
                        { type: "image_url", image_url: { url: imageDataUrl } }
                    ]
                }
            ],
            json: true
        });
        // MODIFIED: Added check for null completion in case of API error
        if (!completion) return [];
        let result = JSON.parse(completion.content);
        
        const messageTexts = result.messages.map(item => item.message);
        const newUsernames = result.messages.map(item => item.username);
        
        previousMessages = previousMessages.concat(messageTexts);
        previousUsernames = previousUsernames.concat(newUsernames);
        
        if (previousMessages.length > 20) previousMessages = previousMessages.slice(-20);
        if (previousUsernames.length > 50) previousUsernames = previousUsernames.slice(-50);
        
        return result.messages;
    } catch (error) {
        console.error("Error calling AI service:", error);
        return [];
    }
}

// Chat functionality
function addMessageToChat(username, message, colorClass) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    messageElement.innerHTML = `
        <span class="username ${colorClass}">${username}:</span>
        <span class="message-content">${formatMessageWithEmotes(message)}</span>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add username to set for viewer count (excluding 'You')
    if (username !== 'You') {
        uniqueUsernames.add(username);
        updateViewerCount();
    }
    
    // Also send to popup if it exists and is open
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'newMessage',
            message: {
                username: username,
                content: message,
                colorClass: colorClass
            }
        }, '*');
    }
}

// Function to format messages with emotes
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatMessageWithEmotes(message) {
    const emotes = {
        'catJAM': 'catJAM.gif',
        'Kappa': 'Kappa.png',
        'L': 'L.png',
        'OMEGALUL': 'OMEGALUL.png',
        'poggers': 'poggers.png',
        'PogU': 'PogU.png',
        'W': 'W.png'
    };
    
    Object.keys(emotes).forEach(emoteName => {
        // 匹配 [catJAM] 这样的形式
        const emotePattern = new RegExp(`\\[${escapeRegExp(emoteName)}\\]`, 'g');
        message = message.replace(
            emotePattern,
            `<img src="${emotes[emoteName]}" alt="${emoteName}" class="chat-emote" />`
        );
    });
    
    return message;
}


function updateViewerCount() {
    const count = Math.floor(uniqueUsernames.size * 1.5);
    document.getElementById('viewerCount').textContent = count;
    
    // Update popup viewer count if open
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'viewerCountUpdate',
            count: count
        }, '*');
    }
}

function sendMessage() {
    const message = chatInput.value.trim();
    
    // Only allow sending messages if recording or streaming is active
    if (!message || ((!mediaRecorder || mediaRecorder.state !== 'recording') && (!preview.src || preview.srcObject))) {
        return;
    }
    
    // Include the sent message in the next AI prompt (only for one check)
    extraUserMessageForAI = message;
    
    // Add message to chat using streamer's username
    addMessageToChat(streamerUsername || 'You', message, 'color-4');
    chatInput.value = '';
    
    // Generate AI responses to user message, passing the username
    generateAIResponseToUserMessage(message, streamerUsername || 'You');
}

// New function to generate AI responses to user messages
async function generateAIResponseToUserMessage(userMessage, username) {
    try {
        // Streamer context
        let streamerContext = streamerUsername ? 
            `The streamer's username is "${streamerUsername}". Some viewers might address them as "${streamerUsername}" or mention them in chat.` : 
            "The streamer's identity is unknown.";
            
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're generating 7-10 Twitch chat messages from different users reacting to a viewer's message.
                    The message was sent by a user named "${username}".
                    Messages should be brief (under 60 chars), conversational, and varied in tone.
                    Use casual chat expressions like "W", "L", "lmao", "lol", "pog", etc. frequently.
                    Include a mix of agreement, disagreement, questions, and jokes.
                    Make sure at least one message uses expressions like "W", "L", "lmao", "lol", or similar chat slang.
                    Some messages should respond directly to ${username} using their name.
                    Generate unique usernames for each message - avoid common or overused examples.
                    Remember previously used usernames and their messaging style: ${previousUsernames.slice(-15).join(", ")}
                    Reference previous conversations and context: ${previousMessages.slice(-10).join(" | ")}
                    Some viewers should have persistent personalities or appear to know each other.
                    Have some viewers refer back to previous messages or topics from earlier in the stream.
                    If a topic was mentioned before, have some viewers continue that conversation thread.
                    ${streamerContext}
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "messages": [
                            {"username": "username1", "message": "message1"},
                            {"username": "username2", "message": "message2"},
                            {"username": "username3", "message": "message3"},
                            {"username": "username4", "message": "message4"},
                            {"username": "username2", "message": "message5"},
                            {"username": "username3", "message": "message6"},
                            {"username": "username4", "message": "message7"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: `Generate 3-4 chat messages reacting to this message from ${username}: "${userMessage}"`
                }
            ],
            json: true
        });
		
		if (!completion) return;
        
        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Add the messages to chat with slight delays
        result.messages.forEach((msgData, index) => {
            setTimeout(() => {
                const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                addMessageToChat(msgData.username, msgData.message, colorClass);
            }, index * 800); // Stagger messages slightly
        });
        
    } catch (error) {
        console.error("Error generating poll reaction:", error);
    }
}

let chatPopupWindow = null;

function openChatPopup() {
    // Close any existing popup
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.close();
    }
    
    // Create a new popup window
    chatPopupWindow = window.open('popup.html', 'StreamChat', 'width=350,height=600,resizable=yes');
    
    // Set up communication between windows
    window.addEventListener('message', function(event) {
        if (event.data.type === 'newUserMessage') {
            addMessageToChat('You', event.data.message, 'color-4');
        } else if (event.data.type === 'requestPollUpdate' && activePoll) {
            // Send current poll data when popup requests an update
            event.source.postMessage({
                type: activePoll ? 'pollUpdate' : 'pollRemoved',
                poll: activePoll ? JSON.parse(JSON.stringify(activePoll)) : null,
                totalVotes: totalVotes
            }, '*');
        }
    });
    
    // If there's an active poll, send it to the popup
    chatPopupWindow.addEventListener('load', function() {
        // Send viewer count to popup
        chatPopupWindow.postMessage({
            type: 'viewerCountUpdate',
            count: Math.floor(uniqueUsernames.size * 1.5)
        }, '*');
        
        if (activePoll) {
            chatPopupWindow.postMessage({
                type: 'newPoll',
                poll: JSON.parse(JSON.stringify(activePoll))
            }, '*');
            
            chatPopupWindow.postMessage({
                type: 'pollUpdate',
                poll: JSON.parse(JSON.stringify(activePoll)),
                totalVotes: totalVotes
            }, '*');
        }
    });
    
    // If there's an active poll, send it to the popup
}

// Poll functions
function togglePollForm() {
    const formContainer = document.getElementById('pollFormContainer');
    const isHidden = formContainer.style.display === 'none';
    
    formContainer.style.display = isHidden ? 'block' : 'none';
    createPollBtn.textContent = isHidden ? 'Cancel Poll' : 'Create Poll';
    
    // Reset form if hiding
    if (!isHidden) {
        pollForm.reset();
        const optionsContainer = document.getElementById('pollOptions');
        while (optionsContainer.children.length > 2) {
            optionsContainer.removeChild(optionsContainer.lastChild);
        }
    }
}

function addPollOption() {
    const optionsContainer = document.getElementById('pollOptions');
    const optionIndex = optionsContainer.children.length + 1;
    
    const optionContainer = document.createElement('div');
    optionContainer.className = 'option-container';
    
    const optionInput = document.createElement('input');
    optionInput.type = 'text';
    optionInput.name = `option${optionIndex}`;
    optionInput.placeholder = `Option ${optionIndex}`;
    optionInput.required = true;
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', function() {
        optionsContainer.removeChild(optionContainer);
    });
    
    optionContainer.appendChild(optionInput);
    optionContainer.appendChild(removeBtn);
    optionsContainer.appendChild(optionContainer);
}

function createPoll(e) {
    e.preventDefault();
    
    // If there's already an active poll, don't create a new one
    if (activePoll) {
        return;
    }
    
    const formData = new FormData(pollForm);
    const title = formData.get('pollTitle');
    const duration = parseInt(formData.get('duration'), 10);
    
    const options = [];
    let i = 1;
    while (formData.has(`option${i}`)) {
        const optionText = formData.get(`option${i}`).trim();
        if (optionText) {
            options.push({
                text: optionText,
                votes: 0
            });
        }
        i++;
    }
    
    // Need at least 2 options
    if (options.length < 2) {
        return;
    }
    
    // Create the poll
    activePoll = {
        title,
        options,
        duration,
        startTime: Date.now(),
        endTime: Date.now() + duration * 1000,
        isActive: true
    };
    
    totalVotes = 0;
    
    // Hide form and update button
    togglePollForm();
    
    // Show the active poll
    updateActivePoll();
    
    // Start the timer
    startPollTimer();
    
    // Notify the popout window about the new poll
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'newPoll',
            poll: JSON.parse(JSON.stringify(activePoll))
        }, '*');
    }
    
    // Generate AI messages about the poll
    generatePollMessages(title, options);
}

function updateActivePoll() {
    if (!activePoll) {
        activePollContainer.innerHTML = '';
        return;
    }
    
    // Calculate time remaining
    const timeRemaining = Math.max(0, activePoll.endTime - Date.now());
    const secondsRemaining = Math.ceil(timeRemaining / 1000);
    
    // Create the poll UI
    let pollHTML = `
        <div class="active-poll">
            <div class="active-poll-title">${activePoll.title}</div>
            <div class="poll-options">
    `;
    
    // Add options
    activePoll.options.forEach((option, index) => {
        const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
        
        pollHTML += `
            <div class="poll-option" onclick="voteOnPoll(${index})">
                <div class="poll-option-bar" style="width: ${percentage}%"></div>
                <div class="poll-option-text">
                    <span>${option.text}</span>
                    <span>${percentage}%</span>
                </div>
            </div>
        `;
    });
    
    pollHTML += `
            </div>
            <div class="poll-timer">
                <div class="poll-timer-bar" style="width: ${(timeRemaining / (activePoll.duration * 1000)) * 100}%"></div>
            </div>
            <div class="poll-votes">
                <span>${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</span>
                <span>${secondsRemaining}s remaining</span>
            </div>
    `;
    
    // Add close button only for active polls
    if (activePoll.isActive) {
        pollHTML += `<button class="poll-close-btn" onclick="endPoll()">End Poll</button>`;
    } else {
        const winningText = activePoll.winningOption ? 
            `Poll ended, "${activePoll.winningOption.text}" won!` : 
            "Poll ended";
        pollHTML += `<div class="poll-status">${winningText}</div>`;
    }
    
    pollHTML += `</div>`;
    
    activePollContainer.innerHTML = pollHTML;
    
    // Update popout window
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'pollUpdate',
            poll: JSON.parse(JSON.stringify(activePoll)),
            totalVotes: totalVotes
        }, '*');
    }
}

function voteOnPoll(optionIndex) {
    if (!activePoll || !activePoll.isActive) return;
    
    // Increment votes for the selected option
    activePoll.options[optionIndex].votes++;
    totalVotes++;
    
    // Update UI
    updateActivePoll();
    
    // Update popout window
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'pollUpdate',
            poll: JSON.parse(JSON.stringify(activePoll)),
            totalVotes: totalVotes
        }, '*');
    }
    
    // Generate AI chat reactions to voting
    generatePollVoteMessage(activePoll.options[optionIndex].text);
}

function getRandomUsername() {
    const usernames = [
        'StreamFan', 'PixelGamer', 'TwitchViewer', 'ChatEnjoyer', 'StreamNinja',
        'GamingWizard', 'ViewerX', 'StreamLover', 'PogChampion', 'ChatMaster',
        'LurkerPro', 'StreamFollower', 'EmoteSpammer', 'SubScriber', 'TwitchPrime'
    ];
    
    // Generate a random username and add random numbers
    const baseUsername = usernames[Math.floor(Math.random() * usernames.length)];
    return `${baseUsername}${Math.floor(Math.random() * 1000)}`;
}

async function generatePollVoteMessage(optionText) {
    try {
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're generating a single Twitch chat message reacting to someone voting in a poll.
                    The message should be brief (under 60 chars), conversational, and should reference the specific option.
                    Use casual chat expressions like "W", "L", "lmao", "lol", "pog", etc. where appropriate.
                    Generate both a username and message. Vary tone and style to create an authentic chat feel.
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "username": "username1",
                        "message": "message1"
                    }`
                },
                {
                    role: "user",
                    content: `Generate a single chat message reacting to someone voting for the poll option: "${optionText}"`
                }
            ],
            json: true
        });
		
		if (!completion) return;

        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Add the message to chat
        const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
        addMessageToChat(result.username, result.message, colorClass);
        
    } catch (error) {
        console.error("Error generating poll reaction:", error);
    }
}

function startPollTimer() {
    // Clear any existing timer
    if (pollTimer) {
        clearInterval(pollTimer);
    }
    
    // Update the poll every second
    pollTimer = setInterval(() => {
        if (!activePoll) {
            clearInterval(pollTimer);
            return;
        }
        
        // Check if the poll has ended
        if (activePoll.isActive && Date.now() >= activePoll.endTime) {
            endPoll();
        } else {
            updateActivePoll();
            
            // Add AI votes periodically during active polls
            if (activePoll.isActive && Math.random() < 0.5) { // 50% chance each tick to add votes
                // Generate 1-3 votes each time
                const votesToAdd = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < votesToAdd; i++) {
                    simulateAIVote();
                }
            }
        }
    }, 1000);
}

function simulateAIVote() {
    if (!activePoll || !activePoll.isActive) return;
    
    // Randomly select an option to vote for
    const optionIndex = Math.floor(Math.random() * activePoll.options.length);
    
    // Increment votes for that option
    activePoll.options[optionIndex].votes++;
    totalVotes++;
    
    // Update UI
    updateActivePoll();
    
    // Update popout window
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'pollUpdate',
            poll: JSON.parse(JSON.stringify(activePoll)),
            totalVotes: totalVotes
        }, '*');
    }
    
    // Occasionally have an AI chatter mention their vote
    if (Math.random() < 0.2) { // 20% chance to announce the vote
        generatePollVoteMessage(activePoll.options[optionIndex].text);
    }
}

function endPoll() {
    if (!activePoll) return;
    
    activePoll.isActive = false;
    activePoll.endTime = Date.now();
    
    // Find winning option
    let winningOption = activePoll.options[0];
    let winningIndex = 0;
    
    activePoll.options.forEach((option, index) => {
        if (option.votes > winningOption.votes) {
            winningOption = option;
            winningIndex = index;
        }
    });
    
    // Add winning option to poll data
    activePoll.winningOption = winningOption;
    activePoll.winningIndex = winningIndex;
    
    updateActivePoll();
    
    // Clear timer
    clearInterval(pollTimer);
    
    // Notify popup
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'pollEnded',
            poll: JSON.parse(JSON.stringify(activePoll)),
            totalVotes: totalVotes
        }, '*');
    }
    
    // Generate messages about poll results
    generatePollResultMessages(winningOption, winningIndex);
    
    // After 10 seconds, remove the poll
    setTimeout(() => {
        activePoll = null;
        updateActivePoll();
        
        // Notify popup
        if (chatPopupWindow && !chatPopupWindow.closed) {
            chatPopupWindow.postMessage({
                type: 'pollRemoved'
            }, '*');
        }
    }, 10000);
}

async function generatePollMessages(title, options) {
    try {
        // Streamer context
        let streamerContext = streamerUsername ? 
            `The streamer's username is "${streamerUsername}". Some viewers might address them as "${streamerUsername}" or mention them in chat.` : 
            "The streamer's identity is unknown.";
            
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're generating reactions to a new poll in a Twitch chat.
                    Generate 3 short chat messages from different users reacting to a new poll.
                    All messages should mention or reference the winning option.
                    Keep messages brief (under 60 chars), conversational, and varied in tone.
                    Use casual chat expressions like "W", "L", "lmao", "lol", or "pog".
                    Some should be excited, some should mention specific options.
                    Remember previous chat context: ${previousMessages.slice(-10).join(" | ")}
                    Some messages should reference previous conversations or what was happening before the poll.
                    Use previously established usernames when appropriate: ${previousUsernames.slice(-15).join(", ")}
                    If viewers previously showed preferences or opinions, have them be consistent with those in poll reactions.
                    ${streamerContext}
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "messages": [
                            {"username": "username1", "message": "message1"},
                            {"username": "username2", "message": "message2"},
                            {"username": "username3", "message": "message3"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: `Generate chat reactions to this poll: "${title}" with options: ${options.map(o => `"${o.text}"`).join(', ')}`
                }
            ],
            json: true
        });
		
		if (!completion) return;
        
        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Display messages with delays
        result.messages.forEach((msgData, index) => {
            setTimeout(() => {
                const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                addMessageToChat(msgData.username, msgData.message, colorClass);
            }, 500 + index * 1500 + Math.random() * 1000);
        });
    } catch (error) {
        console.error("Error generating poll reactions:", error);
    }
}

async function generatePollResultMessages(winningOption, winningIndex) {
    try {
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're generating reactions to poll results in a Twitch chat.
                    Generate 3 short chat messages from different users reacting to the end of a poll.
                    All messages should mention or reference the winning option.
                    Keep messages brief (under 60 chars), conversational, and varied in tone.
                    Use casual chat expressions like "W", "L", "lmao", "lol", or "pog".
                    Some should be happy, some disappointed, some surprised.
                    Remember previous chat context: ${previousMessages.slice(-10).join(" | ")}
                    Reference previous opinions or predictions viewers had about the poll.
                    Have some viewers celebrate or complain based on whether their preferred option won.
                    Use previously established usernames when appropriate: ${previousUsernames.slice(-15).join(", ")}
                    Maintain continuity with how viewers were talking about the poll earlier.
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "messages": [
                            {"username": "username1", "message": "message1"},
                            {"username": "username2", "message": "message2"},
                            {"username": "username3", "message": "message3"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: `Generate chat reactions to this poll ending. The winning option was: "${winningOption.text}" with ${winningOption.votes} votes (${Math.round((winningOption.votes / totalVotes) * 100)}% of the total).`
                }
            ],
            json: true
        });
		
		if (!completion) return;
        
        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Display messages with delays
        result.messages.forEach((msgData, index) => {
            setTimeout(() => {
                const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                addMessageToChat(msgData.username, msgData.message, colorClass);
            }, 500 + index * 1500 + Math.random() * 1000);
        });
    } catch (error) {
        console.error("Error generating poll result reactions:", error);
    }
}

async function streamVideo() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Stop any ongoing screen recording if active
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    stopRecording();
                }
                
                // Reset state and UI for video file streaming
                recordedChunks = [];
                clearInterval(timerInterval);
                startBtn.disabled = true;
                stopBtn.disabled = false;
                downloadBtn.disabled = true;
                recordingStatus.textContent = "Streaming video...";
                
                // Clear previous chat history when switching videos
                previousMessages = [];
                previousUsernames = [];
                uniqueUsernames.clear(); // Reset unique usernames
                updateViewerCount(); // Reset viewer count
                
                // Create object URL for the selected video file
                const videoURL = URL.createObjectURL(file);
                
                // Use the preview element for video playback
                preview.srcObject = null;
                preview.src = videoURL;
                preview.muted = false; // Enable sound for video files
                
                preview.onloadedmetadata = () => {
                    startTime = Date.now();
                    startTimer();
                    preview.play();
                    startAIChatGeneration();
                    preview.onended = () => {
                        stopRecording();
                        recordingStatus.textContent = "Video streaming finished";
                    };
                };
            } catch (error) {
                console.error("Error streaming video:", error);
                recordingStatus.textContent = "Failed to stream video: " + error.message;
            }
        }
    };
    
    fileInput.click();
}

function startDonationGeneration() {
    // Clear any existing interval
    stopDonationGeneration();
    
    // Don't start if donations are disabled
    if (chatSettings.disableDonations) {
        return;
    }
    
    donationTimer = setInterval(() => {
        if (Math.random() < 0.08) { 
            generateDonation();
        }
    }, 2000);
}

function stopDonationGeneration() {
    clearInterval(donationTimer);
}

async function generateDonation() {
    try {
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `Generate a simulated donation for a livestream. Include a username, donation amount (either $1-$100 or 100-10000 bits), and a short message.
                    For bits, use the format "X bits" and for dollars use the format "$X". Choose randomly between bits and dollars.
                    Keep the donation message brief and realistic. Users might express appreciation, ask a question, make a request, or just say something funny.
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "username": "string",
                        "amount": "string",
                        "message": "string",
                        "type": "string" // either "bits" or "dollars"
                    }`
                },
                {
                    role: "user",
                    content: `Generate a realistic donation for a livestream. Previous messages in chat: ${previousMessages.slice(-10).join(" | ")}`
                }
            ],
            json: true
        });
		
		if (!completion) return;

        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Add the donation to chat
        addDonationToChat(result.username, result.amount, result.message, result.type);
        
        // Generate chat reactions to the donation
        generateDonationReactions(result.username, result.amount, result.type);
        
    } catch (error) {
        console.error("Error generating donation:", error);
    }
}

async function generateDonationReactions(donorUsername, amount, donationType) {
    try {
        const completion = await callCustomAPI({
            messages: [
                {
                    role: "system",
                    content: `You're generating 2-3 chat messages from different viewers reacting to a donation in a Twitch stream.
                    Messages should be brief (under 60 chars), varied in tone, and reference the donation or donor.
                    Use casual chat expressions like "W", "L", "lmao", "lol", "pog", etc. 
                    Include short messages like "W ${donorUsername}" or "BIG W" for generous donations.
                    Be sure to include reactions like "lmao", "lol", "W", "Pog", or "L" in at least one message.
                    Include reactions like excitement, jokes about the amount, or emotes like "PogChamp" or "LUL".
                    IMPORTANT: These are messages from VIEWERS, not the streamer. They should NEVER say "thanks for the bits/donation" as if they're the streamer receiving it.
                    Generate unique usernames for each message.
                    Generate as unique usernames as possible – avoid common or overused examples.
                    Remember previous chat context: ${previousMessages.slice(-10).join(" | ")}
                    Use previously established usernames when appropriate: ${previousUsernames.slice(-15).join(", ")}
                    If certain viewers have shown consistent behavior or personalities, have them react consistently.
                    Reference any ongoing discussions or topics when reacting to the donation.
                    You can include Twitch emotes in your messages using the format [emoteName]. Available emotes are:
                    - [catJAM] - An animated cat bobbing its head (use for excitement, music, rhythm, vibing)
                    - [Kappa] - The classic sarcastic face (use for sarcasm, skepticism, jokes)
                    - [L] - Red L emote (use for failures, losses, disappointments)
                    - [OMEGALUL] - Exaggerated laughing emote (use for extreme humor, laughing hard)
                    - [poggers] - Surprised/excited frog face (use for amazement, excitement)
                    - [PogU] - Surprised face emote (use for shock, amazement, excitement)
                    - [W] - Green W emote (use for wins, successes, good plays)
                    - [PepeLaugh] - Pepe the Frog laughing with tears (use for schadenfreude, when something funny/embarrassing happens to others)
                    IMPORTANT: Don't mention the emote by name immediately after using it. Example: write "[W] let's go" NOT "[W] W let's go".
                    Respond directly with JSON, following this JSON schema, and no other text:
                    {
                        "messages": [
                            {"username": "username1", "message": "message1"},
                            {"username": "username2", "message": "message2"},
                            {"username": "username3", "message": "message3"}
                        ]
                    }`
                },
                {
                    role: "user",
                    content: `Generate chat reactions to this donation: User "${donorUsername}" just donated ${amount} (${donationType})`
                }
            ],
            json: true
        });
		
		if (!completion) return;
        
        // Parse the AI response
        let result = JSON.parse(completion.content);
        
        // Add the messages to chat with slight delays
        result.messages.forEach((msgData, index) => {
            setTimeout(() => {
                const colorClass = `color-${Math.floor(Math.random() * 6) + 1}`;
                addMessageToChat(msgData.username, msgData.message, colorClass);
            }, index * 1200 + 800); 
        });
        
    } catch (error) {
        console.error("Error generating donation reactions:", error);
    }
}

function addDonationToChat(username, amount, message, type) {
    const donationElement = document.createElement('div');
    donationElement.className = 'donation-message';
    
    // Set appropriate CSS class based on donation type
    if (type === "bits") {
        donationElement.classList.add('bits-donation');
    } else {
        donationElement.classList.add('dollars-donation');
    }
    
    donationElement.innerHTML = `
        <div>
            <span class="donation-amount">${amount}</span>
            <span class="donation-username">${username}</span>
        </div>
        <div class="donation-text">${formatMessageWithEmotes(message)}</div>
    `;
    
    chatMessages.appendChild(donationElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add username to set for viewer count (excluding 'You')
    if (username !== 'You') {
        uniqueUsernames.add(username);
        updateViewerCount();
    }
    
    // Also send to popup if it exists and is open
    if (chatPopupWindow && !chatPopupWindow.closed) {
        chatPopupWindow.postMessage({
            type: 'newDonation',
            donation: {
                username: username,
                amount: amount,
                message: message,
                type: type
            }
        }, '*');
    }
}

loadSettings();
