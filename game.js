(() => {
  'use strict';

  const C = window.BloomwildCore;
  const $ = id => document.getElementById(id);
  const canvas = $('world');
  const ctx = canvas.getContext('2d');
  const dialog = $('game-dialog');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const directions = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left' };
  let state = null;
  let battle = null;
  let route = [];
  let heldDirection = null;
  let lastStep = -Infinity;
  let grassSteps = 0;
  let encounterCooldown = 3;
  let visual = { x: 8, y: 10, fromX: 8, fromY: 10, at: 0 };
  let toastTimer;
  let saveTimer;
  let dialogKind = '';
  let storageAvailable = true;
  let unreadableSave = false;
  let previousFrame = 0;
  const creatureImages = {};

  for (const id of Object.keys(C.SPECIES)) {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(C.art(id, false))}`;
    creatureImages[id] = image;
  }

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function typeTag(species) {
    const type = C.TYPES[C.SPECIES[species].type];
    return `<span class="type-tag" style="--type-bg:${type.background};--type-ink:${type.color}">${type.name}</span>`;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!state || battle || unreadableSave) return;
    try {
      localStorage.setItem(C.SAVE_KEY, JSON.stringify(state));
      storageAvailable = true;
      $('save-status').textContent = 'All tucked away. Progress saved on this device.';
      $('save-dot').style.background = '#a7b994';
    } catch {
      storageAvailable = false;
      $('save-status').textContent = 'Autosave unavailable — export a backup in Save options';
      $('save-dot').style.background = '#c99870';
    }
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function setVisual() {
    visual = { x: state.player.x, y: state.player.y, fromX: state.player.x, fromY: state.player.y, at: 0 };
  }

  function healthMarkup(creature, label = 'HEALTH') {
    const max = C.maxHP(creature);
    const percentage = Math.max(0, creature.hp / max * 100);
    return `<div class="health-caption"><span>${label}</span><strong>${creature.hp} / ${max} HP</strong></div><div class="health-bar ${percentage < 30 ? 'low' : ''}" role="progressbar" aria-label="${C.SPECIES[creature.species].name} health" aria-valuenow="${creature.hp}" aria-valuemin="0" aria-valuemax="${max}"><span style="width:${percentage}%"></span></div>`;
  }

  function renderUI() {
    if (!state) return;
    const lead = state.team[0];
    const species = C.SPECIES[lead.species];
    $('companion-content').innerHTML = `<div class="buddy-art">${C.art(lead.species)}</div><div class="buddy-title"><h3>${species.name}</h3><span class="level">Lv. ${lead.level}</span></div><div>${typeTag(lead.species)}<span class="buddy-vibe">${species.vibe}</span></div>${healthMarkup(lead)}<div class="xp-caption"><span>${lead.level === 20 ? 'MAX LEVEL' : 'GROWING TOGETHER'}</span><span>${lead.level === 20 ? 'A lifelong friendship' : `${lead.xp} / ${lead.level * 18} XP`}</span></div>`;
    $('capsule-count').textContent = state.capsules;
    $('journal-count').textContent = `${state.caught.length}/8`;
    const quests = [
      ['Choose your first companion', true],
      ['Befriend a wild creature', state.captures > 0],
      ['Discover all three habitats', state.visited.length === 3],
      ['Meet the meadow guardian', state.guardian]
    ];
    $('quest-list').innerHTML = quests.map(([text, done]) => `<li class="${done ? 'done' : ''}"><span class="quest-check">${done ? icon('check') : ''}</span>${text}</li>`).join('');
    const complete = quests.filter(q => q[1]).length;
    $('quest-progress').style.width = `${complete / quests.length * 100}%`;
    $('quest-caption').textContent = complete === 4 ? 'A little island. A whole lot of memories.' : `${complete} of 4 little milestones`;
    const place = C.region(state.player.x, state.player.y);
    $('location-name').textContent = place;
    $('map-status').textContent = C.tileAt(state.player.x, state.player.y) === 'grass' ? 'Someone might be hiding here…' : place === 'Ripplebank' ? 'Follow the sound of the stream' : place === 'Amber Grove' ? 'A little deeper into the green' : 'Take the scenic route';
    $('camp-button').disabled = Boolean(battle);
    $('interact-button').disabled = Boolean(battle);
  }

  function showDialog(kind, content, closable = true) {
    route = [];
    heldDirection = null;
    dialogKind = kind;
    $('dialog-content').innerHTML = `<div class="dialog-inner">${content}</div>`;
    if (!dialog.open) dialog.showModal();
    const close = $('close-dialog');
    if (close && closable) close.onclick = closeDialog;
  }

  function header(eyebrow, title, subtitle = '', closable = true) {
    return `<div class="dialog-header"><div><div class="eyebrow">${eyebrow}</div><h2 id="dialog-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${closable ? `<button class="icon-button" id="close-dialog" aria-label="Close dialog">${icon('close')}</button>` : ''}</div>`;
  }

  function closeDialog() {
    dialog.close();
    dialogKind = '';
    if (!battle) canvas.focus({ preventScroll: true });
  }

  function showStarters() {
    showDialog('starter', `${header('FERNVEIL ISLAND IS WAITING', 'Every adventure starts with a friend.', 'Three little companions. One big first step. Who will explore the island with you?', false)}<div class="starter-grid">${C.STARTERS.map(id => {
      const species = C.SPECIES[id];
      return `<button class="starter-choice" data-starter="${id}" style="--glow:${C.TYPES[species.type].background}"><div class="starter-art">${C.art(id)}</div><h3>${species.name}</h3>${typeTag(id)}<p>${species.description}</p><span class="choose-label">Choose ${species.name} ${icon('arrow')}</span></button>`;
    }).join('')}</div><p class="dialog-footnote"><strong>No wrong choices. Just new beginnings.</strong><br>All three can be found in the wild. Your adventure saves automatically on this device.</p>`, false);
    dialog.querySelectorAll('[data-starter]').forEach(button => {
      button.onclick = () => {
        state = C.freshState(button.dataset.starter);
        unreadableSave = false;
        setVisual();
        closeDialog();
        renderUI();
        saveNow();
        toast(`${C.SPECIES[state.team[0].species].name} joined you! Walk into tall grass to meet a wild friend.`);
      };
    });
  }

  function showHelp() {
    if (!state) return;
    showDialog('help', `${header('A FIELD GUIDE FOR CURIOUS SOULS', 'A little help for the road.', 'There’s no rush. Explore at your own pace and make a few friends along the way.')}<div class="help-grid"><section class="help-item"><h3>Wander the island</h3><p>Move with <strong>W A S D</strong> or <strong>arrow keys</strong>. Click or tap a walkable spot to go there. On a phone, you can also use the direction buttons. Trees and water block your path; wooden bridges cross the stream.</p></section><section class="help-item"><h3>Make a wild friend</h3><p>Walk through tall grass to find creatures. Weaken one with attacks, then throw a <strong>Bloom capsule</strong>. Lower health makes catching easier. You can also flee any encounter.</p></section><section class="help-item"><h3>Know your strengths</h3><p><strong>Leaf beats Tide. Tide beats Flame. Flame beats Leaf.</strong> Spark beats Tide, and Earth beats Spark. Typed attacks are weaker against the same type. Breathe restores health and reduces the next hit.</p></section><section class="help-item"><h3>Take good care</h3><p><strong>Rest at camp</strong> heals everyone and refills your capsules to at least 10. Your first team member leads battles. Switch companions in My team. Extra catches stay with Mira at camp.</p></section><section class="help-item"><h3>Follow your curiosity</h3><p>Press <strong>E</strong> or Interact beside the orange-roofed camp, Mira by the central path, or the little shrine across the north bridge. Meet the guardian after catching a wild creature and discovering all three habitats.</p></section><section class="help-item"><h3>Keep your memories</h3><p>Progress saves automatically <strong>outside battles</strong>. Refreshing during a battle returns to your last checkpoint. Save options lets you export or import a backup. Browser saves don’t sync between devices.</p></section></div><div class="dialog-actions"><button class="primary-button" id="back-to-adventure">Back to the adventure ${icon('arrow')}</button></div>`);
    $('back-to-adventure').onclick = closeDialog;
  }

  function showJournal() {
    if (!state) return;
    showDialog('journal', `${header('THE LITTLE THINGS YOU FIND', 'Your field journal.', `${state.caught.length} of 8 species befriended · ${state.seen.length} spotted · Three habitats to explore`)}<div class="journal-grid">${Object.entries(C.SPECIES).map(([id, species], index) => {
      const seen = state.seen.includes(id);
      const caught = state.caught.includes(id);
      return `<article class="journal-entry ${seen ? '' : 'unknown'}"><span class="entry-number">NO. ${String(index + 1).padStart(3, '0')}</span><div class="journal-art">${C.art(id, seen)}</div><h3>${seen ? species.name : 'Undiscovered'}</h3>${seen ? typeTag(id) : '<span class="type-tag">???</span>'}<p>${seen ? species.description : `A little mystery waiting in ${species.habitat}.`}</p><span class="entry-status">${caught ? 'Befriended' : seen ? 'Spotted in the wild' : species.habitat}</span></article>`;
    }).join('')}</div><p class="dialog-footnote">A journal isn’t about filling every page. But it’s rather nice when you do.</p>`);
  }

  function memberMarkup(creature, index, reserve = false, inBattle = false) {
    const species = C.SPECIES[creature.species];
    const active = !reserve && (battle ? battle.active === index : index === 0);
    return `<article class="team-member ${active ? 'is-lead' : ''}"><div class="member-art">${C.art(creature.species)}</div><div><h3>${species.name} <span class="level">Lv. ${creature.level}</span></h3>${typeTag(creature.species)}${healthMarkup(creature)}<button class="secondary-button" data-${reserve ? 'reserve' : 'member'}="${index}" ${active || (inBattle && creature.hp === 0) ? 'disabled' : ''}>${reserve ? 'Bring along' : active ? inBattle ? 'In battle' : 'Adventure buddy' : creature.hp === 0 && inBattle ? 'Needs a rest' : inBattle ? 'Switch in' : 'Make lead buddy'}</button></div></article>`;
  }

  function showTeam(inBattle = false) {
    if (!state) return;
    if (battle) {
      if (battle.busy) return toast('Let this turn finish first.');
      if (battle.over) return toast('Head back to the sunshine before changing your team.');
      inBattle = true;
    }
    showDialog('team', `${header('GOOD COMPANY, GREAT ADVENTURES', inBattle ? 'Who’s up next?' : 'Your little crew.', inBattle ? 'Switching uses your turn. A free switch follows a faint.' : 'Your lead buddy walks with you and starts each battle. Up to six companions can travel together.')}<div class="roster">${state.team.map((creature, i) => memberMarkup(creature, i, false, inBattle)).join('')}</div>${!inBattle && state.reserve.length ? `<div class="dialog-header" style="margin-top:26px"><div><h2>Hanging out at camp</h2><p>Mira is looking after these friends. Bring one along by swapping a team member.</p></div></div><div class="roster">${state.reserve.map((creature, i) => memberMarkup(creature, i, true)).join('')}</div>` : ''}`);
    dialog.querySelectorAll('[data-member]').forEach(button => {
      button.onclick = () => {
        const index = Number(button.dataset.member);
        if (inBattle) {
          const free = state.team[battle.active].hp === 0;
          battle.active = index;
          closeDialog();
          renderBattle();
          if (free) {
            battle.busy = false;
            setBattleMessage(`${C.SPECIES[state.team[index].species].name} is ready to help!`);
            renderBattleActions();
          } else {
            battle.busy = true;
            setBattleMessage(`Come on in, ${C.SPECIES[state.team[index].species].name}!`);
            renderBattleActions();
            setTimeout(() => enemyTurn(false), 600);
          }
        } else {
          [state.team[0], state.team[index]] = [state.team[index], state.team[0]];
          renderUI();
          saveNow();
          showTeam();
        }
      };
    });
    dialog.querySelectorAll('[data-reserve]').forEach(button => {
      button.onclick = () => {
        const index = Number(button.dataset.reserve);
        if (state.team.length < 6) {
          state.team.push(state.reserve.splice(index, 1)[0]);
          renderUI();
          saveNow();
          showTeam();
          return;
        }
        showReserveSwap(index);
      };
    });
  }

  function showReserveSwap(reserveIndex) {
    const friend = state.reserve[reserveIndex];
    showDialog('swap', `${header('A CHANGE OF COMPANY', `Make room for ${C.SPECIES[friend.species].name}.`, 'Choose someone to rest at camp. They’ll be waiting with Mira whenever you want them back.')}<div class="roster">${state.team.map((c, i) => `<article class="team-member"><div class="member-art">${C.art(c.species)}</div><div><h3>${C.SPECIES[c.species].name}</h3><span class="level">Lv. ${c.level}</span><br><button class="secondary-button" data-swap="${i}">Rest at camp</button></div></article>`).join('')}</div>`);
    dialog.querySelectorAll('[data-swap]').forEach(button => {
      button.onclick = () => {
        const i = Number(button.dataset.swap);
        [state.team[i], state.reserve[reserveIndex]] = [state.reserve[reserveIndex], state.team[i]];
        renderUI();
        saveNow();
        showTeam();
      };
    });
  }

  function restAtCamp() {
    if (!state || battle) return;
    route = [];
    heldDirection = null;
    for (const creature of [...state.team, ...state.reserve]) creature.hp = C.maxHP(creature);
    state.capsules = Math.max(state.capsules, 10);
    state.player = { x: 5, y: 6, facing: 'up' };
    encounterCooldown = 5;
    setVisual();
    renderUI();
    saveNow();
    if (dialog.open) closeDialog();
    toast('A little rest works wonders. Everyone is healed, and your capsules are restocked.');
  }

  function near(target) {
    return Math.abs(state.player.x - target.x) + Math.abs(state.player.y - target.y) <= 2;
  }

  function interact() {
    if (!state || battle || dialog.open) return;
    if (near(C.CAMP)) {
      showDialog('camp', `${header('A SMALL HOME AWAY FROM HOME', 'Welcome back to camp.', 'There’s a warm kettle, a soft blanket, and a spot for every one of your friends.')}<div class="notice-box">Rest here to completely heal your team and refill your bag to at least <strong>10 Bloom capsules</strong>. No coins, no waiting. Just a little kindness.</div><div class="dialog-actions"><button class="primary-button" id="rest-now">Settle in for a little rest ${icon('heart')}</button><button class="secondary-button" id="camp-team">See my companions</button></div>`);
      $('rest-now').onclick = restAtCamp;
      $('camp-team').onclick = () => showTeam();
    } else if (near(C.GUIDE)) {
      state.guideMet = true;
      saveNow();
      showDialog('guide', `${header('MIRA · YOUR FRIEND AT CAMP', '“Oh, hello there, explorer!”', '“The island has a way of introducing you to just the right friend.”')}<div class="notice-box">“The meadow’s grass is full of gentle creatures. Follow the path north to <strong>Amber Grove</strong>, or cross the stream to <strong>Ripplebank</strong>.<br><br>There’s an old shrine just over the north bridge. The guardian sometimes appears to explorers who’ve <strong>befriended a wild creature</strong> and <strong>visited all three habitats</strong>.<br><br>And remember — a tired team can always come home to camp.”</div><div class="dialog-actions"><button class="primary-button" id="thanks-mira">Thanks, Mira ${icon('arrow')}</button></div>`);
      $('thanks-mira').onclick = closeDialog;
    } else if (near(C.SHRINE)) {
      if (state.guardian) {
        showDialog('shrine', `${header('THE OLD MEADOW SHRINE', 'A familiar, friendly rustle.', 'The guardian remembers you. The little bells in the branches sound almost like a welcome.')}<div class="notice-box">You’ve completed your first little adventure. There are still friends to find, a journal to fill, and plenty of sunshine to enjoy.</div>`);
      } else if (state.captures < 1 || state.visited.length < 3) {
        showDialog('shrine', `${header('THE OLD MEADOW SHRINE', 'Something stirs in the leaves.', 'An old carving reads: “To those who wander kindly, the forest opens its heart.”')}<div class="notice-box">Befriend a wild creature and visit <strong>Sunpetal Meadow</strong>, <strong>Amber Grove</strong>, and <strong>Ripplebank</strong>. Then return here to meet the guardian.<br><br>${state.captures > 0 ? 'Wild friendship: found' : 'Wild friendship: still waiting'} · Habitats explored: ${state.visited.length} / 3</div>`);
      } else {
        showDialog('shrine', `${header('THE FOREST HAS NOTICED YOUR KINDNESS', 'A guardian wants to say hello.', 'A rather determined Bramblet steps out of the leaves. It looks like it wants a friendly challenge.')}<div class="celebration-art">${C.art('bramblet')}</div><div class="notice-box">The guardian is level 6. Win the battle <strong>or catch it</strong> to earn its trust. You can leave and return if your team needs a rest.</div><div class="dialog-actions"><button class="primary-button" id="meet-guardian">Meet the guardian ${icon('leaf')}</button><button class="secondary-button" id="not-yet">Maybe in a little while</button></div>`);
        $('meet-guardian').onclick = () => {
          closeDialog();
          startBattle(C.makeCreature('bramblet', 6), true);
        };
        $('not-yet').onclick = closeDialog;
      }
    } else {
      toast('Get a little closer to Mira, the camp, or the shrine across the north bridge.');
    }
  }

  function exportSave() {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bloomwild-adventure.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Your adventure backup is ready to keep somewhere safe.');
  }

  function applyImport(imported) {
    state = imported;
    unreadableSave = false;
    grassSteps = 0;
    encounterCooldown = 5;
    setVisual();
    closeDialog();
    renderUI();
    saveNow();
    toast('Welcome back. Your saved adventure is ready.');
  }

  function showSettings() {
    if (battle) return toast('Finish this encounter before managing your save.');
    showDialog('settings', `${header('KEEP YOUR LITTLE MEMORIES SAFE', 'Your adventure, tucked away.', storageAvailable ? 'Your progress is stored in this browser. Keep a backup before changing devices or clearing browser data.' : 'This browser is blocking local saves. Export a backup before you close the page.')}<div class="settings-stack"><div class="settings-row"><div><h3>Export a backup</h3><p>Download your team, journal, and progress as a small file.</p></div><button class="secondary-button" id="export-save" ${state ? '' : 'disabled'}>Export save</button></div><div class="settings-row"><div><h3>Bring back an adventure</h3><p>Import a Bloomwild save file. You’ll confirm before replacing anything.</p></div><button class="secondary-button" id="import-save">Import save</button><input class="file-input" type="file" id="save-file" accept=".json,application/json"></div><div class="settings-row"><div><h3>A fresh beginning</h3><p>Start again with a new companion. Export first to keep this adventure.</p></div><button class="secondary-button danger-button" id="new-adventure">New adventure</button></div></div>`);
    $('export-save').onclick = exportSave;
    $('import-save').onclick = () => $('save-file').click();
    $('save-file').onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 100000) return toast('That file is too large to be a Bloomwild save.');
      let imported;
      try {
        imported = C.parseSave(await file.text());
      } catch {
        return toast('That file could not be read. Please try another backup.');
      }
      if (!imported) return toast('That doesn’t look like a valid Bloomwild save. Your current adventure is safe.');
      showDialog('confirm-import', `${header('ONE ADVENTURE FOR ANOTHER', 'Restore this adventure?', `This backup contains ${imported.team.length} traveling companions and ${imported.caught.length} befriended species.`)}<div class="notice-box">Importing replaces the adventure currently saved in this browser. Cancel and export first if you’d like to keep it.</div><div class="dialog-actions"><button class="primary-button" id="confirm-import">Restore backup</button><button class="secondary-button" id="cancel-import">Keep current adventure</button></div>`);
      $('confirm-import').onclick = () => applyImport(imported);
      $('cancel-import').onclick = showSettings;
    };
    $('new-adventure').onclick = () => {
      showDialog('confirm-reset', `${header('A NEW FIRST CHAPTER', 'Start a fresh adventure?')}<div class="notice-box">Your current team, journal, and progress on this device will be replaced when you choose a new starter. This cannot be undone without an exported backup.</div><div class="dialog-actions"><button class="primary-button danger-button" id="confirm-reset">Yes, start again</button><button class="secondary-button" id="cancel-reset">Keep my adventure</button></div>`);
      $('confirm-reset').onclick = () => {
        grassSteps = 0;
        encounterCooldown = 3;
        showStarters();
      };
      $('cancel-reset').onclick = showSettings;
    };
  }

  function move(direction, now = performance.now()) {
    if (!state || battle || dialog.open || now - lastStep < 145) return false;
    lastStep = now;
    state.player.facing = direction;
    const [dx, dy] = directions[direction];
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (!C.walkable(x, y)) return false;
    visual.fromX = state.player.x;
    visual.fromY = state.player.y;
    visual.at = now;
    state.player.x = x;
    state.player.y = y;
    state.steps++;
    const place = C.region(x, y);
    if (!state.visited.includes(place)) {
      state.visited.push(place);
      toast(`A new corner of the island: ${place}.`);
    }
    renderUI();
    saveSoon();
    if (encounterCooldown > 0) encounterCooldown--;
    if (C.tileAt(x, y) === 'grass') {
      grassSteps++;
      if (encounterCooldown === 0 && (Math.random() < .18 || grassSteps >= 8)) {
        grassSteps = 0;
        startBattle(C.wildCreature(place, state.team[0].level));
      }
    }
    return true;
  }

  function setBattleMessage(message) {
    $('battle-message').textContent = message;
  }

  function startBattle(enemy, guardian = false) {
    if (battle) return;
    const active = state.team.findIndex(creature => creature.hp > 0);
    if (active < 0) {
      restAtCamp();
      return;
    }
    saveNow();
    route = [];
    heldDirection = null;
    battle = { enemy, active, guardian, busy: false, over: false };
    if (!state.seen.includes(enemy.species)) state.seen.push(enemy.species);
    $('battle-view').hidden = false;
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true');
    $('encounter-flash').classList.remove('flash');
    void $('encounter-flash').offsetWidth;
    $('encounter-flash').classList.add('flash');
    $('battle-terrain').textContent = guardian ? 'The old meadow shrine' : C.region(state.player.x, state.player.y);
    renderBattle();
    renderUI();
    setBattleMessage(guardian ? 'The meadow guardian offers a friendly challenge!' : `A wild ${C.SPECIES[enemy.species].name} peeks out of the grass!`);
    $('battle-actions').querySelector('button')?.focus({ preventScroll: true });
  }

  function renderBattle() {
    if (!battle) return;
    const ally = state.team[battle.active];
    for (const [side, creature] of [['enemy', battle.enemy], ['ally', ally]]) {
      $(side + '-stat').innerHTML = `<h3>${C.SPECIES[creature.species].name}<span>Lv. ${creature.level}</span></h3>${typeTag(creature.species)}${healthMarkup(creature, side === 'enemy' ? battle.guardian ? 'MEADOW GUARDIAN' : 'WILD CREATURE' : 'YOUR COMPANION')}`;
      $(side + '-art').innerHTML = C.art(creature.species);
    }
    renderBattleActions();
  }

  function renderBattleActions() {
    if (!battle) return;
    const container = $('battle-actions');
    if (battle.over) {
      container.innerHTML = '<button class="battle-action attack" id="leave-battle" style="grid-column:1/-1">Back to the sunshine</button>';
      $('leave-battle').onclick = leaveBattle;
      return;
    }
    const ally = state.team[battle.active];
    const type = C.TYPES[C.SPECIES[ally.species].type];
    if (ally.hp === 0) {
      container.innerHTML = `<button class="battle-action attack" id="choose-next" style="grid-column:1/-1" ${battle.busy ? 'disabled' : ''}>Choose your next companion</button>`;
      $('choose-next').onclick = () => showTeam(true);
      return;
    }
    const chance = Math.round(C.catchChance(battle.enemy, battle.guardian) * 100);
    container.innerHTML = `<button class="battle-action attack" data-action="attack">Gentle bop<small>Steady · neutral</small></button><button class="battle-action type-attack" data-action="typed" style="--type-bg:${type.background};--type-ink:${type.color}">${type.move}<small>${type.name} attack</small></button><button class="battle-action catch" data-action="catch" ${state.capsules === 0 || (state.team.length >= 6 && state.reserve.length >= 42) ? 'disabled' : ''}>Capsule · ${state.capsules}<small>${chance}% catch chance</small></button><button class="battle-action" data-action="breathe">Breathe<small>Heal & guard</small></button><button class="battle-action" data-action="flee">Leave<small>Always safe</small></button>${state.team.filter(c => c.hp > 0).length > 1 ? '<button class="battle-action switch-action" data-action="switch">Switch companion</button>' : ''}`;
    container.querySelectorAll('[data-action]').forEach(button => {
      if (battle.busy) button.disabled = true;
      button.onclick = () => battleAction(button.dataset.action);
    });
  }

  function animateHit(side) {
    const element = $(side + '-art');
    element.classList.remove('hit');
    void element.offsetWidth;
    element.classList.add('hit');
    setTimeout(() => element.classList.remove('hit'), 450);
  }

  function effectText(attacker, defender) {
    const effectiveness = C.multiplier(C.SPECIES[attacker.species].type, C.SPECIES[defender.species].type);
    return effectiveness > 1 ? ' A perfect match-up!' : effectiveness < 1 ? ' Not very effective.' : '';
  }

  function battleAction(action) {
    if (!battle || battle.busy || battle.over) return;
    if (action === 'switch') return showTeam(true);
    if (action === 'flee') {
      setBattleMessage('You wave goodbye and leave the little creature in peace.');
      battle.over = true;
      renderBattleActions();
      return;
    }
    battle.busy = true;
    renderBattleActions();
    const ally = state.team[battle.active];
    const allyName = C.SPECIES[ally.species].name;
    if (action === 'catch') {
      if (!state.capsules || (state.team.length >= 6 && state.reserve.length >= 42)) {
        battle.busy = false;
        renderBattleActions();
        return;
      }
      state.capsules--;
      renderUI();
      const caught = Math.random() < C.catchChance(battle.enemy, battle.guardian);
      const orb = document.createElement('div');
      orb.className = 'capture-orb';
      document.querySelector('.battle-scene').append(orb);
      $('enemy-art').style.opacity = '.2';
      setBattleMessage('A little capsule, a little hope…');
      setTimeout(() => {
        orb.remove();
        $('enemy-art').style.opacity = '';
        if (caught) finishBattle(true);
        else {
          setBattleMessage(`${C.SPECIES[battle.enemy.species].name} popped back out! Lower its health and try again.`);
          setTimeout(() => enemyTurn(false), 850);
        }
      }, reducedMotion ? 350 : 1500);
    } else if (action === 'breathe') {
      const heal = Math.min(C.maxHP(ally) - ally.hp, Math.ceil(C.maxHP(ally) * .25));
      ally.hp += heal;
      setBattleMessage(`${allyName} takes a deep breath. Recovered ${heal} HP and braced for the next hit.`);
      renderBattle();
      renderUI();
      setTimeout(() => enemyTurn(true), 900);
    } else {
      const typed = action === 'typed';
      const amount = C.damage(ally, battle.enemy, typed);
      battle.enemy.hp = Math.max(0, battle.enemy.hp - amount);
      renderBattle();
      animateHit('enemy');
      setBattleMessage(`${allyName} used ${typed ? C.TYPES[C.SPECIES[ally.species].type].move : 'Gentle bop'} for ${amount} damage.${typed ? effectText(ally, battle.enemy) : ''}`);
      setTimeout(() => {
        if (battle.enemy.hp === 0) finishBattle(false);
        else enemyTurn(false);
      }, 950);
    }
  }

  function enemyTurn(guarded) {
    if (!battle || battle.over) return;
    const ally = state.team[battle.active];
    const typed = Math.random() > .35;
    const amount = Math.max(1, Math.round(C.damage(battle.enemy, ally, typed) * (guarded ? .4 : 1)));
    ally.hp = Math.max(0, ally.hp - amount);
    renderBattle();
    renderUI();
    animateHit('ally');
    setBattleMessage(`${C.SPECIES[battle.enemy.species].name} used ${typed ? C.TYPES[C.SPECIES[battle.enemy.species].type].move : 'Gentle bop'} for ${amount} damage.${guarded ? ' Your guard softened the hit.' : typed ? effectText(battle.enemy, ally) : ''}`);
    setTimeout(() => {
      if (!battle) return;
      battle.busy = false;
      if (ally.hp === 0) {
        if (state.team.every(c => c.hp === 0)) {
          battle.over = true;
          battle.defeat = true;
          setBattleMessage('Your friends need a little rest. Mira will bring everyone safely back to camp.');
        } else {
          setBattleMessage(`${C.SPECIES[ally.species].name} needs a breather. Choose another companion to help.`);
        }
      }
      renderBattleActions();
    }, 650);
  }

  function finishBattle(caught) {
    const enemy = battle.enemy;
    const name = C.SPECIES[enemy.species].name;
    let message;
    if (caught) {
      const friend = { ...enemy, hp: C.maxHP(enemy), xp: 0 };
      if (state.team.length < 6) state.team.push(friend);
      else state.reserve.push(friend);
      if (!state.caught.includes(enemy.species)) state.caught.push(enemy.species);
      state.captures++;
      message = `${name} is your new friend! ${state.team.includes(friend) ? 'It joined your team.' : 'Mira will look after it at camp.'}`;
    } else {
      state.wins++;
      state.capsules = Math.min(99, state.capsules + 2);
      message = `${name} bounds off for a rest. A friendly win! You found 2 Bloom capsules.`;
    }
    const xp = caught ? 10 + enemy.level * 3 : 14 + enemy.level * 5;
    const ally = state.team[battle.active];
    const levels = C.addXP(ally, xp);
    message += ` +${xp} XP.`;
    if (levels) message += ` ${C.SPECIES[ally.species].name} grew to level ${ally.level}!`;
    if (battle.guardian) {
      state.guardian = true;
      message += ' You earned the guardian’s trust.';
    }
    battle.over = true;
    battle.busy = false;
    battle.victory = true;
    renderBattle();
    renderUI();
    setBattleMessage(message);
    $('leave-battle').focus({ preventScroll: true });
  }

  function leaveBattle() {
    const guardianVictory = battle.guardian && battle.victory;
    const defeat = battle.defeat;
    battle = null;
    $('battle-view').hidden = true;
    canvas.tabIndex = 0;
    canvas.removeAttribute('aria-hidden');
    encounterCooldown = 6;
    grassSteps = 0;
    if (defeat) restAtCamp();
    else {
      renderUI();
      saveNow();
    }
    canvas.focus({ preventScroll: true });
    if (guardianVictory) {
      showDialog('ending', `${header('THE FIRST OF MANY LITTLE ADVENTURES', 'The island feels like home.')}<div class="celebration-art">${C.art('bramblet')}</div><p class="ending-copy">The guardian bows its leafy head. You’ve wandered kindly,<br>made new friends, and found your own little place in the wild.<br><br><strong>Your first chapter is complete.</strong><br>There are still ${8 - state.caught.length} new species to befriend, and no reason to hurry home.</p><div class="dialog-actions" style="justify-content:center"><button class="primary-button" id="keep-exploring">Keep exploring ${icon('compass')}</button><button class="secondary-button" id="ending-journal">Open my journal</button></div>`);
      $('keep-exploring').onclick = closeDialog;
      $('ending-journal').onclick = showJournal;
    }
  }

  function ellipse(context, x, y, rx, ry, color) {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  }

  function rounded(context, x, y, w, h, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    context.fill();
  }

  function polygon(context, points, color) {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    context.fill();
  }

  function noise(x, y, salt = 0) {
    const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function flower(context, x, y, color, size = 2) {
    context.fillStyle = '#6c9d6c';
    context.fillRect(x - 1, y, 1.5, 6);
    for (let i = 0; i < 5; i++) ellipse(context, x + Math.cos(i * 1.256) * size, y + Math.sin(i * 1.256) * size, size, size, color);
    ellipse(context, x, y, size * .7, size * .7, '#eacc7c');
  }

  function tree(context, x, y, scale = 1, warm = false) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    ellipse(context, 9, 18, 27, 12, '#396f5423');
    rounded(context, -5, -1, 11, 23, 3, '#937b51');
    context.fillStyle = '#ab9468';
    context.fillRect(-3, 6, 3, 12);
    const dark = warm ? '#729465' : '#518465';
    const middle = warm ? '#90ad78' : '#70a17a';
    const light = warm ? '#afc58c' : '#91b98a';
    ellipse(context, 0, -10, 31, 30, dark);
    ellipse(context, -13, -17, 22, 23, middle);
    ellipse(context, 14, -18, 22, 25, middle);
    ellipse(context, -2, -32, 24, 23, middle);
    ellipse(context, -9, -33, 15, 16, light);
    ellipse(context, -22, -15, 10, 12, light);
    ellipse(context, 16, -28, 9, 9, light);
    ellipse(context, 10, -4, 14, 11, dark);
    ellipse(context, -10, -30, 4, 2, '#d2dfaa55');
    context.restore();
  }

  function drawCamp(context) {
    const x = 3 * C.TILE - 7;
    const y = 3 * C.TILE - 20;
    ellipse(context, x + 100, y + 107, 104, 19, '#38664924');
    rounded(context, x + 15, y + 28, 157, 82, 6, '#e8d9a8');
    context.fillStyle = '#d3c28f';
    context.fillRect(x + 154, y + 40, 18, 65);
    context.fillStyle = '#bdc098';
    context.fillRect(x + 19, y + 94, 150, 16);
    rounded(context, x + 69, y + 52, 39, 58, 16, '#8a7957');
    rounded(context, x + 74, y + 57, 29, 53, 13, '#667f66');
    ellipse(context, x + 95, y + 82, 2, 2, '#e7c783');
    for (const wx of [29, 122]) {
      rounded(context, x + wx, y + 55, 26, 25, 4, '#ad976c');
      rounded(context, x + wx + 3, y + 58, 20, 19, 2, '#a6c7b5');
      context.fillStyle = '#e2d4a4';
      context.fillRect(x + wx + 12, y + 58, 2, 19);
      context.fillRect(x + wx + 3, y + 67, 20, 2);
      rounded(context, x + wx - 4, y + 80, 34, 7, 2, '#ae8b62');
      flower(context, x + wx + 4, y + 77, '#edcf8b', 3);
      flower(context, x + wx + 18, y + 76, '#dbab9c', 3);
    }
    polygon(context, [[x, y + 40], [x + 27, y - 10], [x + 158, y - 10], [x + 186, y + 40]], '#b67f59');
    polygon(context, [[x + 2, y + 34], [x + 29, y - 13], [x + 155, y - 13], [x + 182, y + 34]], '#d59b6c');
    for (let row = 0; row < 4; row++) {
      const yy = y - 7 + row * 11;
      const inset = 24 - row * 5.5;
      context.strokeStyle = '#bd865b88';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + inset, yy + 6);
      context.lineTo(x + 184 - inset, yy + 6);
      context.stroke();
      for (let xx = x + 40 + (row % 2) * 14; xx < x + 156; xx += 28) {
        context.beginPath();
        context.moveTo(xx, yy - 4);
        context.lineTo(xx - 3, yy + 6);
        context.stroke();
      }
    }
    rounded(context, x + 129, y - 27, 20, 33, 2, '#b09b79');
    rounded(context, x + 126, y - 30, 26, 7, 2, '#c2ac85');
    rounded(context, x + 62, y + 108, 54, 9, 3, '#c1b185');
    rounded(context, x + 57, y + 117, 65, 7, 3, '#d0bd8f');
    mapText(context, 'MIRA’S CAMP', x + 91, y + 140);
  }

  function drawPerson(context, x, y, facing, time, guide = false, moving = false) {
    const bounce = moving && !reducedMotion ? Math.sin(time / 55) * 1.8 : 0;
    ellipse(context, x + 3, y + 16, 13, 5, '#315b4930');
    context.save();
    context.translate(x, y + bounce);
    const stride = moving && !reducedMotion ? Math.sin(time / 75) * 3 : 0;
    rounded(context, -8, 5 + stride, 6, 13, 3, '#3a6152');
    rounded(context, 3, 5 - stride, 6, 13, 3, '#3a6152');
    rounded(context, -9, 15 + stride, 8, 4, 2, '#5c6555');
    rounded(context, 2, 15 - stride, 9, 4, 2, '#5c6555');
    rounded(context, -12, -9, 25, 22, 8, guide ? '#e2a27f' : '#e8e2b3');
    rounded(context, -15, -4, 6, 13, 3, '#e4b98e');
    rounded(context, 10, -4, 6, 13, 3, '#e4b98e');
    if (facing === 'up') rounded(context, -9, -7, 18, 19, 5, guide ? '#b98b65' : '#99af75');
    else {
      context.fillStyle = guide ? '#c48a6b' : '#99af75';
      context.fillRect(-8, -8, 3, 17);
      context.fillRect(7, -8, 3, 17);
    }
    ellipse(context, 0, -16, 12, 13, '#e7bd92');
    if (facing !== 'up') {
      const shift = facing === 'left' ? -4 : facing === 'right' ? 4 : 0;
      ellipse(context, -4 + shift, -14, 1.5, 2, '#514e3d');
      ellipse(context, 4 + shift, -14, 1.5, 2, '#514e3d');
    }
    if (guide) {
      ellipse(context, 0, -26, 13, 8, '#8e7756');
      ellipse(context, -12, -16, 5, 11, '#8e7756');
      ellipse(context, 12, -16, 5, 11, '#8e7756');
      flower(context, 11, -25, '#f0d796', 3);
    } else {
      ellipse(context, 0, -23, 20, 8, '#b9975d');
      ellipse(context, 0, -25, 20, 7, '#e8ce91');
      rounded(context, -12, -39, 24, 15, [10, 10, 3, 3], '#e8ce91');
      rounded(context, -12, -29, 24, 5, 2, '#859e71');
      ellipse(context, -4, -36, 5, 2, '#f3dda6');
    }
    context.restore();
  }

  function mapText(context, text, x, y) {
    context.font = '600 9px sans-serif';
    context.textAlign = 'center';
    const width = context.measureText(text).width + 20;
    rounded(context, x - width / 2, y - 10, width, 18, 8, '#f5f4ddd9');
    context.fillStyle = '#6f8060';
    context.fillText(text, x, y + 2);
  }

  const mapLayer = document.createElement('canvas');
  mapLayer.width = C.COLS * C.TILE;
  mapLayer.height = C.ROWS * C.TILE;
  const mapCtx = mapLayer.getContext('2d');

  function buildMap() {
    const c = mapCtx;
    c.fillStyle = '#a5c995';
    c.fillRect(0, 0, mapLayer.width, mapLayer.height);
    for (let y = 0; y < C.ROWS; y++) {
      for (let x = 0; x < C.COLS; x++) {
        const px = x * C.TILE;
        const py = y * C.TILE;
        const tile = C.tileAt(x, y);
        const water = tile === 'water' || tile === 'bridge';
        c.fillStyle = water ? '#81c1bf' : C.region(x, y) === 'Amber Grove' ? '#b3cd97' : '#acd09c';
        c.fillRect(px, py, C.TILE, C.TILE);
        if (water) {
          c.fillStyle = '#9ed0c4';
          if (C.walkable(x - 1, y) && C.tileAt(x - 1, y) !== 'bridge') c.fillRect(px, py, 5, 48);
          if (C.walkable(x + 1, y) && C.tileAt(x + 1, y) !== 'bridge') c.fillRect(px + 43, py, 5, 48);
          for (let i = 0; i < 3; i++) {
            const xx = px + noise(x, y, i) * 34 + 3;
            const yy = py + noise(x, y, i + 4) * 43;
            rounded(c, xx, yy, 8 + noise(x, y, i + 7) * 9, 2, 1, '#b2e0d055');
          }
        } else {
          if (noise(x, y) > .5) {
            c.fillStyle = '#b6d4a344';
            c.fillRect(px, py, 48, 48);
          }
          for (let i = 0; i < 3; i++) {
            const xx = px + noise(x, y, i + 2) * 42;
            const yy = py + noise(x, y, i + 7) * 42;
            c.strokeStyle = '#8bb77f66';
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(xx - 2, yy - 2);
            c.lineTo(xx, yy + 2);
            c.lineTo(xx + 3, yy - 1);
            c.stroke();
          }
        }
        if (tile === 'path') {
          rounded(c, px - 1, py - 1, 50, 50, 10, '#dfd5a4');
          c.fillStyle = '#e8dfb688';
          c.fillRect(px + 2, py + 2, 44, 44);
          for (let i = 0; i < 4; i++) ellipse(c, px + noise(x, y, i) * 40 + 4, py + noise(x, y, i + 9) * 40 + 4, 1.6, 1, '#bdba8b66');
        }
        if (tile === 'grass') {
          rounded(c, px + 1, py + 1, 46, 46, 7, '#8ab78066');
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
              const gx = px + 5 + col * 11 + (row % 2) * 2;
              const gy = py + 13 + row * 13;
              polygon(c, [[gx - 5, gy + 3], [gx - 6, gy - 7], [gx - 1, gy - 2], [gx + 1, gy - 11], [gx + 4, gy - 3], [gx + 8, gy - 7], [gx + 6, gy + 3]], '#72a56f');
              polygon(c, [[gx - 2, gy + 2], [gx - 2, gy - 5], [gx + 1, gy - 1], [gx + 3, gy - 7], [gx + 4, gy + 2]], '#a2c68a');
            }
          }
          if (noise(x, y, 30) > .64) flower(c, px + 19, py + 20, '#e4d795', 2);
        }
        if (tile === 'bridge') {
          rounded(c, px - 8, py + 3, 65, 46, 3, '#54897b44');
          for (let i = 0; i < 7; i++) {
            rounded(c, px - 6 + i * 9, py + 5, 8, 37, 1, i % 2 ? '#c8a976' : '#d5b782');
            c.fillStyle = '#ae9062';
            c.fillRect(px - 3 + i * 9, py + 10, 1, 23);
          }
          rounded(c, px - 9, py + 1, 69, 5, 2, '#ae8f61');
          rounded(c, px - 9, py + 40, 69, 5, 2, '#ae8f61');
          for (const xx of [px - 7, px + 53]) {
            rounded(c, xx, py - 3, 5, 16, 2, '#947b56');
            rounded(c, xx, py + 31, 5, 16, 2, '#947b56');
          }
        }
        if (tile === 'lawn' && noise(x, y, 1) > .45) {
          for (let i = 0; i < 3; i++) flower(c, px + 10 + noise(x, y, i + 2) * 29, py + 10 + noise(x, y, i + 4) * 25, i % 2 ? '#f0e3ad' : '#ead1c3', 2.1);
        }
      }
    }
    for (const [x, y] of [[2, 4], [2, 5], [8, 11], [9, 11], [12, 10], [13, 10], [14, 10], [19, 4], [20, 4]]) {
      const px = x * 48 + 8;
      const py = y * 48 + 30;
      rounded(c, px, py - 7, 36, 5, 2, '#c3b289');
      rounded(c, px, py + 2, 36, 4, 1, '#c3b289');
      rounded(c, px + 1, py - 11, 5, 25, 2, '#ad9975');
      rounded(c, px + 29, py - 11, 5, 25, 2, '#ad9975');
    }
    for (const [x, y] of [[8, 3], [14, 9], [18, 10], [2, 9], [10, 2]]) {
      ellipse(c, x * 48 + 21, y * 48 + 30, 14, 7, '#8f9e7955');
      polygon(c, [[x * 48 + 8, y * 48 + 28], [x * 48 + 11, y * 48 + 15], [x * 48 + 22, y * 48 + 11], [x * 48 + 31, y * 48 + 18], [x * 48 + 33, y * 48 + 29]], '#b4b69a');
      polygon(c, [[x * 48 + 11, y * 48 + 15], [x * 48 + 22, y * 48 + 11], [x * 48 + 28, y * 48 + 20], [x * 48 + 12, y * 48 + 22]], '#c9c9ac');
    }
    const sx = C.SHRINE.x * 48 + 24;
    const sy = C.SHRINE.y * 48 + 20;
    ellipse(c, sx + 3, sy + 26, 27, 10, '#6e8f6533');
    rounded(c, sx - 27, sy + 19, 54, 10, 5, '#bbbca0');
    rounded(c, sx - 22, sy + 12, 44, 10, 3, '#d3d0b0');
    rounded(c, sx - 16, sy - 18, 32, 35, [13, 13, 3, 3], '#c4c4a6');
    rounded(c, sx - 11, sy - 12, 22, 26, [10, 10, 2, 2], '#9fa88b');
    ellipse(c, sx, sy - 1, 6, 9, '#d4dea5');
    c.strokeStyle = '#7d966c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx - 3, sy + 8);
    c.lineTo(sx + 3, sy - 5);
    c.stroke();
    flower(c, sx - 24, sy + 17, '#edcea8', 3);
    flower(c, sx + 24, sy + 18, '#e7d891', 3);
    mapText(c, 'OLD MEADOW SHRINE', sx, sy + 50);
    drawCamp(c);
    for (let y = 0; y < C.ROWS; y++) {
      for (let x = 0; x < C.COLS; x++) {
        if (C.tileAt(x, y) === 'tree') tree(c, x * 48 + 24, y * 48 + 33, .93 + noise(x, y) * .2, y <= 3);
      }
    }
    drawPerson(c, C.GUIDE.x * 48 + 24, C.GUIDE.y * 48 + 26, 'down', 0, true);
    mapText(c, 'MIRA', C.GUIDE.x * 48 + 24, C.GUIDE.y * 48 - 24);
    const signX = 8 * 48 + 37;
    const signY = 6 * 48 + 8;
    rounded(c, signX - 2, signY, 5, 25, 1, '#9c875e');
    rounded(c, signX - 17, signY - 3, 34, 17, 3, '#d6be87');
    c.fillStyle = '#98835d';
    c.font = '13px sans-serif';
    c.textAlign = 'center';
    c.fillText('→', signX, signY + 10);
    mapText(c, 'SUNPETAL MEADOW', 12 * 48, 9 * 48 + 27);
    ellipse(c, 20 * 48 + 15, 12 * 48 + 10, 12, 5, '#79ae88');
    flower(c, 20 * 48 + 16, 12 * 48 + 8, '#efd6c5', 3);
    ellipse(c, 19 * 48 + 8, 12 * 48 + 34, 9, 4, '#76ad86');
  }

  function drawFrame(now) {
    requestAnimationFrame(drawFrame);
    if (document.hidden || now - previousFrame < 30) return;
    previousFrame = now;
    if (state && !battle && !dialog.open) {
      if (heldDirection) {
        route = [];
        move(heldDirection, now);
      } else if (route.length && now - lastStep >= 145) {
        const next = route.shift();
        const dx = next.x - state.player.x;
        const dy = next.y - state.player.y;
        move(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up', now);
      }
    }
    ctx.drawImage(mapLayer, 0, 0);
    const p = state ? state.player : { x: 8, y: 10, facing: 'down' };
    const progress = reducedMotion ? 1 : Math.min(1, (now - visual.at) / 130);
    visual.x = visual.fromX + (p.x - visual.fromX) * progress;
    visual.y = visual.fromY + (p.y - visual.fromY) * progress;
    const px = visual.x * 48 + 24;
    const py = visual.y * 48 + 26;
    if (state) {
      const image = creatureImages[state.team[0].species];
      const [dx, dy] = directions[p.facing];
      const bob = reducedMotion ? 0 : Math.sin(now / 350) * 1.5;
      if (image.complete && image.naturalWidth) ctx.drawImage(image, px - dx * 25 - 17, py - dy * 24 - 21 + bob, 32, 32);
    }
    drawPerson(ctx, px, py, p.facing, now, false, progress < 1);
    if (!reducedMotion) {
      for (let i = 0; i < 8; i++) {
        const x = ((now / (95 + i * 8) + i * 137) % 1110) - 25;
        const y = 80 + i * 70 + Math.sin(now / 2400 + i) * 15;
        ellipse(ctx, x, y, 2.3, 1.1, '#faf5d68a');
      }
      for (let i = 0; i < 3; i++) {
        const t = now / 1600 + i * 2;
        ellipse(ctx, 275 + Math.sin(t * .4) * 4 - i * 3, 105 - (t % 3) * 12, 5 + (t % 3) * 2, 4 + (t % 3), '#f5edcf44');
      }
    }
    if (state && !battle && (near(C.GUIDE) || near(C.SHRINE) || near(C.CAMP))) {
      rounded(ctx, px - 34, py - 66, 68, 20, 8, '#fffbe6eb');
      ctx.fillStyle = '#748663';
      ctx.textAlign = 'center';
      ctx.font = '600 9px sans-serif';
      ctx.fillText('E · INTERACT', px, py - 53);
    }
  }

  canvas.addEventListener('pointerdown', event => {
    if (!state || battle || dialog.open) return;
    canvas.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * C.COLS);
    const y = Math.floor((event.clientY - rect.top) / rect.height * C.ROWS);
    const tile = C.tileAt(x, y);
    if (['guide', 'camp', 'shrine'].includes(tile)) {
      const target = tile === 'camp' ? C.CAMP : tile === 'guide' ? C.GUIDE : C.SHRINE;
      if (near(target)) return interact();
      const options = Object.values(directions).map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy })).filter(p => C.walkable(p.x, p.y));
      const paths = options.map(p => C.pathTo(state.player, p)).filter(p => p.length).sort((a, b) => a.length - b.length);
      route = paths[0] || [];
      if (route.length) toast('Walk over, then press E or Interact to say hello.');
    } else {
      route = C.pathTo(state.player, { x, y });
      if (!C.walkable(x, y)) toast('Try a path, the grass, or a wooden bridge.');
    }
    heldDirection = null;
  });

  document.addEventListener('keydown', event => {
    if (dialog.open || !state || battle || event.ctrlKey || event.altKey || event.metaKey) return;
    if (keys[event.key]) {
      event.preventDefault();
      heldDirection = keys[event.key];
      route = [];
      move(heldDirection);
    } else if (event.key.toLowerCase() === 'e' && !event.repeat) {
      event.preventDefault();
      interact();
    }
  });
  document.addEventListener('keyup', event => {
    if (keys[event.key] === heldDirection) heldDirection = null;
  });
  window.addEventListener('blur', () => { heldDirection = null; route = []; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      heldDirection = null;
      route = [];
      saveNow();
    }
  });
  window.addEventListener('pagehide', saveNow);
  document.querySelectorAll('[data-direction]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      heldDirection = button.dataset.direction;
      route = [];
      button.setPointerCapture(event.pointerId);
      move(heldDirection);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { heldDirection = null; });
  });
  dialog.addEventListener('cancel', event => {
    if (dialogKind === 'starter' || dialogKind === 'recovery') event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    heldDirection = null;
    if (!state && dialogKind !== 'starter') showStarters();
  });
  $('explore-tab').onclick = () => {
    if (state && dialog.open && !['starter', 'recovery'].includes(dialogKind)) closeDialog();
    if (!battle) canvas.focus({ preventScroll: true });
  };
  $('journal-tab').onclick = showJournal;
  $('team-tab').onclick = () => showTeam();
  $('manage-team').onclick = () => showTeam();
  $('help-button').onclick = showHelp;
  $('interact-button').onclick = interact;
  $('camp-button').onclick = restAtCamp;
  $('settings-button').onclick = showSettings;

  buildMap();
  try {
    const raw = localStorage.getItem(C.SAVE_KEY);
    if (raw) {
      state = C.parseSave(raw);
      unreadableSave = !state;
    }
  } catch {
    storageAvailable = false;
    $('save-status').textContent = 'Autosave unavailable — export a backup in Save options';
    $('save-dot').style.background = '#c99870';
  }
  if (state) {
    setVisual();
    renderUI();
    toast('Welcome back, explorer. Your friends missed you.');
  } else if (unreadableSave) {
    showDialog('recovery', `${header('YOUR MEMORIES MATTER', 'This save needs a little help.', 'The saved adventure could not be read. Nothing has been overwritten.', false)}<div class="notice-box">If you have an exported backup, you can restore it. Or choose a fresh start to replace the unreadable save.</div><div class="dialog-actions"><button class="primary-button" id="recover-import">Restore a backup</button><button class="secondary-button danger-button" id="recover-new">Replace with a new adventure</button></div>`, false);
    $('recover-import').onclick = showSettings;
    $('recover-new').onclick = () => {
      showDialog('confirm-recovery', `${header('A FRESH START', 'Replace the unreadable save?')}<div class="notice-box">Choosing a starter will overwrite the unreadable adventure on this device.</div><div class="dialog-actions"><button class="primary-button" id="recover-confirm">Yes, choose a new starter</button><button class="secondary-button" id="recover-cancel">Save options</button></div>`);
      $('recover-confirm').onclick = showStarters;
      $('recover-cancel').onclick = showSettings;
    };
  } else {
    showStarters();
  }
  requestAnimationFrame(drawFrame);
})();
