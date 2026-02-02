document.addEventListener('DOMContentLoaded', () => {
    
    // --- NAVIGATION LOGIC ---
    const pages = {
        home: document.getElementById('homePage'),
        history: document.getElementById('historyPage'),
        setting: document.getElementById('settingPage')
    };
    const headerTitle = document.getElementById('headerTitle');
    const backBtn = document.getElementById('backBtn');

    function showPage(pageName, title) {
        Object.values(pages).forEach(p => p.classList.remove('active'));
        pages[pageName].classList.add('active');
        headerTitle.innerText = title;
        backBtn.style.display = pageName === 'home' ? 'none' : 'block';
    }

    document.getElementById('goHistory').addEventListener('click', () => {
        showPage('history', 'History');
        loadHistory();
    });

    document.getElementById('goSetting').addEventListener('click', () => showPage('setting', 'Settings'));
    backBtn.addEventListener('click', () => showPage('home', 'CookiesChecker'));

    // กลับมาเป็นแบบเปิดหน้ากราฟปกติ (ไม่ต้องส่ง ?site=...)
    const btnGraph = document.getElementById('btnOpenGraph');
    if (btnGraph) {
        btnGraph.addEventListener('click', () => {
            chrome.tabs.create({ url: 'graph.html' });
        });
    }

    // --- SETTING TABS LOGIC ---
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const saveBtn = document.getElementById('saveSetting'); 

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            navTabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
            if (targetId === 'tabAbout') {
                saveBtn.style.display = 'none';
            } else {
                saveBtn.style.display = 'block';
            }
        });
    });

    // --- HOME LOGIC ---
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if(tabs[0]) {
            try {
                const url = new URL(tabs[0].url);
                document.getElementById('currentDomain').innerText = url.hostname;
            } catch (e) {
                document.getElementById('currentDomain').innerText = "Unknown";
            }
        }
    });

    // --- HISTORY LOGIC ---
    async function loadHistory() {
        const listDiv = document.getElementById('historyList');
        listDiv.innerHTML = '<p style="text-align:center; color:#aaa;">Loading...</p>';
        try {
            // ใช้ 127.0.0.1
            const res = await fetch('http://127.0.0.1:5000/history');
            const data = await res.json();
            listDiv.innerHTML = '';
            if(data.length === 0) {
                listDiv.innerHTML = '<p style="text-align:center;">No history yet.</p>';
                return;
            }
            data.forEach(item => {
                let labels = item.labels.replace("Targeting or Advertising Cookies", "Ads/Tracking")
                                        .replace("Performance Cookies", "Performance")
                                        .replace("Functionality Cookies", "Functionality");
                const html = `
                    <div class="card">
                        <div class="card-title">${item.domain}</div>
                        <div style="font-size:11px; color:#E91E63; margin-top:2px;">${labels}</div>
                    </div>`;
                listDiv.innerHTML += html;
            });
        } catch (err) {
            listDiv.innerHTML = '<p style="text-align:center; color:red;">Cannot connect to Server</p>';
        }
    }

    // --- SETTINGS LOGIC ---
    const settingsKeys = ["Performance Cookies", "Functionality Cookies", "Targeting or Advertising Cookies", "enableNotify", "autoFilter"];
    chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || {};
        settingsKeys.forEach(key => {
            const el = document.getElementById(key);
            if (el) el.checked = settings[key] !== false; 
        });
    });

    document.getElementById('saveSetting').addEventListener('click', () => {
        const settings = {};
        settingsKeys.forEach(key => {
            const el = document.getElementById(key);
            if(el) settings[key] = el.checked;
        });
        settings["Strictly Necessary Cookies"] = true; 
        chrome.storage.local.set({ settings }, () => {
            const btn = document.getElementById('saveSetting');
            const oldText = btn.innerText;
            btn.innerText = "Saved!";
            btn.style.background = "#28a745";
            setTimeout(() => {
                btn.innerText = oldText;
                btn.style.background = "#4CAF50";
            }, 1500);
            chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings });
        });
    });
});