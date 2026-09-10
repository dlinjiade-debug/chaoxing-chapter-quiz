---
name: 超星章节测验自动化
description: 学习通/超星「课程章节」内的章节测验：抓题、抓听力音频、离线转写、按答案提交、读取成绩。触发词：章节测验、学习通测验、超星章节作业、chaoxing chapter quiz。作业列表里的普通作业不属于本技能范围。
---

# 超星章节测验自动化

配套仓库：`chaoxing-chapter-quiz`（scripts/ 下为可直接运行的实现）。
本文件描述做任务的**判断顺序**，细节以仓库 README 为准。

## 开始之前

1. 确认项目根目录存在 `config.json`（从 `config.example.json` 复制）：
   `storageState`（Playwright 登录态）、`schoolHost`、`cpi`、`courses[]`、`asr.modelPath`。
2. 若登录态失效（页面跳转登录页 / 提示参数无效），让用户重新导出，不要猜参数。

## 流程

1. `node scripts/list_courses.js` → 把目标课程写进 `config.json`。
2. `node scripts/chapters.js --course <名>` → 看章节树与「已完成任务点 x/N」，挑出待做节点。
3. `node scripts/quiz.js --course <名> --node <knowledgeId>` → 拿到题面、qid、选项、音频 objectId。
4. **判定答案**：
   - 有原文/教材内容 → 对照原文；
   - 听力题 → 必须 `python scripts/asr.py <objectId>` 拿到转写原文再判；
   - 都不行 → 用专业知识 + 检索验证，**并向用户说明把握程度**。
5. 写答案文件（`{qid: "true"/"false"/"A"/"B"}`）→ `node scripts/submit.js ... --answers 文件`。
6. `node scripts/score.js` 复核成绩。

## 必须遵守的判断

- **先看重做次数**：以批阅页「重做(剩余 N 次)」为准，不要信 `limitWorkSubmitTimes`。只剩 1 次或 0 次时，**绝对不要盲交试错**。
- **填空题/排序题**不要盲猜，宁可交给用户。
- 判断题答错后再提交时取反即可（二值），单选题则需要更多信息——先拿到音频/原文再动。
- 每次提交前用 `--dry` 校验填入是否完整；脚本自身也会在填答不全时中止。

## 关键实现约束

- iframe 只认 `doHomeWorkNew` / `selectWorkQuestion`。
- 填答前先读 `input#answer<qid>`，值相同就跳过，否则会被 `addChoice` 反选。
- 提交确认弹窗按钮文字可能是「提交」或「确定」，轮询点。
- vosk 模型目录必须纯 ASCII 路径。

## 隐私

不要把 `config.json`、登录态、`out/` 里的题目与音频写入任何对外产物；分享样例前先检查学号/姓名/学校名。
