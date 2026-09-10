// 按答案文件填答并提交，输出成绩
// 用法: node scripts/submit.js --course 课程名 --node <knowledgeId> --answers out/answers_xxx.json [--dry]
// 答案文件格式: { "qid": "true" | "false" | "A" | "B" ... }
const fs = require('fs');
const path = require('path');
const { loadConfig, getCourse, launch, openChapterTree, clickNode, findFrame,
  fillAnswers, submitAndWait, parseReview } = require('./common');

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

  let quiz = await findFrame(page, /doHomeWorkNew/, 5, 4000);
  if (!quiz) { console.error('没有可答的测验页'); await browser.close(); process.exit(1); }

  const filled = await fillAnswers(quiz, plan);
  const bad = filled.filter(f => f.want !== '(keep)' && f.filled !== f.want);
  console.log(`填入 ${filled.length - bad.length}/${filled.length}`);
  if (bad.length) {
    console.log('以下题目未填成功，已中止提交：', JSON.stringify(bad));
    await browser.close(); process.exit(2);
  }
  if (dry) { console.log('--dry：仅填写未提交'); await browser.close(); process.exit(0); }

  const rev = await submitAndWait(page);
  if (!rev) { console.error('未等到批阅页'); await browser.close(); process.exit(1); }
  const r = await parseReview(rev);
  console.log(`成绩 ${r.finalScore}  每题 ${JSON.stringify(r.scores)}  剩余重做 ${r.remainRedo}`);

  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `review_${kid}.html`), r.html, 'utf8');
  await browser.close();
})();
