(() => {
  'use strict';

  const SAVE_KEY = 'bloomwild-save-v1';
  const TYPES = {
    leaf: { name: 'Leaf', color: '#6a8b4d', background: '#eaf2db', strong: 'tide', weak: 'flame', move: 'Leaf flutter' },
    flame: { name: 'Flame', color: '#b57b4e', background: '#fae8d9', strong: 'leaf', weak: 'tide', move: 'Ember puff' },
    tide: { name: 'Tide', color: '#528b9c', background: '#e0f1f2', strong: 'flame', weak: 'leaf', move: 'Bubble burst' },
    spark: { name: 'Spark', color: '#a08d42', background: '#f5efcb', strong: 'tide', weak: 'leaf', move: 'Tiny thunder' },
    earth: { name: 'Earth', color: '#96806c', background: '#eee6dc', strong: 'spark', weak: 'tide', move: 'Pebble toss' }
  };
  const SPECIES = {
    spriglet: { name: 'Spriglet', type: 'leaf', vibe: 'A curious little soul', description: 'Part sunshine, part mischief. Always stops to smell the flowers.', habitat: 'Sunpetal Meadow', baseHP: 30, attack: 8, defense: 6 },
    cindlet: { name: 'Cindlet', type: 'flame', vibe: 'A warm-hearted rascal', description: 'A pocket-sized spark with a very big heart. Loves warm naps.', habitat: 'Amber Grove', baseHP: 27, attack: 10, defense: 4 },
    puddloo: { name: 'Puddloo', type: 'tide', vibe: 'Just happy to be here', description: 'Every puddle is a playground. Every stranger is a new friend.', habitat: 'Ripplebank', baseHP: 35, attack: 7, defense: 7 },
    mossbun: { name: 'Mossbun', type: 'leaf', vibe: 'A very soft daydreamer', description: 'Its mossy ears sprout tiny flowers after a good afternoon nap.', habitat: 'Sunpetal Meadow', baseHP: 32, attack: 7, defense: 7 },
    pebblit: { name: 'Pebblit', type: 'earth', vibe: 'Small but steadfast', description: 'Collects little stones and offers the prettiest ones to friends.', habitat: 'Amber Grove', baseHP: 36, attack: 8, defense: 9 },
    lumoth: { name: 'Lumoth', type: 'spark', vibe: 'A floating night-light', description: 'Carries a little lantern glow beneath its moon-shaped wings.', habitat: 'Ripplebank', baseHP: 26, attack: 10, defense: 4 },
    bramblet: { name: 'Bramblet', type: 'leaf', vibe: 'A shy forest guardian', description: 'Keeps the oldest trees company. A berry is the way to its heart.', habitat: 'Amber Grove', baseHP: 34, attack: 9, defense: 7 },
    voltkit: { name: 'Voltkit', type: 'spark', vibe: 'Endlessly energetic', description: 'A happy hop leaves a tiny crackle. Never has a bad hair day.', habitat: 'Ripplebank', baseHP: 28, attack: 11, defense: 5 }
  };
  const STARTERS = ['spriglet', 'cindlet', 'puddloo'];
  const COLS = 22;
  const ROWS = 14;
  const TILE = 48;
  const CAMP = { x: 5, y: 5 };
  const GUIDE = { x: 9, y: 7 };
  const SHRINE = { x: 18, y: 2 };

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return 'void';
    if (x === 16 && (y === 5 || y === 6 || y === 10)) return 'bridge';
    if (x === 16 || (x === 17 && y >= 7 && y <= 9) || (x >= 18 && y >= 11) || (x >= 20 && y >= 10) || (x === 0 && y >= 10) || (x === 1 && y >= 12)) return 'water';
    if ((x >= 3 && x <= 6 && y >= 3 && y <= 4) || (x === 4 && y === 5)) return 'camp';
    if (x === SHRINE.x && y === SHRINE.y) return 'shrine';
    if (x === GUIDE.x && y === GUIDE.y) return 'guide';
    if ((y === 0 && x !== 16) || (y === 13 && x > 1 && x < 16) || (x === 0 && y < 10) || (x === 21 && y < 10) || (x >= 2 && x <= 7 && y === 1) || (x >= 11 && x <= 14 && y <= 2) || (x >= 1 && x <= 2 && y >= 6 && y <= 8) || (x >= 12 && x <= 14 && y === 11) || (x === 19 && y === 7)) return 'tree';
    if ((y === 9 && x >= 4 && x <= 14) || (x >= 7 && x <= 8 && y >= 4 && y <= 10) || (y === 5 && x >= 8 && x <= 20) || (x === 18 && y >= 3 && y <= 6) || (y === 6 && x >= 4 && x <= 8) || (x === 10 && y >= 9 && y <= 12) || (y === 10 && x >= 14 && x <= 18)) return 'path';
    if ((x >= 3 && x <= 6 && y >= 7 && y <= 8) || (x >= 10 && x <= 14 && y >= 6 && y <= 8) || (x >= 2 && x <= 5 && y >= 10 && y <= 12) || (x >= 17 && x <= 20 && y >= 7 && y <= 9) || (x >= 17 && x <= 20 && y <= 4) || (x >= 10 && x <= 14 && y >= 3 && y <= 4)) return 'grass';
    return 'lawn';
  }

  function walkable(x, y) {
    return ['lawn', 'grass', 'path', 'bridge'].includes(tileAt(x, y));
  }

  function region(x, y) {
    if (x >= 17) return 'Ripplebank';
    if (y <= 4) return 'Amber Grove';
    return 'Sunpetal Meadow';
  }

  function pathTo(start, target) {
    if (!walkable(target.x, target.y)) return [];
    const queue = [{ ...start, path: [] }];
    const seen = new Set([`${start.x},${start.y}`]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (current.x === target.x && current.y === target.y) return current.path;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = current.x + dx;
        const y = current.y + dy;
        const key = `${x},${y}`;
        if (walkable(x, y) && !seen.has(key)) {
          seen.add(key);
          queue.push({ x, y, path: [...current.path, { x, y }] });
        }
      }
    }
    return [];
  }

  function maxHP(creature) {
    return SPECIES[creature.species].baseHP + creature.level * 6;
  }

  function makeCreature(species, level = 3) {
    const creature = { species, level, xp: 0, hp: 0 };
    creature.hp = maxHP(creature);
    return creature;
  }

  function multiplier(type, targetType) {
    if (TYPES[type].strong === targetType) return 1.5;
    if (TYPES[type].weak === targetType || type === targetType) return .75;
    return 1;
  }

  function damage(attacker, defender, typed = false, random = Math.random) {
    const a = SPECIES[attacker.species];
    const d = SPECIES[defender.species];
    const power = typed ? 11 : 8;
    const strength = typed ? multiplier(a.type, d.type) : 1;
    return Math.max(2, Math.round((power / 2 + (a.attack + attacker.level * 2) * .6 - (d.defense + defender.level) * .3) * strength * (.9 + random() * .2)));
  }

  function catchChance(creature, boss = false) {
    return Math.min(.94, .23 + (1 - creature.hp / maxHP(creature)) * .72 - (boss ? .08 : 0));
  }

  function addXP(creature, amount) {
    const oldLevel = creature.level;
    if (creature.level >= 20) return 0;
    creature.xp += amount;
    while (creature.level < 20 && creature.xp >= creature.level * 18) {
      const previousHP = maxHP(creature);
      creature.xp -= creature.level * 18;
      creature.level++;
      creature.hp = Math.min(maxHP(creature), creature.hp + maxHP(creature) - previousHP);
    }
    if (creature.level === 20) creature.xp = 0;
    return creature.level - oldLevel;
  }

  function freshState(starter) {
    return {
      version: 1,
      player: { x: 8, y: 10, facing: 'down' },
      team: [makeCreature(starter)],
      reserve: [],
      seen: [starter],
      caught: [starter],
      capsules: 10,
      steps: 0,
      wins: 0,
      captures: 0,
      visited: ['Sunpetal Meadow'],
      guardian: false,
      guideMet: false
    };
  }

  function validCreature(c) {
    return c && Object.hasOwn(SPECIES, c.species) && Number.isInteger(c.level) && c.level >= 1 && c.level <= 20 && Number.isInteger(c.hp) && c.hp >= 0 && c.hp <= maxHP(c) && Number.isInteger(c.xp) && c.xp >= 0 && c.xp < c.level * 18;
  }

  function parseSave(raw) {
    try {
      const s = JSON.parse(raw);
      if (!s || s.version !== 1 || !Array.isArray(s.team) || s.team.length < 1 || s.team.length > 6 || !s.team.every(validCreature)) return null;
      if (!Array.isArray(s.reserve) || s.reserve.length > 42 || !s.reserve.every(validCreature)) return null;
      if (!s.player || !Number.isInteger(s.player.x) || !Number.isInteger(s.player.y) || !walkable(s.player.x, s.player.y) || !['up', 'down', 'left', 'right'].includes(s.player.facing)) return null;
      if (![s.seen, s.caught].every(list => Array.isArray(list) && list.length <= 8 && new Set(list).size === list.length && list.every(id => Object.hasOwn(SPECIES, id)))) return null;
      if (!s.caught.every(id => s.seen.includes(id)) || ![...s.team, ...s.reserve].every(c => s.caught.includes(c.species))) return null;
      if (![s.capsules, s.steps, s.wins, s.captures].every(n => Number.isSafeInteger(n) && n >= 0) || s.capsules > 99) return null;
      if (!Array.isArray(s.visited) || s.visited.length > 3 || !s.visited.every(place => ['Sunpetal Meadow', 'Amber Grove', 'Ripplebank'].includes(place))) return null;
      if (typeof s.guardian !== 'boolean' || typeof s.guideMet !== 'boolean') return null;
      return {
        version: 1, player: { x: s.player.x, y: s.player.y, facing: s.player.facing },
        team: s.team.map(c => ({ species: c.species, level: c.level, xp: c.xp, hp: c.hp })),
        reserve: s.reserve.map(c => ({ species: c.species, level: c.level, xp: c.xp, hp: c.hp })),
        seen: [...s.seen], caught: [...s.caught], capsules: s.capsules, steps: s.steps,
        wins: s.wins, captures: s.captures, visited: [...new Set(s.visited)], guardian: s.guardian, guideMet: s.guideMet
      };
    } catch {
      return null;
    }
  }

  function wildCreature(place, leadLevel, random = Math.random) {
    const pool = place === 'Ripplebank' ? ['puddloo', 'lumoth', 'voltkit', 'puddloo', 'lumoth'] : place === 'Amber Grove' ? ['cindlet', 'pebblit', 'bramblet', 'pebblit', 'cindlet'] : ['mossbun', 'spriglet', 'mossbun', 'pebblit', 'spriglet'];
    const species = pool[Math.floor(random() * pool.length)];
    const level = Math.max(2, Math.min(12, leadLevel + Math.floor(random() * 3) - 2));
    return makeCreature(species, level);
  }

  function art(id, label = true) {
    const face = '<ellipse cx="62" cy="87" rx="5" ry="6.5" fill="#294b3d"/><ellipse cx="99" cy="87" rx="5" ry="6.5" fill="#294b3d"/><circle cx="63" cy="85" r="1.7" fill="#fff"/><circle cx="100" cy="85" r="1.7" fill="#fff"/><path d="M75 96q5 6 11 0" fill="none" stroke="#42654a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="49" cy="96" rx="7" ry="4" fill="#e6a89b" opacity=".55"/><ellipse cx="112" cy="96" rx="7" ry="4" fill="#e6a89b" opacity=".55"/>';
    const shadow = '<ellipse cx="81" cy="143" rx="39" ry="6" fill="#426740" opacity=".1"/>';
    const artById = {
      spriglet: '<path d="M109 111q41 4 29-26-19-2-22 17" fill="#86ae60"/><path d="m119 105 13-14" stroke="#b5ce83" stroke-width="2"/><ellipse cx="79" cy="112" rx="33" ry="29" fill="#a7c979"/><ellipse cx="56" cy="137" rx="13" ry="8" fill="#8daf61"/><ellipse cx="102" cy="137" rx="13" ry="8" fill="#8daf61"/><path d="M37 64q-5-28 8-33l27 23M92 53l25-23q13 11 8 36" fill="#95ba6d"/><path d="m45 43 6 24 13-9m39 0 12-15 1 26" fill="#d5e5a6"/><ellipse cx="80" cy="81" rx="48" ry="38" fill="#b9d989"/><path d="M70 51C39 41 54 16 57 16q27 4 23 34C77 24 97 16 108 21q-2 29-28 30" fill="#638f50"/><path d="m59 23 17 25m24-21L82 48" stroke="#98b86f" stroke-width="2"/><ellipse cx="80" cy="114" rx="17" ry="15" fill="#d9e8ae"/>' + face,
      cindlet: '<path d="M109 124c44-3 41-33 25-43 0 15-16 12-15 22-8-10-14-1-10 21Z" fill="#df8856"/><path d="M123 119q25-6 11-25c-1 10-12 9-11 25" fill="#f5d486"/><ellipse cx="79" cy="115" rx="30" ry="27" fill="#e9a36e"/><ellipse cx="56" cy="137" rx="12" ry="8" fill="#ca8255"/><ellipse cx="101" cy="137" rx="12" ry="8" fill="#ca8255"/><path d="m38 66 1-44q24 9 31 33m22-1q9-24 30-32l-1 46" fill="#d58b5d"/><path d="m45 36 4 32 15-11m34 0 17-22-3 35" fill="#f3c68d"/><path d="M34 71q2-22 44-23 47 0 49 26l10 18-23 7q-5 25-35 25-29-1-37-25l-15-8Z" fill="#efb27e"/><path d="m47 98 28-7 7 6 7-6 26 6q-10 23-34 23-25-1-34-22" fill="#ffdfb0"/><path d="M70 52q-10-17 7-28 0 13 14 15l-3 15" fill="#e49a60"/><ellipse cx="79" cy="119" rx="14" ry="12" fill="#f8d6a3"/>' + face,
      puddloo: '<path d="M110 112q42-25 37 4-7 23-37 15" fill="#79bfc1"/><path d="m38 65-24-9 6 17-13 6 15 9-7 14 26-7m80-29 23-10-4 18 14 5-16 9 7 14-26-8" fill="#d69eab"/><path d="m34 72-14-7m14 15-14 1m17 9-13 6m101-24 13-8m-12 16 13 1m-15 9 13 6" stroke="#f1c0c6" stroke-width="3" stroke-linecap="round"/><ellipse cx="80" cy="114" rx="34" ry="29" fill="#84c6c7"/><ellipse cx="55" cy="138" rx="15" ry="8" fill="#71b2b9"/><ellipse cx="107" cy="138" rx="15" ry="8" fill="#71b2b9"/><ellipse cx="80" cy="82" rx="49" ry="38" fill="#a1d8d5"/><path d="M65 48q-5-19 9-23 8 11 5 22 8-19 18-14 3 13-12 16" fill="#7ebabc"/><ellipse cx="81" cy="119" rx="19" ry="16" fill="#d3edda"/><path d="M48 62q8-8 17-8" stroke="#d1eee3" stroke-width="4" stroke-linecap="round"/>' + face,
      mossbun: '<path d="M43 63C17 9 46 4 61 54m33 1C96 8 129 10 114 67" fill="#a7bc83"/><path d="M44 48q-7-23 1-26l11 32m46-1q5-27 13-29l-7 34" fill="#d5dfa9"/><circle cx="123" cy="112" r="16" fill="#c4d399"/><ellipse cx="81" cy="111" rx="37" ry="32" fill="#b9cb91"/><ellipse cx="54" cy="136" rx="16" ry="8" fill="#a3ba7d"/><ellipse cx="108" cy="136" rx="16" ry="8" fill="#a3ba7d"/><ellipse cx="80" cy="84" rx="43" ry="36" fill="#c8d8a0"/><ellipse cx="80" cy="119" rx="20" ry="17" fill="#e2e8bf"/><path d="M44 47q-12-22 8-19l8 18" fill="#75975a"/><g fill="#efc0bc"><circle cx="49" cy="28" r="7"/><circle cx="60" cy="26" r="7"/><circle cx="55" cy="17" r="7"/></g><circle cx="54" cy="25" r="4" fill="#f4de9a"/>' + face,
      pebblit: '<ellipse cx="80" cy="139" rx="36" ry="9" fill="#9b9483"/><path d="m40 61 26-26 36 1 25 30 10 49-19 21H44l-19-27Z" fill="#b9b2a0"/><path d="m40 61 26-26 8 32-33 23-16 19Zm34 6 28-31 25 30-15 30Z" fill="#cec8b5"/><path d="m41 90 33-23 38 29 6 40H44Z" fill="#c2bbaa"/><path d="m67 35 9-20 22 6 5 16" fill="#93ad7d"/><path d="m76 15 8 21 14-15" fill="#b6c99b"/><ellipse cx="30" cy="113" rx="14" ry="16" fill="#aaa38f"/><ellipse cx="129" cy="113" rx="14" ry="16" fill="#aaa38f"/>' + face,
      lumoth: '<path d="M71 74C35 12 5 26 16 73q5 18 29 19-32 9-17 34 22 22 48-20m15-32c36-62 66-48 55-1-5 18-29 19-32 9-17 34-22 22-48-20" fill="#d9cea1"/><path d="M66 77C34 38 20 40 28 66q10 16 38 11m29 0c32-39 46-37 38-11-10 16-38 11" fill="#f0e6bc"/><path d="M65 98q-32-6-26 16 15 9 30-7m27-9q32-6 26 16-15 9-30-7" fill="#bfc595"/><ellipse cx="81" cy="103" rx="23" ry="36" fill="#b5b982"/><ellipse cx="81" cy="120" rx="16" ry="17" fill="#f5e69e"/><path d="M71 62 59 36m31 26 12-26" stroke="#8c9468" stroke-width="4" stroke-linecap="round"/><circle cx="58" cy="35" r="5" fill="#e8d685"/><circle cx="103" cy="35" r="5" fill="#e8d685"/><ellipse cx="81" cy="79" rx="31" ry="29" fill="#e6ddad"/><ellipse cx="68" cy="81" rx="4" ry="6" fill="#53634e"/><ellipse cx="94" cy="81" rx="4" ry="6" fill="#53634e"/><path d="M77 92q4 4 8 0" fill="none" stroke="#718064" stroke-width="2" stroke-linecap="round"/>' ,
      bramblet: '<path d="m37 86-14-11 16-12-6-18 24 4 8-26 17 16 20-14 7 24 23-4-5 22 15 12-20 12" fill="#6f9761"/><ellipse cx="79" cy="114" rx="35" ry="28" fill="#87a976"/><ellipse cx="56" cy="137" rx="14" ry="8" fill="#6d8e5a"/><ellipse cx="104" cy="137" rx="14" ry="8" fill="#6d8e5a"/><path d="M42 91q-7-34 36-36 49 1 43 37-4 34-41 34-32-1-38-35" fill="#b7c796"/><path d="M39 83q-15 24 5 40l12-10m63-30q16 24-4 39l-11-12" fill="#72975e"/><path d="M72 55q-4-21 9-25 9 11 2 24" fill="#9db780"/><circle cx="96" cy="47" r="8" fill="#c47e76"/><circle cx="108" cy="53" r="7" fill="#d59585"/><path d="m91 40 4-7 6 9" fill="#567b4f"/>' + face,
      voltkit: '<path d="m116 125 15-27-6-17 24-23-5 30 7 8-25 32" fill="#d8bc68"/><ellipse cx="80" cy="115" rx="31" ry="28" fill="#dbc479"/><ellipse cx="57" cy="138" rx="12" ry="8" fill="#c7aa5b"/><ellipse cx="104" cy="138" rx="12" ry="8" fill="#c7aa5b"/><path d="m40 66-5-39 29 25m34 0 27-25-4 42" fill="#d4b965"/><path d="m35 27 3 18 15-4m72-14-1 18-15-3" fill="#8f8862"/><path d="m76 49 12-22 8 17-8 13" fill="#ecd798"/><ellipse cx="80" cy="83" rx="45" ry="37" fill="#ebd58e"/><path d="m35 87 16 7-13 5m87-12-16 7 13 5" fill="#b99b59"/><ellipse cx="81" cy="118" rx="17" ry="15" fill="#f8e8b3"/>' + face
    };
    return `<svg class="creature-svg" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" ${label ? `role="img" aria-label="${SPECIES[id].name}"` : 'aria-hidden="true"'}>${shadow}${artById[id]}</svg>`;
  }

  window.BloomwildCore = { SAVE_KEY, TYPES, SPECIES, STARTERS, COLS, ROWS, TILE, CAMP, GUIDE, SHRINE, tileAt, walkable, region, pathTo, maxHP, makeCreature, multiplier, damage, catchChance, addXP, freshState, parseSave, wildCreature, art };
})();
