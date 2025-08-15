document.addEventListener('DOMContentLoaded', () => {
    const player = videojs('live-player');
    const linksContainer = document.getElementById('stream-links');
    const matchTitleEl = document.getElementById('match-title');

    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p);
    
    if (parts.length === 2) {
        const [categorySlug, matchSlug] = parts;
        fetch('/playlist.m3u')
            .then(response => response.text())
            .then(data => {
                const matchData = findMatchBySlug(data, categorySlug, matchSlug);
                if (matchData) {
                    setupPlayer(matchData);
                } else {
                    matchTitleEl.textContent = 'Match Not Found!';
                }
            });
    } else {
        window.location.href = '/';
    }

    function findMatchBySlug(data, categorySlug, matchSlug) {
        const lines = data.trim().split('\n');
        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                const getAttr = (attr) => {
                    const match = line.match(new RegExp(`${attr}="([^"]*)"`));
                    return match ? match[1] : null;
                };

                if (getAttr('category-slug') === categorySlug && getAttr('match-slug') === matchSlug) {
                    const links = [];
                    for (let i = 1; i <= 10; i++) { // Supports up to 10 links
                        const url = getAttr(`link${i}`);
                        const name = getAttr(`link-name${i}`) || `Link ${i}`;
                        if (url) links.push({ url, name });
                    }
                    return {
                        team1Name: getAttr('team1-name'),
                        team2Name: getAttr('team2-name'),
                        links: links,
                    };
                }
            }
        }
        return null;
    }

    function setupPlayer(match) {
        matchTitleEl.textContent = `${match.team1Name} vs ${match.team2Name}`;
        linksContainer.innerHTML = '';

        if (match.links.length > 0) {
            player.src({ type: 'application/x-mpegURL', src: match.links[0].url });
        }
        
        match.links.forEach((linkInfo, index) => {
            const button = document.createElement('button');
            button.textContent = linkInfo.name;
            button.className = 'link-button';
            if (index === 0) button.classList.add('active');

            button.addEventListener('click', () => {
                player.src({ type: 'application/x-mpegURL', src: linkInfo.url });
                player.play();
                document.querySelectorAll('.link-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
            linksContainer.appendChild(button);
        });
    }
});