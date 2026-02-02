let userSettings = {
    "Strictly Necessary Cookies": true,
    "Performance Cookies": true,
    "Functionality Cookies": true,
    "Targeting or Advertising Cookies": true,
    "enableNotify": true,  
    "autoFilter": true     
};

const cache = {};
const notifiedDomains = new Set();

// โหลด Settings ตอนเริ่ม
chrome.storage.local.get(['settings'], (res) => {
    if (res.settings) userSettings = res.settings;
});

// ฟัง Event แก้ไข Settings
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "UPDATE_SETTINGS") {
        userSettings = msg.settings;
        console.log("Settings Updated:", userSettings);
    }
});

// --- ฟัง Event Cookie เปลี่ยนแปลง ---
chrome.cookies.onChanged.addListener(async (changeInfo) => {
    if (changeInfo.removed) return;

    const cookie = changeInfo.cookie;
    const key = `${cookie.name}|${cookie.domain}`;

    if (userSettings.autoFilter === false) return;

    // Source Site
    let currentSite = "Unknown_Source";
    try {
        // ดึง Tab ที่ Active อยู่ในหน้าต่างปัจจุบัน
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs && tabs.length > 0 && tabs[0].url) {
            currentSite = new URL(tabs[0].url).hostname;
        }
    } catch (e) {
        console.warn("Could not get current tab URL:", e);
    }

    // 2. ถ้ามีใน Cache แล้ว (จัดการลบได้เลย แต่ยังส่งไปวาดกราฟ)
    if (cache[key]) {
        const label = cache[key];
        processCookie(cookie, label);
        checkAndNotify(cookie.domain, label);
        
        // ส่งข้อมูลไปวาดกราฟ (Fire and Forget) เพื่อให้กราฟ Real-time
        fetch("http://localhost:5000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: cookie.name, 
                domain: cookie.domain,
                source_site: currentSite // <--- ส่งชื่อเว็บไปด้วย
            })
        }).catch(() => {}); // ไม่ต้องรอผล

        return;
    }

    // 3. ถ้าเป็นคุกกี้ใหม่ -> ส่งให้ AI ทำนาย
    try {
        const response = await fetch("http://127.0.0.1:5000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: cookie.name, 
                domain: cookie.domain,
                source_site: currentSite // <--- ส่งชื่อเว็บไปด้วย
            })
        });
        
        const data = await response.json();
        const label = data.label;

        console.log(`[AI] ${currentSite} -> ${cookie.domain} = ${label}`);

        cache[key] = label;
        processCookie(cookie, label);
        checkAndNotify(cookie.domain, label);

    } catch (err) {
        console.error("[ERROR] API Connection Failed:", err);
    }
});

// --- ฟังก์ชันลบ Cookie ---
function processCookie(cookie, label) {
    if (label === "Strictly Necessary Cookies") return;

    if (userSettings[label] === false) {
        console.log(`[BLOCK] ${label}: ${cookie.name}`);
        const protocol = cookie.secure ? "https:" : "http:";
        const domainUrl = protocol + "//" + cookie.domain.replace(/^\./, "") + cookie.path;

        chrome.cookies.remove({
            url: domainUrl,
            name: cookie.name,
            storeId: cookie.storeId
        });
    }
}

// --- ฟังก์ชันแจ้งเตือน ---
function checkAndNotify(domain, label) {
    if (userSettings.enableNotify !== true) return;

    if (label === "Targeting or Advertising Cookies") {
        if (!notifiedDomains.has(domain)) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon_Home.png", 
                title: "Tracking Cookie Detected!",
                message: `${domain} detected on this site.`,
                priority: 2
            });

            notifiedDomains.add(domain);
            setTimeout(() => notifiedDomains.delete(domain), 300000); // 5 นาที
        }
    }
}