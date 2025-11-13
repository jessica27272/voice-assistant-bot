/* ========= DOM Refs ========= */
const chatBody = document.querySelector(".chat-body") || document.getElementById("chatBody");
const messageInput = document.querySelector(".message-input") || document.getElementById("messageInput");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = document.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");
const voiceToggle = document.getElementById("voiceToggle");
const micButton = document.getElementById("micButton");
const themeToggle = document.getElementById("themeToggle");

/* ========= Config / State ========= */
const API_KEY = "AIzaSyAxcubjimuyeUBApKhJG_e_YqlbTdBgjuU";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
let userData = { message: null, file: { data: null, mime_type: null } };
let chatHistory = []; // kept for API shape
const initialInputHeight = messageInput.scrollHeight;
let voiceEnabled = true;

/* ========= Helpers ========= */
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

function appendPlainMessage(role, text, attachmentSrc = null) {
  // role: 'user' or 'bot'
  const classes = role === "user" ? ["user-message"] : ["bot-message"];
  const content = `<div class="message-text">${text}</div>${attachmentSrc ? `<img src="${attachmentSrc}" class="attachment" />` : ""}`;
  const el = createMessageElement(content, ...classes);
  chatBody.appendChild(el);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // persist simple history (role + text) to localStorage for memory
  persistChat(role, text);
}

/* ========== LocalStorage Chat Memory ========== */
const PERSIST_KEY = "chatbot_persisted_history";
function persistChat(role, text) {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ role, text, ts: Date.now() });
    localStorage.setItem(PERSIST_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("Could not persist chat:", e);
  }
}
function loadPersistedChat() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    arr.forEach(item => {
      appendPlainMessage(item.role, item.text);
    });
  } catch (e) {
    console.warn("Failed to load persisted chat", e);
  }
}
function clearPersistedChat() {
  localStorage.removeItem(PERSIST_KEY);
  // remove messages from UI (re-render starting state)
  // Keep the initial welcome message only
  while (chatBody.firstChild) chatBody.removeChild(chatBody.firstChild);
  // re-add initial bot greeting
  const greeting = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024"><path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path></svg><div class="message-text">Hey there! 👋 <br />How can I help you today?</div>`;
  const el = createMessageElement(greeting, "bot-message");
  chatBody.appendChild(el);
}

/* ========== Text-to-Speech (TTS) ========= */
function speakText(text) {
  if (!voiceEnabled) return;
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // choose language from page or fallback
    utterance.lang = navigator.language || "en-US";
    utterance.pitch = 1;
    utterance.rate = 1;
    speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("TTS error", e);
  }
}

/* ========== API call & response handling (kept your structure) ========== */
const chatApiPush = (role, text) => {
  // keep original chatHistory structure used by your API
  chatHistory.push({ role, parts: [{ text }] });
};

const generateBotResponse = async (incomingMessageDiv) => {
  const messageElemet = incomingMessageDiv.querySelector(".message-text");

  // add user message to chatHistory for API
  chatApiPush("user", userData.message);

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: chatHistory })
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API error");

    const apiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text
      ? data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '$1').trim()
      : "Sorry, I didn't get that.";

    messageElemet.innerText = apiResponseText;
    speakText(apiResponseText);

    // add model response to chatHistory
    chatApiPush("model", apiResponseText);

    // persist simplified text form as memory
    persistChat("model", apiResponseText);

  } catch (error) {
    console.log(error);
    messageElemet.innerText = error.message || "Request failed";
    messageElemet.style.color = "#ff0000";
  } finally {
    userData.file = {};
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  }
};

/* ========== Outgoing flow (send) ========= */
const handleOutgoingMessage = (e) => {
  if (e && typeof e.preventDefault === "function") e.preventDefault();

  userData.message = messageInput.value.trim();
  if (!userData.message) return;

  // show user message
  const messageContent = `<div class="message-text"></div> ${userData.file.data ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="attachment" />` : ""}`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent = userData.message;
  chatBody.appendChild(outgoingMessageDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // persist user
  persistChat("user", userData.message);

  // reset input + file UI
  messageInput.value = "";
  fileUploadWrapper.classList.remove("file-uploaded");
  messageInput.dispatchEvent(new Event("input"));

  // thinking indicator & call API
  setTimeout(() => {
    const messageContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024"><path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path></svg>
    <div class="message-text"><div class="thinking-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
    const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
    chatBody.appendChild(incomingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    generateBotResponse(incomingMessageDiv);
  }, 600);
};

/* ========== KEY / UI wiring ========== */
messageInput.addEventListener("keydown", (e) => {
  const userMessage = e.target.value.trim();
  if (e.key === "Enter" && userMessage && !e.shiftKey && window.innerWidth > 768) {
    handleOutgoingMessage(e);
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = `${initialInputHeight}px`;
  messageInput.style.height = `${messageInput.scrollHeight}px`;
  document.querySelector(".chat-form").style.borderRadius = messageInput.scrollHeight > initialInputHeight ? "15px" : "32px";
});

/* file preview */
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    fileUploadWrapper.querySelector("img").src = e.target.result;
    fileUploadWrapper.classList.add("file-uploaded");
    const base64String = e.target.result.split(",")[1];
    userData.file = { data: base64String, mime_type: file.type };
    fileInput.value = "";
  };
  reader.readAsDataURL(file);
});
fileCancelButton.addEventListener("click", () => {
  userData.file = {};
  fileUploadWrapper.classList.remove("file-uploaded");
});

/* emoji picker */
const picker = new EmojiMart.Picker({
  theme: "light",
  skinTonePosition: "none",
  previewPosition: "none",
  onEmojiSelect: (emoji) => {
    const { selectionStart: start, selectionEnd: end } = messageInput;
    messageInput.setRangeText(emoji.native, start, end, "end");
    messageInput.focus();
  },
  onClickOutside: (e) => {
    if (e.target.id === "emoji-picker") document.body.classList.toggle("show-emoji-picker");
    else document.body.classList.remove("show-emoji-picker");
  }
});
document.querySelector(".chat-form").appendChild(picker);

/* button wiring */
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
document.querySelector("#file-upload").addEventListener("click", () => fileInput.click());
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeChatbot.addEventListener("click", () => document.body.classList.remove("show-chatbot"));

/* Voice toggle button */
voiceToggle.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  voiceToggle.textContent = voiceEnabled ? "🔊 Voice On" : "🔇 Voice Off";
});

/* Theme toggle */
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
});

/* ========== Speech-to-Text (STT) ========== */
let recognition = null;
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Rec();
  recognition.continuous = false;
  recognition.lang = navigator.language || "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    try {
      if (micButton.classList.contains("listening")) {
        recognition.stop();
        micButton.classList.remove("listening");
      } else {
        recognition.start();
        micButton.classList.add("listening");
      }
    } catch (e) { console.warn(e); micButton.classList.remove("listening"); }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    messageInput.value = transcript;
    micButton.classList.remove("listening");
    // auto-send
    handleOutgoingMessage(new Event("submit"));
  };

  recognition.onerror = (ev) => {
    console.error("Speech recognition error:", ev.error);
    micButton.classList.remove("listening");
  };

  recognition.onend = () => {
    micButton.classList.remove("listening");
  };
} else {
  // If STT unsupported, disable mic button
  micButton.disabled = true;
  micButton.title = "Speech-to-text not supported in this browser";
}

/* ========== Initialization: load persisted chat ========= */
window.addEventListener("DOMContentLoaded", () => {
  loadPersistedChat();
  // set initial voice button label
  voiceToggle.textContent = voiceEnabled ? "🔊 Voice On" : "🔇 Voice Off";
});
