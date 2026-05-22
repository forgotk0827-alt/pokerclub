const state = require('../../utils/state')

Page({
  data: {
    member: {},
    selected: 'gold',
    cards: [
      { id: 'gold', name: '黄金会员月卡', points: 2000, price: 500 },
      { id: 'diamond', name: '钻石会员月卡', points: 3000, price: 700 },
      { id: 'black', name: '黑金会员月卡', points: 5000, price: 800 }
    ],
    selectedCard: { id: 'gold', name: '黄金会员月卡', points: 2000, price: 500 }
  },
  onShow() {
    if (!state.requireLogin('开通会员', () => this.refreshMemberFromServer())) {
      this.setData({ member: state.getMember() })
      return
    }
    this.refreshMemberFromServer()
  },
  refreshMemberFromServer() {
    state.fetchMyProfile((member) => {
      this.setData({ member: member || {} })
    })
  },
  selectCard(event) {
    const selected = event.currentTarget.dataset.id
    const selectedCard = this.data.cards.find((item) => item.id === selected) || this.data.cards[0]
    this.setData({ selected, selectedCard })
  },
  goVipOrders() {
    wx.showToast({ title: '暂无VIP订单记录', icon: 'none' })
  },
  openVip() {
    if (!state.requireLogin('开通会员')) {
      return
    }
    const card = this.data.selectedCard
    wx.showModal({
      title: '确认开通',
      content: `确认使用微信支付开通${card.name}，金额 ¥${card.price}？`,
      confirmText: '立即开通',
      success: (res) => {
        if (!res.confirm) return
        const member = this.data.member && this.data.member.id ? this.data.member : state.getMember()
        state.updateMyProfile({
          level: card.name.replace('月卡', ''),
          points: Number(member.points || 0) + Number(card.points || 0),
          totalSpent: Number(member.totalSpent || 0) + Number(card.price || 0)
        }, (next) => {
          if (!next) return
          this.setData({ member: next })
          wx.showToast({ title: '开通成功', icon: 'success' })
        })
      }
    })
  }
})
