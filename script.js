document.addEventListener('DOMContentLoaded', () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx;
    // --- SES YÖNETİCİSİ ---
    const SoundManager = {
        init: () => { try { if (!audioCtx) audioCtx = new AudioContext(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} },
        playTone: (freq, type, duration, vol = 0.1, detune = 0) => {
            if (!audioCtx) return;
            // SES OPTİMİZASYONU: Çok fazla ses üst üste binince kasmayı engeller
            if (audioCtx.currentTime > 0 && Math.random() < 0.1) return;

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            let finalFreq = timeScale < 1 ? freq * 0.5 : freq;
            osc.frequency.setValueAtTime(finalFreq, audioCtx.currentTime);
            osc.detune.setValueAtTime(detune, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        },
        shoot: () => SoundManager.playTone(400, 'square', 0.1, 0.05),
        overdriveShoot: () => SoundManager.playTone(600, 'sawtooth', 0.05, 0.05),
        enemyShoot: () => SoundManager.playTone(200, 'sawtooth', 0.1, 0.05),
        explosion: () => { SoundManager.playTone(100, 'sawtooth', 0.3, 0.1); },
        powerup: () => { SoundManager.playTone(600, 'sine', 0.1, 0.1); },
        coin: () => SoundManager.playTone(1200, 'sine', 0.1, 0.05),
        slowMoStart: () => SoundManager.playTone(100, 'sine', 0.5, 0.2, -500),
        bomb: () => SoundManager.playTone(50, 'sawtooth', 1.0, 0.3),
        win: () => {
            [440, 554, 659, 880].forEach((f, i) => setTimeout(() => SoundManager.playTone(f, 'square', 0.2, 0.1), i * 150));
        },
        achieve: () => {
            [523, 659].forEach((f, i) => setTimeout(() => SoundManager.playTone(f, 'triangle', 0.3, 0.2), i * 100));
        }
    };

    // --- ELEMENTLER ---
    const gameObjectsDiv = document.getElementById('game-objects');
    const player = document.getElementById('player');
    const nebula = document.getElementById('nebula');
    const glitchOverlay = document.getElementById('glitch-overlay');
    // UI
    const scoreText = document.getElementById('score-text');
    const comboText = document.getElementById('combo-count');
    const comboBox = document.getElementById('combo-box');
    const hpBar = document.getElementById('player-hp-bar');
    const fuelBar = document.getElementById('slowmo-bar');
    const overdriveBar = document.getElementById('overdrive-bar');
    const bombCountText = document.getElementById('bomb-count');
    const bossHud = document.getElementById('boss-hud');
    const bossHpBar = document.getElementById('boss-hp-bar');
    const gameMoneyText = document.getElementById('game-money-text');
    const totalMoneyText = document.getElementById('total-money');
    const shopMoneyText = document.getElementById('shop-money');
    const waveText = document.getElementById('wave-text');
    const waveMsg = document.getElementById('wave-msg');
    const achPopup = document.getElementById('achievement-popup');

    // --- OYUN VERİSİ ---
    let saveData = JSON.parse(localStorage.getItem('galacticSaveV2')) || {
        money: 0,
        highScore: 0,
        upgrades: { hp: 1, magnet: 1, bomb: 1 },
        skins: ['default'],
        equippedSkin: 'default',
        achievements: []
    };

    // --- DEĞİŞKENLER ---
    let gameState = 'MENU';
    let score = 0,
        collectedMoney = 0,
        level = 1,
        wave = 1,
        enemiesToKill = 10;
    let timeScale = 1.0,
        slowMoEnergy = 100,
        isSlowMoActive = false;
    let overdrive = 0,
        isOverdriveActive = false;
    let combo = 0,
        comboTimer = null;
    let hp = 100,
        maxHp = 100,
        bombs = 3,
        magnetRange = 100;
    let posX = 50,
        speedX = 0,
        bossActive = false,
        hasShield = false;
    let frameCount = 0;
    let enemies = [],
        lasers = [],
        enemyLasers = [],
        powerups = [],
        coins = [];
    let boss = { el: null, x: 50, hp: 1000, maxHp: 1000, dir: 1, moveTimer: 0 };
    const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, Space: false, KeyS: false };

    updateMainMenu();
    window.switchTab = (tab) => {
        document.querySelectorAll('.shop-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        event.target.classList.add('active');
    };
    window.buySkin = (skin, cost) => {
        if (saveData.money >= cost && !saveData.skins.includes(skin)) {
            saveData.money -= cost;
            saveData.skins.push(skin);
            localStorage.setItem('galacticSaveV2', JSON.stringify(saveData));
            updateShopUI();
            updateMainMenu();
            SoundManager.powerup();
        }
    };
    window.equipSkin = (skin) => {
        if (saveData.skins.includes(skin)) {
            saveData.equippedSkin = skin;
            localStorage.setItem('galacticSaveV2', JSON.stringify(saveData));
            updateShopUI();
        }
    };

    // --- KONTROLLER ---
    document.addEventListener('keydown', (e) => {
        if (gameState === 'PLAYING') {
            if (e.code === 'Space') {
                keys.Space = true;
                shoot();
            }
            if (e.key === 'b' || e.key === 'B') useBomb();
            if (e.key === 's' || e.key === 'S') toggleSlowMo(true);
            if (e.key === 'p' || e.key === 'P') togglePause();
        }
        if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') keys.Space = false;
        if (e.key === 's' || e.key === 'S') toggleSlowMo(false);
        if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    });

    const setupTouchBtn = (id, key, action = null, hold = false) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[key] = true;
            if (action && !hold) action();
            if (hold) action(true);
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[key] = false;
            if (hold) action(false);
        });
    };
    setupTouchBtn('btn-left', 'ArrowLeft');
    setupTouchBtn('btn-right', 'ArrowRight');
    setupTouchBtn('btn-fire', 'Space', shoot);
    setupTouchBtn('btn-bomb', 'KeyB', useBomb);
    setupTouchBtn('btn-slow', 'KeyS', toggleSlowMo, true);

    document.getElementById('start-btn').addEventListener('click', () => {
        SoundManager.init();
        initGame();
    });
    document.getElementById('shop-btn').addEventListener('click', openShop);
    document.getElementById('close-shop-btn').addEventListener('click', closeShop);
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('buy-hp').addEventListener('click', () => buyUpgrade('hp', 100));
    document.getElementById('buy-magnet').addEventListener('click', () => buyUpgrade('magnet', 150));
    document.getElementById('buy-bomb').addEventListener('click', () => buyUpgrade('bomb', 300));

    function initGame() {
        score = 0;
        collectedMoney = 0;
        level = 1;
        wave = 1;
        enemiesToKill = 10;
        combo = 0;
        overdrive = 0;
        maxHp = 100 + (saveData.upgrades.hp - 1) * 20;
        hp = maxHp;
        bombs = 2 + saveData.upgrades.bomb;
        magnetRange = 100 + (saveData.upgrades.magnet - 1) * 50;
        slowMoEnergy = 100;
        isSlowMoActive = false;
        isOverdriveActive = false;
        posX = 50;
        speedX = 0;
        bossActive = false;
        hasShield = false;

        player.className = '';
        if (saveData.equippedSkin !== 'default') player.classList.add(`player-${saveData.equippedSkin}`);

        gameObjectsDiv.innerHTML = '';
        enemies = [];
        lasers = [];
        enemyLasers = [];
        powerups = [];
        coins = [];

        updateBombUI();
        gameMoneyText.innerText = 0;
        waveText.innerText = 1;
        hpBar.style.width = '100%';
        document.getElementById('main-menu').classList.remove('active');
        document.getElementById('game-ui').style.display = 'flex';
        startWave();
        gameState = 'PLAYING';
        gameLoop();
    }

    function startWave() {
        waveMsg.innerText = "DALGA " + wave;
        waveMsg.style.display = 'block';
        setTimeout(() => waveMsg.style.display = 'none', 3000);

        // ZORLUK AYARI: Dalga başına düşman sayısı azaltıldı
        enemiesToKill = 5 + (wave * 3);

        if (wave % 5 === 0) spawnBoss();
        const colors = ['#1a0b2e', '#2e0b1a', '#0b2e1a', '#2e2e0b'];
        nebula.style.background = `radial-gradient(circle at center, ${colors[wave % colors.length]}, #000)`;
    }

    function updateMainMenu() {
        document.getElementById('menu-high-score').innerText = saveData.highScore;
        totalMoneyText.innerText = saveData.money;
    }

    function openShop() {
        document.getElementById('main-menu').classList.remove('active');
        document.getElementById('shop-menu').classList.add('active');
        updateShopUI();
    }

    function closeShop() {
        document.getElementById('shop-menu').classList.remove('active');
        document.getElementById('main-menu').classList.add('active');
    }

    function updateShopUI() {
        shopMoneyText.innerText = saveData.money;
        const costs = { hp: 100, magnet: 150, bomb: 300 };
        const limits = { hp: 5, magnet: 5, bomb: 3 };
        ['hp', 'magnet', 'bomb'].forEach(type => {
            const lvl = saveData.upgrades[type];
            const cost = costs[type] * lvl;
            const span = document.querySelector(`#buy-${type}`).parentElement.querySelector(`p:nth-child(3) span`);
            if (span) span.innerText = lvl >= limits[type] ? "MAX" : lvl;
            const btn = document.getElementById(`buy-${type}`);
            if (lvl >= limits[type]) {
                btn.disabled = true;
                btn.innerText = "MAX";
                btn.style.background = "#555";
            } else if (saveData.money < cost) {
                btn.disabled = true;
                btn.innerText = `YÜKSELT (${cost})`;
                btn.style.background = "#555";
            } else {
                btn.disabled = false;
                btn.style.background = "#00f0ff";
                btn.innerText = `YÜKSELT (${cost})`;
            }
        });
    }

    function buyUpgrade(type, baseCost) {
        const lvl = saveData.upgrades[type];
        const cost = baseCost * lvl;
        if (saveData.money >= cost) {
            saveData.money -= cost;
            saveData.upgrades[type]++;
            localStorage.setItem('galacticSaveV2', JSON.stringify(saveData));
            updateShopUI();
            updateMainMenu();
            SoundManager.powerup();
        }
    }

    function checkAchievements() {
        const unlocks = [{ id: 'first_blood', desc: "İlk Kan", cond: () => score > 100 }, { id: 'rich', desc: "Zengin", cond: () => saveData.money >= 1000 }, { id: 'survivor', desc: "Hayatta Kalan", cond: () => wave >= 5 }];
        unlocks.forEach(ach => {
            if (!saveData.achievements.includes(ach.id) && ach.cond()) {
                saveData.achievements.push(ach.id);
                localStorage.setItem('galacticSaveV2', JSON.stringify(saveData));
                showAchievement(ach.desc);
            }
        });
    }

    function showAchievement(text) {
        document.getElementById('ach-desc').innerText = text;
        achPopup.classList.add('show');
        SoundManager.achieve();
        setTimeout(() => achPopup.classList.remove('show'), 3000);
    }

    // --- GAME LOOP ---
    function gameLoop() {
        if (gameState !== 'PLAYING') return;
        frameCount++;

        if (isSlowMoActive) {
            slowMoEnergy -= 0.5;
            if (slowMoEnergy <= 0) toggleSlowMo(false);
        } else if (slowMoEnergy < 100) {
            slowMoEnergy += 0.2;
        }
        fuelBar.style.width = slowMoEnergy + '%';

        let playerTimeScale = isSlowMoActive ? 0.6 : 1.0;
        if (keys.ArrowLeft) speedX -= 0.8 * playerTimeScale;
        if (keys.ArrowRight) speedX += 0.8 * playerTimeScale;
        speedX *= 0.92;
        posX += speedX * playerTimeScale;
        if (posX < 2) posX = 2;
        if (posX > 98) posX = 98;
        player.style.left = posX + '%';
        player.style.transform = `translateX(-50%) rotate(${speedX * -2}deg)`;

        if (enemiesToKill <= 0 && enemies.length === 0 && !bossActive) {
            wave++;
            checkAchievements();
            startWave();
        }
        // Optimize Edilmiş Spawn (Aynı anda max 15 düşman)
        if (!bossActive && enemiesToKill > 0 && enemies.length < 15) {
            // ZORLUK AYARI: Düşman spawn olma ihtimali düşürüldü (0.02 -> 0.01)
            if (Math.random() < (0.01 * timeScale) + (wave * 0.003)) spawnEnemy();
        }

        updateLasers();
        updateEnemies();
        updateCoins();
        if (bossActive && boss.el) updateBoss();

        scoreText.innerText = Math.floor(score);
        requestAnimationFrame(gameLoop);
    }

    // --- OYUN NESNELERİ ---
    function spawnCoin(xPct, yPx) {
        const el = document.createElement('div');
        el.className = 'scrap';
        const rX = (Math.random() - 0.5) * 10;
        el.style.left = `calc(${xPct}% + ${rX}px)`;
        el.style.top = yPx + 'px';
        gameObjectsDiv.appendChild(el);
        coins.push({ el, x: xPct, y: yPx, vx: (Math.random() - 0.5) * 1, vy: -3 - Math.random() * 2 });
    }

    function updateCoins() {
        const screenW = window.innerWidth;
        const playerPx = (posX / 100) * screenW;
        const playerTop = player.offsetTop;
        for (let i = coins.length - 1; i >= 0; i--) {
            let c = coins[i];
            const coinPx = (c.x / 100) * screenW;
            const dist = Math.hypot(coinPx - playerPx, c.y - playerTop);
            if (dist < magnetRange) {
                c.vx += (playerPx - coinPx) * 0.05 * timeScale;
                c.vy += (playerTop - c.y) * 0.05 * timeScale;
            } else {
                c.vy += 0.2 * timeScale;
                c.vx *= 0.95;
            }
            c.x += (c.vx / screenW) * 100;
            c.y += c.vy;
            c.el.style.left = c.x + '%';
            c.el.style.top = c.y + 'px';
            if (dist < 40) {
                collectedMoney += 10;
                gameMoneyText.innerText = collectedMoney;
                SoundManager.coin();
                createFloatingText(c.x, c.y, "+10", "heal");
                c.el.remove();
                coins.splice(i, 1);
            } else if (c.y > window.innerHeight) {
                c.el.remove();
                coins.splice(i, 1);
            }
        }
    }

    function spawnEnemy() {
        const rand = Math.random();
        let type = 'enemy-ship';
        if (rand < 0.2) type = 'kamikaze';
        else if (rand < 0.4) type = 'interceptor';
        const el = document.createElement('div');
        el.className = type;
        const startX = Math.random() * 90 + 5;
        el.style.left = startX + '%';
        el.style.top = '-50px';
        gameObjectsDiv.appendChild(el);
        // ZORLUK AYARI: Düşman hızı başlangıçta yavaşlatıldı
        enemies.push({ el, x: startX, y: -50, speed: (1 + Math.random()) * (1 + wave * 0.05), type });
    }

    function updateEnemies() {
        for (let i = enemies.length - 1; i >= 0; i--) {
            let e = enemies[i];
            let moveSpeed = e.speed * timeScale;
            if (e.type === 'kamikaze') {
                if (e.x < posX) e.x += 0.5 * timeScale;
                else e.x -= 0.5 * timeScale;
                e.y += moveSpeed * 1.5;
            } else if (e.type === 'interceptor') {
                if (e.x < posX) e.x += 0.3 * timeScale;
                else e.x -= 0.3 * timeScale;
                e.y += moveSpeed;
            } else {
                e.y += moveSpeed;
                if (Math.random() < 0.01 * timeScale) {
                    createLaser(e.x, e.y + 40, true);
                    SoundManager.enemyShoot();
                }
            }
            e.el.style.top = e.y + 'px';
            e.el.style.left = e.x + '%';
            if (checkRect(e.el.getBoundingClientRect(), player.getBoundingClientRect())) {
                takeDamage(30);
                triggerGlitch();
                e.el.remove();
                enemies.splice(i, 1);
            }
            if (e.y > window.innerHeight) {
                e.el.remove();
                enemies.splice(i, 1);
            }
        }
    }

    function updateLasers() {
        for (let i = lasers.length - 1; i >= 0; i--) {
            let l = lasers[i];
            l.bottom += 15 * timeScale;
            l.el.style.bottom = l.bottom + 'px';
            l.el.style.left = l.x + '%';
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (checkRect(l.el.getBoundingClientRect(), e.el.getBoundingClientRect())) {
                    createFloatingText(e.x, e.y, Math.floor(100), "white");
                    createExplosion(e.x, e.y);
                    spawnCoin(e.x, e.y);
                    addScore(100);
                    e.el.remove();
                    enemies.splice(j, 1);
                    l.el.remove();
                    lasers.splice(i, 1);
                    enemiesToKill--;
                    hit = true;
                    break;
                }
            }
            if (!hit && bossActive && boss.el && checkRect(l.el.getBoundingClientRect(), boss.el.getBoundingClientRect())) {
                boss.hp -= 10;
                l.el.remove();
                lasers.splice(i, 1);
                createExplosion(l.x, boss.el.getBoundingClientRect().bottom - document.getElementById('game-container').getBoundingClientRect().top);
                bossHpBar.style.width = (boss.hp / boss.maxHp * 100) + '%';
                if (boss.hp <= 0) gameWin();
            }
            if (!hit && l.bottom > window.innerHeight) {
                l.el.remove();
                lasers.splice(i, 1);
            }
        }
        for (let i = enemyLasers.length - 1; i >= 0; i--) {
            let l = enemyLasers[i];
            l.y += 10 * timeScale;
            l.el.style.top = l.y + 'px';
            l.el.style.left = l.x + '%';
            if (checkRect(l.el.getBoundingClientRect(), player.getBoundingClientRect())) {
                takeDamage(10);
                l.el.remove();
                enemyLasers.splice(i, 1);
            }
            if (l.y > window.innerHeight) {
                l.el.remove();
                enemyLasers.splice(i, 1);
            }
        }
    }

    function spawnBoss() {
        bossActive = true;
        document.getElementById('boss-warning').style.display = 'block';
        SoundManager.bomb();
        setTimeout(() => {
            document.getElementById('boss-warning').style.display = 'none';
            bossHud.style.display = 'block';
            const el = document.createElement('div');
            el.className = 'boss-ship';
            el.innerHTML = '<div class="boss-body"><div class="boss-core"></div></div>';
            gameObjectsDiv.appendChild(el);
            boss.el = el;
            boss.y = 50;
            boss.el.style.top = boss.y + 'px';
            // ZORLUK AYARI: Boss canı düşürüldü
            boss.hp = 800 + (wave * 500);
            boss.maxHp = boss.hp;
        }, 3000);
    }

    function updateBoss() {
        boss.moveTimer += 0.05 * timeScale;
        boss.x = 50 + Math.sin(boss.moveTimer) * 40;
        boss.el.style.left = boss.x + '%';
        if (Math.random() < 0.05 * timeScale) {
            createLaser(boss.x, boss.y + 150, true);
            createLaser(boss.x, boss.y + 150, true, -2);
            createLaser(boss.x, boss.y + 150, true, 2);
            SoundManager.enemyShoot();
        }
    }

    function toggleSlowMo(active) {
        if (active && slowMoEnergy > 5) {
            isSlowMoActive = true;
            timeScale = 0.3;
            document.body.classList.add('slow-motion');
            SoundManager.slowMoStart();
        } else {
            isSlowMoActive = false;
            timeScale = 1.0;
            document.body.classList.remove('slow-motion');
        }
    }

    function togglePause() {
        gameState = (gameState === 'PLAYING') ? 'PAUSED' : 'PLAYING';
        document.getElementById('pause-menu').classList.toggle('active');
        if (gameState === 'PLAYING') gameLoop();
    }

    function useBomb() {
        if (bombs > 0 && gameState === 'PLAYING') {
            bombs--;
            updateBombUI();
            SoundManager.bomb();
            triggerGlitch();
            enemies.forEach(e => {
                createFloatingText(e.x, 300, "SİLİNDİ", "crit");
                e.el.remove();
                addScore(50);
                enemiesToKill--;
            });
            enemies = [];
            enemyLasers.forEach(l => l.el.remove());
            enemyLasers = [];
        }
    }

    function shoot() {
        if (isOverdriveActive) {
            createLaser(posX - 5, 110, false);
            createLaser(posX + 5, 110, false);
            SoundManager.overdriveShoot();
        } else {
            createLaser(posX, 110, false);
            SoundManager.shoot();
        }
    }

    function createLaser(x, offsetBottom, isEnemy, angle = 0) {
        const el = document.createElement('div');
        el.className = isEnemy ? 'enemy-laser' : 'laser';
        el.style.left = x + '%';
        if (isEnemy) {
            el.style.top = offsetBottom + 'px';
            enemyLasers.push({ el, x, y: offsetBottom, angle });
        } else {
            el.style.bottom = offsetBottom + 'px';
            lasers.push({ el, x, bottom: offsetBottom, angle });
        }
        gameObjectsDiv.appendChild(el);
    }

    function createExplosion(x, y) {
        const el = document.createElement('div');
        el.className = 'explosion';
        el.style.left = x + '%';
        el.style.top = y + 'px';
        gameObjectsDiv.appendChild(el);
        SoundManager.explosion();
        setTimeout(() => el.remove(), 400);
    }

    function createFloatingText(xPct, yPx, text, type = "white") {
        const el = document.createElement('div');
        el.className = `float-text dmg-${type}`;
        el.innerText = text;
        const screenW = window.innerWidth;
        const leftPx = (xPct / 100) * screenW;
        el.style.left = leftPx + 'px';
        el.style.top = yPx + 'px';
        document.getElementById('floating-text-layer').appendChild(el);
        setTimeout(() => el.remove(), 800);
    }

    function updateBombUI() {
        let s = '';
        for (let i = 0; i < bombs; i++) s += '💣 ';
        bombCountText.innerText = s || 'YOK';
    }

    function triggerGlitch() {
        glitchOverlay.classList.add('glitch-active');
        setTimeout(() => glitchOverlay.classList.remove('glitch-active'), 500);
    }

    function takeDamage(amount) {
        if (hasShield) {
            hasShield = false;
            document.getElementById('shield-effect').style.opacity = 0;
            createFloatingText(posX, player.offsetTop, "BLOKLANDI", "white");
            return;
        }
        hp -= amount;
        hpBar.style.width = (hp / maxHp * 100) + '%';
        triggerGlitch();
        if (hp <= 0) endGame(false);
    }

    function addScore(amount) {
        let multiplier = 1 + Math.floor(combo / 5);
        score += amount * multiplier;
        combo++;
        comboText.innerText = combo;
        comboBox.classList.add('combo-active');
        comboBox.classList.remove('combo-hidden');
        if (comboTimer) clearTimeout(comboTimer);
        comboTimer = setTimeout(() => {
            combo = 0;
            comboBox.classList.remove('combo-active');
            comboBox.classList.add('combo-hidden');
        }, 2000);
        if (!isOverdriveActive) {
            overdrive = Math.min(overdrive + (amount * 0.1), 100);
            overdriveBar.style.width = overdrive + '%';
            if (overdrive >= 100) activateOverdrive();
        }
    }

    function activateOverdrive() {
        isOverdriveActive = true;
        document.getElementById('overdrive-aura').style.opacity = 1;
        createFloatingText(posX, player.offsetTop, "OVERDRIVE!", "crit");
        let rapidFire = setInterval(() => shoot(), 100);
        setTimeout(() => {
            isOverdriveActive = false;
            document.getElementById('overdrive-aura').style.opacity = 0;
            clearInterval(rapidFire);
            overdrive = 0;
            overdriveBar.style.width = '0%';
        }, 5000);
    }

    function checkRect(r1, r2) { return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top); }

    function gameWin() {
        SoundManager.win();
        endGame(true);
    }

    function endGame(win) {
        gameState = 'GAME_OVER';
        document.getElementById('game-ui').style.display = 'none';
        document.body.classList.remove('slow-motion');
        saveData.money += collectedMoney;
        if (score > saveData.highScore) saveData.highScore = score;
        localStorage.setItem('galacticSaveV2', JSON.stringify(saveData));
        updateMainMenu();
        document.getElementById(win ? 'success-screen' : 'fail-screen').classList.add('active');
        document.getElementById(win ? 'final-score-win' : 'final-score-lose').innerText = score;
        document.getElementById(win ? 'loot-win' : 'loot-lose').innerText = collectedMoney;
    }
    [document.getElementById('stars-far'), document.getElementById('stars-mid'), document.getElementById('stars-near')].forEach((l, i) => {
        for (let j = 0; j < 50; j++) {
            let s = document.createElement('div');
            s.className = 'star';
            s.style.left = Math.random() * 100 + '%';
            s.style.top = Math.random() * 100 + '%';
            s.style.width = (i + 1) + 'px';
            s.style.height = (i + 1) + 'px';
            l.appendChild(s);
        }
    });
});