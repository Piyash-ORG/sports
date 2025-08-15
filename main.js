document.addEventListener('DOMContentLoaded', () => {
    const matchListContainer = document.getElementById('match-list');
    const tabs = document.querySelectorAll('.tab-button');
    let allMatches = [];

    fetch('playlist.m3u')
        .then(response => response.text())
        .then(data => {
            allMatches = parseM3U(data);
            filterAndRender('all'); // Initially show all matches
        });

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
                if (status === 'live') return isLive;
                if (status === 'upcoming') return !isLive;
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
                    <img src="${match.sportIcon}" alt="${match.sportName}">
                    <span>${match.sportName} | ${match.leagueName}</span>
                </div>
                <div class="card-body">
                    <div class="team">
                        <img src="${match.team1Logo}" alt="${match.team1Name}">
                        <span class="team-name">${match.team1Name}</span>
                    </div>
                    <div class="match-details">
                        <div class="match-time">${time}</div>
                        <div class="match-date">${date}</div>
                        <div class="match-status-text ${isLive ? 'live' : ''}">${statusText}</div>
                    </div>
                    <div class="team">
                        <img src="${match.team2Logo}" alt="${match.team2Name}">
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
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        
        const time = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const date = matchDate.toLocaleDateString('en-GB');

        let statusText = "Upcoming";
        let isLive = false;

        if (diffInSeconds <= 0 && diffInSeconds > -10800) { // Live if started in the last 3 hours
            statusText = "Live";
            isLive = true;
        } else if (diffInSeconds > 0) {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            if (hours > 0) statusText = `Starts in ${hours}h ${minutes}m`;
            else statusText = `Starts in ${minutes}m`;
        } else {
            statusText = "Finished";
        }

        return { time, date, statusText, isLive };
    }
});