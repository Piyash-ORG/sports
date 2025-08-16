document.addEventListener('DOMContentLoaded', () => {
    const matchListContainer = document.getElementById('match-list');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const tabs = document.querySelectorAll('.tab-button');
    let allMatches = [];

    async function loadMatches() {
        try {
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            const response = await fetch('/playlist.m3u');
            if (!response.ok) throw new Error('Failed to load playlist');
            const data = await response.text();
            allMatches = parseM3U(data);
            filterAndRender('all');
        } catch (err) {
            errorEl.textContent = 'Error loading events: ' + err.message;
            errorEl.style.display = 'block';
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    loadMatches();

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const status = tab.getAttribute('data-status');
            filterAndRender(status);
        });
    });

    function filterAndRender(status) {
        let filteredMatches = allMatches;
        if (status !== 'all') {
            filteredMatches = allMatches.filter(match => {
                const { isLive } = getMatchTimeAndStatus(match.matchTime);
                return status === 'live' ? isLive : !isLive;
            });
        }
        renderMatchList(filteredMatches);
    }

    function parseM3U(data) {
        const lines = data.trim().split('\n');
        const playlist = [];
        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                const getAttr = (attr) => {
                    const match = line.match(new RegExp(`${attr}="([^"]*)"`));
                    return match ? match[1] : null;
                };
                const links = [];
                for (let i = 1; i <= 10; i++) {
                    const url = getAttr(`link${i}`);
                    const name = getAttr(`link-name${i}`) || `Server ${i}`;
                    if (url) links.push({ url, name });
                }
                playlist.push({
                    categorySlug: getAttr('category-slug'),
                    matchSlug: getAttr('match-slug'),
                    sportIcon: getAttr('sport-icon'),
                    sportName: getAttr('sport-name'),
                    leagueName: getAttr('league-name'),
                    team1Logo: getAttr('team1-logo'),
                    team1Name: getAttr('team1-name'),
                    team2Logo: getAttr('team2-logo'),
                    team2Name: getAttr('team2-name'),
                    matchTime: getAttr('match-time'),
                    links: links,
                });
            }
        }
        return playlist;
    }

    function renderMatchList(matches) {
        matchListContainer.innerHTML = '';
        matches.forEach(match => {
            const { time, date, statusText, isLive } = getMatchTimeAndStatus(match.matchTime);
            const card = document.createElement('a');
            card.className = 'match-card';
            card.href = `/${match.categorySlug}/${match.matchSlug}`;
            card.innerHTML = `
                <div class="card-header">
                    <img src="${match.sportIcon || 'default-icon.png'}" alt="${match.sportName}" onerror="this.src='default-icon.png'">
                    <span>${match.sportName} | ${match.leagueName}</span>
                </div>
                <div class="card-body">
                    <div class="team">
                        <img src="${match.team1Logo || 'default-logo.png'}" alt="${match.team1Name}" onerror="this.src='default-logo.png'">
                        <span class="team-name">${match.team1Name}</span>
                    </div>
                    <div class="match-details">
                        <div class="match-time">${time}</div>
                        <div class="match-date">${date}</div>
                        <div class="match-status-text ${isLive ? 'live' : ''}">${statusText}</div>
                    </div>
                    <div class="team">
                        <img src="${match.team2Logo || 'default-logo.png'}" alt="${match.team2Name}" onerror="this.src='default-logo.png'">
                        <span class="team-name">${match.team2Name}</span>
                    </div>
                </div>
            `;
            matchListContainer.appendChild(card);
        });
    }

    function getMatchTimeAndStatus(isoString) {
        if (!isoString) return { time: 'N/A', date: '', statusText: 'Time TBC', isLive: false };
        const matchDate = new Date(isoString);
        const now = new Date(); // Current time: 2025-08-16T00:18:00Z (6:18 AM +06:00)
        const diffInSeconds = (matchDate - now) / 1000;
        const time = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const date = matchDate.toLocaleDateString('en-GB');
        let statusText = "Upcoming";
        let isLive = false;
        if (diffInSeconds <= 0 && diffInSeconds > -10800) { // Live within 3 hours
            statusText = "Live";
            isLive = true;
        } else if (diffInSeconds > 0) {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            statusText = hours > 0 ? `Starts in ${hours}h ${minutes}m` : `Starts in ${minutes}m`;
        } else {
            statusText = "Finished";
        }
        return { time, date, statusText, isLive };
    }
});
