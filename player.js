document.addEventListener('DOMContentLoaded', () => {
    const player = videojs('live-player', {
        fluid: true,
        responsive: true,
        autoplay: true,
        muted: true, // Start muted to allow autoplay
        controls: true,
        bigPlayButton: true,
        errorDisplay: false
    });
    const linksContainer = document.getElementById('stream-links');
    const matchTitleEl = document.getElementById('match-title');
    const otherMatchesContainer = document.getElementById('other-matches-list');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    let currentMatchLinks = [];
    let currentLinkIndex = 0;
    let allMatches = [];

    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p);

    async function loadMatch() {
        try {
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            const response = await fetch('/playlist.m3u');
            if (!response.ok) throw new Error('Failed to load playlist');
            const data = await response.text();
            allMatches = parseM3U(data);
            console.log('All Matches:', allMatches); // Debug
            if (parts.length === 2) {
                const [categorySlug, matchSlug] = parts;
                const currentMatch = allMatches.find(m => m.categorySlug === categorySlug && m.matchSlug === matchSlug);
                console.log('Current Match:', currentMatch); // Debug
                if (currentMatch && currentMatch.links.length > 0) {
                    setupPlayer(currentMatch);
                    const otherMatches = allMatches.filter(m => m.matchSlug !== matchSlug);
                    renderOtherMatches(otherMatches);
                } else if (currentMatch) {
                    throw new Error('No stream links available for this match');
                } else {
                    throw new Error('Match not found');
                }
            } else {
                throw new Error('Invalid URL');
            }
        } catch (err) {
            errorEl.textContent = 'Error: ' + err.message;
            errorEl.style.display = 'block';
            matchTitleEl.textContent = 'Stream Unavailable';
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    loadMatch();

    player.on('error', () => {
        console.error(`Link ${currentLinkIndex + 1} failed.`);
        tryNextLink();
    });

    function tryNextLink() {
        currentLinkIndex++;
        if (currentLinkIndex < currentMatchLinks.length) {
            console.log(`Trying link ${currentLinkIndex + 1}...`);
            const nextLink = currentMatchLinks[currentLinkIndex];
            player.src({ type: getMimeType(nextLink.url), src: nextLink.url });
            document.querySelectorAll('.link-button').forEach((btn, index) => {
                btn.classList.toggle('active', index === currentLinkIndex);
            });
            player.play().catch(() => console.log('Autoplay prevented.'));
        } else {
            console.error('All links failed.');
            matchTitleEl.textContent = "Stream unavailable.";
            errorEl.textContent = 'All streams failed. Try again later.';
            errorEl.style.display = 'block';
        }
    }

    function setupPlayer(match) {
        matchTitleEl.textContent = `${match.team1Name} vs ${match.team2Name}`;
        linksContainer.innerHTML = '';
        currentMatchLinks = match.links || [];
        currentLinkIndex = 0;

        if (currentMatchLinks.length > 0) {
            player.src({ type: getMimeType(currentMatchLinks[0].url), src: currentMatchLinks[0].url });
            player.play().catch(() => console.log('Autoplay prevented, user interaction needed.'));
        } else {
            matchTitleEl.textContent = "No streams available.";
            errorEl.textContent = 'No stream links found for this match.';
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
                player.play().catch(() => console.log('Autoplay prevented.'));
                document.querySelectorAll('.link-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
            linksContainer.appendChild(button);
        });
    }

    function renderOtherMatches(matches) {
        otherMatchesContainer.innerHTML = '';
        matches.sort((a, b) => {
            const aStatus = getMatchTimeAndStatus(a.matchTime);
            const bStatus = getMatchTimeAndStatus(b.matchTime);
            if (aStatus.isLive && !bStatus.isLive) return -1;
            if (!aStatus.isLive && bStatus.isLive) return 1;
            return new Date(a.matchTime) - new Date(b.matchTime);
        });

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
            otherMatchesContainer.appendChild(card);
        });
    }

    function getMimeType(url) {
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        if (url.includes('.mp4')) return 'video/mp4';
        if (url.includes('.webm')) return 'video/webm';
        if (url.includes('.ts')) return 'video/MP2T';
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
        if (!isoString) return { time: 'N/A', date: '', statusText: 'Time TBC', isLive: false };
        const matchDate = new Date(isoString);
        const now = new Date('2025-08-16T00:18:00Z'); // Current time: 6:18 AM +06:00
        const diffInSeconds = (matchDate - now) / 1000;
        const time = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const date = matchDate.toLocaleDateString('en-GB');
        let statusText = "Upcoming";
        let isLive = false;
        if (diffInSeconds <= 0 && diffInSeconds > -10800) { statusText = "Live"; isLive = true; }
        else if (diffInSeconds > 0) {
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            statusText = hours > 0 ? `Starts in ${hours}h ${minutes}m` : `Starts in ${minutes}m`;
        } else {
            statusText = "Finished";
        }
        return { time, date, statusText, isLive };
    }
});
