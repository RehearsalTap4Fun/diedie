# 叠叠中国

面向 3-6 岁儿童的省份认知游戏（Web，手机竖屏优先）。玩法：答对省份问题拿到该省的拟人化「积木块」，用物理堆叠把它们叠到目标线过关，逐步收集点亮全国 34 个省级行政区。

**全局模式**（菜单顶部胶囊切换）：**叠省份** / **叠动物**——34 个常见动物的手绘轮廓
对标 34 个省份形状（`tools/animal-shapes.mjs` 手工控制点 → `npm run animals` 生成，
与省份同一套物理/表情/语音管线）；动物模式下「我的地图」变为「动物图鉴」（网格集卡，
未收集灰剪影），无线索题和拼图；两种模式的关卡进度与收集互相独立。

**玩法**：单人闯关（小小班二选一 / 大大班四选一）、我的地图（省份）/ 动物图鉴（动物）、
省份拼图（仅省份模式）、双人竞技（同屏热座：🐼 熊猫队 vs 🐯 老虎队轮流放块，
谁放的块导致塔上任何块掉出屏幕谁输；34 块全叠完没倒则两队双赢；块数越多物理越「活」，
对局自然收敛；塔逼近出块区时镜头自动拉远；不出题、不影响单人收集进度）。

## 开发

```bash
npm install
npm run data     # 从 DataV·GeoAtlas 拉取并生成省份轮廓数据（src/data/provinces.json）
npm run animals  # 从手工控制点生成动物轮廓数据（src/data/animals.json）
npm run voice    # 云童声/say 批量合成语音（src/assets/voice/*.m4a，增量缓存）
npm run dev     # 本地开发（--host，可用手机在同一局域网访问）
npm run build   # 类型检查 + 单文件构建（dist/index.html 内联全部资源）
```

## 单机离线版

`npm run build` 产出**单文件** `dist/index.html`（项目根目录的 `叠叠中国.html` 即其拷贝），
双击用浏览器打开即玩，无需任何服务器。关卡进度存 localStorage（按难度分别记录），
菜单可「继续第 N 关」或「重置进度」。注意：微信里发送 HTML 文件是预览模式跑不了，
电脑传输/AirDrop 后用浏览器打开即可。

## 技术栈

- Vite + TypeScript + Phaser 3（Matter 物理，poly-decomp 凸分解）
- 省份轮廓：DataV·GeoAtlas（基于标准地图改绘）→ 投影/简化/归一化 → JSON
- 语音：预生成 TTS 音频（macOS say「婷婷」→ AAC，单文件构建时内联为 data URI），
  缺失时回退浏览器 SpeechSynthesis；升级云 TTS 童声只需替换 `tools/build-voice.mjs` 的 `synth()`

## 合规备忘（公开发布前必须完成）

- 「点亮地图」页需按自然资源部标准地图改绘，含台湾、港澳，南海诸岛附框 + 九段线，页脚标注审图号来源
- 本原型的轮廓数据仅用于本地开发验证
