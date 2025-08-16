document.addEventListener('DOMContentLoaded', () => {
    if (typeof videojs === 'undefined') {
        console.error('Video.js is not loaded. Check the script URL.');
        return;
    }

    const player = videojs('live-player', {
        fluid: true,
        responsive: true,
        autoplay: true,
        muted: true,
        controls: true,
        bigPlayButton: true,
        errorDisplay: false
    }, function() {
        console.log('Player is ready');
    });

    const matchTitleEl = document.getElementById('match-title');
    const matchSelector = document.getElementById('match-selector');
    const qualitySelector = document.getElementById('quality-selector');
    const qualitySelect = document.getElementById('quality-select');
    const linksContainer = document.getElementById('stream-links');
    const matchContainer = document.getElementById('match-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    let currentMatchLinks = [];
    let currentMatch = null;
    let currentLinkIndex = 0;
    let allMatches = [];

    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p);
    const categorySlug = parts[0] || 'football';

    async function loadMatch() {
        try {
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            const response = await fetch('/playlist.m3u');
            if (!response.ok) throw new Error('Failed to load playlist: ' + response.status);
            const data = await response.text();
            allMatches = parseM3U(data);
            console.log('All Matches:', allMatches);
            const categoryMatches = allMatches.filter(m => m.categorySlug === categorySlug);
            if (categoryMatches.length > 0) {
                setupMatchSelector(categoryMatches);
                currentMatch = categoryMatches[0];
                setupPlayer(currentMatch);
                renderMatchContainer(categoryMatches);
            } else {
                throw new Error('No matches found for this category');
            }
        } catch (err) {
            console.error('Error in loadMatch:', err);
            errorEl.textContent = 'Error: ' + err.message;
            errorEl.style.display = 'block';
            matchTitleEl.textContent = 'No streams available';
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    loadMatch();

    player.on('error', (e) => {
        console.error(`Player error: ${e}`, player.error());
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
            player.play().catch(err => console.error('Play failed:', err));
        } else {
            console.error('All links failed.');
            matchTitleEl.textContent = "Stream unavailable.";
            errorEl.textContent = 'All streams failed. Try again later.';
            errorEl.style.display = 'block';
        }
    }

    function setupMatchSelector(matches) {
        matchSelector.innerHTML = '';
        const select = document.createElement('select');
        select.className = 'match-select';
        select.addEventListener('change', (e) => {
            const selectedMatchSlug = e.target.value;
            currentMatch = matches.find(m => m.matchSlug === selectedMatchSlug);
            currentLinkIndex = 0;
            setupPlayer(currentMatch);
            renderMatchContainer(matches); // Update match container on change
        });

        matches.forEach(match => {
            const option = document.createElement('option');
            option.value = match.matchSlug;
            const { statusText } = getMatchTimeAndStatus(match.matchTime);
            option.textContent = `${match.team1Name} vs ${match.team2Name} (${statusText})`;
            select.appendChild(option);
        });

        matchSelector.appendChild(select);
        select.value = matches[0].matchSlug;
    }

    function setupPlayer(match) {
        if (!match) return;
        matchTitleEl.textContent = `${match.team1Name} vs ${match.team2Name}`;
        linksContainer.innerHTML = '';
        currentMatchLinks = match.links || [];
        currentLinkIndex = 0;

        console.log('Current Match Links:', currentMatchLinks);
        if (currentMatchLinks.length > 0) {
            const firstLink = currentMatchLinks[0];
            player.src({ type: getMimeType(firstLink.url), src: firstLink.url });
            player.play().catch(err => {
                console.error('Autoplay failed:', err);
                errorEl.textContent = 'Stream failed to load. Check the URL or try another server.';
                errorEl.style.display = 'block';
            });
            setupQualitySelector(currentMatchLinks[0].url); // Set quality options
        } else {
            matchTitleEl.textContent = "No streams available.";
            errorEl.textContent = 'No stream links found for this match.';
            errorEl.style.display = 'block';
            qualitySelector.style.display = 'none';
        }

        currentMatchLinks.forEach((linkInfo, index) => {
            const button = document.createElement('button');
            button.textContent = linkInfo.name;
            button.className = 'link-button';
            if (index === 0) button.classList.add('active');
            button.addEventListener('click', () => {
                currentLinkIndex = index;
                player.src({ type: getMimeType(linkInfo.url), src: linkInfo.url });
                player.play().catch(err => console.error('Manual play failed:', err));
                document.querySelectorAll('.link-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                setupQualitySelector(linkInfo.url); // Update quality on link change
            });
            linksContainer.appendChild(button);
        });

        // Show/hide links container based on number of links
        linksContainer.style.display = currentMatchLinks.length > 0 ? 'flex' : 'none';
    }

    function setupQualitySelector(url) {
        qualitySelect.innerHTML = '';
        // Example quality levels (customize based on your stream)
        const qualities = [
            { label: 'Auto', url: url },
            { label: '720p', url: url.replace(/\.m3u8$/, '_720p.m3u8') || url },
            { label: '480p', url: url.replace(/\.m3u8$/, '_480p.m3u8') || url },
            { label: '360p', url: url.replace(/\.m3u8$/, '_360p.m3u8') || url }
        ];
        qualities.forEach(q => {
            const option = document.createElement('option');
            option.value = q.url;
            option.textContent = q.label;
            qualitySelect.appendChild(option);
        });
        qualitySelect.value = url;
        qualitySelector.style.display = 'flex';
        qualitySelect.addEventListener('change', (e) => {
            player.src({ type: getMimeType(e.target.value), src: e.target.value });
            player.play().catch(err => console.error('Quality change failed:', err));
        });
    }

    function renderMatchContainer(matches) {
        matchContainer.innerHTML = '<h3>Live & Upcoming Matches</h3>';
        const matchList = document.createElement('div');
        matchList.className = 'match-list';

        const liveMatches = matches.filter(m => getMatchTimeAndStatus(m.matchTime).isLive);
        const upcomingMatches = matches.filter(m => !getMatchTimeAndStatus(m.matchTime).isLive);

        [liveMatches, upcomingMatches].forEach((matchGroup, index) => {
            if (matchGroup.length > 0) {
                const sectionTitle = index === 0 ? 'Live' : 'Upcoming';
                const section = document.createElement('div');
                section.innerHTML = `<h4>${sectionTitle}</h4>`;
                matchGroup.forEach(match => {
                    const { time, date, statusText, isLive } = getMatchTimeAndStatus(match.matchTime);
                    const card = document.createElement('a');
                    card.className = 'match-card';
                    card.href = `/${match.categorySlug}/${match.matchSlug}`;
                    card.innerHTML = `
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
                    `;
                    section.appendChild(card);
                });
                matchList.appendChild(section);
            }
        });

        matchContainer.appendChild(matchList);
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
        const now = new Date('2025-08-16T01:33:00Z'); // 7:33 AM +06:00
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
