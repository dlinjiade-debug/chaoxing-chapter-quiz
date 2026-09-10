# chaoxing-chapter-quiz

超星 / 学习通 **「课程章节」内的章节测验** 自动化工具集：抓题目、抓听力音频、**离线转写音频**、按答案提交、读取批阅成绩。

基于 Playwright（复用浏览器登录态）+ vosk（离线语音识别）。全部数据留在本地。

---

## ⚠️ 使用声明

- 本仓库是**个人效率工具**，用于：批量查看自己的章节任务、抓取题目与音频、把已经会做的题自动填好、核对成绩。
- **请不要用它代替学习或替他人作答**。是否提交、提交什么答案，责任在使用者自己；请遵守所在学校的课程规定。
- 仓库**不包含**任何账号、Cookie、课程 ID、真实题目与答案，脚本里也不存在任何硬编码的学校或个人数据。

---

## 目录结构

```
chaoxing-chapter-quiz/
├─ config.example.json      # 配置模板（复制为 config.json，后者不入库）
├─ answers.example.json     # 答案文件格式示例
├─ package.json             # Node 依赖：playwright
├─ requirements.txt         # Python 依赖：requests / vosk / imageio-ffmpeg
├─ scripts/
│  ├─ common.js             # 公共逻辑：配置/开浏览器/进章节/填答/提交/读成绩
│  ├─ list_courses.js       # 列出我学的课（courseId、clazzId、ckenc）
│  ├─ chapters.js           # 查看章节树与「已完成任务点 x/N」
│  ├─ quiz.js               # 抓某节点的题目、qid、选项、音频 objectId
│  ├─ submit.js             # 按答案文件填答并提交，打印成绩
│  ├─ redo.js               # 已提交的测验「重做」改错并再次提交
│  ├─ score.js              # 只读查看状态与成绩
│  └─ asr.py                # 下载音频 + ffmpeg 转码 + vosk 转写
└─ out/                     # 运行产物（已 gitignore）
```

---

## 安装（作为 WorkBuddy / CodeBuddy 技能）

本仓库同时是一个标准技能包（根目录 `SKILL.md`，已通过官方 `package_skill.py` 校验）。三种装法：

**A. 下载技能包 zip（最简单）**

从 [Releases](https://github.com/dlinjiade-debug/chaoxing-chapter-quiz/releases) 下载 `chaoxing-chapter-quiz.zip`，解压到技能目录：

```bash
# WorkBuddy
mkdir -p ~/.workbuddy/skills && unzip -o chaoxing-chapter-quiz.zip -d ~/.workbuddy/skills
# CodeBuddy
mkdir -p ~/.codebuddy/skills && unzip -o chaoxing-chapter-quiz.zip -d ~/.codebuddy/skills
```

装好后应存在 `~/.workbuddy/skills/chaoxing-chapter-quiz/SKILL.md`。

**B. 用 skills CLI 从仓库安装**

```bash
npx skills add dlinjiade-debug/chaoxing-chapter-quiz -g -y
```

**C. 直接克隆**

```bash
git clone https://github.com/dlinjiade-debug/chaoxing-chapter-quiz
cp -r chaoxing-chapter-quiz ~/.workbuddy/skills/
```

> 自行重新打包：`python <skill-creator>/scripts/package_skill.py . ./dist`
> 打包前先把要打的内容复制成干净目录，否则会把 `.git` 一起塞进 zip。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
pip install -r requirements.txt
```

浏览器用本机 Edge（脚本里的 `channel: 'msedge'`），无需额外下载 Chromium。

### 2. 准备登录态

1. 正常用 Edge 登录学习通。
2. **关闭 Edge**（运行时 Cookie 库被独占锁定，不关会复制失败）。
3. 复制一份 Edge 的 User Data 目录，用 Playwright 以该 profile 启动后导出：

```js
const { chromium } = require('playwright');
(async () => {
  const ctx = await chromium.launchPersistentContext('<复制出来的 profile 目录>', { channel: 'msedge' });
  await ctx.storageState({ path: 'chaoxing_state.json' });
  await ctx.close();
})();
```

得到的 `chaoxing_state.json` 就是登录态，**不要提交到仓库**（已在 `.gitignore` 中）。

### 3. 写配置

```bash
cp config.example.json config.json
```

```jsonc
{
  "storageState": "./chaoxing_state.json",
  "schoolHost": "your-school.fanya.chaoxing.com",   // 学校专属域名
  "cpi": "000000000",                                // 个人 cpi，从课程卡片属性里取
  "courses": [
    { "name": "课程A", "courseId": "...", "clazzId": "...", "ckenc": "..." }
  ],
  "asr": { "modelPath": "C:/asr/vosk-model-small-en-us-0.15" }
}
```

`courseId / clazzId / ckenc` 用 `npm run courses` 一次性拿到。

---

## 典型流程

```bash
# 1. 列课程
npm run courses

# 2. 看某课程的章节树和任务点
node scripts/chapters.js --course 课程A

# 3. 抓某节点的题目（含音频 objectId）
node scripts/quiz.js --course 课程A --node 1234567890

# 4.（听力题）下载音频并离线转写，得到原文
python scripts/asr.py <objectId>

# 5. 依据原文写好答案文件 out/answers.json：{ "qid": "true" | "false" | "A" | ... }
#    判断题用 true/false，单选题用 A/B/C/D

# 6. 提交（加 --dry 可只填写不提交）
node scripts/submit.js --course 课程A --node 1234567890 --answers out/answers.json

# 7. 随时查看成绩
node scripts/score.js --course 课程A --node 1234567890

# 8. 提交后发现错题？在剩余次数内改错重交
node scripts/redo.js --course 课程A --node 1234567890 --answers out/answers_fix.json
```

答案文件格式见 `answers.example.json`：`{ "题目qid": "true" | "false" | "A" ... }`，
不想改的题直接不写即可（填答时会保留原值）。`redo.js` 会先检查剩余次数，用完就直接退出，不会白试。

---

## 听力题怎么做（重点）

听力测验**不会公布标准答案**，而且多数章节测验的**重做次数只有 1 次**（页面里 `limitWorkSubmitTimes` 写的数字不可信，以批阅页「重做(剩余 N 次)」为准）。所以**不要盲交试错**，正确姿势是先把音频转成文字：

1. `quiz.js` 会输出音频的 `objectId`；
2. `asr.py` 通过 `https://mooc1.chaoxing.com/ananas/status/<objectId>` 拿到下载链接（返回里还有 `filename` 和 `duration`，可用文件名核对是哪一单元的录音）；
3. ffmpeg 转 16k 单声道 → vosk 识别 → 输出 `out/asr_<objectId>.txt`；
4. 对着原文逐句判断题目的对错。

模型下载：https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip

> **坑**：vosk 模型目录必须是**纯 ASCII 路径**（如 `C:/asr/...`）。放在含中文的目录下会报
> `Folder '...' does not contain model files` ——这是 C++ 侧窄字符路径读不了 CJK，跟文件是否完整无关。

---

## 原理与坑位（都是踩出来的）

| 事项 | 说明 |
|---|---|
| 找 iframe | 必须匹配 `doHomeWorkNew`（答题页）/ `selectWorkQuestion`（批阅页）。宽匹配 `work/` 会撞上作业列表和播放器包装页 |
| 进章节 | 课程页是 SPA，接口抓不到树；要走 `courselist/opencoursenewfy` 落地后**真实鼠标点击**「章节」标签 |
| 选项取值 | `li[qid]` 下 `span.num_option` 的 `data` 属性：单选 = `A/B/C/D`，判断 = `true/false` |
| 选中方式 | 调页面函数 `addChoice(li)`；**已选中的选项再点会反选**，所以填答前先读 `input#answer<qid>`，值相同就跳过 |
| 提交确认 | 弹窗按钮文字可能是「提交」也可能是「确定」，要轮询尝试 |
| 暂存 | `a.btnSave` → `noSubmit()`；别用 innerText 找按钮，容器 div 会误命中 |
| 批阅页 | `最终成绩<span><i>分数</i>`、`class="scoreNum"` 是每题得分、`重做 <i>(剩余 N 次)` 是剩余机会 |
| 重做 | 批阅页里的重做按钮是 `a.jb_btn_bg`，点完还要再点一次「确定」 |

---

## 隐私

- 仓库**不含**任何个人数据；所有账号相关信息都在 `config.json` / `chaoxing_state.json`，两者均已 gitignore。
- 运行产物（题目、音频、转写文本、批阅 HTML）全部写入 `out/`，也已 gitignore。
- 若要把 `out/` 里的样例分享出去，请先自行检查是否包含学校名、教师名、学号等。

---

## License

MIT
