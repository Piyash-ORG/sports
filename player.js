document.addEventListener('DOMContentLoaded', () => {
    if (typeof videojs === 'undefined') return;

    const player = videojs('live-player', {
        fluid: true,
        responsive: true,
        autoplay: true,
        muted: true
    });

    const matchTitleEl = document.getElementById('match-title');
    const matchSelectorContainer = document.getElementById('match-selector-container');
    const linksContainer = document.getElementById('stream-links');
    const relatedMatchesContainer = document.getElementById('related-matches-container');
    const errorEl = document.getElementById('error');
    
    let allMatches = [];
    let currentMatch = null;
    let currentMatchLinks = [];
    let currentLinkIndex = 0;
    let timerInterval = null;

    async function loadAndSetupPlayer() {
        try {
            const response = await fetch('/playlist.m3u');
            if (!response.ok) throw new Error('Failed to load playlist.');
            const data = await response.text();
            allMatches = parseM3U(data);

            const path = window.location.pathname;
            const parts = path.split('/').filter(p => p);
            const categorySlug = parts[0];
            const matchSlugFromUrl = parts[1];

            const categoryMatches = allMatches.filter(m => m.categorySlug === categorySlug);
            if (categoryMatches.length === 0) throw new Error('No matches found for this category.');

            currentMatch = categoryMatches.find(m => m.matchSlug === matchSlugFromUrl) || categoryMatches[0];

            setupMatchSelector(categoryMatches, currentMatch.matchSlug);
            setupPlayerForMatch(currentMatch);
            renderRelatedMatches(categoryMatches, currentMatch.matchSlug);
            
            // Start the master timer
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateAllMatchTimers, 1000);

        } catch (err) {
            errorEl.textContent = `Error: ${err.message}`;
            errorEl.style.display = 'block';
            matchTitleEl.textContent = 'Stream Unavailable';
        }
    }

    loadAndSetupPlayer();

    player.on('error', () => {
        console.error('Player Error. Trying next available link.');
        tryNextLink();
    });

    function tryNextLink() {
        currentLinkIndex++;
        if (currentMatchLinks && currentLinkIndex < currentMatchLinks.length) {
            const nextLink = currentMatchLinks[currentLinkIndex];
            player.src({ type: getMimeType(nextLink.url), src: nextLink.url });
            player.play().catch(e => console.error("Autoplay failed on next link:", e));
            document.querySelectorAll('.link-button').forEach((btn, index) => {
                btn.classList.toggle('active', index === currentLinkIndex);
            });
        } else {
            errorEl.textContent = 'All stream links failed for this match.';
            errorEl.style.display = 'block';
        }
    }

    function setupMatchSelector(matches, currentMatchSlug) {
        matchSelectorContainer.innerHTML = '';
        const select = document.createElement('select');
        select.className = 'match-selector';
        select.addEventListener('change', (e) => {
            const selectedSlug = e.target.value;
            window.location.href = `/${matches[0].categorySlug}/${selectedSlug}`;
        });

        matches.forEach(match => {
            const option = document.createElement('option');
            option.value = match.matchSlug;
            option.textContent = `${match.team1Name} vs ${match.team2Name}`;
            select.appendChild(option);
        });

        select.value = currentMatchSlug;
        matchSelectorContainer.appendChild(select);
    }

    function setupPlayerForMatch(match) {
        if (!match) return;
        matchTitleEl.textContent = `${match.team1Name} vs ${match.team2Name}`;
        linksContainer.innerHTML = '';
        errorEl.style.display = 'none';

        currentMatchLinks = match.links || [];
        currentLinkIndex = 0;

        const { isLive } = getMatchTimeAndStatus(match.matchTime);

        if (isLive) {
            if (currentMatchLinks.length > 0) {
                const firstLink = currentMatchLinks[0];
                player.src({ type: getMimeType(firstLink.url), src: firstLink.url });
                player.play().catch(e => console.warn("Autoplay was prevented:", e));
            } else {
                errorEl.textContent = 'No stream sources found for this live match.';
                errorEl.style.display = 'block';
            }
        } else {
            player.reset();
            errorEl.textContent = 'The stream will begin shortly.';
            errorEl.style.display = 'block';
        }

        currentMatchLinks.forEach((linkInfo, index) => {
            const button = document.createElement('button');
            button.textContent = linkInfo.name;
            button.className = 'link-button';
            if (index === 0) button.classList.add('active');
            
            button.addEventListener('click', () => {
                currentLinkIndex = index;
                player.src({ type: getMimeType(linkInfo.url), src: linkInfo.url });
                player.play().catch(e => console.warn("Manual play was prevented:", e));
                document.querySelectorAll('.link-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
            linksContainer.appendChild(button);
        });
    }

    function renderRelatedMatches(matches, currentMatchSlug) {
        relatedMatchesContainer.innerHTML = '<h3>Live & Upcoming</h3>';
        const matchList = document.createElement('div');
        matchList.className = 'match-list'; // Use same class as homepage

        const otherMatches = matches.filter(m => m.matchSlug !== currentMatchSlug);
        
        if (otherMatches.length === 0) {
            relatedMatchesContainer.innerHTML += '<p class="no-matches-text">No other matches in this category.</p>';
            return;
        }
        
        // Sorting: Live first, then upcoming by time
        otherMatches.sort((a, b) => {
             const statusA = getMatchTimeAndStatus(a.matchTime);
             const statusB = getMatchTimeAndStatus(b.matchTime);
             if (statusA.isLive && !statusB.isLive) return -1;
             if (!statusA.isLive && statusB.isLive) return 1;
             return new Date(a.matchTime) - new Date(b.matchTime);
        });

        otherMatches.forEach(match => {
            const card = document.createElement('a');
            card.className = 'match-card';
            card.href = `/${match.categorySlug}/${match.matchSlug}`;
            // Add data-attribute for the timer
            card.setAttribute('data-match-time', match.matchTime);
            card.innerHTML = `
                <div class="card-header">
                    <img src="${match.sportIcon}" alt="${match.sportName}" onerror="this.style.display='none'">
                    <span>${match.sportName} | ${match.leagueName}</span>
                </div>
                <div class="card-body">
                    <div class="team">
                        <img src="${match.team1Logo}" alt="${match.team1Name}" onerror="this.src='https.via.placeholder.com/60'">
                        <span class="team-name">${match.team1Name}</span>
                    </div>
                    <div class="match-details">
                        <div class="status-display">
                            </div>
                    </div>
                    <div class="team">
                        <img src="${match.team2Logo}" alt="${match.team2Name}" onerror="this.src='https.via.placeholder.com/60'">
                        <span class="team-name">${match.team2Name}</span>
                    </div>
                </div>
            `;
            matchList.appendChild(card);
        });
        relatedMatchesContainer.appendChild(matchList);
        updateAllMatchTimers(); // Initial timer update
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
        
        const pad = (num) => num.toString().padStart(2, '0');

        if (diffInSeconds > 0) { // Upcoming
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            const seconds = Math.floor(diffInSeconds % 60);

            if (diffInSeconds >= 36000) { // More than 10 hours
                 statusHtml = `<div class="match-status-text">In ${hours}h ${minutes}m</div>`;
            } else { // Less than 10 hours, show HH:MM:SS
                 statusHtml = `<div class="timer">${pad(hours)}:${pad(minutes)}:${pad(seconds)}</div>`;
            }
        } else if (diffInSeconds > -10800) { // Live (within 3 hours from start)
            const liveSeconds = Math.abs(diffInSeconds);
            const hours = Math.floor(liveSeconds / 3600);
            const minutes = Math.floor((liveSeconds % 3600) / 60);
            const seconds = Math.floor(liveSeconds % 60);
            statusHtml = `
                <div class="match-status-text live">Live</div>
                <div class="timer">${pad(hours)}:${pad(minutes)}:${pad(seconds)}</div>
            `;
        } else { // Finished
            statusHtml = `<div class="match-status-text finished">Finished</div>`;
        }
        
        return { statusHtml };
    }
    
    // This is a simplified helper, mainly for sorting
    function getMatchTimeAndStatus(isoString) {
        if (!isoString) return { isLive: false };
        const matchDate = new Date(isoString);
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        const isLive = diffInSeconds <= 0 && diffInSeconds > -10800;
        return { isLive };
    }

    function getMimeType(url) {
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        return 'video/mp4';
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
                    categorySlug: getAttr('category-slug'), matchSlug: getAttr('match-slug'), sportIcon: getAttr('sport-icon'), sportName: getAttr('sport-name'), leagueName: getAttr('league-name'), team1Logo: getAttr('team1-logo'), team1Name: getAttr('team1-name'), team2Logo: getAttr('team2-logo'), team2Name: getAttr('team2-name'), matchTime: getAttr('match-time'), links: links,
                });
            }
        }
        return playlist;
    }
});
