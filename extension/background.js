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

chrome.storage.local.get(['settings'], (res) => {
    if (res.settings) userSettings = res.settings;
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "UPDATE_SETTINGS") {
        userSettings = msg.settings;
    }
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
    if (changeInfo.removed) return;

    const cookie = changeInfo.cookie;
    const key = `${cookie.name}|${cookie.domain}`;

    if (userSettings.autoFilter === false) return;

    let currentSite = "Unknown_Source";
    try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs && tabs.length > 0 && tabs[0].url && tabs[0].url.startsWith('http')) {
            currentSite = new URL(tabs[0].url).hostname;
        }
    } catch (e) {
        console.warn("Could not get current tab URL:", e);
    }

    const API_URL = "http://127.0.0.1:5000/predict";

    if (cache[key]) {
        const label = cache[key];
        processCookie(cookie, label);
        checkAndNotify(cookie.domain, label);
        
        fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: cookie.name, 
                domain: cookie.domain,
                source_site: currentSite 
            })
        }).catch(() => {}); 
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: cookie.name, 
                domain: cookie.domain,
                source_site: currentSite 
            })
        });
        
        const data = await response.json();
        const label = data.label;

        cache[key] = label;
        processCookie(cookie, label);
        checkAndNotify(cookie.domain, label);

    } catch (err) {
        console.error("[ERROR] API Connection Failed:", err);
    }
});

function processCookie(cookie, label) {
    if (label === "Strictly Necessary Cookies") return;

    if (userSettings[label] === false) {
        const protocol = cookie.secure ? "https:" : "http:";
        const domainUrl = protocol + "//" + cookie.domain.replace(/^\./, "") + cookie.path;

        chrome.cookies.remove({
            url: domainUrl,
            name: cookie.name,
            storeId: cookie.storeId
        });
    }
}

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
            setTimeout(() => notifiedDomains.delete(domain), 300000);
        }
    }
}