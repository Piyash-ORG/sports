document.addEventListener('DOMContentLoaded', () => {
    const matchListContainer = document.getElementById('match-list');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const tabs = document.querySelectorAll('.tab-button');
    let allMatches = [];
    let timerInterval = null;

    async function loadMatches() {
        try {
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            const response = await fetch('/111.m3u');
            if (!response.ok) throw new Error('Failed to load playlist');
            const data = await response.text();
            allMatches = parseM3U(data);
            filterAndRender('all');

            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateAllMatchTimers, 1000);

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
                const { isLive, statusText } = getMatchTimeAndStatus(match.matchTime);
                if (status === 'live') return isLive;
                if (status === 'upcoming') return !isLive && statusText !== "Finished";
                return false;
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
                    const name = getAttr(`link-name${i}`);
                    const url = getAttr(`link${i}`);
                    if (name && url) {
                        links.push({ name, url });
                    }
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
        if (matches.length === 0) {
            matchListContainer.innerHTML = '<p class="no-matches-text">No matches found for this filter.</p>';
            return;
        }

        matches.sort((a, b) => {
             const statusA = getMatchTimeAndStatus(a.matchTime);
             const statusB = getMatchTimeAndStatus(b.matchTime);
             if (statusA.isLive && !statusB.isLive) return -1;
             if (!statusA.isLive && statusB.isLive) return 1;
             return new Date(a.matchTime) - new Date(b.matchTime);
        });

        matches.forEach(match => {
            const card = document.createElement('a');
            card.className = 'match-card';
            card.href = `/${match.categorySlug}/${match.matchSlug}`;
            card.setAttribute('data-match-time', match.matchTime);
            
            const matchDate = new Date(match.matchTime);
            const displayTime = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const displayDate = matchDate.toLocaleDateString('en-GB');

            card.innerHTML = `
                <div class="card-header">
                    <img src="${match.sportIcon}" alt="${match.sportName}" onerror="this.style.display='none'">
                    <span>${match.sportName} | ${match.leagueName}</span>
                </div>
                <div class="card-body">
                    <div class="team">
                        <img src="${match.team1Logo}" alt="${match.team1Name}" onerror="this.src='https://via.placeholder.com/60'">
                        <span class="team-name">${match.team1Name}</span>
                    </div>
                    <div class="match-details">
                        <div class="match-time">${displayTime}</div>
                        <div class="match-date">${displayDate}</div>
                        <div class="status-display">
                           </div>
                    </div>
                    <div class="team">
                        <img src="${match.team2Logo}" alt="${match.team2Name}" onerror="this.src='https://via.placeholder.com/60'">
                        <span class="team-name">${match.team2Name}</span>
                    </div>
                </div>
            `;
            matchListContainer.appendChild(card);
        });
        updateAllMatchTimers();
    }

    function updateAllMatchTimers() {
        const matchCards = document.querySelectorAll('[data-match-time]');
        matchCards.forEach(card => {
            const timeString = card.dataset.matchTime;
            const statusContainer = card.querySelector('.status-display');
            if (timeString && statusContainer) {
                const { statusHtml } = formatMatchTime(timeString);
                statusContainer.innerHTML = statusHtml;
            }
        });
    }

    function formatMatchTime(isoString) {
        if (!isoString) return { statusHtml: '<span>TBC</span>' };
        
        const matchDate = new Date(isoString);
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        
        let statusHtml = '';

        if (diffInSeconds > 0) { // Upcoming
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            statusHtml = `<div class="match-status-text">Starts in ${hours}h ${minutes}m</div>`;
        } else if (diffInSeconds > -10800) { // Live
            statusHtml = `<div class="match-status-text live">Live</div>`;
        } else { // Finished
            statusHtml = `<div class="match-status-text finished">Finished</div>`;
        }
        
        return { statusHtml };
    }

    function getMatchTimeAndStatus(isoString) {
        if (!isoString) return { isLive: false, statusText: 'Finished' };
        const matchDate = new Date(isoString);
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        const isLive = diffInSeconds <= 0 && diffInSeconds > -10800;
        let statusText = "Upcoming";
        if (isLive) {
            statusText = "Live";
        } else if (diffInSeconds < -10800) {
            statusText = "Finished";
        }
        return { isLive: isLive, statusText: statusText };
    }
});
