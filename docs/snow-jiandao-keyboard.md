# 冰雪剑道合并键盘与筛选

`SNOW-JIANDAO-TONED` 的声母、零声母、十韵组和纯形辅使用一张合并键盘。
渲染复用无调 21×21 的 `keyboardSVG`：键位、边框、密度缩放、声母位移 link
与 OKLab 链式校验均沿用公共实现。R 键的 `Ø A/E/O` 完整显示；旧的三行截断
会漏掉第四项 `zero-O`，不再使用该实现。

在公共 SVG 上只调整带调合同的语义：上排四声用蓝底、中排二三声用绿底、
下排一声／轻声用黄底；同韵组跨排使用同一文字色，同键多个韵组分行显示。
AVUIO 是保留键集合，纯形辅顺序由 `shapeKeysByMeaning` 表示；
`toneKeysByTone=IVUAO` 仅作为公共渲染器的边界适配，不显示独立调辅。

## 数据与代码

- `tools/score_snow_jiandao_toned_benchmark.js` 导出完整带调码表和四轨实际选用的
  终码，`filterRows` 各列由 `filterRowColumns` 声明。UI 声调数字用 0 表示轻声，
  内部评分仍使用第五槽位。三／四字词的主码保留其声母简码合同。
- `tools/snow_jiandao_toned_view.js` 负责语义适配、查询和热力聚合，浏览器与
  Node 测试共用。声母移位配色仍只来自 `tools/keymap_link_colors.js`。
- `tools/snow_jiandao_toned_ui.js` 将公共 SVG 转为带调合同显示，并连接筛选、
  明细与导出。集成器把两个脚本内嵌到本地 HTML，浏览器无需网络。

总热力图将字／二字／三字／四字轨分别按击键数归一，再以评测采用的
1:3:1:1 权重混合。筛选后按非空轨重新归一。各轨负担直接来自实际终码，
包括选用的形辅；日常文章热力图保留冻结文章回放与标点口径。

统一筛选支持汉字、词语、连续或分隔的全拼、编码；如 `jian4dao1`、`jiandao`、
`ni3 hao3`、`de0`。数字紧跟所属音节，未写数字则接受该音节的所有合法声调。
合法全拼即使未命中词频语料也可激活相应主码；任意汉字词未命中时可按已知
单字读音预览主码。预览不生成词频，不计入热力。无调全拼激活所有合法调的
键，热力与明细仍只使用命中的真实语料。日常图有查询时显示筛选字词的主码
频率，清空后恢复文章回放，提示文案明确区分两种来源。

## 重新生成与验证

首次需要导出筛选数据，运行 `python -X utf8 tools/integrate_snow_jiandao_toned_r11.py`。
此命令沿用既有依赖：本地 Snow 词库、带调 fixture 与冻结回放材料。
已有完整数据时，`just snow-jiandao-ui` 只更新内嵌 UI 并同步公共配色。

`just snow-jiandao-ui-test` 执行语义往返、查询、权重与配色测试，并在无头 Edge
检查完整零声母、跨排韵组颜色、形辅、文字裁切、带调／无调／汉字筛选和
四轨热力一致性。`node tests/browser-ui.test.mjs` 检查跨方案切换等通用交互；
`node tools/audit_keymap_link_colors.mjs` 复核全量普通方案和冰雪剑道的链式配色。

HTML 与生成的 benchmark JSON 是被忽略的本地产物，源码与测试由 Git 保存。
