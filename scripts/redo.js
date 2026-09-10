// 已提交的测验改错重交：点「重做」→ 按新答案填答 → 提交
// 用法: node scripts/redo.js --course 课程名 --node <knowledgeId> --answers out/answers_fix.json [--dry]
// 提示：判断题答错时取反即可（二值）；单选题需要额外信息，别盲改。
const fs = require('fs');
const path = require('path');
const { loadConfig, getCourse, launch, openChapterTree, clickNode, findFrame,
  fillAnswers, clickPopup, submitAndWait, parseReview } = require('./common');

function arg(k, d) {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
}

(async () => {
  const cfg = loadConfig();
  const course = getCourse(cfg, arg('course'));
  const kid = arg('node');
  const ansPath = arg('answers');
  const dry = process.argv.includes('--dry');
  if (!kid || !ansPath) { console.error('需要 --node <knowledgeId> --answers <文件>'); process.exit(1); }

  const plan = JSON.parse(fs.readFileSync(path.resolve(ansPath), 'utf8'));
  const { browser, page } = await launch(cfg);
  const tree = await openChapterTree(page, cfg, course);
  if (!tree) { console.error('未拿到章节框架'); await browser.close(); process.exit(1); }
  await clickNode(tree, kid);

  let quiz = await findFrame(page, /doHomeWorkNew/, 3, 3000);
  if (!quiz) {
    const rev = await findFrame(page, /selectWorkQuestion/, 4, 3000);
    if (!rev) { console.error('既没有答题页也没有批阅页'); await browser.close(); process.exit(1); }
    const remain = await rev.evaluate(() => {
      const m = document.body.innerText.match(/重做\s*\(剩余\s*(\d+)\s*次\)/);
      return m ? Number(m[1]) : 0;
    });
    if (remain <= 0) { console.error('重做次数已用完，无法改错'); await browser.close(); process.exit(3); }
    const clicked = await rev.evaluate(() => {
      const a = document.querySelector('a.jb_btn_bg');
      if (a && /重做/.test(a.innerText)) { a.click(); return a.innerText.trim(); }
      return null;
    });
    console.log('点击: ' + clicked + `（剩余 ${remain} 次）`);
    await clickPopup(page, /^确定$/, 6);
    quiz = await findFrame(page, /doHomeWorkNew/, 6, 4000);
  }
  if (!quiz) { console.error('重做后仍未拿到答题页'); await browser.close(); process.exit(1); }

  const filled = await fillAnswers(quiz, plan);
  const bad = filled.filter(f => f.want !== '(keep)' && f.filled !== f.want);
  console.log(`填入 ${filled.length - bad.length}/${filled.length}`);
  if (bad.length) { console.log('未填成功，已中止：', JSON.stringify(bad)); await browser.close(); process.exit(2); }
  if (dry) { console.log('--dry：仅填写未提交'); await browser.close(); process.exit(0); }

  const rev2 = await submitAndWait(page);
  if (!rev2) { console.error('未等到批阅页'); await browser.close(); process.exit(1); }
  const r = await parseReview(rev2);
  console.log(`重做后成绩 ${r.finalScore}  每题 ${JSON.stringify(r.scores)}`);

  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `review_${kid}.html`), r.html, 'utf8');
  await browser.close();
})();
