// --- State Management ---
let mediaRecorder;
let audioChunks = [];
let isSessionActive = false;
let stream;
let audioContext;
let analyser;
let source;
let vadInterval;
let isSpeaking = false;
let silenceStart = Date.now();
let speechFrames = 0;

// --- DOM Elements ---
const startBtn = document.getElementById('startBtn');
const snippetBtn = document.getElementById('snippetBtn');
const fullBtn = document.getElementById('fullBtn');
const opacitySlider = document.getElementById('opacitySlider');
const dialogueContent = document.getElementById('dialogueContent');
const screenshotContent = document.getElementById('screenshotContent');
const languageInput = document.getElementById('languageInput');
const modelSelect = document.getElementById('modelSelect');
const fontSizeSlider = document.getElementById('fontSizeSlider');
const foldBtn = document.getElementById('foldBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

// Session DOM Elements
const newSessionBtn = document.getElementById('newSessionBtn');
const sessionList = document.getElementById('sessionList');

// --- Session Management ---
let sessions = JSON.parse(localStorage.getItem('ghost_sessions')) || [];
let currentSessionId = localStorage.getItem('ghost_current_session') || null;

function initSessions() {
    if (sessions.length === 0) {
        createNewSession();
    } else {
        if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
            currentSessionId = sessions[0].id;
        }
        loadSession(currentSessionId);
    }
}

function createNewSession() {
    const newSession = {
        id: Date.now().toString(),
        title: 'New Session',
        date: new Date().toISOString(),
        messages: []
    };
    sessions.unshift(newSession);
    currentSessionId = newSession.id;
    saveSessions();
    loadSession(currentSessionId);
}

function saveSessions() {
    localStorage.setItem('ghost_sessions', JSON.stringify(sessions));
    localStorage.setItem('ghost_current_session', currentSessionId);
}

function loadSession(id) {
    currentSessionId = id;
    if (dialogueContent) dialogueContent.innerHTML = '';
    if (screenshotContent) screenshotContent.innerHTML = `<div class="message system"><strong>System:</strong><p>Screenshot results will appear here.</p></div>`;
    
    const session = sessions.find(s => s.id === id);
    if (session) {
        if (session.messages.length === 0) {
            addMessageToDOM(dialogueContent, "System", "Dialogue initialized.", "system");
        } else {
            session.messages.forEach(msg => {
                if (msg.target === 'screenshot') {
                    addMessageToDOM(screenshotContent, msg.sender, msg.text, msg.type);
                } else {
                    addMessageToDOM(dialogueContent, msg.sender, msg.text, msg.type);
                }
            });
        }
    }
    renderSessionList();
}

function renderSessionList() {
    if (!sessionList) return;
    
    sessionList.innerHTML = '';
    sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
        
        const dateObj = new Date(session.date);
        const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="session-info">
                <div class="session-title">${session.title}</div>
                <div class="session-date">${dateStr}</div>
            </div>
            <div class="session-actions">
                <button class="action-btn edit-btn" title="Rename"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                <button class="action-btn download-btn" title="Download"><i data-lucide="download" style="width: 14px; height: 14px;"></i></button>
                <button class="action-btn delete-btn" title="Delete"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
            </div>
        `;
        div.addEventListener('click', () => loadSession(session.id));
        
        // Actions
        const editBtn = div.querySelector('.edit-btn');
        const downloadBtn = div.querySelector('.download-btn');
        const deleteBtn = div.querySelector('.delete-btn');
        
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const titleDiv = div.querySelector('.session-title');
            if (titleDiv.querySelector('input')) return; // Already editing
            
            const currentTitle = session.title;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.className = 'session-title-edit';
            input.style.width = '100%';
            input.style.background = 'rgba(0, 0, 0, 0.2)';
            input.style.border = '1px solid var(--primary-color, #4a90e2)';
            input.style.color = 'var(--text-primary, #ffffff)';
            input.style.fontSize = '13px';
            input.style.fontFamily = 'inherit';
            input.style.padding = '2px 4px';
            input.style.borderRadius = '4px';
            input.style.outline = 'none';
            input.style.boxSizing = 'border-box';
            
            titleDiv.innerHTML = '';
            titleDiv.appendChild(input);
            input.focus();
            input.select();
            
            let isSaved = false;
            const save = () => {
                if (isSaved) return;
                isSaved = true;
                const newTitle = input.value.trim();
                if (newTitle !== '' && newTitle !== currentTitle) {
                    session.title = newTitle;
                    saveSessions();
                }
                renderSessionList();
            };
            
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    save();
                } else if (e.key === 'Escape') {
                    isSaved = true;
                    renderSessionList();
                }
            });
        });
        
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            let markdown = `# Session: ${session.title}\nDate: ${new Date(session.date).toLocaleString()}\n\n`;
            session.messages.forEach(msg => {
                markdown += `### ${msg.sender} (${msg.target === 'screenshot' ? 'Vision' : 'Audio'})\n`;
                markdown += `${msg.text}\n\n`;
            });
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Interview_Session_${session.id}.md`;
            a.click();
            URL.revokeObjectURL(url);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm("Are you sure you want to delete this session?")) {
                sessions = sessions.filter(s => s.id !== session.id);
                if (sessions.length === 0) {
                    createNewSession();
                } else if (currentSessionId === session.id) {
                    loadSession(sessions[0].id);
                } else {
                    saveSessions();
                    renderSessionList();
                }
            }
        });
        
        sessionList.appendChild(div);
    });
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

if (newSessionBtn) {
    newSessionBtn.addEventListener('click', createNewSession);
}

// Auth DOM Elements
const authOverlay = document.getElementById('authOverlay');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const authError = document.getElementById('authError');
const payBtn = document.getElementById('payBtn');

// Paywall DOM Elements
const paywallOverlay = document.getElementById('paywallOverlay');
const btnCancelPaywall = document.getElementById('btnCancelPaywall');
const subMonthly = document.getElementById('subMonthly');
const subYearly = document.getElementById('subYearly');

// Profile & Preferences DOM Elements
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');
const profileEmailDisplay = document.getElementById('profileEmail');
const profileBalanceDisplay = document.getElementById('profileBalance');
const btnPreferences = document.getElementById('btnPreferences');
const btnUpgrade = document.getElementById('btnUpgrade');
const btnTopUp = document.getElementById('btnTopUp');
const btnCancelSub = document.getElementById('btnCancelSub');
const btnLogout = document.getElementById('btnLogout');
const preferencesOverlay = document.getElementById('preferencesOverlay');
const sysPromptAudio = document.getElementById('sysPromptAudio');
const sysPromptVision = document.getElementById('sysPromptVision');
const btnSavePrefs = document.getElementById('btnSavePrefs');
const btnCancelPrefs = document.getElementById('btnCancelPrefs');
const tokenWarning = document.getElementById('tokenWarning');
const langDropdownWrapper = document.getElementById('langDropdownWrapper');
const langDropdown = document.getElementById('langDropdown');
const uiLangIcon = document.getElementById('uiLangIcon');
const uiLangText = document.getElementById('uiLangText');

const FLAG_EN = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjExIj48Y2xpcFBhdGggaWQ9InQiPjxwYXRoIGQ9Ik0zMCwxNSBoMzAgdjE1IHogdi0xNSBoLTMwIHogaC0zMCB2LTE1IHogdjE1IGgzMCB6Ii8+PC9jbGlwUGF0aD48cGF0aCBkPSJNMCwwIHYzMCBoNjAgdi0zMCB6IiBmaWxsPSIjMDEyMTY5Ii8+PHBhdGggZD0iTTAsMCBMNjAsMzAgTTYwLDAgTDAsMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHBhdGggZD0iTTAsMCBMNjAsMzAgTTYwLDAgTDAsMzAiIGNsaXAtcGF0aD0idXJsKCN0KSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAsMCB2MzAgTTAsMTUgaDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAsMCB2MzAgTTAsMTUgaDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPg==';
const FLAG_RU = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxMSI+PHJlY3QgZmlsbD0iI2ZmZiIgd2lkdGg9IjkiIGhlaWdodD0iMyIvPjxyZWN0IGZpbGw9IiNkNTJiMWUiIHk9IjMiIHdpZHRoPSI5IiBoZWlnaHQ9IjMiLz48cmVjdCBmaWxsPSIjMDAzOWE2IiB5PSIyIiB3aWR0aD0iOSIgaGVpZ2h0PSIyIi8+PC9zdmc+';

function updateUiLangDisplay(lang) {
    if (lang === 'ru') {
        if (uiLangIcon) uiLangIcon.src = FLAG_RU;
        if (uiLangText) uiLangText.textContent = 'RU';
    } else {
        if (uiLangIcon) uiLangIcon.src = FLAG_EN;
        if (uiLangText) uiLangText.textContent = 'EN';
    }
}

const translations = {
    en: {
        authTitle: "Ghost Assistant",
        tabLogin: "Login",
        tabRegister: "Register",
        loginEmail: "Email",
        loginPassword: "Password",
        btnLogin: "Login",
        regEmail: "Email",
        regPassword: "Password",
        btnRegister: "Register",
        prefTitle: "Preferences",
        lblSysPromptAudio: "Audio System Prompt",
        lblSysPromptVision: "Vision System Prompt",
        btnSavePrefs: "Save",
        btnCancelPrefs: "Cancel",
        paywallTitleUI: "Premium Subscription",
        paywallDescUI: "Unlock unlimited access and exclusive features.",
        subMonthlyTitleUI: "1 Month",
        subMonthlyDescUI: "Flexible, cancel anytime.",
        subYearlyTitleUI: "1 Year",
        subYearlyDescUI: "Save big! Billed annually.",
        bestValueUI: "BEST VALUE",
        btnCancelPaywall: "Close",
        tokenWarningLow: `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; margin-right: 4px;"></i> Low Tokens`,
        tokenWarningTopUp: `<i data-lucide="coins" style="width: 14px; height: 14px; margin-right: 4px;"></i> Top Up Required`,
        tokenWarningTitle: "Low Balance. Please top up!",
        btnPreferences: "Preferences",
        btnUpgrade: `<i data-lucide="gem" style="width: 14px; height: 14px; margin-right: 6px;"></i> Subscribe`,
        btnTopUp: `<i data-lucide="coins" style="width: 14px; height: 14px; margin-right: 6px;"></i> Buy Top-up`,
        btnCancelSub: `<i data-lucide="x-circle" style="width: 14px; height: 14px; margin-right: 6px;"></i> Cancel Sub`,
        btnLogout: "Log Out",
        dialogueHeaderUI: "Dialogue",
        startBtnStart: "Start Listening",
        startBtnStop: "Stop",
        screenshotsHeaderUI: "Screenshots",
        snippetBtn: `<i data-lucide="scissors" style="width: 14px; height: 14px; margin-right: 4px;"></i> Snipping`,
        fullBtn: `<i data-lucide="camera" style="width: 14px; height: 14px; margin-right: 4px;"></i> Full`,
        transparencyLabelUI: "Transparency",
        systemAnalyzing: "Analyzing...",
        systemMicrophoneError: "Microphone access denied.",
        balanceLoading: "Balance: Loading...",
        balanceStandard: "Balance: Standard Plan",
        balanceUnknown: "Balance: Unknown",
        paymentError: "Payment error: ",
        cancelConfirm: "Are you sure you want to cancel your subscription?",
        cancelSuccess: "Subscription canceled successfully.",
        cancelError: "Cancellation error: ",
        fillFieldsError: "Please fill all fields.",
        loggingIn: "Logging in...",
        registering: "Registering...",
        profileLoading: "Loading...",
        titleProfile: "Profile",
        titleMinimize: "Minimize",
        titleMaximize: "Maximize",
        titleClose: "Close",
        titlePremium: "Upgrade to Premium",
        roleSystem: "System",
        roleYou: "You/Interviewer",
        roleGhost: "Ghost",
        roleError: "Error",
        systemInit: "Screenshot results will appear here.",
        historyHeaderUI: "History",
        verifyEmailMessage: "Verification email sent. Please check your inbox.",
        verifyEmailError: "Please verify your email before logging in.",
        verifyBannerText: "Your email is not verified. Sync features are limited.",
        btnResendVerification: "Resend Email",
        resendSuccess: "Verification email sent!",
        verifyLimitReached: "Limit reached. Please verify your email to continue.",
        verifyLimitReached: "Limit reached. Please verify your email to continue."
    },
    ru: {
        authTitle: "Ghost Assistant",
        tabLogin: "Вход",
        tabRegister: "Регистрация",
        loginEmail: "Email",
        loginPassword: "Пароль",
        btnLogin: "Войти",
        regEmail: "Email",
        regPassword: "Пароль",
        btnRegister: "Зарегистрироваться",
        prefTitle: "Настройки",
        lblSysPromptAudio: "Системный промпт (Аудио)",
        lblSysPromptVision: "Системный промпт (Зрение)",
        btnSavePrefs: "Сохранить",
        btnCancelPrefs: "Отмена",
        paywallTitleUI: "Премиум Подписка",
        paywallDescUI: "Безлимитный доступ и эксклюзивные функции.",
        subMonthlyTitleUI: "1 Месяц",
        subMonthlyDescUI: "Гибко, отмена в любой момент.",
        subYearlyTitleUI: "1 Год",
        subYearlyDescUI: "Экономия! Списание раз в год.",
        bestValueUI: "ЛУЧШАЯ ЦЕНА",
        btnCancelPaywall: "Закрыть",
        tokenWarningLow: `<i data-lucide="alert-triangle" style="width: 14px; height: 14px; margin-right: 4px;"></i> Мало токенов`,
        tokenWarningTopUp: `<i data-lucide="coins" style="width: 14px; height: 14px; margin-right: 4px;"></i> Пополните баланс`,
        tokenWarningTitle: "Мало токенов. Пожалуйста, пополните баланс!",
        btnPreferences: "Настройки",
        btnUpgrade: `<i data-lucide="gem" style="width: 14px; height: 14px; margin-right: 6px;"></i> Подписаться`,
        btnTopUp: `<i data-lucide="coins" style="width: 14px; height: 14px; margin-right: 6px;"></i> Пополнить`,
        btnCancelSub: `<i data-lucide="x-circle" style="width: 14px; height: 14px; margin-right: 6px;"></i> Отменить подписку`,
        btnLogout: "Выйти",
        dialogueHeaderUI: "Диалог",
        startBtnStart: "Начать запись",
        startBtnStop: "Остановить",
        screenshotsHeaderUI: "Скриншоты",
        snippetBtn: `<i data-lucide="scissors" style="width: 14px; height: 14px; margin-right: 4px;"></i> Фрагмент`,
        fullBtn: `<i data-lucide="camera" style="width: 14px; height: 14px; margin-right: 4px;"></i> Весь экран`,
        transparencyLabelUI: "Прозрачность",
        systemAnalyzing: "Анализ...",
        systemMicrophoneError: "Доступ к микрофону запрещен.",
        balanceLoading: "Баланс: Загрузка...",
        balanceStandard: "Баланс: Базовый план",
        balanceUnknown: "Баланс: Неизвестно",
        paymentError: "Ошибка оплаты: ",
        cancelConfirm: "Вы уверены, что хотите отменить подписку?",
        cancelSuccess: "Подписка успешно отменена.",
        cancelError: "Ошибка отмены: ",
        fillFieldsError: "Пожалуйста, заполните все поля.",
        loggingIn: "Вход...",
        registering: "Регистрация...",
        profileLoading: "Загрузка...",
        titleProfile: "Профиль",
        titleMinimize: "Свернуть",
        titleMaximize: "Развернуть",
        titleClose: "Закрыть",
        titlePremium: "Перейти на Premium",
        roleSystem: "Система",
        roleYou: "Вы/Интервьюер",
        roleGhost: "Ghost",
        roleError: "Ошибка",
        systemInit: "Результаты скриншотов появятся здесь.",
        historyHeaderUI: "История",
        verifyEmailMessage: "Письмо с подтверждением отправлено. Пожалуйста, проверьте почту.",
        verifyEmailError: "Пожалуйста, подтвердите email перед входом.",
        verifyBannerText: "Ваш email не подтвержден. Функции синхронизации ограничены.",
        btnResendVerification: "Переотправить письмо",
        resendSuccess: "Письмо отправлено!",
        verifyLimitReached: "Лимит исчерпан. Пожалуйста, подтвердите email для продолжения."
    }
};

let currentLang = 'en';

function updateLanguageUI() {
    const t = translations[currentLang];
    if (!t) return;

    const setTxt = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const setInner = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setPlace = (id, text) => { const el = document.getElementById(id); if (el) el.placeholder = text; };
    const setTitle = (id, text) => { const el = document.getElementById(id); if (el) el.title = text; };

    setTxt('authTitle', t.authTitle);
    setTxt('tabLogin', t.tabLogin);
    setTxt('tabRegister', t.tabRegister);
    setPlace('loginEmail', t.loginEmail);
    setPlace('loginPassword', t.loginPassword);
    setTxt('btnLogin', t.btnLogin);
    setPlace('regEmail', t.regEmail);
    setPlace('regPassword', t.regPassword);
    setTxt('btnRegister', t.btnRegister);
    
    setTxt('prefTitle', t.prefTitle);
    setTxt('lblSysPromptAudio', t.lblSysPromptAudio);
    setTxt('lblSysPromptVision', t.lblSysPromptVision);
    setTxt('btnSavePrefs', t.btnSavePrefs);
    setTxt('btnCancelPrefs', t.btnCancelPrefs);
    
    setTxt('paywallTitleUI', t.paywallTitleUI);
    setTxt('paywallDescUI', t.paywallDescUI);
    setTxt('subMonthlyTitleUI', t.subMonthlyTitleUI);
    setTxt('subMonthlyDescUI', t.subMonthlyDescUI);
    setTxt('subYearlyTitleUI', t.subYearlyTitleUI);
    setTxt('subYearlyDescUI', t.subYearlyDescUI);
    setTxt('bestValueUI', t.bestValueUI);
    setTxt('btnCancelPaywall', t.btnCancelPaywall);
    
    setTxt('btnPreferences', t.btnPreferences);
    setInner('btnUpgrade', t.btnUpgrade);
    setInner('btnTopUp', t.btnTopUp);
    setInner('btnCancelSub', t.btnCancelSub);
    setTxt('btnLogout', t.btnLogout);
    
    setTxt('dialogueHeaderUI', t.dialogueHeaderUI);
    setTxt('historyHeaderUI', t.historyHeaderUI);
    setTxt('screenshotsHeaderUI', t.screenshotsHeaderUI);
    setInner('snippetBtn', t.snippetBtn);
    setInner('fullBtn', t.fullBtn);
    setTxt('transparencyLabelUI', t.transparencyLabelUI);
    
    setTxt('verifyBannerText', t.verifyBannerText);
    setTxt('btnResendVerification', t.btnResendVerification);
    setTitle('fontSizeSliderContainer', t.fontSizeTitle);
    setTitle('profileBtn', t.titleProfile);
    setTitle('foldBtn', t.titleMinimize);
    setTitle('maximizeBtn', t.titleMaximize);
    setTitle('closeBtn', t.titleClose);
    setTitle('payBtn', t.titlePremium);
    setTxt('screenshotInitMsg', t.systemInit);
    setTxt('dialogueInitSystem', t.roleSystem + ':');
    setTxt('screenshotInitSystem', t.roleSystem + ':');
    
    if (startBtn.textContent === "Start Listening" || startBtn.textContent === "Начать запись") {
        startBtn.textContent = t.startBtnStart;
    } else if (startBtn.textContent === "Stop" || startBtn.textContent === "Остановить") {
        startBtn.textContent = t.startBtnStop;
    }

    if (profileEmailDisplay && (profileEmailDisplay.textContent === "Loading..." || profileEmailDisplay.textContent === "Загрузка...")) {
        profileEmailDisplay.textContent = t.profileLoading;
    }
    if (profileBalanceDisplay && (profileBalanceDisplay.textContent.startsWith("Balance: Loading") || profileBalanceDisplay.textContent.startsWith("Баланс: Загрузка"))) {
        profileBalanceDisplay.textContent = t.balanceLoading;
    }
    
    if (tokenWarning && !tokenWarning.classList.contains('hidden')) {
        tokenWarning.title = t.tokenWarningTitle;
        if (tokenWarning.innerHTML.includes('Top Up') || tokenWarning.innerHTML.includes('Пополните')) {
            tokenWarning.innerHTML = t.tokenWarningTopUp;
        } else {
            tokenWarning.innerHTML = t.tokenWarningLow;
        }
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

let appConfig = null;

window.api.getConfig().then(config => {
    if (config) {
        appConfig = config;
        
        // Merge paywall translations if present
        if (config.paywall && config.paywall.text) {
            if (config.paywall.text.en) {
                Object.assign(translations.en, config.paywall.text.en);
            }
            if (config.paywall.text.ru) {
                Object.assign(translations.ru, config.paywall.text.ru);
            }
        }
        
        if (config.uiLanguage) {
            currentLang = config.uiLanguage;
            updateUiLangDisplay(currentLang);
        }
        
        // Update price texts if present
        if (config.paywall && config.paywall.prices) {
            const sym = config.paywall.prices.currencySymbol || '';
            const mPrice = config.paywall.prices.monthly || '1900.00';
            const yPrice = config.paywall.prices.yearly || '8000.00';
            const mEl = document.getElementById('subMonthlyPriceUI');
            const yEl = document.getElementById('subYearlyPriceUI');
            // Remove decimal .00 for display if present
            const formatPrice = (p) => p.endsWith('.00') ? p.slice(0, -3) : p;
            if (mEl) mEl.textContent = `${formatPrice(mPrice)} ${sym}`;
            if (yEl) yEl.textContent = `${formatPrice(yPrice)} ${sym}`;
        }
        
        updateLanguageUI();
    }
});

if (langDropdownWrapper) {
    langDropdownWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        if (langDropdown) langDropdown.classList.toggle('hidden');
    });
}

document.querySelectorAll('.lang-option').forEach(opt => {
    opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        currentLang = e.currentTarget.getAttribute('data-value');
        updateUiLangDisplay(currentLang);
        if (langDropdown) langDropdown.classList.add('hidden');
        updateLanguageUI();
        await window.api.saveConfig({ uiLanguage: currentLang });
    });
});

let currentUserEmail = null;
let isEmailVerified = true;

function checkActionLimit(type) {
    if (isEmailVerified) return true;
    const key = `unverified_${type}_count`;
    let count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 1) {
        alert(translations[currentLang].verifyLimitReached);
        return false;
    }
    return true;
}

function incrementActionCount(type) {
    if (isEmailVerified) return;
    const key = `unverified_${type}_count`;
    let count = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, (count + 1).toString());
}

function updateTokenBalanceUI(balance) {
    if (profileBalanceDisplay) {
        profileBalanceDisplay.textContent = `Tokens: ${balance.toLocaleString()}`;
    }
}

// Update Profile UI function to not block access without email verification for testing
async function updateProfileUI() {
    if (currentUserEmail && profileEmailDisplay && profileBalanceDisplay) {
        profileEmailDisplay.textContent = currentUserEmail;
        try {
            const profileInfo = await window.api.getUserProfile();
            console.log("Profile Info:", profileInfo); // DEBUG
            if (profileInfo && profileInfo.tokenBalance !== undefined) {
                profileBalanceDisplay.textContent = `${currentLang === 'ru' ? 'Баланс' : 'Balance'}: ${profileInfo.tokenBalance.toLocaleString()}`;
                
                const btnUpgrade = document.getElementById('btnUpgrade');
                const btnCancelSub = document.getElementById('btnCancelSub');
                
                if (profileInfo.subscription && profileInfo.subscription.tier === 'premium' && profileInfo.subscription.status === 'active') {
                    if (btnUpgrade) btnUpgrade.style.display = 'none';
                    if (btnCancelSub) btnCancelSub.style.display = 'flex';
                } else {
                    if (btnUpgrade) btnUpgrade.style.display = 'flex';
                    if (btnCancelSub) btnCancelSub.style.display = 'none';
                }
                
                const tokenWarning = document.getElementById('tokenWarning');
                if (tokenWarning && !profileInfo.lowBalanceWarning) {
                    tokenWarning.classList.add('hidden');
                    tokenWarning.style.display = 'none';
                } else if (tokenWarning && profileInfo.lowBalanceWarning) {
                    tokenWarning.classList.remove('hidden');
                    tokenWarning.innerHTML = translations[currentLang].tokenWarningLow;
                    tokenWarning.style.display = 'flex';
                }
            } else if (profileInfo && profileInfo.balance !== undefined) {
                // Fallback for old mock data just in case
                profileBalanceDisplay.textContent = `${currentLang === 'ru' ? 'Баланс' : 'Balance'}: $${profileInfo.balance}`;
            } else {
                profileBalanceDisplay.textContent = translations[currentLang].balanceStandard;
            }
        } catch (e) {
            console.error("Profile error:", e);
            profileBalanceDisplay.textContent = translations[currentLang].balanceUnknown;
        }
    }
}

let verificationPollInterval = null;

function updateVerificationBanner(isVerified) {
    if (emailVerificationBanner) {
        if (isVerified) {
            emailVerificationBanner.classList.add('hidden');
            emailVerificationBanner.style.display = 'none';
            if (verificationPollInterval) {
                clearInterval(verificationPollInterval);
                verificationPollInterval = null;
            }
        } else {
            emailVerificationBanner.classList.remove('hidden');
            emailVerificationBanner.style.display = 'flex';
            
            if (!verificationPollInterval) {
                verificationPollInterval = setInterval(async () => {
                    const result = await window.api.checkAuth();
                    if (result.authenticated && result.user.emailVerified) {
                        isEmailVerified = true;
                        updateVerificationBanner(true);
                    }
                }, 5000);
            }
        }
    }
}

if (btnResendVerification) {
    btnResendVerification.addEventListener('click', async () => {
        const originalText = btnResendVerification.textContent;
        btnResendVerification.textContent = "...";
        btnResendVerification.style.pointerEvents = 'none';
        
        const result = await window.api.resendVerification();
        if (result.success) {
            btnResendVerification.textContent = translations[currentLang].resendSuccess;
            setTimeout(() => {
                btnResendVerification.textContent = originalText;
                btnResendVerification.style.pointerEvents = 'auto';
            }, 3000);
        } else {
            btnResendVerification.textContent = originalText;
            btnResendVerification.style.pointerEvents = 'auto';
            alert(result.error);
        }
    });
}

// --- Auth Flow ---
async function checkAuth() {
    const result = await window.api.checkAuth();
    if (result.authenticated) {
        authOverlay.classList.add('hidden');
        currentUserEmail = result.user.email;
        isEmailVerified = result.user.emailVerified;
        updateProfileUI();
        updateVerificationBanner(result.user.emailVerified);
    } else {
        authOverlay.classList.remove('hidden');
    }
}
checkAuth();

// Auth Tabs
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authError.textContent = '';
});

tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authError.textContent = '';
});

// Login
btnLogin.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;
    if(!email || !password) return authError.textContent = translations[currentLang].fillFieldsError;
    
    authError.textContent = translations[currentLang].loggingIn;
    const result = await window.api.login(email, password);
    if (result.success) {
        authOverlay.classList.add('hidden');
        currentUserEmail = result.user.email;
        isEmailVerified = result.user.emailVerified;
        updateProfileUI();
        updateVerificationBanner(result.user.emailVerified);
    } else {
        authError.textContent = result.error;
    }
});

// Register
btnRegister.addEventListener('click', async () => {
    const email = regEmail.value;
    const password = regPassword.value;
    if(!email || !password) return authError.textContent = translations[currentLang].fillFieldsError;
    
    authError.textContent = translations[currentLang].registering;
    const result = await window.api.register(email, password);
    if (result.success) {
        authOverlay.classList.add('hidden');
        currentUserEmail = result.user.email;
        isEmailVerified = result.user.emailVerified;
        updateProfileUI();
        updateVerificationBanner(result.user.emailVerified);
    } else {
        authError.textContent = result.error;
    }
});

// Premium Button
if (payBtn) {
    payBtn.addEventListener('click', () => {
        paywallOverlay.classList.remove('hidden');
    });
}

// Paywall Actions
if (btnCancelPaywall) {
    btnCancelPaywall.addEventListener('click', () => {
        paywallOverlay.classList.add('hidden');
    });
}

if (subMonthly) {
    subMonthly.addEventListener('click', async () => {
        subMonthly.style.opacity = '0.5';
        subMonthly.style.pointerEvents = 'none';
        const priceDiv = subMonthly.lastElementChild;
        const originalText = priceDiv.textContent;
        priceDiv.textContent = translations[currentLang].profileLoading;
        
        const monthlyPrice = (appConfig && appConfig.paywall && appConfig.paywall.prices && appConfig.paywall.prices.monthly) ? appConfig.paywall.prices.monthly : '1900.00';
        const result = await window.api.createPayment('subscription', 'monthly', monthlyPrice);
        
        subMonthly.style.opacity = '1';
        subMonthly.style.pointerEvents = 'auto';
        priceDiv.textContent = originalText;
        
        if (result.error) {
            alert(translations[currentLang].paymentError + result.error);
        } else {
            paywallOverlay.classList.add('hidden');
        }
    });
}

if (subYearly) {
    subYearly.addEventListener('click', async () => {
        subYearly.style.opacity = '0.5';
        subYearly.style.pointerEvents = 'none';
        const priceDiv = subYearly.lastElementChild;
        const originalText = priceDiv.textContent;
        priceDiv.textContent = translations[currentLang].profileLoading;
        
        const yearlyPrice = (appConfig && appConfig.paywall && appConfig.paywall.prices && appConfig.paywall.prices.yearly) ? appConfig.paywall.prices.yearly : '8000.00';
        const result = await window.api.createPayment('subscription', 'yearly', yearlyPrice);
        
        subYearly.style.opacity = '1';
        subYearly.style.pointerEvents = 'auto';
        priceDiv.textContent = originalText;
        
        if (result.error) {
            alert(translations[currentLang].paymentError + result.error);
        } else {
            paywallOverlay.classList.add('hidden');
        }
    });
}


// --- Event Listeners ---
startBtn.addEventListener('click', toggleSession);

// Profile Dropdown Logic
if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
    });
}

document.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.classList.contains('hidden') && !e.target.closest('.profile-wrapper')) {
        profileDropdown.classList.add('hidden');
    }
    if (langDropdown && !langDropdown.classList.contains('hidden') && !e.target.closest('#langDropdownWrapper')) {
        langDropdown.classList.add('hidden');
    }
});

// Preferences Modal
if (btnPreferences) {
    btnPreferences.addEventListener('click', async () => {
        profileDropdown.classList.add('hidden');
        const config = await window.api.getConfig();
        sysPromptAudio.value = config.systemPromptAudio || '';
        sysPromptVision.value = config.systemPromptVision || '';
        preferencesOverlay.classList.remove('hidden');
    });
}

if (btnCancelPrefs) {
    btnCancelPrefs.addEventListener('click', () => {
        preferencesOverlay.classList.add('hidden');
    });
}

if (btnSavePrefs) {
    btnSavePrefs.addEventListener('click', async () => {
        const newConfig = {
            systemPromptAudio: sysPromptAudio.value,
            systemPromptVision: sysPromptVision.value
        };
        await window.api.saveConfig(newConfig);
        preferencesOverlay.classList.add('hidden');
    });
}

// Logout Action
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        profileDropdown.classList.add('hidden');
        await window.api.logout();
        currentUserEmail = null;
        authOverlay.classList.remove('hidden');
    });
}

// Upgrade Action in Dropdown
if (btnUpgrade) {
    btnUpgrade.addEventListener('click', () => {
        profileDropdown.classList.add('hidden');
        paywallOverlay.classList.remove('hidden');
    });
}

// Top Up Action in Dropdown
if (btnTopUp) {
    btnTopUp.addEventListener('click', async () => {
        btnTopUp.innerHTML = '<i data-lucide="loader" class="lucide-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const result = await window.api.createPayment('topup');
        if (result.error) {
            alert(translations[currentLang].paymentError + result.error);
        }
        btnTopUp.innerHTML = translations[currentLang].btnTopUp;
    });
}

// Cancel Subscription Action in Dropdown
if (btnCancelSub) {
    btnCancelSub.addEventListener('click', async () => {
        if (!confirm(translations[currentLang].cancelConfirm)) return;
        btnCancelSub.innerHTML = '<i data-lucide="loader" class="lucide-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const result = await window.api.cancelSubscription();
        if (result.error) {
            alert(translations[currentLang].cancelError + result.error);
        } else {
            alert(translations[currentLang].cancelSuccess);
            await updateProfileUI(); // Refresh UI to hide the cancel button
        }
        btnCancelSub.innerHTML = translations[currentLang].btnCancelSub;
    });
}

if (snippetBtn) {
    snippetBtn.addEventListener('click', () => {
        if (!checkActionLimit('screenshot')) return;
        const lang = languageInput.value || 'Python';
        window.api.startSelection(lang);
    });
}

if (fullBtn) {
    fullBtn.addEventListener('click', () => {
        if (!checkActionLimit('screenshot')) return;
        const lang = languageInput.value || 'Python';
        window.api.takeScreenshotFull(lang);
    });
}

// Opacity Slider
if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        window.api.setOpacity(e.target.value);
    });
}

// Font Size Slider
if (fontSizeSlider) {
    fontSizeSlider.addEventListener('input', (e) => {
        const size = e.target.value;
        // Update the CSS variable on the root element
        document.documentElement.style.setProperty('--base-font-size', `${size}px`);
    });
}

// Window Controls
if (foldBtn) {
    foldBtn.addEventListener('click', () => {
        window.api.minimizeWindow();
    });
}

if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
        window.api.maximizeWindow();
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        window.api.closeWindow();
    });
}

// Listen for Image Results
window.api.onImageResult((result) => {
    if (result && typeof result === 'object') {
        if (result.error) {
            addMessage(screenshotContent, translations[currentLang].roleError, result.error, "error");
            if (result.code === 403) {
                if (result.error && result.error.toLowerCase().includes('subscription')) {
                    if (paywallOverlay) paywallOverlay.classList.remove('hidden');
                } else if (tokenWarning) {
                    tokenWarning.classList.remove('hidden');
                    tokenWarning.style.display = 'flex';
                    tokenWarning.innerHTML = translations[currentLang].tokenWarningTopUp;
                    tokenWarning.onclick = async () => { 
                        const originalHtml = tokenWarning.innerHTML;
                        tokenWarning.innerHTML = '<i data-lucide="loader" class="lucide-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i> ' + translations[currentLang].profileLoading;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                        tokenWarning.style.pointerEvents = 'none';
                        await window.api.createPayment('topup'); 
                        tokenWarning.innerHTML = originalHtml;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                        tokenWarning.style.pointerEvents = 'auto';
                    };
                }
            }
            return;
        }

        if (result.tokenBalance !== undefined) updateTokenBalanceUI(result.tokenBalance);
        if (result.lowBalanceWarning) {
            if (tokenWarning) tokenWarning.classList.remove('hidden');
        } else {
            if (tokenWarning) {
            tokenWarning.classList.add('hidden');
            tokenWarning.style.display = 'none';
        }
        }

        const adviceText = result.advice || result;
        const adviceStr = typeof adviceText === 'string' ? adviceText : JSON.stringify(adviceText);
        const isIgnored = !adviceStr || adviceStr.trim() === "" || adviceStr.trim() === "-" || adviceStr.trim().toLowerCase() === "ignore" || adviceStr.trim().toLowerCase() === "null";
        
        if (!isIgnored) {
            incrementActionCount('screenshot');
        }
        addMessage(screenshotContent, translations[currentLang].roleGhost + " (Vision)", result.advice || result, "advice");
    } else {
        const adviceStr = typeof result === 'string' ? result : JSON.stringify(result);
        const isIgnored = !adviceStr || adviceStr.trim() === "" || adviceStr.trim() === "-" || adviceStr.trim().toLowerCase() === "ignore" || adviceStr.trim().toLowerCase() === "null";
        
        if (!isIgnored) {
            incrementActionCount('screenshot');
        }
        addMessage(screenshotContent, translations[currentLang].roleGhost + " (Vision)", result, "advice");
    }
});

window.api.onProcessingStart(() => {
    // Processing start logic
});

window.api.onProcessingEnd(() => {
    // Processing end logic
});

async function toggleSession() {
  if (!isSessionActive) {
    await startSession();
  } else {
    stopSession();
  }
}

async function startSession() {
  try {
    // 1. Get Microphone Stream (once for the session)
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 2. Setup VAD (Voice Activity Detection)
    setupVAD(stream);

    // 3. Initialize Recorder State
    isSessionActive = true;
    updateUI(true);

    // 4. Start the first recording segment
    startSegment();

  } catch (err) {
    console.error("Error accessing microphone:", err);
    addMessage(dialogueContent, translations[currentLang].roleError, translations[currentLang].systemMicrophoneError, "error");
  }
}

function stopSession() {
  isSessionActive = false;
  
  // Stop recording if active
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // Stop VAD
  if (vadInterval) cancelAnimationFrame(vadInterval);
  
  // Stop Stream Tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  // Close Audio Context (to save resources)
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }

  updateUI(false);
}

function startSegment() {
  if (!isSessionActive || !stream) return;

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    // Capture the current chunks before they are reset
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const framesCount = speechFrames; // Capture the speech frames for this segment

    // Immediately restart recording if session is still active
    if (isSessionActive) {
        startSegment();
    }
    
    // Process the captured audio (background)
    processAudioChunk(blob, framesCount);
  };

  mediaRecorder.start();
  // Reset VAD state for this segment
  isSpeaking = false;
  silenceStart = Date.now();
  speechFrames = 0;
  monitorAudio(); // Start VAD loop
}

async function processAudioChunk(audioBlob, framesCount) {
  // Filter out tiny/empty recordings (e.g. background noise < 1s)
  if (audioBlob.size < 3000) return; 

  // If there wasn't enough sustained speech (e.g., just a quick keyboard clack)
  // requestAnimationFrame runs at ~60fps, so 15 frames is ~250ms of active noise
  if (framesCount < 15) {
      console.log("Filtered out audio chunk: not enough speech frames", framesCount);
      return;
  }

  if (!checkActionLimit('audio')) {
      stopSession();
      return;
  }

  const arrayBuffer = await audioBlob.arrayBuffer();
  
  const analyzingMsg = addMessage(dialogueContent, translations[currentLang].roleSystem, translations[currentLang].systemAnalyzing, "system");
  
  const modelType = modelSelect.value;
  const result = await window.api.processAudio(arrayBuffer, modelType);
  
  if (analyzingMsg) analyzingMsg.remove();

  if (result.error) {
     addMessage(dialogueContent, translations[currentLang].roleError, result.error, "error");
     if (result.code === 403) {
        if (result.error && result.error.toLowerCase().includes('subscription')) {
            if (paywallOverlay) paywallOverlay.classList.remove('hidden');
        } else if (tokenWarning) {
            tokenWarning.classList.remove('hidden');
            tokenWarning.style.display = 'flex';
            tokenWarning.innerHTML = `<i data-lucide="coins" style="width: 14px; height: 14px; margin-right: 4px;"></i> Top Up Required`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            tokenWarning.onclick = async () => { 
                const originalHtml = tokenWarning.innerHTML;
                tokenWarning.innerHTML = '<i data-lucide="loader" class="lucide-spin" style="width: 14px; height: 14px; margin-right: 6px;"></i> Loading...';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                tokenWarning.style.pointerEvents = 'none';
                await window.api.createPayment('topup'); 
                tokenWarning.innerHTML = originalHtml;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                tokenWarning.style.pointerEvents = 'auto';
            };
        }
     }
  } else {
    if (result.tokenBalance !== undefined) updateTokenBalanceUI(result.tokenBalance);
    if (result.lowBalanceWarning) {
        if (tokenWarning) {
            tokenWarning.classList.remove('hidden');
            tokenWarning.style.display = 'flex';
            tokenWarning.innerHTML = translations[currentLang].tokenWarningLow;
            tokenWarning.onclick = null;
        }
    } else {
        if (tokenWarning) {
            tokenWarning.classList.add('hidden');
            tokenWarning.style.display = 'none';
        }
    }

    if (result.transcription && result.transcription.trim().length > 1) {
        const adviceText = result.advice ? result.advice.trim() : "";
        const isIgnored = adviceText === "" || adviceText === "-" || adviceText.toLowerCase() === "ignore" || adviceText.toLowerCase() === "null";

        if (!isIgnored) {
            incrementActionCount('audio');
            addMessage(dialogueContent, translations[currentLang].roleYou, result.transcription, "transcript");
            addMessage(dialogueContent, translations[currentLang].roleGhost, adviceText, "advice");
        }
    }
  }
}

// --- VAD Logic ---
function setupVAD(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512; // Smaller FFT is faster
  source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
}

function monitorAudio() {
  if (!isSessionActive || (mediaRecorder && mediaRecorder.state === 'inactive')) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);

  // Calculate Volume (RMS)
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const x = (dataArray[i] - 128) / 128.0;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / dataArray.length);

  // VAD Thresholds
  const SPEAK_THRESHOLD = 0.02; 
  const SILENCE_THRESHOLD = 0.01; 
  const SILENCE_DURATION = 1500; // 1.5 seconds silence to stop

  if (rms > SPEAK_THRESHOLD) {
    isSpeaking = true;
    silenceStart = Date.now(); // Reset silence timer
    speechFrames++;
  }

  // Logic: If we HAVE spoken, and now it's been silent for X seconds -> STOP
  if (isSpeaking && (Date.now() - silenceStart > SILENCE_DURATION)) {
    // Trigger stop
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        return; // Loop ends here, restarted in onstop
    }
  }

  vadInterval = requestAnimationFrame(monitorAudio);
}

// --- UI Helpers ---
function updateUI(active) {
  if (active) {
    startBtn.textContent = translations[currentLang].startBtnStop;
    startBtn.classList.add('recording');
  } else {
    startBtn.textContent = translations[currentLang].startBtnStart;
    startBtn.classList.remove('recording');
  }
}

/**
 * Internal function to actually append the message element to the DOM
 */
function addMessageToDOM(container, sender, text, type) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;
  
  let formattedText = text;
  if (typeof marked !== 'undefined') {
    formattedText = marked.parse(text, { breaks: true });
  } else {
    // Fallback if marked fails to load
    formattedText = text.replace(/\n/g, '<br>');
    formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  }
  
  msgDiv.innerHTML = `<strong>${sender}:</strong> <div class="markdown-body">${formattedText}</div>`;
  
  container.appendChild(msgDiv);
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
  
  return msgDiv;
}

/**
 * Adds a message to a specific container (Dialogue or Screenshot) and saves to current session
 */
function addMessage(container, sender, text, type) {
  const msgDiv = addMessageToDOM(container, sender, text, type);
  
  const target = container === screenshotContent ? 'screenshot' : 'dialogue';
  const session = sessions.find(s => s.id === currentSessionId);
  
  if (session && type !== 'system' && type !== 'error') {
      session.messages.push({ sender, text, type, target });
      
      if (session.messages.length === 1 || session.title === 'New Session') {
          session.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      }
      saveSessions();
      renderSessionList();
  }
  
  return msgDiv;
}

// Initialize on load
initSessions();

// Initialize on load
initSessions();

// Custom Google Analytics 4 (Firebase Analytics) Integration using Measurement Protocol
// This bypasses the limitations of Electron's file:// or app:// protocols and ensures 100% delivery
class SimpleAnalytics {
    constructor() {
        this.measurementId = null;
        this.apiSecret = null;
        this.clientId = this.getOrCreateClientId();
        this.sessionId = Date.now().toString();
    }

    getOrCreateClientId() {
        let cid = localStorage.getItem('ga_client_id');
        if (!cid) {
            // Generate a random UUID-like string
            cid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
            localStorage.setItem('ga_client_id', cid);
        }
        return cid;
    }

    init(measurementId) {
        this.measurementId = measurementId;
        // In order to send events via POST, GA4 requires an API Secret which you create in the Google Analytics UI.
        // However, for standard web tracking we can use the web/collection endpoint without a secret.
        console.log("Simple Analytics initialized with Measurement ID:", this.measurementId);
        
        // Track app open automatically
        this.logEvent('app_open', { page_title: 'Main Window' });
    }

    logEvent(eventName, params = {}) {
        if (!this.measurementId) return;

        // Merge default params
        const finalParams = {
            session_id: this.sessionId,
            engagement_time_msec: 1000,
            ...params
        };

        const payload = {
            client_id: this.clientId,
            events: [{
                name: eventName,
                params: finalParams
            }]
        };

        // We use fetch with 'no-cors' mode if needed, but standard POST to the collect endpoint works best
        const url = `https://www.google-analytics.com/mp/collect?measurement_id=${this.measurementId}&api_secret=bZ_jGqQ3Sg-gW32T2M8t3w`; // We will use a dedicated API secret
        
        // Let's use the standard browser endpoint which doesn't require an API secret
        const webUrl = `https://www.google-analytics.com/g/collect?v=2&tid=${this.measurementId}&cid=${this.clientId}&en=1&sid=${this.sessionId}&sct=1&seg=1&ed=1&en=${encodeURIComponent(eventName)}&ep.page_title=${encodeURIComponent(params.page_title || 'App')}`;

        fetch(webUrl, {
            method: 'POST',
            mode: 'no-cors' // This prevents CORS errors in the console
        }).then(() => {
            console.log(`[Analytics] Event sent: ${eventName}`);
        }).catch(err => {
            console.error(`[Analytics] Failed to send event:`, err);
        });
    }
}

const analytics = new SimpleAnalytics();

window.api.getFirebaseConfig().then(config => {
    if (config && config.measurementId) {
        analytics.init(config.measurementId);
        
        // Intercept some app events to send to analytics
        if (startBtn) {
            const originalClick = startBtn.onclick;
            startBtn.addEventListener('click', () => {
                const isStarting = startBtn.textContent === translations[currentLang].startBtnStart;
                analytics.logEvent('button_click', { button_id: 'start_listening', action: isStarting ? 'start' : 'stop' });
            });
        }
        
        if (fullBtn) {
            fullBtn.addEventListener('click', () => {
                analytics.logEvent('screenshot_taken', { type: 'full' });
            });
        }
        
        if (snippetBtn) {
            snippetBtn.addEventListener('click', () => {
                analytics.logEvent('screenshot_taken', { type: 'snippet' });
            });
        }
    } else {
        console.log("Analytics missing measurementId");
    }
});

// --- Custom Language Dropdown Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('langSelectorTrigger');
    const menu = document.getElementById('langSelectorMenu');
    const searchInput = document.getElementById('langSearchInput');
    const list = document.getElementById('langSelectorList');
    const hiddenInput = document.getElementById('languageInput');
    const textSpan = document.getElementById('langSelectorText');

    if (!trigger) return;

    const languages = [
        "Python", "C++", "Java", "JavaScript", "TypeScript", "Go", "Rust", "SQL", 
        "C#", "Ruby", "PHP", "Swift", "Kotlin", "Dart", "HTML", "CSS", "Bash", 
        "PowerShell", "Lua", "R", "Scala", "Perl", "Haskell", "Objective-C",
        "Assembly", "Matlab", "Groovy", "C", "Solidity", "Lisp", "Fortran", "Elixir", "Erlang"
    ];

    function populateList(filter = '') {
        list.innerHTML = '';
        const filtered = languages.filter(l => l.toLowerCase().includes(filter.toLowerCase()));
        
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom-dropdown-item';
            empty.textContent = 'No results found';
            empty.style.pointerEvents = 'none';
            empty.style.color = 'var(--text-tertiary)';
            list.appendChild(empty);
            return;
        }

        filtered.forEach(lang => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            if (lang === hiddenInput.value) {
                item.classList.add('selected');
            }
            item.textContent = lang;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectLanguage(lang);
            });
            list.appendChild(item);
        });
    }

    function selectLanguage(lang) {
        hiddenInput.value = lang;
        textSpan.textContent = lang;
        menu.classList.add('hidden');
        populateList(); // Refresh selected state
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
            searchInput.value = '';
            populateList();
            searchInput.focus();
        } else {
            menu.classList.add('hidden');
        }
    });

    searchInput.addEventListener('input', (e) => {
        populateList(e.target.value);
    });

    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    // Initial population
    populateList();
});


