// 通用工具：读配置、开浏览器、进课程章节、找框架、填答、提交、读成绩
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

function loadConfig() {
  const p = process.env.CX_CONFIG || path.join(ROOT, 'config.json');
  if (!fs.existsSync(p)) {
    console.error(`找不到配置文件 ${p}。请先复制 config.example.json 为 config.json 并填入自己的信息。`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getCourse(cfg, name) {
  const c = cfg.courses.find(x => x.name === name);
  if (!c) {
    console.error(`配置里没有课程「${name}」，可用：${cfg.courses.map(x => x.name).join(' / ')}`);
    process.exit(1);
  }
  return c;
}

async function launch(cfg) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext({
    storageState: cfg.storageState,
    viewport: { width: 1600, height: 1200 },
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  return { browser, page };
}

// 打开课程首页
async function openCourse(page, cfg, course) {
  const url = `https://${cfg.schoolHost}/courselist/opencoursenewfy?role=3&courseId=${course.courseId}` +
    `&clazzId=${course.clazzId}&cpi=${cfg.cpi}&ckenc=${course.ckenc}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);
  return url;
}

// 真实点击顶部标签（章节 / 任务 ...）
async function clickTab(page, tabName) {
  const box = await page.evaluate((tab) => {
    const els = Array.from(document.querySelectorAll('li a, li span.nav_content, li'));
    const hit = els.find(e => (e.innerText || '').trim() === tab);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tabName);
  if (!box) return false;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(9000);
  return true;
}

async function findFrame(page, re, tries = 5, wait = 4000) {
  for (let t = 0; t < tries; t++) {
    for (const f of page.frames()) if (re.test(f.url())) return f;
    await page.waitForTimeout(wait);
  }
  return null;
}

// 进入某课程章节树
async function openChapterTree(page, cfg, course) {
  await openCourse(page, cfg, course);
  await clickTab(page, '章节');
  return findFrame(page, /studentcourse/, 4, 3000);
}

// 点击章节里的某个节点
async function clickNode(tree, knowledgeId) {
  await tree.evaluate((k) => {
    const el = document.getElementById('cur' + k);
    if (el) el.click();
  }, knowledgeId);
  await tree.page().waitForTimeout(13000);
}

// 读取题目与选项
async function readQuestions(quiz) {
  return quiz.evaluate(() => {
    const qids = [...new Set(Array.from(document.querySelectorAll('li[qid]')).map(l => l.getAttribute('qid')))];
    return qids.map(qid => {
      const lis = Array.from(document.querySelectorAll(`li[qid="${qid}"]`));
      const opts = lis.map(li => {
        const s = li.querySelector('span.num_option');
        return s ? s.getAttribute('data') : null;
      }).filter(Boolean);
      const num = lis[0] ? (lis[0].closest('[id^="question"]') ? lis[0].closest('[id^="question"]').innerText : '') : '';
      return { qid, opts, head: (num || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    });
  });
}

// 填答：已选中则跳过，避免 addChoice 反选
async function fillAnswers(quiz, plan) {
  return quiz.evaluate((plan) => {
    const out = [];
    const qids = [...new Set(Array.from(document.querySelectorAll('li[qid]')).map(l => l.getAttribute('qid')))];
    qids.forEach(qid => {
      const want = plan[qid];
      const inp = document.getElementById('answer' + qid);
      const cur = inp ? inp.value : '';
      const lis = Array.from(document.querySelectorAll(`li[qid="${qid}"]`));
      const sel = (v) => {
        const hit = lis.find(li => {
          const s = li.querySelector('span.num_option');
          return s && s.getAttribute('data') === v;
        });
        if (hit) {
          if (typeof addChoice === 'function') addChoice(hit); else hit.click();
        }
      };
      if (want && cur !== want) {
        if (cur) sel(cur);   // 先取消已选项
        sel(want);
      }
      const now = document.getElementById('answer' + qid);
      out.push({ qid, want: want || '(keep)', filled: now ? now.value : 'X' });
    });
    return out;
  }, plan);
}

// 轮询点击确认弹窗（按钮文字可能是「提交」或「确定」）
async function clickPopup(page, re = /^(提交|确定|确认|是)$/, tries = 10) {
  for (let i = 0; i < tries; i++) {
    for (const f of page.frames()) {
      try {
        const hit = await f.evaluate((src) => {
          const rx = new RegExp(src);
          const els = Array.from(document.querySelectorAll('a,button,span,div'));
          const el = els.find(e => rx.test((e.innerText || '').trim()) && (e.innerText || '').trim().length <= 4 && e.offsetParent !== null);
          if (el) { el.click(); return (el.innerText || '').trim(); }
          return null;
        }, re.source);
        if (hit) return hit;
      } catch (e) { /* 框架可能已销毁 */ }
    }
    await page.waitForTimeout(2500);
  }
  return null;
}

// 提交并等待批阅页
async function submitAndWait(page) {
  const quiz = await findFrame(page, /doHomeWorkNew/, 3, 2000);
  if (quiz) {
    await quiz.evaluate(() => {
      if (typeof btnBlueSubmit === 'function') btnBlueSubmit();
      else { const a = document.querySelector('a.btnSubmit'); if (a) a.click(); }
    });
  }
  await page.waitForTimeout(4000);
  await clickPopup(page);
  for (let i = 0; i < 10; i++) {
    const rev = await findFrame(page, /selectWorkQuestion/, 1, 500);
    if (rev) return rev;
    await page.waitForTimeout(3000);
  }
  return null;
}

// 解析批阅页
async function parseReview(rev) {
  const html = await rev.evaluate(() => document.documentElement.outerHTML);
  const finalScore = (html.match(/最终成绩<span><i>([\d.]+)<\/i>/) || [])[1] || null;
  const scores = (html.match(/class="scoreNum">([\d.]+)</g) || []).map(s => parseFloat(s.replace(/[^\d.]/g, '')));
  const remainRedo = (html.match(/重做 <i>\(剩余 (\d+) 次\)/) || [])[1] || null;
  return { finalScore, scores, remainRedo, html };
}

module.exports = {
  ROOT, loadConfig, getCourse, launch, openCourse, clickTab, findFrame,
  openChapterTree, clickNode, readQuestions, fillAnswers, clickPopup,
  submitAndWait, parseReview,
};
