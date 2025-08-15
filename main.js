document.addEventListener('DOMContentLoaded', () => {
    const matchListContainer = document.getElementById('match-list');
    const tabs = document.querySelectorAll('.tab-button');
    let allMatches = []; // Store all matches to avoid re-fetching

    // Fetch and process playlist
    fetch('playlist.m3u')
        .then(response => response.text())
        .then(data => {
            allMatches = parseM3U(data);
            renderMatchList(allMatches); // Initially render all matches
        });

    // Add event listeners to tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const status = tab.getAttribute('data-status');
            filterAndRender(status);
        });
    });

    function filterAndRender(status) {
        if (status === 'all') {
            renderMatchList(allMatches);
            return;
        }
        const filteredMatches = allMatches.filter(match => match.status === status);
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

                const item = {
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
                    status: getAttr('match-status'),
                    // Add link parsing if needed for the next page
                };
                playlist.push(item);
            }
        }
        return playlist;
    }

    function renderMatchList(matches) {
        matchListContainer.innerHTML = ''; // Clear previous list
        matches.forEach(match => {
            const { time, date, statusText } = getMatchTimeAndStatus(match.matchTime);
            
            const card = document.createElement('a');
            card.className = 'match-card';
            // Link to the player page (404.html)
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
                        <div class="match-status-text">${statusText}</div>
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
        const matchDate = new Date(isoString);
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        
        // Format Time (e.g., 05:00 AM)
        const time = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        // Format Date (e.g., 16/08/2025)
        const date = matchDate.toLocaleDateString('en-GB');

        let statusText = "Starts Soon";
        if (diffInSeconds > 0) {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);

            if (hours > 0) {
                statusText = `Starts in ${hours} Hours`;
            } else if (minutes > 0) {
                statusText = `Starts in ${minutes} Mins`;
            } else {
                 statusText = `Starting Soon`;
            }
        } else if (diffInSeconds < 0 && diffInSeconds > -7200) { // Assuming a match is live for 2 hours
            statusText = "Live";
        } else {
            statusText = "Finished";
        }

        return { time, date, statusText };
    }
});
