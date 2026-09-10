// 查看某章节测验当前状态与成绩（不提交任何内容）
// 用法: node scripts/score.js --course 课程名 --node <knowledgeId>
const { loadConfig, getCourse, launch, openChapterTree, clickNode, findFrame, parseReview } = require('./common');

function arg(k, d) {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
}

(async () => {
  const cfg = loadConfig();
  const course = getCourse(cfg, arg('course'));
  const kid = arg('node');
  const { browser, page } = await launch(cfg);
  const tree = await openChapterTree(page, cfg, course);
  await clickNode(tree, kid);

  const rev = await findFrame(page, /selectWorkQuestion/, 4, 3000);
  const quiz = await findFrame(page, /doHomeWorkNew/, 1, 500);
  if (rev) {
    const r = await parseReview(rev);
    console.log(`[${kid}] 已提交  成绩=${r.finalScore}  每题=${JSON.stringify(r.scores)}  剩余重做=${r.remainRedo}`);
  } else if (quiz) {
    console.log(`[${kid}] 待完成（还在答题页，未提交）`);
  } else {
    console.log(`[${kid}] 未识别`);
  }
  await browser.close();
})();
