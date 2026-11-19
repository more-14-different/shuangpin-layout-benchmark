# 恢复399异码后的继续搜索

保留M-R2≤40、D≤3、V≤1、无分支、Common399恰好399个主码、主码QZ/ZQ双空。相对原R2保持最少4组声母规则／6个映射项改动；本轮不放宽到更多声母改动。

评分为完整CKT v5.2八轨，形辅/调辅各半，单/二/三/四字权重1:3:1:1；沿用形辅12/12/24、调辅12/21/13、toneKeysByTone=IEUAO、shapeKeysByMeaning=AEUIO、42310配对。2倍将候选与S005六项认知延时一起翻倍。没有重新枚举辅序。

|方案|1倍CKT↓|2倍CKT↓|移手↑|S2主行↑|20轨主行下限↑|
|---|---:|---:|---:|---:|---:|
|A|9.086538431|9.043952098|—|—|—|
|C|9.083907769|9.034929863|—|—|—|
|恢复399首次对照（581布局）|9.146163952|9.096819873|—|—|—|
|UR2-V52-6d805a35d5fe|9.102926551|9.050056730|131.115161|42.598%|29.789%|
|UR2-V52-29e4e969a151|9.103505476|9.049245115|129.343372|42.598%|29.789%|

本次两步/三步续搜起点为 5170 个已评分布局，最低1倍 9.104186126、2倍 9.053238070。本次新增完整评分3276个，其中三步循环评分619个；本次两个成本情景分别净差 -0.001259575 / -0.003992954（负值更低，可来自不同候选）。

## UR2-V52-6d805a35d5fe

相对恢复399首次对照净差：1倍 -0.043237402，2倍 -0.046763143；负值更低。M/D/V=40/3/1，Common399异码数399。

声母相对R2改动：q: Q→F；ch: S→Q；A: R→Y；E: R→Y；O: R→Y；W: P→J。

独立A7-E v4=10.678105108，S2 e34=1.332358778，全部原生产工效门槛：未通过。

韵母映射：a→A，ai→L，an→P，ang→N，ao→K，e→H，ei→C，en→D，eng→J，er→C，i→I，ia→B，ian→Q，iang→G，iao→W，ie→Z，in→R，ing→E，iong→M，iu→F，o→O，ong→M，ou→Y，u→U，ua→R，uai→Q，uan→T，uang→E，ui→S，un→B，uo→O，v→S，van→T，ve→X，vn→V。

## UR2-V52-29e4e969a151

相对恢复399首次对照净差：1倍 -0.042658476，2倍 -0.047574758；负值更低。M/D/V=40/3/1，Common399异码数399。

声母相对R2改动：q: Q→F；ch: S→Q；A: R→Y；E: R→Y；O: R→Y；W: P→J。

独立A7-E v4=10.679081461，S2 e34=1.332164306，全部原生产工效门槛：未通过。

韵母映射：a→A，ai→L，an→P，ang→N，ao→K，e→H，ei→C，en→D，eng→J，er→C，i→I，ia→B，ian→Q，iang→G，iao→Z，ie→W，in→R，ing→E，iong→M，iu→F，o→O，ong→M，ou→Y，u→U，ua→R，uai→Q，uan→T，uang→E，ui→S，un→B，uo→O，v→S，van→T，ve→X，vn→V。

累计完整精评8446个不同布局，比首次对照新增7865个；构造起点256个；完成20个中心的合法一跳扫描。额外224个远点来自28套声母布局上的可复现MILP扰动，按字符运动、接近A/C、S2主行及主行下限代理构造；代理只用于产生候选，最终全部使用完整CKT评分。

最终1倍/2倍最低点的一跳已完整扫描：true / true。该结论只涵盖单韵母移动、两韵母交换、整键合并和整键交换。没有穷尽两步联动、全局韵母排列或更多声母改动。

两步联动：先枚举所有操作对的合法端点（包含非法中间布局），再以两种成本的单步可加预测、二键运动代理、确定性探索筛选端点做完整CKT。枚举合法端点不等于完整CKT搜透两步空间。

- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEgUWGREEDBUODBgUEhATBBEGDhATFwY=：4650000 个有序操作对，32573 个未评分的合法端点，其中 399 个经由非法中间布局；完整CKT精评 259 个。
- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEgUZFhEEDBUODBgUEhATBBEGDhATFwY=：4650000 个有序操作对，32834 个未评分的合法端点，其中 415 个经由非法中间布局；完整CKT精评 263 个。
- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEAUWGREEDBUODBgUERATBBIGDhITFwY=：4650000 个有序操作对，33072 个未评分的合法端点，其中 409 个经由非法中间布局；完整CKT精评 931 个。
- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEAUZFhEEDBUODBgUERATBBIGDhITFwY=：4650000 个有序操作对，33075 个未评分的合法端点，其中 410 个经由非法中间布局；完整CKT精评 944 个。

三步检查只覆盖四韵母、四键位的三次连续交换循环，先做合法性筛选，再选部分端点完整评分，不等于完整三步穷举。

- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEAYWGREEDAUODBgUERATBBIBDhITFxU=：访问375564个三交换循环，38250个未评分合法端点；本轮完整CKT精评272个，另外复用该中心先前缓存104个。
- 中心 AQ8MBQMTDRYGCgcJBRgXEBURGQISGBgYCQsLAAsPDQoHAgMJAggBEAYZFhEEDAUODBgUERATBBIBDhITFxU=：访问375564个三交换循环，38351个未评分合法端点；本轮完整CKT精评243个，另外复用该中心先前缓存0个。

399异码需要至少26韵母键位的结构证明仍成立，因此空Q韵、空Z韵和Q/Z韵母双空没有合规候选；主码QZ/ZQ两桶为空可以保留。

完整布局和独立20轨工效在同名前缀 result.json；完整八轨JS重放在 verification.json；全量native评分在 scores.jsonl.gz，SHA256=b61803664dcdddfef490459bffdcbb93944337ac10ba3a4180d7a86751048537。

复核现有结果运行 `just r2-restore399-v52-verify`。继续探索运行 `just r2-restore399-v52-diverse`、`just r2-restore399-v52-twohop` 或 `just r2-restore399-v52-threehop`；这些搜索会新增探索与更新候选，不能视为只读复核。输入哈希变化会拒绝复用旧评分。
