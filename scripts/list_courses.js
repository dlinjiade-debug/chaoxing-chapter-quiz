// 列出「我学的课」及其 courseId / clazzId / ckenc
// 用法: node scripts/list_courses.js
const { loadConfig, launch } = require('./common');

(async () => {
  const cfg = loadConfig();
  const { browser, page } = await launch(cfg);
  await page.goto(`https://${cfg.schoolHost}/courselist/mycourse`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  const list = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('li[cid]').forEach(li => {
      out.push({
        cname: li.getAttribute('cname') || '',
        courseId: li.getAttribute('cid') || '',
        clazzId: li.getAttribute('classid') || '',
        cpi: li.getAttribute('cpi') || '',
        kcenc: li.getAttribute('kcenc') || '',
        ckenc: li.getAttribute('ckenc') || '',
      });
    });
    return out;
  });

  console.log('课程数: ' + list.length);
  list.forEach(x => console.log(`- ${x.cname}  courseId=${x.courseId} clazzId=${x.clazzId} ckenc=${x.ckenc}`));
  console.log('\n把需要的课程填进 config.json 的 courses 数组即可。');
  await browser.close();
})();
