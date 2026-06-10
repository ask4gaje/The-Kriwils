(function () {
    var ZONES = [
        { stars: 12, xMin: 110, xMax: 900, yMin: 70, yMax: 200 },
        { stars: 6,  xMin: 550, xMax: 870, yMin: 450, yMax: 640 },
        { stars: 7,  xMin: 60,  xMax: 360, yMin: 280, yMax: 570 },
        { stars: 5,  xMin: 330, xMax: 580, yMin: 500, yMax: 640 },
        { stars: 6,  xMin: 600, xMax: 850, yMin: 260, yMax: 390 }
    ];

    var MIN_DIST = 40;

    function distance(a, b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    function farthestPoint(points, candidate) {
        var bestDist = 0;
        for (var i = 0; i < points.length; i++) {
            var d = distance(candidate, points[i]);
            if (d < bestDist) bestDist = d;
        }
        return bestDist;
    }

    function scatterStars(count, xMin, xMax, yMin, yMax) {
        var stars = [];
        var pad = 15;
        xMin += pad; xMax -= pad;
        yMin += pad; yMax -= pad;

        for (var i = 0; i < count; i++) {
            var bestPoint = null;
            var bestScore = -1;

            for (var attempt = 0; attempt < 60; attempt++) {
                var cand = {
                    x: xMin + Math.random() * (xMax - xMin),
                    y: yMin + Math.random() * (yMax - yMin)
                };
                var score = farthestPoint(stars, cand);
                if (score > bestScore) {
                    bestScore = score;
                    bestPoint = cand;
                }
            }
            stars.push(bestPoint);
        }
        return stars;
    }

    function connectStars(stars) {
        var lines = [];
        var used = {};

        for (var i = 0; i < stars.length; i++) {
            var neighbors = [];

            for (var j = 0; j < stars.length; j++) {
                if (i === j) continue;
                neighbors.push({ idx: j, dist: distance(stars[i], stars[j]) });
            }

            neighbors.sort(function (a, b) { return a.dist - b.dist; });

            var maxLinks = 1 + Math.floor(Math.random() * 2);
            var links = 0;

            for (var k = 0; k < neighbors.length && links < maxLinks; k++) {
                var a = Math.min(i, neighbors[k].idx);
                var b = Math.max(i, neighbors[k].idx);
                var key = a + '-' + b;

                if (used[key]) continue;
                if (neighbors[k].dist > 250) continue;

                used[key] = true;
                lines.push({ a: stars[i], b: stars[neighbors[k].idx] });
                links++;
            }
        }

        return lines;
    }

    function buildSvg(stars, lines) {
        var html = '';
        for (var i = 0; i < lines.length; i++) {
            html += '<line x1="' + lines[i].a.x.toFixed(0) + '" y1="' + lines[i].a.y.toFixed(0) + '" x2="' + lines[i].b.x.toFixed(0) + '" y2="' + lines[i].b.y.toFixed(0) + '" />';
        }
        var sizes = [2, 2.5, 3];
        for (var j = 0; j < stars.length; j++) {
            var r = sizes[Math.floor(Math.random() * sizes.length)];
            html += '<circle cx="' + stars[j].x.toFixed(0) + '" cy="' + stars[j].y.toFixed(0) + '" r="' + r + '" />';
        }
        return html;
    }

    function generate() {
        var svgs = document.querySelectorAll('.splash-constellation');
        for (var i = 0; i < Math.min(svgs.length, ZONES.length); i++) {
            var zone = ZONES[i];
            var stars = scatterStars(zone.stars, zone.xMin, zone.xMax, zone.yMin, zone.yMax);
            var lines = connectStars(stars);
            svgs[i].innerHTML = buildSvg(stars, lines);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', generate);
    } else {
        generate();
    }
})();
