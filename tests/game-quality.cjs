// Serve the repository with: python3 -m http.server 4341 --bind 127.0.0.1
// With Playwright and Chromium installed, run: node tests/game-quality.cjs
// Optional suites: smoke, puzzle, pulse, citadel, campaign, wakeward.
// Simulated long runs use the actual game logic and seeded, scripted player input.
// Browser interception exposes test functions only in the automated browser.

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const source = path.resolve(__dirname, "..");
const address = new URL(
  process.env.GROUPQUEST_TEST_URL || "http://127.0.0.1:4341/",
).href;
const games = {
  "Spot It!": ["index.html", "#startBtn", "#grid button"],
  "Pulse Shift": ["groupquest_pulse_shift.html", "#play", "#pause"],
  "Orbit Merge": ["orbit_merge.html", "#primary", "canvas"],
  "Lumen Vault": ["lumen_vault_fixed.html", null, "#board svg"],
  "Prism Pop": ["groupquest_prism_pop.html", "#modalPrimary", "#board .cell"],
  Moonfall: ["moonfall_last_light.html", "#startBtn", "#pauseBtn"],
  Voidforge: ["groupquest_voidforge.html", "#start", "#dash"],
  Echobound: ["echobound.html", null, "button"],
  "Citadel Protocol": ["groupquest_citadel_protocol.html", "#play", "#next"],
  "Citadel Protocol Balanced": [
    "groupquest_citadel_balanced.html",
    "#play",
    "#next",
  ],
  Wakeward: ["wakeward/index.html", null, "button[data-action=campaign]"],
};

async function check(browser, name, filename, action, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 750 },
    reducedMotion: "reduce",
    ...options.device,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(address))
      errors.push(r.status() + " " + r.url());
  });
  try {
    if (options.code) {
      let html = await fs.readFile(path.join(source, filename), "utf8");
      const location = html.lastIndexOf("})();");
      assert.ok(location >= 0);
      html =
        html.slice(0, location) +
        "\n" +
        options.code +
        "\n" +
        html.slice(location);
      if (options.fastWait)
        html = html.replace(
          "const wait=ms=>new Promise(r=>setTimeout(r,ms));",
          "const wait=()=>Promise.resolve();",
        );
      await page.route(address + filename, (r) =>
        r.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
      );
    }
    if (options.noAnimation)
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 1;
        window.cancelAnimationFrame = () => {};
      });
    if (options.seed)
      await page.addInitScript((seed) => {
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
      }, options.seed);
    await page.goto(address + filename, { waitUntil: "load" });
    const result = await action(page);
    assert.deepEqual(errors, [], name);
    console.log("PASS", name, result ?? "");
  } finally {
    await context.close();
  }
}

async function normal(browser) {
  for (const [name, [file, start, play]] of Object.entries(games)) {
    for (const device of [
      { ...devices["Pixel 7"], viewport: { width: 360, height: 700 } },
      { viewport: { width: 1366, height: 850 } },
    ]) {
      await check(
        browser,
        name + " " + device.viewport.width,
        file,
        async (page) => {
          if (start) await page.locator(start).click({ timeout: 4000 });
          await page
            .locator(play)
            .first()
            .waitFor({ state: "visible", timeout: 4000 });
          const sizes = await page.evaluate(() => [
            document.documentElement.scrollWidth,
            innerWidth,
          ]);
          assert.ok(sizes[0] <= sizes[1] + 1, "horizontal overflow " + sizes);
        },
        { device },
      );
    }
  }
}

async function puzzles(browser) {
  await check(
    browser,
    "Spot It full round and replay",
    "index.html",
    async (page) => {
      await page.clock.install();
      await page.locator("#startBtn").tap();
      const cells = page.locator("#grid button");
      for (let i = 0; i < 10; i++) {
        const target = await page.evaluate(() => targetIndex);
        await cells.nth(target).tap();
        await page.clock.runFor(150);
      }
      assert.equal(await page.locator("#score").textContent(), "100");
      await page.clock.runFor(61000);
      assert.equal(
        await page.locator("#overlayTitle").textContent(),
        "Час вийшов!",
      );
      await page.locator("#startBtn").tap();
      assert.equal(await page.locator("#timer").textContent(), "60");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("gq_best")),
        "100",
      );
    },
    { device: devices["Pixel 7"] },
  );

  await check(
    browser,
    "Lumen Vault all 60 chambers",
    "lumen_vault_fixed.html",
    async (page) => {
      return await page.evaluate(() => {
        for (let room = 1; room <= TOTAL; room++) {
          if (save.level !== room || trace().hit)
            throw Error("Bad opening " + room);
          const answer = Object.entries(level.solution).filter(
            ([id, value]) => board[id].type !== value,
          );
          if (answer.length === 0) throw Error("No rotations " + room);
          for (const [i] of answer)
            rotate(Number(i) % SIZE, Math.floor(Number(i) / SIZE));
          if (!trace().hit || save.stars[room] !== 3 || save.states[room])
            throw Error("Not solved " + room);
          if (room < TOTAL) document.getElementById("nextLevel").click();
        }
        const record = JSON.parse(localStorage.getItem(STORE));
        if (Object.keys(record.stars).length !== 60)
          throw Error("Missing stars");
        return "180 stars, saved";
      });
    },
  );

  await check(
    browser,
    "Prism Pop 25 rounds and high level",
    "groupquest_prism_pop.html",
    async (page) => {
      return await page.evaluate(async () => {
        await window.quality();
        return "levels 1–25 and 1000 passed";
      });
    },
    {
      seed: 741,
      noAnimation: true,
      fastWait: true,
      code: `
 window.quality=async()=>{
  levelStart(true);
  for(const round of [...Array.from({length:25},(_,i)=>i+1),1000]){
   if(round===1000){level=round;levelStart();}
   if(level!==round)throw Error('Wrong level '+level);
   while(moves>0&&levelScore<target){
    const step=findMove();
    if(!step)throw Error('Dead board '+round);
    await swap(...step);
   }
   if(levelScore<target)throw Error('Blocked at level '+round);
   document.getElementById('modalPrimary').click();
  }
 };
 `,
    },
  );

  await check(
    browser,
    "Orbit Merge supply, real collision and final planet",
    "orbit_merge.html",
    async (page) => page.evaluate(() => window.quality()),
    {
      seed: 318,
      noAnimation: true,
      code: `
 window.quality=()=>{
  for(let bag=0;bag<64;bag++){
   const distribution=Array.from({length:8},randLevel).sort().join('');
   if(distribution!=='00001112')throw Error('Unfair supply');
  }
  reset();
  current=next=0;
  aimX=W/2;drop();
  for(let i=0;i<60;i++)update(1/60);
  drop();
  for(let i=0;i<100;i++)update(1/60);
  if(!balls.some(orb=>orb.level===1)||score!==20)throw Error('First merge failed');
  reset();
  const radiusAtGoal=radius(MAX_LEVEL-1);
  balls=[{x:W/2-radiusAtGoal*.65,y:H*.5,r:radiusAtGoal,level:MAX_LEVEL-1,age:1,vx:0,vy:0},{x:W/2+radiusAtGoal*.65,y:H*.5,r:radiusAtGoal,level:MAX_LEVEL-1,age:1,vx:0,vy:0}];
  update(1/60);
  if(!over||document.getElementById('modalTitle').textContent!=='ORBIT COMPLETE')throw Error('No final planet');
  return '512 draws, collision and victory';
 };
 `,
    },
  );
}

async function pulse(browser) {
  const code = `
 window.quality=()=>{
  start('daily');
  for(let i=0;i<3700&&state==='playing';i++){
   const travel=(playerY+55)/480;
   const close=objects.filter(o=>o.y>=playerY-46*travel&&o.y<=playerY+26*travel&&!o.hit);
   const banned=new Set(close.filter(o=>o.kind==='hazard').map(o=>o.lane));
   const gem=close.find(o=>o.kind==='gem'&&!banned.has(o.lane));
   if(gem)shift(gem.lane);
   else if(banned.has(lane))shift([0,1,2].find(candidate=>!banned.has(candidate)));
   update(1/60);
  }
  if(elapsed<60||document.getElementById('endTag').textContent!=='DAILY CLEARED'||gems<5)throw Error('Daily failed at '+elapsed);
  return {score,gems};
 };
 `;
  const scores = [];
  for (const [width, height] of [
    [320, 500],
    [390, 770],
    [1366, 840],
  ])
    await check(
      browser,
      "Pulse Shift daily " + width,
      "groupquest_pulse_shift.html",
      async (page) => {
        const result = await page.evaluate(() => window.quality());
        scores.push(result.score);
        return result;
      },
      {
        seed: 340,
        noAnimation: true,
        device: { viewport: { width, height } },
        code,
      },
    );
  assert.equal(
    new Set(scores).size,
    1,
    "daily scoring must match across screens",
  );
}

async function citadels(browser) {
  for (const filename of [
    "groupquest_citadel_protocol.html",
    "groupquest_citadel_balanced.html",
  ]) {
    await check(
      browser,
      filename + " 12-wave campaign",
      filename,
      async (p) => p.evaluate(() => window.quality()),
      {
        seed: 399,
        noAnimation: true,
        code: `
   window.quality=()=>{
    document.getElementById('play').click();
    const coverage=(x,y,type)=>way.reduce((sum,p)=>{
     const d=Math.hypot(p.x-(x+.5)*C,p.y-(y+.5)*C);
     return sum+Math.max(0,1-d/TYPES[type].range);
    },0);
    for(let round=1;round<=12;round++){
     const choices=document.getElementById('choices');
     if(choices) (Array.from(choices.children).find(t=>t.textContent.includes('ПЛАЗМОВЕ'))||choices.firstElementChild).click();
     for(let budget=0;budget<18;budget++){
      const type=round>2&&state.cash>=TYPES[1].cost?1:0;
      if(state.towers.length>=13||state.cash<TYPES[type].cost){
       const tower=state.towers.map((t,i)=>[t,i]).filter(([t])=>t.level<5&&state.cash>=upgradeCost(t))
        .sort(([a],[b])=>coverage(b.gx,b.gy,b.type)-coverage(a.gx,a.gy,a.type))[0];
       if(!tower)break;selectedTower=tower[1];document.getElementById('upgrade').click();
       continue;
      }
      const cells=[];
      for(let y=0;y<N;y++)for(let x=0;x<N;x++){
       if(pathSet.has(x+','+y)||state.towers.some(t=>t.gx===x&&t.gy===y))continue;
       cells.push([x,y,coverage(x,y,type)]);
      }
      cells.sort((a,b)=>b[2]-a[2]);
      selectedType=type;place(cells[0][0],cells[0][1]);
     }
     document.getElementById('next').click();
     if(!state.active)throw Error('Failed to start wave '+round);
     for(let frame=0;state.active&&frame<12000;frame++)tick(1/30);
     if(state.hp<=0||state.active)throw Error('Stopped at wave '+round+' with HP '+state.hp);
    }
    if(!state.ended||!document.getElementById('modal').textContent.includes('ЦИТАДЕЛЬ ВРЯТОВАНО'))throw Error('No victory');
    return {health:state.hp,kills:state.kills,score:state.score};
   };
  `,
      },
    );
  }
}

async function campaigns(browser) {
  if (!process.argv[3] || process.argv[3] === "moon")
    await check(
      browser,
      "Moonfall 12 wave victory",
      "moonfall_last_light.html",
      (p) => p.evaluate(() => window.quality()),
      {
        seed: Number(process.env.GROUPQUEST_SEED) || 393,
        noAnimation: true,
        code: `
  window.quality=()=>{
   sound=false;startNew();
   const upgradesRank=['blade','tempo','orbit','twin','frost','heal','pierce','heart','shield','steps'];
   for(let i=0;i<65000;i++){
    if(game.phase==='reward'){
     const preferred=game.choices.slice().sort((a,b)=>upgradesRank.indexOf(a)-upgradesRank.indexOf(b));
     pickUpgrade(preferred[0]);
    }
    if(game.phase==='dead')throw Error('Moonfall death at wave '+game.wave);
    if(game.phase==='win')return {wave:game.wave,kills:game.kills,time:Math.round(game.totalTime)};
    const p=game.player;
    if(i%5===0){
     const nearest=game.enemies.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,15);
     const bullets=game.enemyBullets.filter(b=>Math.hypot(b.x-p.x,b.y-p.y)<245);
     let best=null;
     for(let dir=0;dir<=12;dir++){
      const vx=dir===12?0:Math.cos(dir*Math.PI/6),vy=dir===12?0:Math.sin(dir*Math.PI/6);
      const px=p.x+vx*105,py=p.y+vy*105;
      let distance=Infinity, value=0;
      for(const e of nearest){const d=Math.hypot(e.x-px,e.y-py);distance=Math.min(distance,d);value-=Math.max(0,195-d)*1.7;}
      for(const b of bullets){const d=Math.hypot(b.x+b.vx*.42-px,b.y+b.vy*.42-py);value-=Math.max(0,100-d)*2.4;}
      if(nearest.length)value-=Math.max(0,distance-315)*1.6;
      else value-=Math.hypot(px-p.x,py-p.y);
      if(!best||value>best[0])best=[value,vx,vy];
     }
     [inputs.joy.x,inputs.joy.y]=best.slice(1);
    }
    update(1/30);
   }
   throw Error('Moonfall timed out '+JSON.stringify({wave:game.wave,phase:game.phase,hp:game.player.hp,kills:game.kills,queue:game.queue,foes:game.enemies.map(e=>[e.type,e.hp,Math.round(Math.hypot(e.x-game.player.x,e.y-game.player.y))]), upgrades:game.player.upgradeLevels}));
  };
 `,
      },
    );

  if (!process.argv[3] || process.argv[3] === "void")
    await check(
      browser,
      "Voidforge three bosses",
      "groupquest_voidforge.html",
      (p) => p.evaluate(() => window.quality()),
      {
        seed: Number(process.env.GROUPQUEST_SEED) || 228,
        noAnimation: true,
        code: `
  window.quality=()=>{
   muted=true;start();
   const rank=['Блискав','Дрон','Шкода','Орбіт','Регенерація','Здоров','Швидкостр','Нова','Магніт','Мороз'];
   for(let i=0;i<25000;i++){
    if(state==='upgrade'){
     const cards=[...document.querySelectorAll('#choices .card')];
     const score=card=>{const ix=rank.findIndex(x=>card.textContent.includes(x));return ix<0?rank.length:ix;};
     cards.sort((a,b)=>score(a)-score(b));
     cards[0].click();
    }
    if(wardensDefeated>=3){if(state==='play')gameOver();return {bosses:wardensDefeated,time:Math.round(elapsed),kills:p.kills};}
    if(state==='over')throw Error('Voidforge died at '+elapsed+' with '+wardensDefeated+' bosses');
    if(i%5===0){
     const foes=enemies.filter(e=>!e.dead).sort((a,b)=>dist(a,p)-dist(b,p)).slice(0,16);
     const loot=gems.filter(g=>dist(g,p)<350).sort((a,b)=>dist(a,p)-dist(b,p)).slice(0,4);
     let best=null;
     for(let dir=0;dir<=12;dir++){
      const vx=dir===12?0:Math.cos(dir*Math.PI/6),vy=dir===12?0:Math.sin(dir*Math.PI/6);
      const pos={x:clamp(p.x+vx*115,20,WORLD-20),y:clamp(p.y+vy*115,20,WORLD-20)};
      let value=0, closest=Infinity;
      for(const e of foes){const d=dist(e,pos);closest=Math.min(closest,d);value-=Math.max(0,185-d)*1.7;}
      if(foes.length)value-=Math.max(0,closest-330)*1.4;
      for(const b of bullets){
       if(b.enemy && dist(b,p)<230){
        const predicted={x:b.x+b.vx*.43,y:b.y+b.vy*.43};
        value-=Math.max(0,90-dist(predicted,pos))*2.7;
       }
      }
      if(boss)value-=Math.max(0,dist(boss,pos)-310)*2;
      if(loot.length)value-=Math.min(...loot.map(g=>dist(g,pos)))*.67;
      value-=Math.max(0,95-Math.min(pos.x,pos.y,WORLD-pos.x,WORLD-pos.y))*1.1;
      if(!best||value>best[0])best=[value,vx,vy];
     }
     [joy.x,joy.y]=best.slice(1);
     if(foes.length&&dist(foes[0],p)<60&&p.dash<=0)dash();
    }
    update(1/30);
   }
   throw Error('Voidforge timed out at '+elapsed);
  };
 `,
      },
    );

  if (!process.argv[3] || process.argv[3] === "echo")
    await check(
      browser,
      "Echobound full three-act run",
      "echobound.html",
      (p) => p.evaluate(() => window.quality()),
      {
        seed: Number(process.env.GROUPQUEST_SEED) || 283,
        noAnimation: true,
        code: `
  window.quality=()=>{
   newRun();
   const cardWeight={flare:28,drain:12,reap:15,pierce:11,needle:14,shatter:17,dash:24,arc:11,focus:16,surge:16,strike:8};
   for(let step=0;step<2600;step++){
    const screen=state.screen;
    if(screen==='victory') return {act:MAX_ACT,rooms:R().nodesCleared,hp:R().hp};
    if(screen==='defeat') throw Error('Echobound defeated at act '+R().act+' stage '+R().stage);
    if(screen==='map'){
     const list=routeOptions();chooseRoute(list.includes('camp')?'camp':list.includes('shop')&&R().gold>=100?'shop':list.includes('battle')?'battle':list[0]);
    }else if(screen==='camp'){
     if(R().hp<R().maxHp-18)campHeal();else {campUpgrade();upgradeCard(R().deck.findIndex(c=>c.id==='strike'&&!c.up));if(state.screen==='camp')campHeal();}
    }else if(screen==='shop'){
     if(R().hp<R().maxHp-15)buyShop('healing',0);
     for(const [index,item] of state.shop.relics.entries()){
      if(['hope','blessing','armor','phoenix'].includes(item.id))buyShop('relics',index);
     }
     for(const [index,item] of state.shop.cards.entries()){
      if((cardWeight[item.id]||0)>=12)buyShop('cards',index);
     }
     completeNode();
    }else if(screen==='event'){
     eventChoice(0);
    }else if(screen==='reward'){
     const cards=state.reward.cards;
     if(cards.length){
      const selected=cards.slice().sort((a,b)=>(cardWeight[b]||0)-(cardWeight[a]||0))[0];
      if(cardWeight[selected]>=9)acceptCard(selected);else finishReward();
     }else finishReward();
    }else if(screen==='relicReward'){
     const list=state.reward.relics;acceptRelic(['hope','blessing','armor','phoenix'].find(a=>list.includes(a))||list[0]);
    }else if(screen==='battle'){
     const b=B();
     const enemies=b.enemies.filter(e=>e.hp>0);
     const target=enemies.slice().sort((a,b)=>(a.hp+a.block)-(b.hp+b.block))[0];
     selection=target.uid;
     if(R().potions&&R().hp<=R().maxHp-22)potion();
     const imminent=enemies.reduce((sum,e)=>sum+(['hit','charge','multi'].includes(e.intent.kind)?e.intent.amount+(e.str||0):0),0);
     const choices=b.hand.map((c,index)=>{
      const def=C[c.id];
      const value=cardWeight[c.id]??(def.type==='attack'?9:4);
      const score=c.id==='guard'&&imminent>b.player.block&&target.hp+target.block>9?14:value;
      return {index,score:score+(c.up?1:0),cost:def.cost};
     }).filter(c=>c.cost<=b.energy&&c.score>=7).sort((a,b)=>b.score-a.score);
     if(choices.length)playCard(choices[0].index);else endTurn();
    }else throw Error('Unexpected screen '+screen);
   }
   throw Error('Echobound timed out at '+state.screen+' act '+R().act+' stage '+R().stage);
  };
 `,
      },
    );
}

async function wakeward(browser) {
  const { CAMPAIGN } = await import(path.join(source, "wakeward/charts.mjs"));
  const { solve } = await import(path.join(source, "wakeward/engine.mjs"));
  await check(
    browser,
    "Wakeward all 24 charts, browser and saved medals",
    "wakeward/index.html",
    async (page) => {
      await page.locator("button[data-action=campaign]").click();
      await page.locator("#play").waitFor();
      const stroke = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];
      await page.keyboard.press(stroke[solve(CAMPAIGN[0].chart)[0]]);
      await page.keyboard.press("z");
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("groupquest.wakeward")).runs
              .campaign.moves.length,
        ),
        0,
      );
      for (const [id, { chart, par }] of CAMPAIGN.entries()) {
        const route = solve(chart, undefined, Infinity);
        assert.equal(route.length, par);
        for (const direction of route)
          await page.keyboard.press(stroke[direction]);
        const record = await page.evaluate(
          (id) =>
            JSON.parse(localStorage.getItem("groupquest.wakeward")).campaign[
              id
            ],
          id,
        );
        assert.equal(record.best, par);
        assert.equal(record.stars, 3);
        if (id + 1 < CAMPAIGN.length)
          await page.locator("button[data-action=next]").click();
      }
      return "72 stars, all charts through keyboard";
    },
  );
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.GROUPQUEST_CHROMIUM,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    switch (process.argv[2]) {
      case "puzzle":
        await puzzles(browser);
        break;
      case "pulse":
        await pulse(browser);
        break;
      case "citadel":
        await citadels(browser);
        break;
      case "campaign":
        await campaigns(browser);
        break;
      case "wakeward":
        await wakeward(browser);
        break;
      case "smoke":
        await normal(browser);
        break;
      default:
        await normal(browser);
        await puzzles(browser);
        await pulse(browser);
        await citadels(browser);
        await campaigns(browser);
        await wakeward(browser);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
