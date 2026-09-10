// 抓取某章节测验：题面、qid、选项、音频 objectId
// 用法: node scripts/quiz.js --course 课程名 --node <knowledgeId>
const fs = require('fs');
const path = require('path');
const { loadConfig, getCourse, launch, openChapterTree, clickNode, findFrame, readQuestions } = require('./common');

function arg(k, d) {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
}

(async () => {
  const cfg = loadConfig();
  const course = getCourse(cfg, arg('course'));
  const kid = arg('node');
  if (!kid) { console.error('需要 --node <knowledgeId>'); process.exit(1); }

  const { browser, page } = await launch(cfg);
  const tree = await openChapterTree(page, cfg, course);
  if (!tree) { console.error('未拿到章节框架'); await browser.close(); process.exit(1); }
  await clickNode(tree, kid);

  const quiz = await findFrame(page, /doHomeWorkNew/, 5, 4000);
  if (!quiz) { console.error('该节点没有可答的测验（可能已完成或不是测验节点）'); await browser.close(); process.exit(1); }

  const qs = await readQuestions(quiz);
  const body = await quiz.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 3000));
  const audioIds = await quiz.evaluate(() => [...new Set(
    Array.from(document.querySelectorAll('iframe'))
      .map(f => (f.getAttribute('src') || '').match(/objectid=([0-9a-f]+)/))
      .filter(Boolean).map(m => m[1])
  )]);
  const redo = await quiz.evaluate(() => (document.getElementById('limitWorkSubmitTimes') || {}).value || null);

  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const data = { knowledgeId: kid, questions: qs, audioIds, limitWorkSubmitTimes: redo, bodyText: body };
  fs.writeFileSync(path.join(outDir, `quiz_${kid}.json`), JSON.stringify(data, null, 1), 'utf8');

  console.log(`题数 ${qs.length}，音频 ${audioIds.length} 个，limitWorkSubmitTimes=${redo}`);
  console.log('题面: ' + body.slice(0, 800));
  if (audioIds.length) console.log('音频 objectId: ' + JSON.stringify(audioIds));
  console.log(`\n已保存 out/quiz_${kid}.json`);
  await browser.close();
})();
