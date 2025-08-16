document.addEventListener('DOMContentLoaded', () => {
    if (typeof videojs === 'undefined') return;

    const player = videojs('live-player', {
        fluid: true,
        responsive: true,
        autoplay: true,
        muted: false,
    });

    const linksContainer = document.getElementById('stream-links');
    const relatedMatchesContainer = document.getElementById('related-matches-container');
    const pageLoader = document.getElementById('page-loader');
    const infoPanel = document.querySelector('.match-info-panel');

    let allMatches = [];
    let currentMatchLinks = [];
    let currentLinkIndex = 0;
    let timerInterval = null;

    async function loadAndSetupPlayer() {
        try {
            const response = await fetch('/playlist.m3u');
            if (!response.ok) throw new Error('Playlist fetch failed');
            const data = await response.text();
            allMatches = parseM3U(data);

            const path = window.location.pathname;
            const parts = path.split('/').filter(p => p);
            const categorySlug = parts[0];
            const matchSlugFromUrl = parts[1];

            const categoryMatches = allMatches.filter(m => m.categorySlug === categorySlug);
            if (categoryMatches.length === 0) throw new Error('No matches in this category');

            const currentMatch = categoryMatches.find(m => m.matchSlug === matchSlugFromUrl) || categoryMatches[0];

            document.title = `${currentMatch.team1Name} vs ${currentMatch.team2Name} | Live Stream`;
            setupPlayerForMatch(currentMatch);
            renderRelatedMatches(categoryMatches, currentMatch.matchSlug);

            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateAllMatchTimers, 1000);

            pageLoader.style.display = 'none';
            infoPanel.classList.remove('hidden-on-load');
            relatedMatchesContainer.classList.remove('hidden-on-load');

        } catch (err) {
            console.error(err);
            pageLoader.innerHTML = '<p class="error-message">Could not load stream details.</p>';
        }
    }

    loadAndSetupPlayer();

    player.on('error', () => {
        console.error('Player Error. Trying next server link.');
        tryNextLink();
    });

    function tryNextLink() {
        currentLinkIndex++;
        if (currentMatchLinks && currentLinkIndex < currentMatchLinks.length) {
            setActiveServer(currentMatchLinks[currentLinkIndex], currentLinkIndex);
        } else {
            console.error('All server links failed.');
        }
    }

    function setActiveServer(linkInfo, index) {
        currentLinkIndex = index;
        document.querySelectorAll('.link-button').forEach(btn => btn.classList.remove('active'));
        const activeButton = document.querySelector(`.link-button[data-index="${index}"]`);
        if (activeButton) activeButton.classList.add('active');

        player.src({
            type: getMimeType(linkInfo.url),
            src: linkInfo.url
        });
    }

    function setupPlayerForMatch(match) {
        if (!match) return;
        linksContainer.innerHTML = '';
        currentMatchLinks = match.links || [];
        currentLinkIndex = 0;

        const {
            isLive
        } = getMatchTimeAndStatus(match.matchTime);
        if (!isLive) player.reset();

        currentMatchLinks.forEach((linkInfo, index) => {
            const button = document.createElement('button');
            button.textContent = linkInfo.name;
            button.className = 'link-button';
            button.dataset.index = index;
            if (index === 0) button.classList.add('active');

            button.addEventListener('click', () => {
                setActiveServer(linkInfo, index);
            });
            linksContainer.appendChild(button);
        });

        if (currentMatchLinks.length > 0) {
            setActiveServer(currentMatchLinks[0], 0);
        }
    }

    function renderRelatedMatches(matches, currentMatchSlug) {
        relatedMatchesContainer.innerHTML = '<h3></h3>';
        const matchList = document.createElement('div');
        matchList.className = 'match-list';

        const otherMatches = matches.filter(m => m.matchSlug !== currentMatchSlug);

        if (otherMatches.length === 0) {
            relatedMatchesContainer.innerHTML += '<p class="no-matches-text">No other matches found.</p>';
            return;
        }

        otherMatches.sort((a, b) => {
            const statusA = getMatchTimeAndStatus(a.matchTime);
            const statusB = getMatchTimeAndStatus(b.matchTime);
            if (statusA.isLive && !statusB.isLive) return -1;
            if (!statusA.isLive && statusB.isLive) return 1;
            return new Date(a.matchTime) - new Date(b.matchTime);
        });

        const limitedMatches = otherMatches.slice(0, 6);

        limitedMatches.forEach(match => {
            const card = document.createElement('a');
            card.className = 'match-card';
            card.href = `/${match.categorySlug}/${match.matchSlug}`;
            card.setAttribute('data-match-time', match.matchTime);

            const matchDate = new Date(match.matchTime);
            const displayTime = matchDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
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
            matchList.appendChild(card);
        });
        relatedMatchesContainer.appendChild(matchList);
        updateAllMatchTimers();
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
                        links.push({
                            name,
                            url
                        });
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

    function updateAllMatchTimers() {
        const matchCards = document.querySelectorAll('[data-match-time]');
        matchCards.forEach(card => {
            const timeString = card.dataset.matchTime;
            const statusContainer = card.querySelector('.status-display');
            if (timeString && statusContainer) {
                const {
                    statusHtml
                } = formatMatchTime(timeString);
                statusContainer.innerHTML = statusHtml;
            }
        });
    }

    function formatMatchTime(isoString) {
        if (!isoString) return {
            statusHtml: '<span>TBC</span>'
        };
        const matchDate = new Date(isoString);
        const now = new Date;
        const diffInSeconds = (matchDate - now) / 1e3;
        let statusHtml = "";
        
        if (diffInSeconds > 0) { // Upcoming
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            statusHtml = `<div class="match-status-text">Starts in ${hours}h ${minutes}m</div>`;
        } else if (diffInSeconds > -10800) { // Live
            statusHtml = '<div class="match-status-text live">Live</div>';
        } else { // Finished
            statusHtml = '<div class="match-status-text finished">Finished</div>';
        }
        return {
            statusHtml: statusHtml
        };
    }

    function getMatchTimeAndStatus(isoString) {
        if (!isoString) return {
            isLive: !1
        };
        const matchDate = new Date(isoString);
        const now = new Date;
        const diffInSeconds = (matchDate - now) / 1e3;
        return {
            isLive: diffInSeconds <= 0 && diffInSeconds > -10800
        };
    }

    function getMimeType(url) {
        return url.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4";
    }
});
