const state = require('../../utils/state')

Page({
  data: {
    member: {}
  },
  onShow() {
    if (!state.requireLogin('查看个人资料', () => this.refreshMemberFromServer())) {
      this.setData({ member: state.getMember() })
      return
    }
    this.refreshMemberFromServer()
  },
  refreshMemberFromServer() {
    state.fetchMyProfile((member) => {
      this.setData({ member: member || state.getMember() })
    })
  },
  editName() {
    if (!state.requireLogin('修改姓名')) {
      return
    }
    wx.showModal({
      title: '修改姓名',
      editable: true,
      placeholderText: '请输入姓名',
      confirmText: '保存',
      success: (res) => {
        if (res.confirm) {
          const member = state.updateNickname(res.content, (serverMember) => {
            if (serverMember) this.setData({ member: serverMember })
          })
          this.setData({ member })
        }
      }
    })
  },
  editGender() {
    if (!state.requireLogin('修改性别')) {
      return
    }
    wx.showActionSheet({
      itemList: ['男', '女', '未设置'],
      success: (res) => {
        const gender = ['男', '女', '未设置'][res.tapIndex]
        state.updateMyProfile({ gender }, (member) => {
          if (member) this.setData({ member })
        })
      }
    })
  },
  editPhone() {
    if (!state.requireLogin('修改手机号')) {
      return
    }
    wx.showModal({
      title: '手机号',
      editable: true,
      placeholderText: '请输入手机号',
      confirmText: '保存',
      success: (res) => {
        if (res.confirm) {
          state.updateMyProfile({ phone: res.content }, (member) => {
            if (member) this.setData({ member })
          })
        }
      }
    })
  }
})
