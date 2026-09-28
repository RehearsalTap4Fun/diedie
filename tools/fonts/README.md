# 字体（仅供 tools/build-chars.mjs 生成汉字块轮廓，游戏运行时不加载字体）

- `DiedieCharsBrush-Regular.ttf`：马善政毛笔楷书（Ma Shan Zheng，https://github.com/googlefonts/mashanzheng ，
  SIL OFL 1.1，见 LICENSE-MaShanZheng.txt），用 fonttools 裁剪为叠汉字模式的 24 个字并更名为 Diedie Chars Brush。
  选它：毛笔笔锋让轮廓不规则（叠起来有难度），字形仍是规范楷书（利于认字）。
  加字时：从 Google Fonts 取 MaShanZheng-Regular.ttf，
  `pyftsubset MaShanZheng-Regular.ttf --text="<全部字>" --output-file=subset.ttf`，再用 fonttools 改字体名。
