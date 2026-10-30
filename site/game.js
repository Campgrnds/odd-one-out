/* Odd One Out: Real or AI? (plain JavaScript, no build step) */
(function () {
  'use strict';

  // ---- Settings ------------------------------------------------------------
  const STARTING_LIVES = 5;        // hearts at the start of a game (e.g. change to 4)
  const POINTS_PER_CORRECT = 10;   // points for each correct answer
  const FEEDBACK_MS = 1000;        // how long "Correct!" / "Wrong" stays on screen
  const FLY_MS = 280;              // card exit animation (matches --flash-ms in style.css)
  const SWIPE_FRACTION = 0.22;     // drag past this share of the card width to answer
  const DRAG_STAMP_MAX = 0.55;     // stamp opacity while dragging (kept faint)

  const HEART_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 8 2.7 4.2 6.4 4.2c2.2 0 3.6 1.3 4.4 2.6.3.5 1.1.5 1.4 0 .8-1.3 2.2-2.6 4.4-2.6 3.7 0 5.5 3.8 4 7.1-2.1 4.6-9.6 9.2-9.6 9.2z"/></svg>';

  const images = Array.isArray(window.MANIFEST) ? window.MANIFEST : [];

  const byId = (id) => document.getElementById(id);
  const screens = { start: byId('screen-start'), game: byId('screen-game'), end: byId('screen-end') };
  const el = {
    startBtn: byId('start-btn'),
    againBtn: byId('again-btn'),
    noImages: byId('no-images'),
    btnAi: byId('btn-ai'),
    btnReal: byId('btn-real'),
    card: byId('card'),
    media: byId('card-media'),
    stampAi: byId('stamp-ai'),
    stampReal: byId('stamp-real'),
    feedback: byId('feedback'),
    hearts: byId('hearts'),
    score: byId('score'),
    scoreFloat: byId('score-float'),
    counter: byId('counter'),
    endTitle: byId('end-title'),
    endSub: byId('end-sub'),
    finalScore: byId('final-score'),
    statCorrect: byId('stat-correct'),
    statWrong: byId('stat-wrong'),
    statAccuracy: byId('stat-accuracy'),
  };

  let screen = 'start';
  let game = null;       // state for the game in progress
  let prepared = null;   // next game's shuffled deck, with its first image already loading
  let scoreFrame = 0;
  let drag = null;

  // ---- Helpers ---------------------------------------------------------------
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function isReal(item) {
    try { return atob(item.answer).slice(-2) === ':R'; } catch (e) { return false; }
  }

  function restartAnimation(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // reflow so the animation can play again
    node.classList.add(cls);
  }

  function showScreen(name) {
    screen = name;
    Object.keys(screens).forEach((key) => { screens[key].hidden = key !== name; });
  }

  // ---- Image loading ---------------------------------------------------------
  function loadImage(item, number) {
    const img = new Image();
    img.className = 'card-img';
    img.alt = 'Photo ' + number;   // neutral: never reveals the answer
    img.draggable = false;
    img.decoding = 'async';
    img.src = item.src;
    return img;
  }

  function whenReady(img) {
    if (img.decode) return img.decode().catch(() => {});
    return new Promise((resolve) => {
      if (img.complete) resolve();
      else img.onload = img.onerror = () => resolve();
    });
  }

  function prepareNextGame() {
    const deck = shuffle(images);
    prepared = { deck: deck, first: deck.length ? loadImage(deck[0], 1) : null };
  }

  // ---- Card ------------------------------------------------------------------
  function setPose(x, deg) {
    el.card.style.transform = x || deg ? 'translateX(' + x + 'px) rotate(' + deg + 'deg)' : '';
  }

  function setStamps(ai, real) {
    el.stampAi.style.opacity = ai;
    el.stampReal.style.opacity = real;
  }

  // Size the card to the photo's shape so there are no big empty bands around it.
  function fitCard() {
    const img = el.media.firstChild;
    const wrap = el.card.parentElement;
    if (!img || !img.naturalWidth || !wrap.clientWidth) {
      el.card.style.width = el.card.style.height = '';
      return;
    }
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = wrap.clientWidth;
    let h = w / ratio;
    if (h > wrap.clientHeight) {
      h = wrap.clientHeight;
      w = h * ratio;
    }
    el.card.style.width = Math.floor(w) + 'px';
    el.card.style.height = Math.floor(h) + 'px';
  }

  function resetCard() {
    el.card.classList.add('dragging'); // no transition while snapping back to centre
    el.card.classList.remove('leaving', 'is-correct', 'is-wrong', 'card-enter');
    setPose(0, 0);
    setStamps(0, 0);
    void el.card.offsetWidth;
    el.card.classList.remove('dragging');
  }

  function showCard(g, i) {
    const img = g.next || loadImage(g.deck[i], i + 1);
    g.next = null;
    return whenReady(img).then(() => {
      if (game !== g) return; // a new game started while this image loaded
      el.media.replaceChildren(img);
      resetCard();
      fitCard();
      restartAnimation(el.card, 'card-enter');
      el.counter.textContent = 'Image ' + (i + 1) + ' of ' + g.deck.length;
      if (i + 1 < g.deck.length) g.next = loadImage(g.deck[i + 1], i + 2); // preload the next one
      g.locked = false;
    });
  }

  // ---- HUD -------------------------------------------------------------------
  function renderHearts(lives) {
    el.hearts.innerHTML = '';
    for (let i = 0; i < STARTING_LIVES; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart' + (i < lives ? '' : ' lost');
      heart.innerHTML = HEART_SVG;
      el.hearts.appendChild(heart);
    }
    labelHearts(lives);
  }

  function labelHearts(lives) {
    el.hearts.setAttribute('aria-label', lives + (lives === 1 ? ' life' : ' lives') + ' left');
  }

  function breakHeart(lives) {
    const heart = el.hearts.children[lives];
    labelHearts(lives);
    if (!heart) return;
    restartAnimation(heart, 'breaking');
    heart.classList.add('lost');
  }

  function animateScore(g) {
    cancelAnimationFrame(scoreFrame);
    const from = g.shownScore;
    const to = g.score;
    const start = performance.now();
    const duration = 450;
    restartAnimation(el.score, 'bump');
    el.scoreFloat.textContent = '+' + POINTS_PER_CORRECT;
    restartAnimation(el.scoreFloat, 'go');
    const step = (now) => {
      if (game !== g) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      g.shownScore = Math.round(from + (to - from) * eased);
      el.score.textContent = g.shownScore;
      if (t < 1) scoreFrame = requestAnimationFrame(step);
    };
    scoreFrame = requestAnimationFrame(step);
  }

  function showFeedback(correct, real) {
    el.feedback.className = 'feedback show ' + (correct ? 'is-correct' : 'is-wrong');
    el.feedback.innerHTML = correct ? 'Correct!' : 'Wrong, that was ' + (real ? 'REAL' : 'AI');
  }

  function hideFeedback() {
    el.feedback.className = 'feedback';
  }

  function flashButton(button) {
    restartAnimation(button, 'pressed');
    setTimeout(() => button.classList.remove('pressed'), 160);
  }

  // ---- Game flow -------------------------------------------------------------
  function startGame() {
    if (!images.length) return;
    if (!prepared) prepareNextGame();

    cancelAnimationFrame(scoreFrame);
    const g = {
      deck: prepared.deck,
      next: prepared.first,
      index: 0,
      lives: STARTING_LIVES,
      score: 0,
      shownScore: 0,
      correct: 0,
      wrong: 0,
      locked: true, // unlocked once the first image is on screen
    };
    prepared = null;
    game = g;

    renderHearts(g.lives);
    el.score.textContent = '0';
    el.score.classList.remove('bump');
    el.scoreFloat.classList.remove('go');
    el.counter.textContent = 'Image 1 of ' + g.deck.length;
    hideFeedback();
    resetCard();
    el.media.replaceChildren();
    showScreen('game');
    showCard(g, 0);
  }

  function choose(guessReal) {
    const g = game;
    if (screen !== 'game' || !g || g.locked) return;
    g.locked = true; // blocks double presses until the next card is shown

    const real = isReal(g.deck[g.index]);
    const correct = guessReal === real;
    const dir = guessReal ? 1 : -1;
    const hold = Math.min(28, el.card.offsetWidth * 0.04);

    flashButton(guessReal ? el.btnReal : el.btnAi);
    el.card.classList.remove('dragging', 'card-enter');
    el.card.classList.add(correct ? 'is-correct' : 'is-wrong');
    setPose(dir * hold, dir * 2.5);
    setStamps(guessReal ? 0 : 0.9, guessReal ? 0.9 : 0);
    showFeedback(correct, real);

    if (correct) {
      g.correct++;
      g.score += POINTS_PER_CORRECT;
      animateScore(g);
    } else {
      g.wrong++;
      g.lives--;
      breakHeart(g.lives);
    }

    setTimeout(() => {
      if (game !== g) return;
      hideFeedback();
      el.card.classList.add('leaving');
      setPose(dir * (window.innerWidth * 0.9), dir * 22);
      setTimeout(() => {
        if (game !== g) return;
        g.index++;
        if (g.lives <= 0) endGame(g, 'lives');
        else if (g.index >= g.deck.length) endGame(g, 'complete');
        else showCard(g, g.index);
      }, FLY_MS);
    }, FEEDBACK_MS);
  }

  function endGame(g, reason) {
    g.locked = true;
    const total = g.deck.length;
    const answered = g.correct + g.wrong;
    const accuracy = answered ? Math.round((g.correct / answered) * 100) : 0;

    el.endTitle.textContent = reason === 'lives' ? 'Out of lives!' : 'You made it through every image!';
    el.endSub.textContent =
      reason === 'lives'
        ? 'You answered ' + answered + ' of ' + total + ' images before your hearts ran out.'
        : 'You answered all ' + total + ' images with ' + g.lives + (g.lives === 1 ? ' heart' : ' hearts') + ' left.';
    el.finalScore.textContent = g.score;
    el.statCorrect.textContent = g.correct;
    el.statWrong.textContent = g.wrong;
    el.statAccuracy.textContent = accuracy + '%';

    screens.end.classList.remove('reason-lives', 'reason-complete');
    screens.end.classList.add('reason-' + reason);
    showScreen('end');
    // Focus the heading, not the button, so a stray key press can't wipe the results.
    el.endTitle.focus();
    prepareNextGame();
  }

  // ---- Drag / swipe (mouse, touch, and pen via Pointer Events) ----------------
  el.card.addEventListener('pointerdown', (e) => {
    if (screen !== 'game' || !game || game.locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, dx: 0, t: performance.now() };
    try { el.card.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    el.card.classList.remove('card-enter');
    el.card.classList.add('dragging');
  });

  el.card.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    const width = el.card.offsetWidth || 1;
    const progress = Math.min(1, Math.abs(drag.dx) / (width * SWIPE_FRACTION));
    setPose(drag.dx, (drag.dx / width) * 14);
    setStamps(drag.dx < 0 ? progress * DRAG_STAMP_MAX : 0, drag.dx > 0 ? progress * DRAG_STAMP_MAX : 0);
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    el.card.classList.remove('dragging');
    const width = el.card.offsetWidth || 1;
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.t); // px per ms
    const committed = Math.abs(d.dx) > width * SWIPE_FRACTION || (Math.abs(d.dx) > 50 && speed > 0.6);
    if (!cancelled && committed && game && !game.locked) {
      choose(d.dx > 0);
    } else {
      setPose(0, 0);
      setStamps(0, 0);
    }
  }

  el.card.addEventListener('pointerup', (e) => endDrag(e, false));
  el.card.addEventListener('pointercancel', (e) => endDrag(e, true));
  el.card.addEventListener('lostpointercapture', (e) => endDrag(e, true));
  el.card.addEventListener('dragstart', (e) => e.preventDefault());

  // Keep the card fitted when the window resizes or a Chromebook rotates.
  if (window.ResizeObserver) new ResizeObserver(fitCard).observe(el.card.parentElement);
  else window.addEventListener('resize', fitCard);

  // ---- Buttons and keyboard --------------------------------------------------
  el.btnAi.addEventListener('click', () => choose(false));
  el.btnReal.addEventListener('click', () => choose(true));
  el.startBtn.addEventListener('click', startGame);
  el.againBtn.addEventListener('click', startGame);

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (screen === 'start' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      startGame();
    } else if (screen === 'game' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (!e.repeat) choose(e.key === 'ArrowRight');
    }
  });

  // ---- Init ------------------------------------------------------------------
  byId('start-lives').textContent = STARTING_LIVES;
  byId('start-points').textContent = POINTS_PER_CORRECT;
  if (!images.length) {
    el.startBtn.disabled = true;
    el.noImages.hidden = false;
  } else {
    prepareNextGame(); // warms up the first image while students read the start screen
  }

  // Exposed for automated testing only; contains no answers.
  window.__oddOneOut = {
    get screen() { return screen; },
    get stats() {
      return game && { index: game.index, lives: game.lives, score: game.score, correct: game.correct, wrong: game.wrong, total: game.deck.length, locked: game.locked };
    },
  };
})();
