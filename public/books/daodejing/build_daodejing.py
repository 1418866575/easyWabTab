# -*- coding: utf-8 -*-
"""生成《道德经》古籍阅读单文件 HTML（风格对齐 sunzibingfa/index.html）。"""
import io, os, re, unicodedata

# 数据：(章号, 标题, 原文, 白话译文)
# 原文以王弼本（通行本）为底本；译文为现代白话转写。
DATA = [
(1, "众妙之门",
"道可道，非常道。名可名，非常名。无名天地之始；有名万物之母。故常无欲，以观其妙；常有欲，以观其徼。此两者同出而异名，同谓之玄。玄之又玄，众妙之门。",
"可以用言语说出的“道”，不是那永恒不变的道；可以用名称界定的“名”，不是那永恒不变的名。“无”是天地的本始，“有”是万物的根源。所以常从“无”中体察道的奥妙，常从“有”中观照道的端倪。这两者同源而异名，都称作“玄”；玄之又玄，是一切奥妙的门户。"),
(2, "美善相生",
"天下皆知美之为美，斯恶已。皆知善之为善，斯不善已。故有无相生，难易相成，长短相形，高下相倾，音声相和，前后相随。是以圣人处无为之事，行不言之教；万物作焉而不辞，生而不有，为而不恃，功成而弗居。夫唯弗居，是以不去。",
"天下人都知道美之所以为美，丑的观念就随之而生；都知道善之所以为善，不善的观念就随之而生。所以有与无互相生成，难与易互相成就，长与短互相显现，高与下互相依凭，音与声互相调和，前与后互相跟随。因此圣人以“无为”处事，施行“不言”的教化；任万物兴起而不加干涉，生养而不占有，作为而不自恃，功成而不居功。正因不居功，功业才不会离他而去。"),
(3, "无为而治",
"不尚贤，使民不争；不贵难得之货，使民不为盗；不见可欲，使民心不乱。是以圣人之治，虚其心，实其腹，弱其志，强其骨。常使民无知无欲，使夫智者不敢为也。为无为，则无不治。",
"不崇尚贤才，使百姓不争；不看重稀有之物，使百姓不为盗；不显露足以引起贪欲的东西，使民心不乱。所以圣人的治理，是虚化百姓的心智、充实他们的腹胃、削弱他们的志气、强健他们的筋骨，常使百姓没有巧智、没有贪欲，使自作聪明的人不敢妄为。以“无为”来治，就没有治理不好的。"),
(4, "道冲不盈",
"道冲，而用之或不盈。渊兮，似万物之宗。挫其锐，解其纷，和其光，同其尘。湛兮，似或存。吾不知谁之子，象帝之先。",
"道是空虚无形的，用它却总也用不完。深远啊，像是万物的宗主。收敛锋芒，解除纷扰，调和光芒，混同尘世。隐没啊，似亡而实存。我不知道它是谁所生，似乎在天帝之前就已存在。"),
(5, "天地不仁",
"天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。天地之间，其犹橐籥乎？虚而不屈，动而愈出。多言数穷，不如守中。",
"天地无所谓仁慈，把万物当作祭品般任其生死；圣人无所谓仁慈，把百姓当作祭品般任其自便。天地之间，不正像一只风箱吗？空虚却不穷竭，越鼓动越是生出风来。多说话常会穷尽，不如守持中道。"),
(6, "谷神玄牝",
"谷神不死，是谓玄牝。玄牝之门，是谓天地根。绵绵若存，用之不勤。",
"虚空的变化之妙永不消亡，这叫做“玄牝”。玄牝的门户，是天地的根本。它绵绵不绝、若存若亡，作用却永不穷尽。"),
(7, "天长地久",
"天长地久。天地所以能长且久者，以其不自生，故能长生。是以圣人后其身而身先，外其身而身存。非以其无私邪？故能成其私。",
"天长地久。天地之所以能长久，是因为它们不为自己而生，所以能长生。圣人退身而后反而身先，置外自身而后反而身存。不正是因为他的无私吗？所以反倒成就了他的私利。"),
(8, "上善若水",
"上善若水。水善利万物而不争，处众人之所恶，故几于道。居善地，心善渊，与善仁，言善信，政善治，事善能，动善时。夫唯不争，故无尤。",
"最高的善像水。水善于利益万物而不与争，停留在众人所厌恶的低处，所以最接近于道。居处善于择下，心境善于沉静，施与善于仁爱，言谈善于守信，为政善于治理，处事善于胜任，行动善于待时。正因不争，所以没有过失。"),
(9, "功遂身退",
"持而盈之，不如其已；揣而锐之，不可长保。金玉满堂，莫之能守；富贵而骄，自遗其咎。功遂身退，天之道也。",
"执持而求盈满，不如适时停下；捶击而求锐利，不能长保。金玉满堂，无人能守；富贵而骄，自招祸殃。功业成就便抽身而退，才是天之道。"),
(10, "载营魄抱一",
"载营魄抱一，能无离乎？专气致柔，能如婴儿乎？涤除玄鉴，能无疵乎？爱民治国，能无为乎？天门开阖，能为雌乎？明白四达，能无知乎？生之畜之，生而不有，为而不恃，长而不宰，是谓玄德。",
"能身心合一而不离散吗？能聚敛精气以致柔顺，像婴儿一样吗？能洗涤内心如明镜，毫无瑕疵吗？能爱民治国而无所作为吗？能感官开合而安守柔静吗？能通达四方而如无识无智吗？生养万物，生而不占有，为而不自恃，长养而不主宰，这叫做“玄德”。"),
(11, "有无相生",
"三十辐共一毂，当其无，有车之用。埏埴以为器，当其无，有器之用。凿户牖以为室，当其无，有室之用。故有之以为利，无之以为用。",
"三十根辐条共凑于一个毂中，正因为车毂中有空虚，才有车的作用。揉和陶土做成器皿，正因为器皿中有空虚，才有器皿的作用。开凿门窗建成房屋，正因为房屋中有空虚，才有房屋的作用。所以“有”给人便利，“无”才发挥功用。"),
(12, "五色目盲",
"五色令人目盲；五音令人耳聋；五味令人口爽；驰骋畋猎，令人心发狂；难得之货，令人行妨。是以圣人为腹不为目，故去彼取此。",
"五色使人眼盲，五音使人耳聋，五味使人口伤，驰骋田猎使人心发狂，稀有之物使人行为不轨。所以圣人只求饱腹不求悦目，因此舍弃前者而取后者。"),
(13, "宠辱若惊",
"宠辱若惊。贵大患若身。何谓宠辱若惊？宠为下，得之若惊，失之若惊，是谓宠辱若惊。何谓贵大患若身？吾所以有大患者，为吾有身，及吾无身，吾有何患？故贵以身为天下，若可寄天下；爱以身为天下，若可托天下。",
"得宠与受辱都令人惊恐，把大患看得和自身一样重。什么叫宠辱若惊？宠是居下的，得到它惊恐，失去它也惊恐，这就叫宠辱若惊。什么叫把大患看得如身？我所以有大患，是因为我执着于身；若我无身，又有什么祸患？所以能以身为天下的人，才可托付天下；能爱身为天下的人，才可交付天下。"),
(14, "夷希微",
"视之不见，名曰夷；听之不闻，名曰希；搏之不得，名曰微。此三者不可致诘，故混而为一。其上不皦，其下不昧。绳绳不可名，复归于无物。是谓无状之状，无物之象，是谓惚恍。迎之不见其首，随之不见其后。执古之道，以御今之有。能知古始，是谓道纪。",
"看它不见，叫做“夷”；听它不闻，叫做“希”；摸它不得，叫做“微”。这三者无从穷究，所以混而为一。它上面不显得明亮，下面不显得暗昧，绵绵不绝不可名状，终归于无物。这是没有形状的形，没有物象的象，叫做“惚恍”。迎它不见头，随它不见尾。执守古来的道，以驾驭今日的实有；能知远古的开端，就是道的纲纪。"),
(15, "善为士者",
"古之善为士者，微妙玄通，深不可识。夫唯不可识，故强为之容：豫兮若冬涉川；犹兮若畏四邻；俨兮其若客；涣兮其若凌释；敦兮其若朴；旷兮其若谷；混兮其若浊。孰能浊以静之徐清？孰能安以动之徐生？保此道者，不欲盈。夫唯不盈，故能蔽而新成。",
"古时善于为士的人，幽微玄妙、深不可识。正因不可识，勉强形容他：迟疑如冬日涉川，谨慎如畏惧四邻，庄重如做客，消散如冰之将释，敦厚如朴木，空旷如山谷，浑厚如浊水。谁能使浊水静下来慢慢澄清？谁能使安稳中生动起来慢慢生长？持守此道的人不求盈满，正因不盈满，所以能破旧而成新。"),
(16, "致虚守静",
"致虚极，守静笃。万物并作，吾以观复。夫物芸芸，各复归其根。归根曰静，是谓复命。复命曰常，知常曰明。不知常，妄作凶。知常容，容乃公，公乃王，王乃天，天乃道，道乃久，没身不殆。",
"致虚要极尽，守静要笃实。万物蓬勃生长，我由此观其往复。万物繁盛，各自复归其根。归根叫做静，静叫做复命，复命叫做常，知常叫做明。不知常而妄动，必遭凶险。知常才能容，容才能公，公才能王，王才能合天，天才能合道，道才能长久，终身不危。"),
(17, "太上不知",
"太上，不知有之；其次，亲而誉之；其次，畏之；其次，侮之。信不足焉，有不信焉。悠兮其贵言。功成事遂，百姓皆谓：“我自然。”",
"最好的统治者，百姓不知有他；其次，亲近而称誉他；再次，畏惧他；最次，轻侮他。诚信不足，才有不信任。悠然啊，他不轻易发号施令。功成事遂，百姓都说“我们本来如此”。"),
(18, "大道废",
"大道废，有仁义；慧智出，有大伪；六亲不和，有孝慈；国家昏乱，有忠臣。",
"大道废弃，才有所谓仁义；智巧出现，才有所谓大伪；六亲不和，才有所谓孝慈；国家昏乱，才有所谓忠臣。"),
(19, "绝圣弃智",
"绝圣弃智，民利百倍；绝仁弃义，民复孝慈；绝巧弃利，盗贼无有。此三者以为文不足，故令有所属：见素抱朴，少私寡欲，绝学无忧。",
"弃绝聪明智巧，百姓得益百倍；弃绝仁义，百姓复归孝慈；弃绝巧利，盗贼自然消失。这三者作为文教还不够，所以要使人心有所归属：见素抱朴，少私寡欲，弃绝虚学而无所忧。"),
(20, "独异于人",
"唯之与阿，相去几何？善之与恶，相去若何？人之所畏，不可不畏。荒兮，其未央哉！众人熙熙，如享太牢，如春登台。我独泊兮，其未兆；沌沌兮，如婴儿之未孩；累累兮，若无所归。众人皆有余，而我独若遗。我愚人之心也哉！俗人昭昭，我独昏昏。俗人察察，我独闷闷。澹兮其若海，飂兮若无止。众人皆有以，而我独顽且鄙。我独异于人，而贵食母。",
"应诺与呵斥，相差多少？善与恶，相差几何？世人所畏惧的，我也不可不畏惧。荒远啊，这风气从古至今未曾中断！众人都熙熙攘攘，如享太牢，如登春台。我独淡泊而无征兆，浑沌如婴儿尚未开智，疲懒如无家可归。众人都富余，我独若有所失。我真是愚人的心啊！世人昭昭，我独昏昏；世人明察，我独闷闷。淡然如海，飘然无止。众人皆有所用，我独顽钝而鄙陋。我独与众人不同，而贵在依守“道”。"),
(21, "孔德之容",
"孔德之容，惟道是从。道之为物，惟恍惟惚。惚兮恍兮，其中有象；恍兮惚兮，其中有物。窈兮冥兮，其中有精；其精甚真，其中有信。自今及古，其名不去，以阅众甫。吾何以知众甫之状哉？以此。",
"大德的样态，唯独随从于道。道之为物，恍恍惚惚。惚兮恍兮，其中有象；恍兮惚兮，其中有物。幽深啊冥暗啊，其中有精；其精极真，其中有信。从今上溯到古，它的名从不消逝，以观照万物之始。我何以知道万物之始的状貌？就是凭这个。"),
(22, "曲则全",
"曲则全，枉则直，洼则盈，敝则新，少则得，多则惑。是以圣人抱一为天下式。不自见，故明；不自是，故彰；不自伐，故有功；不自矜，故长。夫唯不争，故天下莫能与之争。古之所谓“曲则全”者，岂虚言哉！诚全而归之。",
"委曲反能保全，枉屈反能伸直，低洼反能充盈，破旧反能更新，少取反能得，贪多反会惑。所以圣人抱守“一”作为天下的法式。不自我标榜，所以显明；不自以为是，所以彰显；不自我夸耀，所以有功；不自高自大，所以长久。正因不争，天下无人能与之争。古语说“曲则全”，岂是空话！确实能使人全而归之。"),
(23, "希言自然",
"希言自然。故飘风不终朝，骤雨不终日。孰为此者？天地。天地尚不能久，而况于人乎？故从事于道者，同于道；德者，同于德；失者，同于失。同于道者，道亦乐得之；同于德者，德亦乐得之；同于失者，失亦乐得之。信不足焉，有不信焉。",
"少言才合于自然。所以狂风刮不了一早晨，骤雨下不了一整天。谁使它们如此？天地。天地尚不能持久，何况人呢？所以从事于道的人，就同于道；从事于德的人，就同于德；失道失德的人，就同于失。同于道者，道也乐于得他；同于德者，德也乐于得他；同于失者，失也乐于得他。诚信不足，才有不信任。"),
(24, "企者不立",
"企者不立，跨者不行。自见者不明，自是者不彰，自伐者无功，自矜者不长。其在道也，曰：余食赘行。物或恶之，故有道者不处。",
"踮脚而立不能久，跨步而行不能远。自我标榜的不能显明，自以为是的不彰显，自我夸耀的没功劳，自高自大的不长久。从道来看，这些叫做剩饭赘行。人人都厌恶它，所以有道者不这样做。"),
(25, "道法自然",
"有物混成，先天地生。寂兮寥兮，独立不改，周行而不殆，可以为天下母。吾不知其名，强字之曰道，强为之名曰大。大曰逝，逝曰远，远曰反。故道大，天大，地大，王亦大。域中有四大，而王居其一焉。人法地，地法天，天法道，道法自然。",
"有一物浑然自成，先于天地而生。寂静啊空廓啊，独立不变，周行不殆，可以为天下母。我不知道它的名字，勉强称它为“道”，再勉强命名为“大”。大叫做逝，逝叫做远，远叫做反。所以道大，天大，地大，王也大。域中有四大，王居其一。人法地，地法天，天法道，道法自然。"),
(26, "重静为本",
"重为轻根，静为躁君。是以圣人终日行不离辎重。虽有荣观，燕处超然。奈何万乘之主，而以身轻天下？轻则失本，躁则失君。",
"重是轻的根基，静是躁的主宰。所以圣人整日行走不离辎重。虽有华丽观瞻，却安居超然。无奈那万乘之主，却以轻率之身临天下？轻率就失根本，躁动就失君位。"),
(27, "善行无迹",
"善行无辙迹，善言无瑕谪，善数不用筹策，善闭无关楗而不可开，善结无绳约而不可解。是以圣人常善救人，故无弃人；常善救物，故无弃物，是谓袭明。故善人者，不善人之师；不善人者，善人之资。不贵其师，不爱其资，虽智大迷，是谓要妙。",
"善于行走的不留痕迹，善于言谈的不留过失，善于计算的不用筹码，善于关闭的不用栓钥却不可开，善于捆缚的不用绳索却不可解。所以圣人常善于救人，因而没有弃人；常善于救物，因而没有弃物，这叫做“袭明”。所以善人是恶人的老师，恶人是善人的借鉴。不尊重老师、不珍惜借鉴，虽自以为智实为大迷，这叫做要妙。"),
(28, "知雄守雌",
"知其雄，守其雌，为天下谿。为天下谿，常德不离，复归于婴儿。知其白，守其黑，为天下式。为天下式，常德不忒，复归于无极。知其荣，守其辱，为天下谷。为天下谷，常德乃足，复归于朴。朴散则为器，圣人用之，则为官长，故大制不割。",
"明知雄强，却守雌柔，甘为天下的溪谷。为天下溪谷，常德不离，复归于婴儿。明知洁白，却守暗黑，甘为天下的法式。为天下法式，常德不差，复归于无极。明知荣耀，却守屈辱，甘为天下的低谷。为天下低谷，常德乃足，复归于朴。朴散则为器物，圣人用之则为百官之长，所以大制不割。"),
(29, "去甚去泰",
"将欲取天下而为之，吾见其不得已。天下神器，不可为也。为者败之，执者失之。故物或行或随，或歔或吹，或强或羸，或挫或隳。是以圣人去甚，去奢，去泰。",
"想要取天下而有所作为，我看他做不到。天下是神圣之物，不可勉强而为。妄为的必败，把持的必失。所以物有前行有后随，有轻嘘有急吹，有强有弱，有损毁有败坏。所以圣人去掉极端、去掉奢侈、去掉过当。"),
(30, "以道佐主",
"以道佐人主者，不以兵强天下。其事好还。师之所处，荆棘生焉。大军之后，必有凶年。善有果而已，不敢以取强。果而勿矜，果而勿伐，果而勿骄，果而不得已，果而勿强。物壮则老，是谓不道，不道早已。",
"以道辅佐君主的，不靠兵力逞强于天下。用兵这事容易遭报应。军队所到之处，荆棘丛生；大战之后，必有凶年。善于用兵的，只求达到目的便止，不敢以兵力逞强。达到目的而不矜夸，不夸耀，不骄傲，出于不得已，达到目的而不逞强。事物壮盛就衰老，这叫做不合于道，不合于道就会早亡。"),
(31, "兵者不祥",
"夫兵者，不祥之器，物或恶之，故有道者不处。君子居则贵左，用兵则贵右。兵者不祥之器，非君子之器，不得已而用之，恬淡为上。胜而不美，而美之者，是乐杀人。夫乐杀人者，则不可以得志于天下矣。吉事尚左，凶事尚右。偏将军居左，上将军居右，言以丧礼处之。杀人之众，以哀悲泣之，战胜以丧礼处之。",
"兵器是不祥之器，人人厌恶，所以有道者不亲近它。君子平时以左为贵，用兵时以右为贵。兵器不祥，非君子之器，不得已才用之，以恬淡为贵。胜了也不以为美；若以为美，就是乐于杀人。乐于杀人的，不可能得志于天下。吉事尚左，凶事尚右。偏将军居左，上将军居右，这是以丧礼处之。杀人众多，以悲哀泣之；战胜也以丧礼处之。"),
(32, "道常无名",
"道常无名，朴虽小，天下莫能臣也。侯王若能守之，万物将自宾。天地相合，以降甘露，民莫之令而自均。始制有名，名亦既有，夫亦将知止，知止可以不殆。譬道之在天下，犹川谷之于江海。",
"道永远无名，朴虽微小，天下却无人能使它臣服。侯王若能守持，万物将自行归附。天地相合，降下甘露，无人指使而自然均匀。开始制定名分，名分既立，就要知道止境；知道止境才能不危。道在天下，如同川谷流向江海。"),
(33, "知人者智",
"知人者智，自知者明。胜人者有力，自胜者强。知足者富，强行者有志。不失其所者久，死而不亡者寿。",
"能识人的是智，能自知的是明。能胜人的是有力，能自胜的是强。知足的是富，勉力而行的是有志。不丧失根本的能久，身死而道不亡的是寿。"),
(34, "大道氾兮",
"大道氾兮，其可左右。万物恃之而生而不辞，功成不名有，衣养万物而不为主。常无欲，可名于小；万物归焉而不为主，可名为大。以其终不自为大，故能成其大。",
"大道泛滥啊，可左可右。万物依恃它而生它却不推辞，功成而不自以为有，养育万物而不为主宰。常无欲，可称其小；万物归附而不为主，可称其大。正因它始终不自以为大，所以能成就其大。"),
(35, "执大象",
"执大象，天下往。往而不害，安平太。乐与饵，过客止。道之出口，淡乎其无味，视之不足见，听之不足闻，用之不足既。",
"执守大道，天下人前来归往。归往而不相害，于是安宁太平。音乐与美食，能使过客停步。而道之出口，淡而无味，看它不足见，听它不足闻，用它却用不尽。"),
(36, "微明",
"将欲歙之，必固张之；将欲弱之，必固强之；将欲废之，必固兴之；将欲夺之，必固与之。是谓微明。柔弱胜刚强。鱼不可脱于渊，国之利器不可以示人。",
"将要收敛它，必先暂且扩张它；将要削弱它，必先暂且强盛它；将要废去它，必先暂且兴举它；将要夺取它，必先暂且给予它。这叫做微妙的明察。柔弱胜刚强。鱼不可脱离深渊，国家的利器不可轻易示人。"),
(37, "道常无为",
"道常无为而无不为。侯王若能守之，万物将自化。化而欲作，吾将镇之以无名之朴。无名之朴，夫亦将无欲。不欲以静，天下将自定。",
"道永远无为，却没有什么不是它所为。侯王若能守持，万物将自行化育。化育中若有贪欲萌生，我就用无名之朴来镇服它。无名之朴，也会使人无欲。无欲而安静，天下将自行安定。"),
(38, "上德不德",
"上德不德，是以有德；下德不失德，是以无德。上德无为而无以为；下德为之而有以为。上仁为之而无以为；上义为之而有以为。上礼为之而莫之应，则攘臂而扔之。故失道而后德，失德而后仁，失仁而后义，失义而后礼。夫礼者，忠信之薄，而乱之首。前识者，道之华，而愚之始。是以大丈夫处其厚，不居其薄；处其实，不居其华。故去彼取此。",
"上德不自以为德，所以有德；下德不肯失德，所以无德。上德无心作为而无意于为；下德有所作为而用意于为。上仁有所作为而无意于为；上义有所作为而用意于为。上礼有所作为而无人回应，就卷袖攘臂强拽人。所以失道而后有德，失德而后有仁，失仁而后有义，失义而后有礼。礼，是忠信的薄浅，祸乱的开端。前识，是道的虚华，愚昧的开始。所以大丈夫立身于厚，不居于薄；立身于实，不居于华。因此舍弃后者而取前者。"),
(39, "得一",
"昔之得一者：天得一以清；地得一以宁；神得一以灵；谷得一以盈；万物得一以生；侯王得一以为天下正。其致之也，谓天无以清，将恐裂；地无以宁，将恐废；神无以灵，将恐歇；谷无以盈，将恐竭；万物无以生，将恐灭；侯王无以正，将恐蹶。故贵以贱为本，高以下为基。是以侯王自称孤、寡、不穀。此非以贱为本邪？非乎？故至誉无誉。是故不欲琭琭如玉，珞珞如石。",
"往昔得到“一”的：天得一则清，地得一则宁，神得一则灵，谷得一则盈，万物得一则生，侯王得一则成为天下的正。推而言之：天若不清将恐崩裂，地若不宁将恐废坠，神若不灵将恐消歇，谷若不盈将恐枯竭，万物若不生将恐灭绝，侯王若不正将恐倾覆。所以贵以贱为根本，高以下为基础。侯王自称孤、寡、不穀，这不正是以贱为本吗？所以最高的称誉是无誉。因此不愿如美玉般琭琭耀眼，而愿如顽石般珞珞坚实。"),
(40, "反者道动",
"反者道之动，弱者道之用。天下万物生于有，有生于无。",
"反返是道的运动，柔弱是道的作用。天下万物生于“有”，“有”生于“无”。"),
(41, "上士闻道",
"上士闻道，勤而行之；中士闻道，若存若亡；下士闻道，大笑之。不笑不足以为道。故建言有之：明道若昧，进道若退，夷道若颣。上德若谷，大白若辱，广德若不足，建德若偷，质真若渝。大方无隅，大器晚成，大音希声，大象无形，道隐无名。夫唯道，善贷且成。",
"上士闻道，勤恳践行；中士闻道，将信将疑；下士闻道，大笑不止。不被笑，就不足以称为道。所以古语说：光明的道好似暗昧，前进的道好似后退，平坦的道好似崎岖。上德好似低谷，大白好似暗辱，广德好似不足，建德好似偷惰，至真好似有变。大地方没有棱角，大器晚成，大音希声，大象无形，道隐而没有名称。唯有道，善于施予而成就万物。"),
(42, "道生一二三",
"道生一，一生二，二生三，三生万物。万物负阴而抱阳，冲气以为和。人之所恶，唯孤、寡、不穀，而王公以为称。故物或损之而益，或益之而损。人之所教，我亦教之。强梁者不得其死，吾将以为教父。",
"道生一，一生二，二生三，三生万物。万物负阴而抱阳，冲和之气以为调和。人所厌恶的孤、寡、不穀，王公却用来自称。所以事物有时减损反得增益，有时增益反受减损。别人教我的，我也用来教人：强梁者不得好死，我将以此作为教人的总则。"),
(43, "至柔驰坚",
"天下之至柔，驰骋天下之至坚。无有入无间，吾是以知无为之有益。不言之教，无为之益，天下希及之。",
"天下最柔弱的，能驰骋于最坚强的。无有能穿入无间隙，我因此知道无为的益处。不言的教化、无为的益处，天下很少能及得上。"),
(44, "名身孰亲",
"名与身孰亲？身与货孰多？得与亡孰病？是故甚爱必大费，多藏必厚亡。知足不辱，知止不殆，可以长久。",
"名声与身体哪个更亲？身体与财物哪个更多？获得与丧失哪个更病？所以过分爱惜必致大费，过多藏聚必致厚亡。知足不辱，知止不危，可以长久。"),
(45, "大成若缺",
"大成若缺，其用不弊。大盈若冲，其用不穷。大直若屈，大巧若拙，大辩若讷。躁胜寒，静胜热。清静为天下正。",
"大成就好似有缺，它的作用却不衰败；大充盈好似空虚，它的作用却不穷竭。大直好似屈曲，大巧好似笨拙，大辩好似木讷。躁动胜寒，安静胜热。清静是天下的正道。"),
(46, "知足常足",
"天下有道，却走马以粪；天下无道，戎马生于郊。罪莫厚于甚欲，祸莫大于不知足，咎莫大于欲得。故知足之足，常足矣。",
"天下有道，把奔马退回来种田；天下无道，孕马也产在郊野。罪过没有比纵欲更大的，祸患没有比不知足更大的，灾殃没有比贪得更大的。所以知足之足，才是常足。"),
(47, "不出户",
"不出户，知天下；不窥牖，见天道。其出弥远，其知弥少。是以圣人不行而知，不见而明，不为而成。",
"不出门户，能知天下；不窥窗户，能见天道。你走出去越远，知道的反而越少。所以圣人不行而已知，不见而自明，不为而自成。"),
(48, "为学日益",
"为学日益，为道日损。损之又损，以至于无为。无为而无不为。取天下常以无事，及其有事，不足以取天下。",
"求学一天天增加，求道一天天减损。减损又减损，以至于无为。无为便没有不为。取得天下常靠无事；若事事有为，就不足以取得天下。"),
(49, "圣人无心",
"圣人无常心，以百姓心为心。善者吾善之，不善者吾亦善之，德善。信者吾信之，不信者吾亦信之，德信。圣人在天下，歙歙焉，为天下浑其心，百姓皆注其耳目，圣人皆孩之。",
"圣人没有恒常的心，以百姓的心为心。善良的我爱他，不善良的我也爱他，这叫做德善；守信的我相信他，不守信的我也相信他，这叫做德信。圣人在天下，收敛心意，使天下人的心浑然淳朴，百姓都专注耳目，圣人却把他们当婴儿般呵护。"),
(50, "出生入死",
"出生入死。生之徒，十有三；死之徒，十有三；人之生，动之于死地，亦十有三。夫何故？以其生生之厚。盖闻善摄生者，陆行不遇兕虎，入军不被甲兵；兕无所投其角，虎无所措其爪，兵无所容其刃。夫何故？以其无死地。",
"出来求生、入而赴死。长寿的十中有三，短命的十中有三，本来可以长寿却妄动而陷于死地的，也十中有三。为什么？因为他过分厚养生命。听说善于养生的人，走路不遇犀虎，入军不被甲兵；犀牛无处投角，老虎无处伸爪，兵器无处容刃。为什么？因为他没有致死的地方。"),
(51, "道生德畜",
"道生之，德畜之，物形之，势成之。是以万物莫不尊道而贵德。道之尊，德之贵，夫莫之命而常自然。故道生之，德畜之；长之育之；亭之毒之；养之覆之。生而不有，为而不恃，长而不宰，是谓玄德。",
"道生成它，德畜养它，物赋予形，势促成它。所以万物没有不尊道而贵德的。道的尊、德的重，并无谁命令，而永远自然。所以道生成、德畜养；长育它，亭毒它，养育它，覆护它。生而不占有，为而不自恃，长养而不主宰，这叫做“玄德”。"),
(52, "天下有始",
"天下有始，以为天下母。既得其母，以知其子；既知其子，复守其母，没身不殆。塞其兑，闭其门，终身不勤。开其兑，济其事，终身不救。见小曰明，守柔曰强。用其光，复归其明，无遗身殃，是为袭常。",
"天下有始，作为天下的母。既得其母，由此知其子；既知其子，再守住其母，终身不危。塞住感官的窍，关上欲望的门，终身不劳。打开窍，逞其事，终身不可救。能见细微叫做明，能守柔弱叫做强。运用其光，复归其明，不给自身留下灾殃，这叫做承袭常道。"),
(53, "行于大道",
"使我介然有知，行于大道，唯施是畏。大道甚夷，而人好径。朝甚除，田甚芜，仓甚虚；服文彩，带利剑，厌饮食，财货有余，是谓盗夸。非道也哉！",
"假使我稍有见识，行走于大道，只怕走入邪路。大道很平坦，人们却爱走小径。朝政腐败，农田荒芜，仓库空虚；却穿着文彩，佩着利剑，饱足饮食，财物有余，这叫做盗魁。多么不合于道啊！"),
(54, "善建不拔",
"善建者不拔，善抱者不脱，子孙以祭祀不辍。修之于身，其德乃真；修之于家，其德乃余；修之于乡，其德乃长；修之于国，其德乃丰；修之于天下，其德乃普。故以身观身，以家观家，以乡观乡，以国观国，以天下观天下。吾何以知天下然哉？以此。",
"善于建树的不可拔除，善于抱守的不会脱落，子孙祭祀因而不断。修德于身，德就纯真；于家，德就充裕；于乡，德就长久；于国，德就丰盛；于天下，德就普博。所以以身观身，以家观家，以乡观乡，以国观国，以天下观天下。我何以知道天下的情形？就是凭这个。"),
(55, "含德之厚",
"含德之厚，比于赤子。蜂虿虺蛇不螫，猛兽不据，攫鸟不搏。骨弱筋柔而握固。未知牝牡之合而朘作，精之至也。终日号而不嗄，和之至也。知和曰常，知常曰明，益生曰祥，心使气曰强。物壮则老，谓之不道，不道早已。",
"含德深厚的人，好比赤子。毒虫不刺他，猛兽不扑他，鸷鸟不抓他。筋骨柔弱却握拳牢固。不知男女交合而小处勃起，是精气至足；终日啼哭而声不嘶哑，是和气至极。知和叫做常，知常叫做明，贪生叫做祥，心役使气叫做强。事物壮盛就衰老，这叫做不合于道，不合于道就会早亡。"),
(56, "知者不言",
"知者不言，言者不知。塞其兑，闭其门，挫其锐，解其纷，和其光，同其尘，是谓玄同。故不可得而亲，不可得而疏；不可得而利，不可得而害；不可得而贵，不可得而贱。故为天下贵。",
"知道的人不说话，说话的人不知道。塞住窍，关上门，收敛锋芒，解除纷扰，调和光芒，混同尘世，这叫做“玄同”。所以既不可得而亲，也不可得而疏；不可得而利，也不可得而害；不可得而贵，也不可得而贱。因此为天下所贵。"),
(57, "以正治国",
"以正治国，以奇用兵，以无事取天下。吾何以知其然哉？以此：天下多忌讳，而民弥贫；民多利器，国家滋昏；人多伎巧，奇物滋起；法令滋彰，盗贼多有。故圣人云：“我无为，而民自化；我好静，而民自正；我无事，而民自富；我无欲，而民自朴。”",
"以清正治国，以奇巧用兵，以无事取天下。我何以知道如此？因为：禁令越多，百姓越贫；民多利器，国家越昏乱；人多技巧，奇物越滋生；法令越明，盗贼越多。所以圣人说：“我无为，百姓自化；我好静，百姓自正；我无事，百姓自富；我无欲，百姓自朴。”"),
(58, "祸福相依",
"其政闷闷，其民淳淳；其政察察，其民缺缺。祸兮福之所倚，福兮祸之所伏。孰知其极？其无正也。正复为奇，善复为妖。人之迷，其日固久。是以圣人方而不割，廉而不刿，直而不肆，光而不耀。",
"为政宽厚，百姓就淳朴；为政苛察，百姓就狡黠。祸啊，福所倚傍；福啊，祸所潜伏。谁知它们的终极？并没有定准。正会再变为奇，善会再变为妖。人们的迷惑，由来已久。所以圣人方正而不割人，清廉而不伤人，直率而不放肆，光明而不刺眼。"),
(59, "治人啬",
"治人事天，莫若啬。夫唯啬，是谓早服；早服谓之重积德；重积德则无不克；无不克则莫知其极；莫知其极，可以有国；有国之母，可以长久。是谓深根固柢，长生久视之道。",
"治理人、事奉天，莫过于“啬”。啬，叫做早作准备；早作准备叫做不断积德；不断积德就无往不胜；无往不胜就莫测其极；莫测其极，就可以据有国家；有国之母，可以长久。这叫做深根固柢、长生久视之道。"),
(60, "治大国",
"治大国，若烹小鲜。以道莅天下，其鬼不神；非其鬼不神，其神不伤人；非其神不伤人，圣人亦不伤人。夫两不相伤，故德交归焉。",
"治理大国，如同烹小鱼。以道临天下，鬼就不灵；不是鬼不灵，而是它的神灵不伤人；不是神灵不伤人，圣人也不伤人。两者互不伤害，德就交相归附。"),
(61, "大邦下流",
"大邦者下流，天下之牝，天下之交也。牝常以静胜牡，以静为下。故大邦以下小邦，则取小邦；小邦以下大邦，则取大邦。故或下以取，或下而取。大邦不过欲兼畜人，小邦不过欲入事人。夫两者各得所欲，大者宜为下。",
"大国如同下流，是天下的雌、天下的交汇处。雌常以静胜雄，以静为下。所以大国以谦下待小国，就取得小国；小邦以谦下事大国，就取得大国。所以或以下取得，或以下被取。大国不过是想兼畜人，小国不过是想事奉人。两者各遂其愿，大国更宜谦下。"),
(62, "万物之奥",
"道者万物之奥。善人之宝，不善人之所保。美言可以市尊，美行可以加人。人之不善，何弃之有？故立天子，置三公，虽有拱璧以先驷马，不如坐进此道。古之贵此道者何？不曰：求以得，有罪以免邪？故为天下贵。",
"道是万物的庇荫。是善人的珍宝，也是不善人所倚仗的。美言可以换取尊位，美行可以加于人上。不善的人，又何必舍弃？所以立天子、置三公，虽有拱璧驷马在先，不如静坐进献此道。古时所以贵此道，岂不因为：求它可得，有罪可免吗？所以为天下所贵。"),
(63, "为无为",
"为无为，事无事，味无味。大小多少，报怨以德。图难于其易，为大于其细。天下难事必作于易，天下大事必作于细。是以圣人终不为大，故能成其大。夫轻诺必寡信，多易必多难。是以圣人犹难之，故终无难矣。",
"作为于无为，从事于无事，品味于无味。大小多少，以恩德报怨恨。图谋困难要从容易处入手，成就大事要从细微处入手。天下难事必起于易，天下大事必起于细。所以圣人始终不自以为大，因而能成其大。轻易许诺必少信用，把容易看得太易必多困难。所以圣人犹以为难，终于没有困难。"),
(64, "其安易持",
"其安易持，其未兆易谋；其脆易泮，其微易散。为之于未有，治之于未乱。合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下。为者败之，执者失之。是以圣人无为故无败，无执故无失。民之从事，常于几成而败之。慎终如始，则无败事。是以圣人欲不欲，不贵难得之货；学不学，复众人之所过。以辅万物之自然而不敢为。",
"安定时容易保持，未有征兆时容易谋划；脆弱时容易消解，微细时容易散除。要在未发生前处理，在未混乱前治理。合抱的大树，生于毫末；九层的高台，起于累土；千里的远行，始于足下。妄为的必败，把持的必失。所以圣人无为，因此不败；不把持，因此不丧失。人们做事，常在接近成功时失败。谨慎到底如开始，就没有败事。所以圣人的欲望在于无欲，不看重稀有之物；学那不学，以补救众人的过失。以此辅助万物的自然，而不敢妄为。"),
(65, "古之善道",
"古之善为道者，非以明民，将以愚之。民之难治，以其智多。故以智治国，国之贼；不以智治国，国之福。知此两者亦稽式。常知稽式，是谓玄德。玄德深矣，远矣，与物反矣，然后乃至大顺。",
"古时善于为道的人，不是要百姓聪明，而是要使他们愚朴。百姓所以难治，是因为他们智巧太多。所以用智治国，是国家的祸害；不用智治国，是国家的福分。知道这两点也是法式。常知法式，叫做玄德。玄德深啊远啊，与物相反，然后才能达到大顺。"),
(66, "江海百谷王",
"江海之所以能为百谷王者，以其善下之，故能为百谷王。是以圣人欲上民，必以言下之；欲先民，必以身后之。是以圣人处上而民不重，处前而民不害。是以天下乐推而不厌。以其不争，故天下莫能与之争。",
"江海所以能成为百谷之王，是因为它善于居下，所以能成为百谷之王。所以圣人要居民之上，必以言语表示谦下；要居民之先，必把自身放在后面。所以圣人处上而百姓不感重压，处前而百姓不感妨害。所以天下乐于推举而不厌弃。正因不争，天下无人能与之争。"),
(67, "我有三宝",
"天下皆谓我道大，似不肖。夫唯大，故似不肖。若肖，久矣其细也夫！我有三宝，持而保之：一曰慈，二曰俭，三曰不敢为天下先。慈故能勇；俭故能广；不敢为天下先，故能成器长。今舍慈且勇，舍俭且广，舍后且先，死矣！夫慈，以战则胜，以守则固。天将救之，以慈卫之。",
"天下人都说我的道大，好似不肖。正因大，所以好似不肖；若肖，早就细小平凡了！我有三宝，持守不失：一叫慈，二叫俭，三叫不敢为天下先。慈故能勇，俭故能广，不敢为天下先故能成为百官之长。如今舍慈而求勇，舍俭而求广，舍后而求先，必死！慈，用于战则胜，用于守则固。天要救谁，就用慈来卫护他。"),
(68, "善为士者不武",
"善为士者不武，善战者不怒，善胜敌者不与，善用人者为之下。是谓不争之德，是谓用人之力，是谓配天古之极。",
"善于为士的不尚武，善于作战的不动怒，善于胜敌的不交锋，善于用人的甘居人下。这叫做不争之德，叫做用人之力，叫做契合天古的极致。"),
(69, "用兵有言",
"用兵有言：“吾不敢为主，而为客；不敢进寸，而退尺。”是谓行无行，攘无臂，扔无敌，执无兵。祸莫大于轻敌，轻敌几丧吾宝。故抗兵相若，哀者胜矣。",
"用兵有话说：“我不敢主动进攻，而宁肯防守；不敢进一寸，而宁肯退一尺。”这叫做行动如无行阵，攘臂如无手臂，执敌如无可敌，持兵如无兵器。祸莫大于轻敌，轻敌几乎丧我三宝。所以两军相当，哀痛的一方必胜。"),
(70, "被褐怀玉",
"吾言甚易知，甚易行。天下莫能知，莫能行。言有宗，事有君。夫唯无知，是以不我知。知我者希，则我者贵。是以圣人被褐而怀玉。",
"我的话很容易懂，很容易行。天下却无人能懂，无人能行。言有宗旨，事有根据。正因无知，所以不了解我。了解我的人稀少，取法我的人可贵。所以圣人外穿褐衣而怀藏美玉。"),
(71, "知不知",
"知不知，上；不知知，病。夫唯病病，是以不病。圣人不病，以其病病，是以不病。",
"知道却自以为不知，是上等；不知却自以为知，是弊病。正因把弊病当弊病，所以不病。圣人所以不病，是因为他把弊病当弊病，所以不病。"),
(72, "民不畏威",
"民不畏威，则大威至。无狎其所居，无厌其所生。夫唯不厌，是以不厌。是以圣人自知不自见，自爱不自贵。故去彼取此。",
"百姓不畏惧威压，大的威压就来了。不要逼迫百姓的居处，不要压挤他们的生计。正因不压迫，所以不遭厌弃。所以圣人自知而不自见，自爱而不自贵。因此舍弃后者而取前者。"),
(73, "勇敢则杀",
"勇于敢则杀，勇于不敢则活。此两者，或利或害。天之所恶，孰知其故？是以圣人犹难之。天之道，不争而善胜，不言而善应，不召而自来，繟然而善谋。天网恢恢，疏而不失。",
"勇于敢的则被杀，勇于不敢的则活命。这两者，或利或害。天所厌恶的，谁知其缘故？所以圣人犹以为难。天之道，不争而善于胜，不言而善于应，不召而自来，坦然而善于谋划。天网广大，稀疏却不漏失。"),
(74, "民不畏死",
"民不畏死，奈何以死惧之？若使民常畏死，而为奇者，吾得执而杀之，孰敢？常有司杀者杀。夫代司杀者杀，是谓代大匠斫。夫代大匠斫者，希有不伤其手矣。",
"百姓不怕死，何必用死来恐吓？若使百姓常怕死，而为非作歹的，我抓来杀掉，谁还敢？自有专司杀伐的在杀。代替专司杀伐的去杀，叫做代大匠砍削。代大匠砍削的，很少不伤自己的手。"),
(75, "民之饥",
"民之饥，以其上食税之多，是以饥。民之难治，以其上之有为，是以难治。民之轻死，以其上求生之厚，是以轻死。夫唯无以生为者，是贤于贵生。",
"百姓的饥荒，是因为在上者吞食赋税太多，所以饥。百姓的难治，是因为在上者妄作有为，所以难治。百姓的轻死，是因为在上者厚养自身，所以轻死。唯有不厚养生命的，胜过那贵生的人。"),
(76, "柔弱处上",
"人之生也柔弱，其死也坚强。草木之生也柔脆，其死也枯槁。故坚强者死之徒，柔弱者生之徒。是以兵强则不胜，木强则兵。强大处下，柔弱处上。",
"人活着时柔弱，死后就僵硬。草木活着时柔脆，死后就枯槁。所以坚强的属于死的一类，柔弱的属于生的一类。因此兵力强盛的反而不胜，树木强壮的反遭砍伐。强大处下，柔弱处上。"),
(77, "天之道",
"天之道，其犹张弓与？高者抑之，下者举之；有余者损之，不足者补之。天之道，损有余而补不足。人之道则不然，损不足以奉有余。孰能有余以奉天下？唯有道者。是以圣人为而不恃，功成而不处，其不欲见贤。",
"天之道，不就像张弓吗？高了就压低，低了就抬高；有余的就减损，不足的就补充。天之道，减损有余以补不足。人之道却不然，减损不足以奉有余。谁能把有余奉给天下？唯有有道者。所以圣人有所作为而不自恃，功成而不自处，不愿显露贤能。"),
(78, "天下莫柔弱",
"天下莫柔弱于水，而攻坚强者莫之能胜，以其无以易之。弱之胜强，柔之胜刚，天下莫不知，莫能行。是以圣人云：“受国之垢，是谓社稷主；受国不祥，是为天下王。”正言若反。",
"天下没有比水更柔弱的，而攻击坚强的没有能胜过它，因为没有什么能取代它。弱胜强，柔胜刚，天下无人不知，却无人能行。所以圣人说：“承受国家的垢辱，才是社稷之主；承受国家的灾殃，才是天下之王。”正话好似反说。"),
(79, "和大怨",
"和大怨，必有余怨，安可以为善？是以圣人执左契，而不责于人。有德司契，无德司彻。天道无亲，常与善人。",
"调和大的怨恨，必定还留余怨，怎能算是妥善？所以圣人执持左契，却不向人讨债。有德的人掌管契据，无德的人掌管税收。天道无亲疏，常助善人。"),
(80, "小国寡民",
"小国寡民。使有什伯之器而不用，使民重死而不远徙。虽有舟舆，无所乘之；虽有甲兵，无所陈之。使民复结绳而用之。甘其食，美其服，安其居，乐其俗。邻国相望，鸡犬之声相闻，民至老死，不相往来。",
"小国寡民。即使有十倍百倍的器具也不使用，使百姓重生死而不远迁。虽有船车，无所乘坐；虽有甲兵，无处陈列。使百姓重新以结绳记事。吃得香甜，穿得漂亮，住得安适，习俗快乐。邻国相望，鸡犬之声相闻，百姓至老死不相往来。"),
(81, "信言不美",
"信言不美，美言不信。善者不辩，辩者不善。知者不博，博者不知。圣人不积，既以为人己愈有，既以与人己愈多。天之道，利而不害；圣人之道，为而不争。",
"真话不美，美言不真。善者不巧辩，巧辩者不善。知者不博杂，博杂者不知。圣人不积藏，尽力为人自己越有，尽量给予别人自己越多。天之道，利物而不害；圣人之道，有所作为而不争。"),
]

assert len(DATA) == 81, "章节数必须为 81"

CN_DIGIT = "零一二三四五六七八九"
def cn(n):
    # 1-81 转中文（章号用“第X章”）
    if n <= 10:
        if n == 10:
            return "十"
        return CN_DIGIT[n]
    if n < 20:
        return "十" + CN_DIGIT[n - 10]
    if n < 100:
        tens = n // 10
        ones = n % 10
        s = CN_DIGIT[tens] + "十"
        if ones:
            s += CN_DIGIT[ones]
        return s
    return str(n)

# ===== 生僻字注音 / 注释 =====
# 字 -> "拼音 释义"（仅标注生僻字与古义字，普通字不入）
ANNO = {
    '徼':'jiào 边际；端倪', '湛':'zhàn 隐没', '橐':'tuó 口袋（橐籥：风箱）', '籥':'yuè 管乐器；风箱',
    '牝':'pìn 雌性', '魄':'pò 魂魄', '涤':'dí 洗涤', '鉴':'jiàn 镜（玄鉴即心镜）',
    '毂':'gǔ 车轮中心圆木', '埏':'shān 揉和黏土', '埴':'zhí 黏土', '牖':'yǒu 窗户',
    '畋':'tián 打猎', '夷':'yí 看不见；平', '希':'xī 听不到', '皦':'jiǎo 明亮', '昧':'mèi 暗',
    '惚':'hū 恍惚', '恍':'huǎng 恍惚', '窈':'yǎo 幽深', '冥':'míng 暗',
    '甫':'fǔ 始；父', '枉':'wǎng 弯曲', '洼':'wā 低洼', '敝':'bì 破旧', '彰':'zhāng 显明',
    '矜':'jīn 夸耀；骄傲', '骤':'zhòu 急骤', '企':'qǐ 踮起脚跟', '赘':'zhuì 多余；累赘',
    '寂':'jì 寂静', '寥':'liáo 空寂', '辎':'zī 辎重（粮草）', '辙':'zhé 车辙',
    '瑕':'xiá 瑕疵', '谪':'zhé 责备', '筹':'chóu 算筹（计数）', '楗':'jiàn 门闩',
    '袭':'xí 内藏（袭明）', '谿':'xī 溪谷', '忒':'tè 差错', '歔':'xū 呼气；吹',
    '羸':'léi 瘦弱', '隳':'huī 毁坏', '荆':'jīng 荆棘', '棘':'jí 荆棘',
    '攘':'rǎng 捋袖；伸出', '琭':'lù 美玉', '珞':'luò 坚石', '蹶':'jué 跌倒；失败',
    '颣':'lèi 丝结；缺陷', '氾':'fàn 泛滥；广泛', '饵':'ěr 诱饵；美食', '歙':'xī 收敛；闭合',
    '兕':'sì 犀牛', '兑':'duì 孔窍；口', '芜':'wú 荒芜', '夸':'kuā 浮夸', '辍':'chuò 中断',
    '虿':'chài 蝎子', '螫':'shì 蜇刺', '攫':'jué 抓取', '朘':'zuī 男童生殖器（指勃起）',
    '嗄':'shà 声音嘶哑', '啬':'sè 爱惜；收敛', '柢':'dǐ 根柢', '莅':'lì 临；治理',
    '拱':'gǒng 拱抱', '璧':'bì 玉璧', '驷':'sì 四匹马', '泮':'pàn 溶解；消散',
    '稽':'jī 考察；法式', '褐':'hè 粗布衣', '狎':'xiá 轻慢；挤压', '繟':'chǎn 舒缓；从容',
    '斫':'zhuó 砍削', '枯槁':'kū gǎo 干枯', '芸':'yún 众多（芸芸）', '沌':'dùn 混沌',
    '婴':'yīng 婴儿', '澹':'dàn 恬淡；平静', '飂':'liú 风声（飂兮）',
    '熙':'xī 热闹（熙熙）', '豫':'yù 迟疑；谨慎', '犹':'yóu 警觉（犹豫）', '俨':'yǎn 庄重',
    '涣':'huàn 消散（涣兮）', '敦':'dūn 敦厚', '旷':'kuàng 空旷', '蔽':'bì 遮蔽；掩藏',
    '笃':'dǔ 诚笃；深厚', '毒':'dú 成熟；养育（亭毒）', '施':'yí 斜行；邪路（唯施是畏）',
    '介':'jiè 微小（介然）', '闷':'mèn 宽厚（闷闷）', '淳':'chún 淳朴', '刿':'guì 划伤；伤害',
    '恢':'huī 广大（恢恢）', '挫':'cuò 收敛（挫其锐）', '冲':'chōng 空虚（道沖）',
}

def annotate(text):
    # 多字词优先整体注音
    for k in sorted(ANNO, key=len, reverse=True):
        if len(k) > 1 and k in text:
            note = ANNO[k]
            py = note.split()[0]
            text = text.replace(k, '<ruby class="anno" title="%s">%s<rt>%s</rt></ruby>' % (note, k, py))
    out = []
    for ch in text:
        if len(ch) == 1 and ch in ANNO:
            note = ANNO[ch]
            py = note.split()[0]
            out.append('<ruby class="anno" title="%s">%s<rt>%s</rt></ruby>' % (note, ch, py))
        else:
            out.append(ch)
    return ''.join(out)

_CN = "零一二三四五六七八九十百"
def cn_to_int(s):
    if s == '十':
        return 10
    if '十' in s:
        l, r = s.split('十', 1)
        left = cn_to_int(l) if l else 1
        right = cn_to_int(r)
        return left * 10 + right
    if '百' in s:
        l, r = s.split('百', 1)
        return (cn_to_int(l) if l else 1) * 100 + cn_to_int(r)
    return _CN.index(s)

def _md_inline(md):
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', md)

def _md_block_to_html(md):
    md = _md_inline(md)
    lines = md.split('\n')
    out = []
    buf = []
    def flush():
        if not buf:
            return ''
        txt = ' '.join(x.strip() for x in buf if x.strip())
        return '<p>' + txt + '</p>' if txt else ''
    for line in lines:
        s = line.strip()
        if s.startswith('# '):
            out.append(flush()); buf = []
            out.append('<h2 class="lecture-h2">' + s[2:] + '</h2>')
        elif s.startswith('## '):
            out.append(flush()); buf = []
            out.append('<h3 class="lecture-h3">' + s[3:] + '</h3>')
        elif s.startswith('### '):
            out.append(flush()); buf = []
            out.append('<h4 class="lecture-h4">' + s[4:] + '</h4>')
        elif s.startswith('> '):
            out.append(flush()); buf = []
            out.append('<blockquote class="lecture-quote">' + s[2:] + '</blockquote>')
        elif s == '---' or s == '':
            out.append(flush()); buf = []
        else:
            buf.append(s)
    out.append(flush())
    return '\n'.join(x for x in out if x)

# 聚合《百家讲坛讲稿》Markdown（文件存在则注入，否则跳过）
LECTURE_MD = r'D:/工作号文章/道德经-百家讲坛讲稿.md'
INTRO_HTML, OUTRO_HTML, COMMENTS, GLOSSARY_HTML = '', '', {}, ''
try:
    raw = io.open(LECTURE_MD, encoding='utf-8').read()
    m_intro = re.search(r'## 开场白(.*?)# 道经', raw, re.S)
    if m_intro:
        INTRO_HTML = _md_block_to_html(m_intro.group(1))
    m_outro = re.search(r'# 结语(.*)$', raw, re.S)
    if m_outro:
        OUTRO_HTML = _md_block_to_html(m_outro.group(1))
    for cm in re.finditer(r'## 第([一二三四五六七八九十百]+)章[^\n]*\n(.*?)(?=\n## 第|\n# |\n---|\Z)', raw, re.S):
        num = cn_to_int(cm.group(1))
        body = cm.group(2)
        body = '\n'.join(l for l in body.split('\n') if not l.strip().startswith('>'))
        COMMENTS[num] = _md_block_to_html(body)
    gloss = []
    _norm = lambda s: ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    for k in sorted(ANNO, key=lambda x: _norm(ANNO[x].split()[0])):
        note = ANNO[k]
        parts = note.split()
        gloss.append('<div class="gloss-item"><span class="gloss-char">%s</span><span class="gloss-py">%s</span><span class="gloss-mean">%s</span></div>' % (k, parts[0], ' '.join(parts[1:])))
    GLOSSARY_HTML = '\n'.join(gloss)
    print('聚合讲稿：章节', len(COMMENTS), '｜总论', bool(INTRO_HTML), '｜结语', bool(OUTRO_HTML))
except Exception as e:
    print('WARN：未聚合讲稿（缺少 MD 或解析失败）：', e)

# ===== 构建章节页面 =====
chapters_html = []
for idx, (num, title, orig, trans) in enumerate(DATA):
    pg = idx + 1
    # 道经 1-37 / 德经 38-81
    part = "道 经" if num <= 37 else "德 经"
    # 页脚翻页链接（纯锚点，无 JS 也可翻页）
    if pg > 1:
        prev_html = f'<a class="foot-nav" href="#page-{pg-1}">← 上一章</a>'
    else:
        prev_html = '<span class="foot-nav is-disabled">已是第一章</span>'
    if pg < 81:
        next_html = f'<a class="foot-nav" href="#page-{pg+1}">下一章 →</a>'
    else:
        next_html = '<span class="foot-nav is-disabled">已是最后一章</span>'
    cm = COMMENTS.get(num, '')
    lecture_block = ''
    if cm:
        lecture_block = '<div class="lecture-block"><div class="lecture-block-title">逐章讲解 · 百家讲坛风格</div>' + cm + '</div>'
    ch_html = f'''                <!-- 第 {num} 章 -->
                <div class="book-page" id="page-{pg}">
                    <div class="book-spread">
                        <div class="page page-left">
                            <div class="page-content">
                                <div class="chapter-header">
                                    <div class="chapter-num-display">第 {cn(num)} 章 · {part}</div>
                                    <h2 class="chapter-title" id="ch-{pg}">{title}</h2>
                                </div>
                                <div class="content-section">
                                    <div class="original-text">
                                        <p>{annotate(orig)}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="page-number">— {pg} —</div>
                        </div>
                        <div class="book-fold"><div class="fold-title">道德经</div></div>
                        <div class="page page-right">
                            <div class="page-content">
                                <div class="content-section">
                                    <div class="translation-text">
                                        <p>{trans}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="page-number">— {pg} —</div>
                        </div>
                    </div>
{lecture_block}
                    <div class="chapter-foot">
                        {prev_html}
                        <a class="foot-nav" href="#page-cover">封面</a>
                        {next_html}
                    </div>
                </div>'''
    chapters_html.append(ch_html)

chapters_block = "\n".join(chapters_html)

# ===== 构建目录（道经 / 德经 两组）=====
def toc_items(start, end):
    items = []
    for num in range(start, end + 1):
        pg = num
        title = DATA[num-1][1]
        items.append(f'                <li class="toc-item"><a class="toc-link" href="#page-{pg}" data-ch="{pg}">第 {cn(num)} 章 · {title}</a></li>')
    return "\n".join(items)

toc_html = f'''        <div class="toc-section">
            <div class="toc-section-title">导言 · 附录</div>
            <ul class="toc-list">
                <li class="toc-item"><a class="toc-link" href="#page-intro" data-ch="0">系统导读（总论）</a></li>
                <li class="toc-item"><a class="toc-link" href="#page-outro" data-ch="0">结语</a></li>
                <li class="toc-item"><a class="toc-link" href="#page-glossary" data-ch="0">生僻字表</a></li>
            </ul>
        </div>

        <div class="toc-section">
            <div class="toc-section-title">道经（一—三七）</div>
            <ul class="toc-list">
{toc_items(1, 37)}
            </ul>
        </div>

        <div class="toc-section">
            <div class="toc-section-title">德经（三八—八一）</div>
            <ul class="toc-list">
{toc_items(38, 81)}
            </ul>
        </div>'''

CSS = r'''        :root {
            --bg-paper: #f5f0e6;
            --bg-dark: #2c2416;
            --text-primary: #3d2e1e;
            --text-light: #6b5a47;
            --accent-gold: #b8860b;
            --accent-red: #8b0000;
            --shadow-soft: rgba(60, 40, 20, 0.15);
            --shadow-hard: rgba(60, 40, 20, 0.4);
            --page-width: 800px;
            --spine-width: 30px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        html { scroll-behavior: smooth; }

        body {
            font-family: 'Noto Serif SC', 'SimSun', serif;
            -webkit-text-size-adjust: 100%;
            min-height: 100dvh;
            color: var(--text-primary);
            line-height: 1.9;
            overflow-x: hidden;
            position: relative;
            background:
                radial-gradient(ellipse 80% 25% at 50% 0%, rgba(184, 134, 11, 0.07) 0%, transparent 70%),
                radial-gradient(ellipse 80% 25% at 50% 100%, rgba(139, 0, 0, 0.04) 0%, transparent 70%),
                radial-gradient(ellipse 35% 70% at 0% 50%, rgba(139, 115, 85, 0.05) 0%, transparent 60%),
                radial-gradient(ellipse 35% 70% at 100% 50%, rgba(139, 115, 85, 0.05) 0%, transparent 60%),
                repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(139, 115, 85, 0.015) 2px, rgba(139, 115, 85, 0.015) 3px),
                linear-gradient(180deg, #f5f0e6 0%, #ede5d8 30%, #e8dfd1 60%, #f0e8da 100%);
        }

        /* 书脊装饰 */
        .book-spine {
            position: fixed; left: 0; top: 0;
            width: var(--spine-width); height: 100dvh;
            background: linear-gradient(90deg, var(--bg-dark) 0%, #4a3c28 30%, #6b5a47 50%, #4a3c28 70%, var(--bg-dark) 100%);
            box-shadow: inset 0 0 30px rgba(0,0,0,0.5), 2px 0 10px rgba(0,0,0,0.3);
            z-index: 100;
        }
        .book-spine::before {
            content: ''; position: absolute; left: 50%; top: 20px; bottom: 20px; width: 2px;
            background: linear-gradient(180deg, transparent 0%, var(--accent-gold) 10%, var(--accent-gold) 90%, transparent 100%);
            transform: translateX(-50%);
        }
        .book-spine::after {
            content: '道'; position: absolute; left: 50%; top: 50%;
            transform: translate(-50%, -50%) rotate(-90deg);
            font-family: 'Ma Shan Zheng', cursive; font-size: 14px; color: var(--accent-gold);
            letter-spacing: 8px; text-shadow: 0 0 10px rgba(184, 134, 11, 0.5);
        }

        .book-container { margin-left: var(--spine-width); padding: 20px; perspective: 2000px; position: relative; }

        .book {
            max-width: 1120px; margin: 0 auto; background: var(--bg-paper); border-radius: 8px;
            box-shadow: 0 0 0 1px rgba(139, 115, 85, 0.3), 0 4px 20px var(--shadow-soft), 0 12px 40px rgba(60, 40, 20, 0.25), 0 30px 80px rgba(60, 40, 20, 0.18), inset 0 0 80px rgba(139, 115, 85, 0.1);
            position: relative; min-height: auto;
        }
        .book::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: repeating-linear-gradient(90deg, transparent, transparent 100px, rgba(139, 115, 85, 0.03) 100px, rgba(139, 115, 85, 0.03) 101px);
            pointer-events: none; border-radius: 8px;
        }

        /* 侧边目录 */
        .toc-sidebar {
            position: fixed; top: 0; left: calc(var(--spine-width) + 20px); width: 320px;
            max-height: calc(100dvh - 40px); margin-top: 20px;
            background: linear-gradient(135deg, rgba(245, 240, 230, 0.98) 0%, rgba(240, 235, 220, 0.98) 100%);
            border-radius: 0 12px 12px 0; box-shadow: 5px 0 30px var(--shadow-hard), inset 0 0 0 1px rgba(139, 115, 85, 0.2);
            padding: 25px; overflow-y: auto; z-index: 50;
            transform: translateX(-120%); transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .toc-sidebar.active { transform: translateX(0); }
        .toc-sidebar::-webkit-scrollbar { width: 6px; }
        .toc-sidebar::-webkit-scrollbar-thumb { background: rgba(139, 115, 85, 0.4); border-radius: 3px; }

        .toc-header {
            font-family: 'Ma Shan Zheng', cursive; font-size: 28px; color: var(--accent-red);
            text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid var(--accent-gold); position: relative;
        }
        .toc-header::after {
            content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
            width: 60%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent-gold), transparent);
        }
        .toc-section { margin-bottom: 25px; }
        .toc-section-title {
            font-family: 'ZCOOL XiaoWei', serif; font-size: 16px; color: var(--accent-gold); margin-bottom: 10px;
            padding-left: 10px; border-left: 3px solid var(--accent-red); display: flex; align-items: center; gap: 8px;
        }
        .toc-section-title::before { content: ''; width: 8px; height: 8px; background: var(--accent-red); border-radius: 50%; }
        .toc-list { list-style: none; }
        .toc-item { margin-bottom: 6px; }
        .toc-link {
            display: flex; align-items: center; min-height: 44px; padding: 8px 12px; color: var(--text-primary);
            text-decoration: none; font-size: 14px; border-radius: 6px; transition: all 0.3s ease; position: relative; overflow: hidden;
        }
        .toc-link::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 0;
            background: linear-gradient(90deg, rgba(184, 134, 11, 0.15), rgba(184, 134, 11, 0.05)); transition: width 0.3s ease;
        }
        .toc-link:hover::before { width: 100%; }
        .toc-link:hover { color: var(--accent-red); padding-left: 18px; }
        .toc-link.active { background: rgba(184, 134, 11, 0.15); color: var(--accent-red); font-weight: 600; }

        .content-area { padding: 30px 40px; }
        .cover-page .content-area { padding-top: 10px; }

        /* 顶部导航 */
        .top-nav { position: fixed; top: 0; right: 0; padding: 20px; z-index: 200; display: flex; gap: 15px; }
        .nav-btn {
            width: 50px; height: 50px; border: none; border-radius: 50%;
            background: linear-gradient(135deg, var(--bg-paper) 0%, #e8e0d0 100%); color: var(--text-primary);
            font-size: 20px; cursor: pointer; box-shadow: 0 4px 15px var(--shadow-soft), inset 0 0 0 1px rgba(139, 115, 85, 0.2);
            transition: all 0.3s ease; display: flex; align-items: center; justify-content: center;
        }
        .nav-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 25px var(--shadow-hard), inset 0 0 0 1px rgba(139, 115, 85, 0.3); }
        .nav-btn:active { transform: translateY(-1px); }
        .nav-btn svg { width: 24px; height: 24px; }

        /* 底部翻页导航 */
        .bottom-nav {
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            display: flex; align-items: center; gap: 12px; padding: 8px 16px;
            background: rgba(245, 240, 230, 0.96); border-radius: 30px; border: 1px solid rgba(139, 115, 85, 0.12);
            box-shadow: 0 2px 12px rgba(60, 40, 20, 0.1); z-index: 500; font-family: 'Noto Serif SC', serif; user-select: none;
            transition: opacity 0.3s, transform 0.3s;
        }
        body.cover-page .bottom-nav { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(20px); }
        .bottom-nav .nav-arrow {
            background: none; border: 1px solid rgba(139, 115, 85, 0.18); color: var(--text-primary);
            padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 13px; font-family: inherit;
            transition: all 0.25s; display: flex; align-items: center; gap: 4px; opacity: 0.7;
        }
        .bottom-nav .nav-arrow:hover:not(:disabled) { background: rgba(139, 0, 0, 0.06); border-color: var(--accent-red); color: var(--accent-red); opacity: 1; }
        .bottom-nav .nav-arrow:disabled { opacity: 0.2; cursor: default; }
        .bottom-nav .page-indicator { color: rgba(61, 46, 30, 0.4); font-size: 12px; min-width: 56px; text-align: center; letter-spacing: 1px; }

        /* 每章页脚翻页导航（无 JS 时主用，有 JS 时隐藏） */
        .chapter-foot { justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 28px; padding-bottom: 24px; }
        .chapter-foot .foot-nav {
            display: inline-flex; align-items: center; padding: 9px 20px; border: 1px solid rgba(139, 115, 85, 0.25);
            border-radius: 22px; color: var(--text-primary); font-size: 14px; background: rgba(245, 240, 230, 0.6); transition: all 0.25s;
        }
        .chapter-foot .foot-nav:hover { background: rgba(139, 0, 0, 0.06); border-color: var(--accent-red); color: var(--accent-red); }
        .chapter-foot .foot-nav.is-disabled { opacity: 0.35; pointer-events: none; border-style: dashed; }

        /* ===== 纯 CSS :target 翻页：即使 JS 失效/被禁用，点击/目录/上一下一章/返回封面均可用 ===== */
        .book-page { display: none; }
        #page-cover { display: block; }            /* 默认（无 :target 时）显示封面 */
        .book-page:target { display: block; }       /* 被锚点定位到的章节显示 */
        /* 封面置于全部章节页之后；只要任一章节页被 :target，就隐藏封面 */
        .book-page:not(#page-cover):target ~ #page-cover { display: none; }

        a { text-decoration: none; color: inherit; }

        /* 无 JS：显示每章页脚翻页导航；有 JS：改为底部悬浮导航（由 .js 类切换） */
        .bottom-nav { display: none; }
        .js .bottom-nav { display: flex; }
        .chapter-foot { display: flex; }
        .js .chapter-foot { display: none; }

        /* 纯 CSS 目录抽屉：用隐藏 checkbox + label 切换，无需 JS */
        .toc-toggle-cb { display: none; }
        #tocToggleCb:checked ~ .toc-sidebar { transform: translateX(0); }
        .toc-overlay { display: none; position: fixed; inset: 0; background: rgba(40, 30, 18, 0.35); z-index: 40; }
        #tocToggleCb:checked ~ .toc-overlay { display: block; }

        .cover-decoration {
            width: 100px; height: 100px; border: 2px solid var(--accent-gold); border-radius: 50%;
            display: flex; align-items: center; justify-content: center; margin-bottom: 20px; position: relative;
            animation: pulse 3s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(184, 134, 11, 0.3); }
            50% { box-shadow: 0 0 0 20px rgba(184, 134, 11, 0); }
        }
        .cover-decoration::before { content: ''; position: absolute; inset: 8px; border: 1px solid var(--accent-gold); border-radius: 50%; }
        .cover-decoration span { font-family: 'Ma Shan Zheng', cursive; font-size: 48px; color: var(--accent-gold); }

        .cover-title {
            font-family: 'ZCOOL XiaoWei', serif; font-size: 60px; color: var(--text-primary); margin-bottom: 12px;
            text-shadow: 2px 2px 4px rgba(139, 115, 85, 0.3); letter-spacing: 18px;
        }
        .cover-subtitle { font-family: 'Noto Serif SC', serif; font-size: 18px; color: var(--text-light); margin-bottom: 24px; letter-spacing: 8px; }
        .cover-author { font-size: 16px; color: var(--text-light); margin-bottom: 28px; }
        .cover-author span { color: var(--accent-red); font-weight: 600; }

        .start-reading {
            display: inline-flex; align-items: center; gap: 10px; padding: 15px 40px;
            background: linear-gradient(135deg, var(--accent-red) 0%, #6b0000 100%); color: var(--bg-paper);
            text-decoration: none; border-radius: 30px; font-size: 16px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(139, 0, 0, 0.3);
        }
        .start-reading:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(139, 0, 0, 0.4); }

        .chapter-header { text-align: center; margin-bottom: 50px; padding-bottom: 30px; border-bottom: 1px solid rgba(184, 134, 11, 0.3); position: relative; }
        .chapter-header::after {
            content: ''; position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%);
            width: 60px; height: 3px; background: var(--accent-gold); border-radius: 2px;
        }
        .chapter-num-display { font-family: 'Ma Shan Zheng', cursive; font-size: 16px; color: var(--accent-gold); letter-spacing: 5px; margin-bottom: 15px; }
        .chapter-title { font-family: 'ZCOOL XiaoWei', serif; font-size: 36px; color: var(--text-primary); margin-bottom: 10px; }

        /* 原文样式 */
        .original-text {
            background: linear-gradient(135deg, rgba(139, 115, 85, 0.08) 0%, rgba(139, 115, 85, 0.03) 100%);
            padding: 25px 30px; border-radius: 8px; border-left: 4px solid var(--accent-red); margin-bottom: 30px; position: relative;
        }
        .original-text::before {
            content: '原文'; position: absolute; top: -12px; left: 20px; background: var(--bg-paper); padding: 0 10px;
            font-size: 12px; color: var(--accent-red); font-weight: 600;
        }
        .original-text p { font-size: 17px; line-height: 2.2; text-align: justify; text-indent: 2em; margin-bottom: 15px; overflow-wrap: anywhere; }
        .original-text p:last-child { margin-bottom: 0; }

        /* 译文样式 */
        .translation-text {
            background: linear-gradient(135deg, rgba(184, 134, 11, 0.08) 0%, rgba(184, 134, 11, 0.03) 100%);
            padding: 25px 30px; border-radius: 8px; border-left: 4px solid var(--accent-gold); position: relative;
        }
        .translation-text::before {
            content: '译文'; position: absolute; top: -12px; left: 20px; background: var(--bg-paper); padding: 0 10px;
            font-size: 12px; color: var(--accent-gold); font-weight: 600;
        }
        .translation-text p { font-size: 16px; line-height: 2; text-align: justify; color: var(--text-light); margin-bottom: 12px; overflow-wrap: anywhere; }
        .translation-text p:last-child { margin-bottom: 0; }

        /* ===== 封面进入按钮 ===== */
        .enter-btn {
            display: inline-flex; align-items: center; gap: 10px; margin-top: 35px; padding: 14px 48px;
            font-family: 'Noto Serif SC', serif; font-size: 1.1em; letter-spacing: 0.3em;
            background: linear-gradient(135deg, var(--accent-red) 0%, #6b0000 100%); color: var(--bg-paper);
            border: 2px solid var(--accent-red); cursor: pointer; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative; overflow: hidden; box-shadow: 0 4px 20px rgba(139, 0, 0, 0.3);
        }
        .enter-btn::after {
            content: ''; position: absolute; top: 3px; left: 3px; right: 3px; bottom: 3px; border: 1px solid rgba(255, 255, 255, 0.15); pointer-events: none;
        }
        .enter-btn:hover { background: linear-gradient(135deg, #a00000 0%, #8b0000 100%); transform: translateY(-3px); box-shadow: 0 8px 30px rgba(139, 0, 0, 0.4); }
        .enter-btn:active { transform: translateY(-1px); }

        /* ===== 章节头部适配书本样式 ===== */
        .book-spread .chapter-header { margin-bottom: 25px; padding-bottom: 15px; }
        .book-spread .chapter-title { font-size: 26px; }
        .book-spread .chapter-num-display { font-size: 13px; }
        .book-spread .original-text, .book-spread .translation-text { padding: 16px 20px; }
        .book-spread .original-text p { font-size: 16px; line-height: 2; }
        .book-spread .translation-text p { font-size: 15px; line-height: 1.9; }
        .book-spread .content-section { margin-bottom: 0; }

        /* ===== 双页展开 ===== */
        .book-spread {
            display: flex; justify-content: center; align-items: stretch; gap: 0; max-width: 1120px;
            margin: 0 auto; position: relative; transform: perspective(1200px) rotateX(1.8deg); transform-style: preserve-3d;
            transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); min-height: 320px;
        }
        .book-spread:hover { transform: perspective(1200px) rotateX(1.2deg) rotateY(-0.5deg); }
        .book-spread .page {
            flex: 1; min-height: 380px; max-width: 540px; position: relative; display: flex; flex-direction: column;
            padding: 30px 32px 44px; background-color: var(--bg-paper);
            background-image:
                repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.008) 3px, rgba(0,0,0,0.008) 4px),
                repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(0,0,0,0.004) 20px, rgba(0,0,0,0.004) 21px);
        }
        .book-spread .page-left { border-right: 1px solid rgba(139, 115, 85, 0.15); border-radius: 2px 0 0 2px; box-shadow: -3px 0 8px rgba(0,0,0,0.04), inset 3px 0 10px rgba(0,0,0,0.03); }
        .book-spread .page-right { border-left: 1px solid rgba(139, 115, 85, 0.15); border-radius: 0 2px 2px 0; box-shadow: 3px 0 8px rgba(0,0,0,0.04), inset -3px 0 10px rgba(0,0,0,0.03); }
        .book-spread .page-content { flex: 1; overflow-y: auto; line-height: 1.9; max-height: calc(70vh + 50px); scrollbar-width: thin; scrollbar-color: rgba(139,115,85,0.25) transparent; padding-top: 14px; }
        .book-spread .page-content::-webkit-scrollbar { width: 4px; }
        .book-spread .page-content::-webkit-scrollbar-thumb { background: rgba(139, 115, 85, 0.2); border-radius: 2px; }
        .book-spread .page-number { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; font-size: 0.78em; color: var(--text-light); letter-spacing: 2px; pointer-events: none; }

        .book-fold {
            width: 6px; min-height: 500px; flex-shrink: 0; position: relative; z-index: 2;
            background: linear-gradient(to right, rgba(60,40,20,0.04) 0%, rgba(60,40,20,0.20) 48%, rgba(60,40,20,0.25) 50%, rgba(60,40,20,0.20) 52%, rgba(60,40,20,0.04) 100%);
            display: flex; align-items: center; justify-content: center;
        }
        .fold-title { writing-mode: vertical-rl; font-family: 'Ma Shan Zheng', cursive; font-size: 12px; color: var(--accent-gold); letter-spacing: 5px; opacity: 0.5; white-space: nowrap; }

        /* 封面页 */
        .book-cover-view {
            display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: auto;
            text-align: center; padding: 30px; position: relative; border-radius: 2px;
            border: 12px double var(--accent-gold); background: linear-gradient(135deg, #f5f0e6 0%, #e8ddd0 100%);
            box-shadow: inset 0 0 80px rgba(139,115,85,0.10), 0 12px 30px rgba(60,40,20,0.20), 0 20px 60px rgba(60,40,20,0.12);
        }
        .book-cover-view:hover { box-shadow: inset 0 0 80px rgba(139,115,85,0.14), 0 16px 40px rgba(60,40,20,0.26), 0 26px 70px rgba(60,40,20,0.16); }
        .cover-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 22px; background: linear-gradient(90deg, rgba(60,40,20,0.15) 0%, rgba(139,115,85,0.08) 40%, transparent 100%); border-right: 1px solid rgba(139,115,85,0.15); }
        .cover-spine::before { content: '道德经'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-90deg); font-family: 'Ma Shan Zheng', cursive; font-size: 11px; color: var(--accent-gold); letter-spacing: 6px; white-space: nowrap; opacity: 0.5; }
        .cover-frame { border: 1px solid var(--accent-gold); padding: 20px 36px; position: relative; max-width: 440px; width: 100%; }
        .cover-frame::before { content: ''; position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; border: 1px solid rgba(184, 134, 11, 0.4); pointer-events: none; }
        .cover-corner { position: absolute; width: 22px; height: 22px; border-color: var(--accent-gold); border-style: solid; }
        .cover-corner.tl { top: 5px; left: 5px; border-width: 2px 0 0 2px; }
        .cover-corner.tr { top: 5px; right: 5px; border-width: 2px 2px 0 0; }
        .cover-corner.bl { bottom: 5px; left: 5px; border-width: 0 0 2px 2px; }
        .cover-corner.br { bottom: 5px; right: 5px; border-width: 0 2px 2px 0; }

        /* 阅读进度 */
        .reading-progress { position: fixed; top: 0; left: 0; height: 2px; width: 0; background: var(--accent-gold); z-index: 600; transition: width 0.15s ease; }

        /* 滚动条 */
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: rgba(139, 115, 85, 0.1); }
        ::-webkit-scrollbar-thumb { background: rgba(139, 115, 85, 0.4); border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(139, 115, 85, 0.6); }

        /* ===== 响应式 ===== */
        @media (max-width: 1200px) { .toc-sidebar { width: 280px; } }
        @media (max-width: 900px) {
            .book-spine { display: none; }
            .book-container { margin-left: 0; }
            .content-area { padding: 40px 30px; }
            .cover-title { font-size: 48px; letter-spacing: 10px; }
            .chapter-title { font-size: 28px; }
            .top-nav { padding: 15px; }
            .nav-btn { width: 44px; height: 44px; }
            .toc-sidebar { width: 85%; max-width: 350px; }
            .bottom-nav { bottom: 12px; width: min(94vw, 460px); }
            .content-area { padding-top: calc(76px + env(safe-area-inset-top)); padding-bottom: calc(92px + env(safe-area-inset-bottom)); }
            .book-spread { max-height: none; width: 100%; }
            .book-spread .page { min-height: 0; }
            .book-spread .page-content { overflow: visible; max-height: none; padding-top: 0; }
            .cover-frame { padding: 18px 20px; }
            .cover-title { font-size: 44px !important; letter-spacing: 10px !important; }
        }
        @media (max-width: 768px) {
            .book-spread { flex-direction: column; align-items: center; transform: none; }
            .book-spread:hover { transform: none; }
            .book-fold { width: 100%; min-height: 6px; height: 6px; background: linear-gradient(to bottom, rgba(60,40,20,0.04) 0%, rgba(60,40,20,0.16) 50%, rgba(60,40,20,0.04) 100%); }
            .fold-title { writing-mode: horizontal-tb; font-size: 10px; letter-spacing: 3px; }
            .book-fold::before { width: 100%; height: 1px; top: 50%; left: 0; transform: translateY(-50%); background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%); }
            .book-spread .page { width: 100%; max-width: 100%; min-height: 0; padding: 26px 20px 42px; border: 1px solid rgba(139,115,85,0.15); border-radius: 2px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
            .book-spread .page-number { position: static; margin-top: 8px; }
        }
        @media (max-width: 600px) {
            .content-area { padding: calc(72px + env(safe-area-inset-top)) 14px calc(88px + env(safe-area-inset-bottom)); }
            .book-spread .page { padding: 22px 16px 38px; }
            .original-text, .translation-text { padding: 20px; overflow-wrap: anywhere; }
            .original-text p, .translation-text p { font-size: 15px; text-indent: 1.5em; }
            .book-cover-view { padding: 20px 10px; border-width: 6px; }
            .cover-frame { padding: 14px 14px; }
            .cover-frame::before { top: 6px; left: 6px; right: 6px; bottom: 6px; }
            .cover-title { font-size: 32px !important; letter-spacing: 8px !important; }
            .cover-subtitle { font-size: 15px; letter-spacing: 3px; }
            .book-opened { padding: 10px 8px 70px; }
        }

        /* ===== 生僻字注音（ruby 注释）===== */
        ruby.anno { ruby-position: over; cursor: help; }
        ruby.anno rt { font-size: 0.6em; color: var(--accent-red); font-family: 'Noto Serif SC', serif; opacity: 0.9; letter-spacing: 0; }
        ruby.anno:hover { background: rgba(184, 134, 11, 0.2); border-radius: 3px; }

        /* ===== 逐章讲解 / 讲稿块 ===== */
        .lecture-block {
            margin: 26px auto 0; max-width: 980px;
            background: linear-gradient(135deg, rgba(139, 0, 0, 0.04) 0%, rgba(184, 134, 11, 0.05) 100%);
            border: 1px solid rgba(139, 115, 85, 0.22); border-left: 4px solid var(--accent-red);
            border-radius: 10px; padding: 24px 30px 28px;
        }
        .lecture-block-title {
            font-family: 'ZCOOL XiaoWei', serif; font-size: 18px; color: var(--accent-red);
            margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px dashed rgba(139, 115, 85, 0.3); letter-spacing: 1px;
        }
        .lecture-block p { font-size: 15.5px; line-height: 2.05; text-align: justify; color: var(--text-primary); margin-bottom: 13px; overflow-wrap: anywhere; }
        .lecture-block p:last-child { margin-bottom: 0; }
        .lecture-block strong { color: var(--accent-red); font-weight: 600; }

        /* 讲稿长文（总论 / 结语）标题与引用 */
        .essay { max-width: 920px; margin: 0 auto; padding: 14px 6px 30px; }
        .lecture-h2 { font-family: 'ZCOOL XiaoWei', serif; font-size: 30px; color: var(--text-primary); margin: 30px 0 16px; text-align: center; letter-spacing: 2px; }
        .lecture-h3 { font-family: 'ZCOOL XiaoWei', serif; font-size: 21px; color: var(--accent-red); margin: 26px 0 12px; padding-left: 12px; border-left: 3px solid var(--accent-gold); }
        .lecture-h4 { font-family: 'Noto Serif SC', serif; font-size: 17px; color: var(--accent-gold); margin: 18px 0 8px; font-weight: 600; }
        .lecture-quote {
            margin: 14px 0; padding: 12px 18px; background: rgba(139, 115, 85, 0.07);
            border-left: 3px solid var(--accent-gold); border-radius: 6px; color: var(--text-light); font-style: italic;
        }
        .essay > p { font-size: 16px; line-height: 2.1; text-align: justify; color: var(--text-primary); margin-bottom: 14px; overflow-wrap: anywhere; }
        .essay > p:last-child { margin-bottom: 0; }
        .essay strong { color: var(--accent-red); font-weight: 600; }

        /* ===== 生僻字表 ===== */
        .gloss-intro { font-size: 15px; color: var(--text-light); margin: 8px 0 18px; text-align: justify; }
        .gloss-list { display: block; }
        .gloss-item {
            display: grid; grid-template-columns: 46px 96px 1fr; gap: 4px 16px; align-items: baseline;
            padding: 11px 4px; border-bottom: 1px dashed rgba(139, 115, 85, 0.22);
        }
        .gloss-char { font-size: 22px; color: var(--accent-red); font-weight: 600; text-align: center; font-family: 'Noto Serif SC', serif; }
        .gloss-py { color: var(--accent-gold); font-size: 15px; letter-spacing: 0.5px; }
        .gloss-mean { color: var(--text-light); font-size: 14.5px; line-height: 1.75; }
        @media (max-width: 600px) {
            .gloss-item { grid-template-columns: 38px 80px 1fr; gap: 4px 10px; }
            .gloss-char { font-size: 19px; }
            .lecture-block { padding: 18px 18px 22px; }
            .lecture-h2 { font-size: 24px; }
        }

        /* 封面页隐藏顶部导航（目录抽屉仍可由 checkbox 打开） */
        body.cover-page .top-nav { display: none !important; }
'''

JS = r'''
        (function () {
            var TOTAL = 81;
            var body = document.body;
            // 标记已启用 JS：CSS 据此在“悬浮导航 / 页脚导航”之间切换
            body.classList.remove('no-js');
            body.classList.add('js');

            var progressBar = document.getElementById('readingProgress');
            var prevBtn = document.getElementById('prevBtn');
            var nextBtn = document.getElementById('nextBtn');
            var pageInd = document.getElementById('pageIndicator');
            var tocCb = document.getElementById('tocToggleCb');
            var tocLinks = document.querySelectorAll('#tocSidebar .toc-link');

            // 导言 / 结语 / 生僻字表等特殊页
            var SPECIAL = { '#page-intro': '系统导读', '#page-outro': '结语', '#page-glossary': '生僻字表' };

            function clamp(n) { if (n < 1) return 1; if (n > TOTAL) return TOTAL; return n; }

            // 根据当前 hash 计算导航目标（同时兼容章节页与特殊页）
            function navTargets() {
                var hash = location.hash || '';
                var m = hash.match(/^#page-(\d+)$/);
                if (m) {
                    var ch = clamp(parseInt(m[1], 10));
                    return {
                        onCover: false,
                        indicator: '第 ' + ch + ' / ' + TOTAL + ' 章',
                        prev: ch > 1 ? ('#page-' + (ch - 1)) : '#page-cover',
                        next: ch < TOTAL ? ('#page-' + (ch + 1)) : '#page-cover'
                    };
                }
                if (SPECIAL[hash]) {
                    if (hash === '#page-intro') return { onCover: false, indicator: SPECIAL[hash], prev: '#page-cover', next: '#page-1' };
                    if (hash === '#page-outro') return { onCover: false, indicator: SPECIAL[hash], prev: '#page-81', next: '#page-glossary' };
                    if (hash === '#page-glossary') return { onCover: false, indicator: SPECIAL[hash], prev: '#page-outro', next: '#page-cover' };
                }
                return { onCover: true, indicator: '封面', prev: '#page-cover', next: '#page-1' };
            }

            function applyHash() {
                var t = navTargets();
                var hash = location.hash || '';
                body.classList.toggle('cover-page', t.onCover);
                if (prevBtn) prevBtn.href = t.prev;
                if (nextBtn) nextBtn.href = t.next;
                if (pageInd) pageInd.textContent = t.indicator;

                Array.prototype.forEach.call(tocLinks, function (l) {
                    l.classList.toggle('active', l.getAttribute('href') === hash);
                });

                if (tocCb) tocCb.checked = false;
                if (window.scrollTo) window.scrollTo(0, 0);
                updateProgress();
            }

            function updateProgress() {
                if (!progressBar) return;
                var ratio = 0;
                var h = document.documentElement.scrollHeight - window.innerHeight;
                if (h > 0) ratio = window.scrollY / h;
                if (ratio < 0) ratio = 0;
                if (ratio > 1) ratio = 1;
                progressBar.style.width = (ratio * 100) + '%';
            }

            // 点击目录项后收起抽屉（增强体验）
            Array.prototype.forEach.call(tocLinks, function (l) {
                l.addEventListener('click', function () { if (tocCb) tocCb.checked = false; });
            });

            // 键盘左右翻页（仅增强；无 JS 时用页脚 / 悬浮导航）
            window.addEventListener('keydown', function (e) {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                var t = navTargets();
                var cur = location.hash || '';
                var target = (e.key === 'ArrowLeft') ? t.prev : t.next;
                if (target && target !== cur) location.hash = target;
            });

            window.addEventListener('hashchange', applyHash);
            window.addEventListener('scroll', updateProgress, { passive: true });
            applyHash();
        })();
'''

HTML = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#f5f0e6">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>道德经 · 古籍阅读</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=ZCOOL+XiaoWei&family=Ma+Shan+Zheng&display=swap" rel="stylesheet">
    <style>
{CSS}
    </style>
</head>
<body class="no-js">
    <div class="reading-progress" id="readingProgress"></div>

    <!-- 顶部导航 -->
    <div class="top-nav" id="topNav">
        <label for="tocToggleCb" class="nav-btn" id="tocToggle" title="目录">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </label>
        <a href="#page-cover" class="nav-btn" id="homeBtn" title="返回封面">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
        </a>
    </div>

    <div class="book-wrapper">
        <input type="checkbox" id="tocToggleCb" class="toc-toggle-cb">
        <!-- 侧边目录（checkbox 驱动，无需 JS） -->
        <nav class="toc-sidebar" id="tocSidebar">
            <div class="toc-header">道德经</div>
{toc_html}
        </nav>
        <label for="tocToggleCb" class="toc-overlay" id="tocOverlay"></label>

        <!-- 书籍容器 -->
        <div class="book-container">
            <div class="book">
                <div class="content-area">
                    <!-- 章节页（置于封面之前，保证 :target 兄弟选择器生效） -->
{chapters_block}

                    <!-- 系统导读（总论） -->
                    <div class="book-page" id="page-intro">
                        <div class="essay">
                            <div class="chapter-header">
                                <div class="chapter-num-display">导言</div>
                                <h2 class="chapter-title">系统导读 · 百家讲坛风格</h2>
                            </div>
{INTRO_HTML}
                            <div class="chapter-foot">
                                <a class="foot-nav" href="#page-cover">← 封面</a>
                                <a class="foot-nav" href="#page-1">进入正文（第 1 章） →</a>
                            </div>
                        </div>
                    </div>

                    <!-- 结语 -->
                    <div class="book-page" id="page-outro">
                        <div class="essay">
                            <div class="chapter-header">
                                <div class="chapter-num-display">尾声</div>
                                <h2 class="chapter-title">结语</h2>
                            </div>
{OUTRO_HTML}
                            <div class="chapter-foot">
                                <a class="foot-nav" href="#page-81">← 第八十一章</a>
                                <a class="foot-nav" href="#page-glossary">生僻字表 →</a>
                            </div>
                        </div>
                    </div>

                    <!-- 生僻字表 -->
                    <div class="book-page" id="page-glossary">
                        <div class="essay">
                            <div class="chapter-header">
                                <div class="chapter-num-display">附录</div>
                                <h2 class="chapter-title">生僻字 · 难字注音释义</h2>
                            </div>
                            <p class="gloss-intro">下列为《道德经》原文中较生僻或含古义之字，标注读音与释义（原文中已用上方小字注音，鼠标悬停可见完整释义）。</p>
                            <div class="gloss-list">
{GLOSSARY_HTML}
                            </div>
                            <div class="chapter-foot">
                                <a class="foot-nav" href="#page-outro">← 结语</a>
                                <a class="foot-nav" href="#page-cover">封面</a>
                            </div>
                        </div>
                    </div>

                    <!-- 封面页 -->
                    <div class="book-page" id="page-cover">
                        <div class="book-cover-view">
                            <div class="cover-spine"></div>
                            <div class="cover-frame">
                                <div class="cover-corner tl"></div>
                                <div class="cover-corner tr"></div>
                                <div class="cover-corner bl"></div>
                                <div class="cover-corner br"></div>
                                <div class="cover-decoration"><span>道</span></div>
                                <h1 class="cover-title">道德经</h1>
                                <p class="cover-subtitle">道家经典 · 八十一章</p>
                                <p class="cover-author">著者：<span>老子</span>（春秋时期）</p>
                                <a class="enter-btn" id="startReading" href="#page-intro">开始阅读
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 底部悬浮翻页导航（JS 增强；无 JS 时由每章页脚导航替代） -->
    <div class="bottom-nav" id="bottomNav">
        <a class="nav-arrow" id="prevBtn" href="#page-cover">← 上一章</a>
        <span class="page-indicator" id="pageIndicator">封面</span>
        <a class="nav-arrow" id="nextBtn" href="#page-1">下一章 →</a>
    </div>

    <script>
{JS}
    </script>
</body>
</html>
'''

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
with io.open(out_path, "w", encoding="utf-8") as f:
    f.write(HTML)

print("written:", out_path, "bytes:", len(HTML.encode("utf-8")))
print("chapters:", len(DATA))
