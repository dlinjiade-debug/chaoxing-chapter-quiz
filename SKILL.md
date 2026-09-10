---
name: chaoxing-chapter-quiz
description: 完成学习通（超星/泛雅）课程「章节」里的章节测验/作业 —— 定位课程 → 抓章节树 → 取题目 → 抓听力音频并离线转写 → 填答案 → 暂存/交卷 → 查分/改错重交。触发词：学习通作业、超星作业、章节测验、章节任务点、chaoxing homework、听力题转写。区别于作业列表里的普通作业（那种用 xuexitong-homework-submit）。
agent_created: true
license: MIT
---

# 学习通章节测验自动完成

只对接**网页版**（App 不行，但账号通用，网页版看到的作业与 App 一致）。

配套开源仓库：<https://github.com/dlinjiade-debug/chaoxing-chapter-quiz>
本技能目录内已自带 `scripts/`，可直接用；需要更新时从上游拉取。

## 0. 前置：登录态与运行环境

- 登录态：Playwright storageState，优先复用已有文件（如 `<项目目录>/chaoxing_state.json`）。
- 浏览器：`chromium.launch({ headless: true, channel: 'msedge' })`，**不要下载 Chromium 内核**（校园网下必卡死）。
- 拿不到登录态时：先关闭所有 Edge 进程 → `robocopy` 复制整个 Edge `User Data` 到别的盘（排除 Cache/Code Cache/GPUCache）→ Playwright 挂载副本。**Edge 运行时对 Cookies 数据库独占加锁，cp / Python open / esentutl / robocopy /B 全部绕不过去**，只能先关浏览器。
- Node：`NODE_PATH=<playwright 模块目录> node xxx.js`。

## 1. 定位课程

1. 打开 `https://<学校>.fanya.chaoxing.com/courselist/mycourse`，等 JS 渲染 ~8s。
2. 课程卡片是 `li[cid]`，属性里有 `cid / classid / cpi / kcenc / ckenc`。
3. 入口拼法：
   `https://<学校>.fanya.chaoxing.com/courselist/opencoursenewfy?role=3&courseId=<cid>&clazzId=<classid>&cpi=<cpi>&ckenc=<ckenc>`
   → 302 到 `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=..&clazzid=..&cpi=..&enc=..`

## 2. 找章节里的测验

课程页「作业」标签经常显示 `0/0 暂无作业`，**真正的测验在「章节」标签里**。

- 章节树 iframe：`mooc2-ans/mycourse/studentcourse?courseid=..&clazzid=..&cpi=..`
- 节点：`<div id="cur<knowledgeId>" class="chapter_item">`
- **最稳的取题方式（推荐，避开 SPA 点击）** —— 直连：

```
https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=<knowledgeId>&courseId=<cid>&clazzid=<clazzid>&cpi=<cpi>&enc=<enc>&mooc2=1&hidetype=0&openc=<openc>
```

同一门课下 `enc` / `openc` 通用，只换 `chapterId`（从任意一次点击后的地址栏抄下来即可）。

## 3. 答题页结构

答题 iframe：`doHomeWorkNew`；批阅 iframe：`selectWorkQuestion`（`selectWorkQuestionYiPiYue`）。

```
题目容器 div.singleQuesId[data=qid]
选项     li[qid][qtype]  →  span.num_option[data=值]
         判断题 qtype=3，data = "true" / "false"
         单选题 qtype=0，data = "A".."D"
答案写入 input#answer<qid>   （题型 input#answertype<qid>）
```

## 4. 填写答案

```js
// 先读当前值，相同就跳过 —— 否则 addChoice 会把已选项「反选」掉
const inp = document.getElementById('answer' + qid);
if (inp.value !== val) {
  if (inp.value) addChoice(已选项的 li);   // 先取消旧选项
  addChoice(目标 li);
}
// 校验：document.getElementById('answer'+qid).value === val
```

## 5. 暂存 / 交卷 / 查分

| 动作 | 做法 |
|---|---|
| 暂存 | `noSubmit()`（或点 `a.btnSave`）。**点外层容器无效** |
| 交卷 A | 点「提交」→ `btnBlueSubmit()`，需处理确认弹窗（按钮文字可能是**「提交」也可能是「确定」**，要轮询尝试） |
| 交卷 B（更稳） | `toadd('')` → `document.getElementById('pyFlag').value=''` → `form1submit()`，绕开 `validateTimeNew` 那个经常不弹窗的确认流程 |
| 查分 | 提交后重开章节，frame 变成 `selectWorkQuestionYiPiYue`，显示「第N次作答 本次成绩XX分」 |

- `pyFlag`：`'1'` = 暂存，**空字符串 = 正式交卷**。
- 接口：交卷 `POST /mooc-ans/work/addStudentWorkNewWeb`，暂存 `/work/addStudentWorkNew`；成功返回 `{"msg":"success!","stuStatus":4,...}`。
- 批阅页解析：`最终成绩<span><i>分数</i>`、`class="scoreNum"`（每题得分）、`重做 <i>(剩余 N 次)`。

## 6. 必踩的坑

1. **frame 正则必须写 `doHomeWorkNew`**。写 `work/` 会误匹配 `ananas/modules/work/index.html`（播放器外壳），导致所有题 `NO_INPUT`。
2. 找到 frame 后**轮询等题目 DOM 渲染**（`li[qid]` 数量 > 0），否则填了也是空。
3. 填完（尤其暂存后）要**回读** `input#answer<qid>` 校验，别只看点击返回值。
4. 查分正则要包含 `selectWorkQuestion`，只写 `doHomeWorkNew` 会漏掉结果页。
5. **重做次数以批阅页「重做(剩余 N 次)」为准，`#limitWorkSubmitTimes` 字段不可信**（见过写着 100 实际只剩 1 次）。只剩 0/1 次时**绝对不能盲交试错**。
6. 点「重做」的按钮是 `a.jb_btn_bg`，点完还要再点一次「确定」；重做后**原答案会保留**，填答时记得先读值。
7. 章节里的「Text A」节点常常只有视频 + 教材封面图，**没有可抓取的正文**。

## 7. 答案要 100% 正确时的做法

页面里**没有隐藏的正确答案字段**（`answerArr` 等只是题目数据），批阅页多数情况也不公布标准答案。可靠做法：

1. 抓下题目整段文本（脚本存到 `out/quiz_<kid>.json`）。
2. 拿题干**特征句**去检索（维基 / 权威资料），很多阅读题直接改写自百科词条，能逐句对上。
3. 判断题重点找「张冠李戴 / 时间错位 / 绝对化表述」三类设错；还要注意「说了某现象」≠「建议做某事」这类偷换。
4. **听力题**：见下节，先把音频转成文字再判，不要猜。
5. 填完先**暂存** → 出一份「题目 + 我的答案 + 依据」的核对表给用户 → 确认后再交卷。

## 8. 听力题：下载音频 + 离线转写

音频嵌在答题页里：`ananas/common-modules/audioplay/audioplay.html?objectid=<oid>`。

1. `GET https://mooc1.chaoxing.com/ananas/status/<oid>` → JSON 的 `download`（mp3）、`filename`（原始文件名，可用它核对是哪一单元）、`duration`。
2. 转码：`imageio_ffmpeg.get_ffmpeg_exe()` 自带 ffmpeg → `-ar 16000 -ac 1 -f wav`。
3. 转写：`vosk` + `vosk-model-small-en-us-0.15`。
4. 一条命令搞定：`python scripts/asr.py <objectId>` → 输出 `out/asr_<oid>.txt`。

> **坑**：vosk 模型目录必须是**纯 ASCII 路径**（如 `C:/asr/...`）。放在含中文的路径下会报
> `Folder '...' does not contain model files` —— 这是 C++ 侧窄字符路径读不了 CJK，跟文件是否完整无关。
> zip 解压要用 Python `zipfile`，部分 shell 解压会只留空目录。

## 9. 现成脚本

```bash
node scripts/list_courses.js                                   # 列课程（courseId/clazzId/ckenc）
node scripts/chapters.js --course 课程名                        # 章节树 + 已完成任务点 x/N
node scripts/quiz.js     --course 课程名 --node <knowledgeId>   # 抓题：qid、选项、音频 objectId
python scripts/asr.py <objectId>                                # 下载音频 + 离线转写
node scripts/submit.js   --course 课程名 --node <kid> --answers 答案.json [--dry]
node scripts/score.js    --course 课程名 --node <kid>            # 查成绩
node scripts/redo.js     --course 课程名 --node <kid> --answers 修正.json  # 改错重交
```

配置：`cp config.example.json config.json`（`storageState` / `schoolHost` / `cpi` / `courses[]` / `asr.modelPath`）。
答案文件格式 `{ "题目qid": "true"|"false"|"A"|... }`，见 `answers.example.json`；不想改的题不写即可保留原值。

## 10. 隐私

不要把 `config.json`、登录态、`out/` 下的题目/音频/转写文本写进任何对外产物；分享样例前检查学号、姓名、学校名。
