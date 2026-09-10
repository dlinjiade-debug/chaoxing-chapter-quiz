// 查看某课程的章节树与「已完成任务点 x/N」
// 用法: node scripts/chapters.js --course 课程名
const fs = require('fs');
const path = require('path');
const { loadConfig, getCourse, launch, openChapterTree, findFrame } = require('./common');

function arg(k, d) {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? process.argv[i + 1] : d;
}

(async () => {
  const cfg = loadConfig();
  const course = getCourse(cfg, arg('course'));
  const { browser, page } = await launch(cfg);

  const tree = await openChapterTree(page, cfg, course);
  if (!tree) { console.error('未拿到章节框架，检查 ckenc/登录态是否过期'); await browser.close(); process.exit(1); }

  const txt = await tree.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
  const nodes = await tree.evaluate(() => {
    const out = [];
    document.querySelectorAll('div[id^="cur"]').forEach(e => {
      out.push({ knowledgeId: e.id.replace('cur', ''), title: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70) });
    });
    return out;
  });

  console.log(txt.slice(0, 1200));
  console.log(`\n节点 ${nodes.length}:`);
  nodes.forEach(n => console.log(`  ${n.knowledgeId}  ${n.title}`));

  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const safe = course.name.replace(/[\\/:*?"<>|\s]+/g, '_');
  const file = `chapters_${safe || 'course'}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ course: course.name, nodes }, null, 1), 'utf8');
  console.log(`\n已保存 out/${file}`);
  await browser.close();
})();
