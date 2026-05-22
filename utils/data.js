const stores = [
  {
    id: 'jiangning',
    name: '《破壳派酒吧》江宁上元大街(皇家酒吧Royal Cask Bar)',
    shortName: '江宁上元大街店',
    address: '江宁区东山街道上元大街江宁供销商厦1层',
    status: '营业中',
    phone: '025-8888-0520'
  },
]

const categories = [
  { id: 'packages', name: '桌游套餐' },
  { id: 'dishes', name: '点菜' },
  { id: 'classic', name: '经典鸡尾酒' },
  { id: 'special', name: '特调鸡尾酒' },
  { id: 'craft-beer', name: '精酿啤酒' },
  { id: 'drinks', name: '饮料' }
]

const products = [
  {
    id: 'pkg-mtt',
    categoryId: 'packages',
    name: '中型MTT复活套餐(每日仅限3次复活)',
    desc: '任选酒水饮料一杯+1万记分牌',
    price: 268,
    points: 0,
    unit: '份',
    image: '/assets/product-pack.svg',
    sale: true
  },
  {
    id: 'pkg-198',
    categoryId: 'packages',
    name: '桌游酒水饮料套餐198元',
    desc: '酒水饮料198/杯（鸡尾酒任选一杯）赠送3000积分',
    price: 198,
    points: 3000,
    unit: '份',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'pkg-328',
    categoryId: 'packages',
    name: '桌游酒水饮料套餐328元',
    desc: '酒水任选一杯，赠送5000积分，活动期间积分双倍',
    price: 328,
    points: 5000,
    unit: '份',
    image: '/assets/product-special.svg',
    sale: true
  },
  {
    id: 'dish-crab',
    categoryId: 'dishes',
    name: '葱姜炒膏蟹',
    desc: '招牌热菜，可使用42800积分兑换',
    price: 188,
    points: 42800,
    unit: '份',
    image: '/assets/product-dish.svg',
    sale: true
  },
  {
    id: 'dish-fish',
    categoryId: 'dishes',
    name: '香煎小黄鱼',
    desc: '下酒小食，可使用12800积分兑换',
    price: 68,
    points: 12800,
    unit: '份',
    image: '/assets/product-dish.svg',
    sale: true
  },
  {
    id: 'classic-negroni',
    categoryId: 'classic',
    name: '尼格罗尼',
    desc: '金巴利、金酒、甜味美思，经典微苦',
    price: 78,
    points: 9000,
    unit: '杯',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'classic-martini',
    categoryId: 'classic',
    name: '干马天尼',
    desc: '金酒与干味美思，强劲清冽',
    price: 88,
    points: 9800,
    unit: '杯',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'special-royal',
    categoryId: 'special',
    name: '皇家筹码',
    desc: '破壳派定制特调，柑橘、威士忌、香草尾韵',
    price: 98,
    points: 12000,
    unit: '杯',
    image: '/assets/product-special.svg',
    sale: true
  },
  {
    id: 'drink-cola',
    categoryId: 'drinks',
    name: '可乐',
    desc: '冰镇软饮',
    price: 18,
    points: 2000,
    unit: '瓶',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'craft-beer-lager',
    categoryId: 'craft-beer',
    name: '破壳派德式拉格',
    desc: '清爽麦香，适合桌游与轻食搭配',
    price: 58,
    points: 6800,
    unit: '杯',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'craft-beer-ipa',
    categoryId: 'craft-beer',
    name: '柑橘社交IPA',
    desc: '柑橘与松针香气，苦度明亮',
    price: 68,
    points: 7800,
    unit: '杯',
    image: '/assets/product-drink.svg',
    sale: true
  },
  {
    id: 'craft-beer-wheat',
    categoryId: 'craft-beer',
    name: '小麦白啤',
    desc: '柔和麦芽、淡淡丁香与香蕉香气',
    price: 62,
    points: 7200,
    unit: '杯',
    image: '/assets/product-drink.svg',
    sale: true
  }
]

const activities = [
  {
    id: 'act-mtt-sun',
    title: '国际扑克标准中型MTT邀请赛 - 周日',
    type: '国际扑克',
    date: '05月10日 (周日)20:40',
    dayLabel: '今天',
    location: '江宁区东山街道上元大街江宁供销商厦1层',
    deadline: '报名已截止',
    price: 100,
    quota: 20,
    joined: 5,
    status: 'ended',
    productName: 'MTT邀请赛报名券',
    image: '/assets/activity-card.svg'
  },
  {
    id: 'act-sng-sun',
    title: '国际扑克SNG快速邀请赛-周日',
    type: '国际扑克',
    date: '05月10日 (周日)19:30',
    dayLabel: '今天',
    location: '江宁区东山街道上元大街江宁供销商厦1层',
    deadline: '报名已截止',
    price: 69,
    quota: 10,
    joined: 6,
    status: 'ended',
    productName: 'SNG快速赛报名券',
    image: '/assets/activity-card.svg'
  },
  {
    id: 'act-mtt-tue',
    title: '中扑院标准MTT复活邀请赛 - 周二',
    type: '国际扑克',
    date: '05月12日 (周二)20:10',
    dayLabel: '明天',
    location: '江宁区东山街道上元大街江宁供销商厦1层',
    deadline: '抢约倒计时：开放报名中',
    price: 100,
    quota: 20,
    joined: 8,
    status: 'open',
    productName: 'MTT复活赛报名券',
    image: '/assets/activity-card.svg'
  },
  {
    id: 'act-eggs',
    title: '破壳派酒吧掼蛋友谊局',
    type: '掼蛋',
    date: '05月13日 (周三)19:30',
    dayLabel: '后天',
    location: '新街口店扑克主题桌游区',
    deadline: '抢约倒计时：开放报名中',
    price: 39,
    quota: 16,
    joined: 4,
    status: 'open',
    productName: '掼蛋友谊局报名券',
    image: '/assets/activity-card.svg'
  }
]

const member = {
  id: '260509069792',
  nickname: '260509069792',
  level: '普通会员',
  avatarText: '2',
  balance: 0,
  points: 0,
  gems: 0,
  invitePieces: 0,
  consultant: '专属顾问-程经理'
}

const videos = [
  {
    id: 'bar-intro',
    type: '酒吧介绍',
    title: '破壳派酒吧环境介绍',
    desc: '门店环境、桌游区与扑克主题酒吧介绍',
    poster: '/assets/hero-bar.svg',
    src: 'https://media.w3.org/2010/05/sintel/trailer.mp4'
  },
  {
    id: 'activity-mtt',
    type: '活动视频',
    title: 'MTT邀请赛活动回顾',
    desc: '活动现场、赛制与会员互动片段',
    poster: '/assets/activity-card.svg',
    src: 'https://media.w3.org/2010/05/bunny/trailer.mp4'
  }
]

const leaderboard = [
  { id: 'rank-1', username: '260509069792', score: 18800 },
  { id: 'rank-2', username: '破壳派玩家南京上元大街店001', score: 15600 },
  { id: 'rank-3', username: 'Royal Cask Bar Poker Master', score: 13200 },
  { id: 'rank-4', username: '中扑院MTT常客', score: 9800 }
]

const merchantAccount = {
  username: 'dev_store_admin',
  password: 'change-this-store-password',
  storeId: 'jiangning',
  name: '江宁店商家端'
}

module.exports = {
  stores,
  categories,
  products,
  activities,
  member,
  videos,
  leaderboard,
  merchantAccount
}
