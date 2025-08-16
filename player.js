document.addEventListener('DOMContentLoaded', () => {
    if (typeof videojs === 'undefined') {
        return;
    }

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
            console.error('All links for the match have failed.');
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
            const { statusText } = getMatchTimeAndStatus(match.matchTime);
            option.textContent = `${match.team1Name} vs ${match.team2Name} [${statusText}]`;
            select.appendChild(option);
        });

        select.value = currentMatchSlug;
        matchSelectorContainer.appendChild(select);
    }

    function setupPlayerForMatch(match) {
        if (!match) return;
        matchTitleEl.textContent = `${match.team1Name} vs ${match.team2Name}`;
        linksContainer.innerHTML = '';
        currentMatchLinks = match.links || [];
        currentLinkIndex = 0;

        if (currentMatchLinks.length > 0) {
            errorEl.style.display = 'none';
            const firstLink = currentMatchLinks[0];
            player.src({ type: getMimeType(firstLink.url), src: firstLink.url });
            player.play().catch(e => console.warn("Autoplay was prevented:", e));
        } else {
            matchTitleEl.textContent = "No stream links for this match.";
            errorEl.textContent = 'No stream sources found.';
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
        matchList.className = 'related-match-list';

        const otherMatches = matches.filter(m => m.matchSlug !== currentMatchSlug);
        const liveMatches = otherMatches.filter(m => getMatchTimeAndStatus(m.matchTime).isLive);
        const upcomingMatches = otherMatches.filter(m => !getMatchTimeAndStatus(m.matchTime).isLive)
                                         .sort((a, b) => new Date(a.matchTime) - new Date(b.matchTime));

        const sortedMatches = [...liveMatches, ...upcomingMatches];

        if (sortedMatches.length === 0) {
             matchList.innerHTML = '<p class="no-matches-text">No other matches in this category.</p>';
        } else {
            sortedMatches.forEach(match => {
                const { time, statusText, isLive } = getMatchTimeAndStatus(match.matchTime);
                const card = document.createElement('a');
                card.className = 'related-match-card';
                card.href = `/${match.categorySlug}/${match.matchSlug}`;
                card.innerHTML = `
                    <div class="team-info">
                        <img src="${match.team1Logo}" alt="${match.team1Name}" onerror="this.src='https.via.placeholder.com/40'">
                        <span>${match.team1Name}</span>
                    </div>
                    <div class="details">
                        <div class="status ${isLive ? 'live' : ''}">${statusText}</div>
                        <div class="time">${time}</div>
                    </div>
                    <div class="team-info">
                        <img src="${match.team2Logo}" alt="${match.team2Name}" onerror="this.src='https.via.placeholder.com/40'">
                        <span>${match.team2Name}</span>
                    </div>
                `;
                matchList.appendChild(card);
            });
        }
        relatedMatchesContainer.appendChild(matchList);
    }

    function getMimeType(url) {
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        if (url.includes('.mp4')) return 'video/mp4';
        return 'video/mp4'; // Default fallback
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

    function getMatchTimeAndStatus(isoString) {
        if (!isoString) return { time: 'N/A', date: '', statusText: 'TBC', isLive: false };
        const matchDate = new Date(isoString);
        const now = new Date();
        const diffInSeconds = (matchDate - now) / 1000;
        const time = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const date = matchDate.toLocaleDateString('en-GB');

        let statusText = "Upcoming";
        let isLive = false;

        if (diffInSeconds <= 0 && diffInSeconds > -10800) { // Live if started within the last 3 hours
            statusText = "Live";
            isLive = true;
        } else if (diffInSeconds > 0) {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            statusText = hours > 0 ? `In ${hours}h ${minutes}m` : `In ${minutes}m`;
        } else {
            statusText = "Finished";
        }
        return { time, date, statusText, isLive };
    }
});
