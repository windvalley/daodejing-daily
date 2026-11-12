export interface ConceptQuote {
  chapter: number
  text: string
}

export interface Concept {
  slug: string
  name: string
  subtitle: string
  summary: string
  chapters: number[]
  quotes: ConceptQuote[]
}

export const concepts: Concept[] = [
  {
    slug: 'dao',
    name: '道',
    subtitle: '说不出的根本',
    summary:
      '道是老子思想的总根源，也是万物运行的总规律。它无形、无声、无名，不能用概念完全说尽，却贯穿在有形世界的生灭之中。理解道，不是多掌握一个定义，而是学会在名相之外观察事物本来的走向。',
    chapters: [1, 4, 14, 21, 25, 32, 34, 40, 42, 47, 51, 52, 62],
    quotes: [
      { chapter: 25, text: '有物混成，先天地生。' },
      { chapter: 1, text: '道可道，非常道；名可名，非常名。' },
      { chapter: 40, text: '天下万物生于有，有生于无。' },
    ],
  },
  {
    slug: 'de',
    name: '德',
    subtitle: '道在身上的落实',
    summary:
      '德是道在具体事物中的体现，是得之于道的内在质地。老子反复说“上德不德”，真正的德不标榜自己，也不以德为工具。德越厚，越像朴、像婴儿、像水，平常而不刺眼。',
    chapters: [10, 18, 21, 23, 27, 31, 33, 38, 39, 49, 50, 51, 54, 55, 58, 62, 63, 65, 67, 69, 71, 72, 74, 77, 79, 81],
    quotes: [
      { chapter: 38, text: '上德不德，是以有德。' },
      { chapter: 51, text: '生而不有，为而不恃，长而不宰。是谓玄德。' },
    ],
  },
  {
    slug: 'wuwei',
    name: '无为',
    subtitle: '不妄为，而不是不作为',
    summary:
      '无为常被误解为什么都不做。老子说的无为，是不逆着事物的本性强行推动，不以私意搅动局面。它往往表现为少发号令、不频繁变动、在事情未乱时先做安排，最后达到“无不为”的效果。',
    chapters: [2, 3, 5, 7, 10, 17, 24, 26, 27, 29, 34, 37, 43, 47, 48, 49, 51, 57, 60, 63, 64, 74, 75],
    quotes: [
      { chapter: 37, text: '道常无为而无不为。' },
      { chapter: 48, text: '损之又损，以至于无为。无为而无不为。' },
    ],
  },
  {
    slug: 'ziran',
    name: '自然',
    subtitle: '自己如此',
    summary:
      '自然是“自己如此”“本来这样”，不是今天所说的大自然。道法自然，是说道以自身为法，不依赖另一个主宰。最好的治理和最好的生活，都让人和事回到自己本来的节律。',
    chapters: [5, 16, 17, 23, 25, 29, 35, 37, 51, 55, 57, 60, 64, 80],
    quotes: [
      { chapter: 25, text: '人法地，地法天，天法道，道法自然。' },
      { chapter: 17, text: '功成事遂，百姓皆谓：我自然。' },
    ],
  },
  {
    slug: 'youwu',
    name: '有无',
    subtitle: '空处才有大用',
    summary:
      '有与无相互生成，也相互成就。老子用车毂、陶器、房屋说明：实体带来便利，空处才让器物真正可用。人生也一样，日程、房间、心里的话，都需要留白。',
    chapters: [1, 2, 11, 40, 42],
    quotes: [
      { chapter: 11, text: '故有之以为利，无之以为用。' },
      { chapter: 40, text: '天下万物生于有，有生于无。' },
    ],
  },
  {
    slug: 'rouruo',
    name: '柔弱',
    subtitle: '生之徒',
    summary:
      '柔弱不是软弱，而是不硬碰、不耗尽自己。老子观察草木与流水，得出“柔弱者生之徒”的判断：真正有生命力的东西往往柔软，僵硬则接近死亡。柔弱胜刚强，靠的是顺势、持久和余地。',
    chapters: [6, 8, 15, 22, 28, 30, 36, 40, 43, 52, 61, 66, 67, 68, 69, 73, 76, 78],
    quotes: [
      { chapter: 76, text: '故坚强者死之徒，柔弱者生之徒。' },
      { chapter: 78, text: '弱之胜强，柔之胜刚，天下莫不知莫能行。' },
    ],
  },
  {
    slug: 'buzheng',
    name: '不争',
    subtitle: '不与人争，反而无人能争',
    summary:
      '不争不是放弃，而是不把力气花在争夺名分和胜负上。老子把水、江海、圣人都写成“处下”“不争”的形象：把位置放低，把功劳让出，反而能聚拢人心，成就更大的事。',
    chapters: [2, 7, 8, 22, 34, 56, 66, 67, 68, 69, 77, 79, 81],
    quotes: [
      { chapter: 8, text: '夫唯不争，故无尤。' },
      { chapter: 22, text: '夫唯不争，故天下莫能与之争。' },
      { chapter: 81, text: '天之道，利而不害；圣人之道，为而不争。' },
    ],
  },
  {
    slug: 'zhizu',
    name: '知足',
    subtitle: '知道什么时候够了',
    summary:
      '知足不是没有追求，而是能分辨“需要”和“想要”。老子把不知足看作最大的祸患，把知止看作长久的前提。懂得在哪里停下，才能保住已经拥有的东西。',
    chapters: [3, 9, 12, 13, 19, 32, 33, 44, 46, 48, 50, 59, 67, 71, 72, 75, 80],
    quotes: [
      { chapter: 33, text: '知足者富。' },
      { chapter: 46, text: '故知足之足，常足矣。' },
      { chapter: 44, text: '知足不辱，知止不殆，可以长久。' },
    ],
  },
  {
    slug: 'pu',
    name: '朴',
    subtitle: '未经雕琢的原木',
    summary:
      '朴是没被切开、没被修饰的原木，代表事物本来的样子。老子常用朴来形容道和厚德：不显眼，不锋利，不急着成为某种器物。朴散开才成为各种器具，但最好的治理不把万物割裂。',
    chapters: [15, 19, 28, 32, 37, 38, 41, 45, 53, 57, 65, 70, 80, 81],
    quotes: [
      { chapter: 19, text: '见素抱朴，少私寡欲。' },
      { chapter: 28, text: '朴散则为器，圣人用之，则为官长，故大制不割。' },
    ],
  },
  {
    slug: 'fan',
    name: '反',
    subtitle: '返回与相反相成',
    summary:
      '反有两层意思：一是返回、循环，万物归根复命；二是相反相成，事物走到极端会转向另一面。祸福相倚、物壮则老、将欲歙之必固张之，都是这个道理。理解反，就不会在顺境里忘形，也不会在逆境里绝望。',
    chapters: [9, 18, 22, 24, 30, 31, 36, 38, 40, 44, 46, 48, 53, 58, 65, 73, 76, 77, 78],
    quotes: [
      { chapter: 40, text: '反者道之动，弱者道之用。' },
      { chapter: 58, text: '祸兮福之所倚，福兮祸之所伏。' },
    ],
  },
  {
    slug: 'shui',
    name: '水',
    subtitle: '最近于道的形象',
    summary:
      '水是老子最喜欢用的比喻：它利万物而不争，停在众人厌恶的低处；它最柔弱，却能穿透最坚硬的东西。学水，不是学它的软弱，而是学它的顺势、包容和持久。',
    chapters: [8, 43, 78],
    quotes: [
      { chapter: 8, text: '上善若水。水善利万物而不争，处众人之所恶，故几于道。' },
      { chapter: 78, text: '天下莫柔弱于水，而攻坚强者，莫之能胜。' },
    ],
  },
  {
    slug: 'yinger',
    name: '婴儿',
    subtitle: '德厚、精足、无欲',
    summary:
      '婴儿在老子笔下不是幼稚，而是德厚与生命力充沛的象征：筋骨柔弱却握得紧，终日号哭却不沙哑，没有机心，也没有多余的欲望。回到婴儿，是回到未被习气磨硬的状态。',
    chapters: [10, 20, 28, 49, 55],
    quotes: [
      { chapter: 10, text: '专气致柔，能婴儿乎？' },
      { chapter: 28, text: '为天下溪，常德不离，复归于婴儿。' },
      { chapter: 55, text: '含德之厚，比于赤子。' },
    ],
  },
  {
    slug: 'heguang',
    name: '和光同尘',
    subtitle: '有光而不刺眼',
    summary:
      '和光同尘不是随波逐流，而是收敛锋芒、混同尘世，不把自己放在众人之上。有道的人内部有光，外部却平常，不靠刺眼来证明自己。',
    chapters: [4, 56],
    quotes: [
      { chapter: 4, text: '挫其锐，解其纷，和其光，同其尘。' },
      { chapter: 56, text: '和其光，同其尘，是谓玄同。' },
    ],
  },
  {
    slug: 'jing',
    name: '静',
    subtitle: '躁动的主宰',
    summary:
      '静是老子反复强调的工夫。致虚守静，才能看见万物归根；清静无为，才能成为天下的正道。静不是不动，而是不被躁动牵着走，在动之前先有定力。',
    chapters: [16, 26, 45, 47, 52, 59, 61, 66],
    quotes: [
      { chapter: 26, text: '重为轻根，静为躁君。' },
      { chapter: 45, text: '躁胜寒，静胜热。清静为天下正。' },
      { chapter: 16, text: '致虚极，守静笃。' },
    ],
  },
]

export const conceptMap = new Map<string, Concept>(concepts.map((concept) => [concept.slug, concept]))

export function getConcept(slug: string): Concept | undefined {
  return conceptMap.get(slug)
}

export function conceptsForChapter(chapterNumber: number): Concept[] {
  return concepts.filter((concept) => concept.chapters.includes(chapterNumber))
}
