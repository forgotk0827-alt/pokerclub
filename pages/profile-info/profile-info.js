const state = require('../../utils/state')

Page({
  data: {
    member: state.getMember()
  },
  onShow() {
    if (!state.requireLogin('查看个人资料', () => this.setData({ member: state.getMember() }))) {
      this.setData({ member: state.getMember() })
      return
    }
    this.setData({ member: state.getMember() })
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
          const member = state.updateNickname(res.content)
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
        const member = state.saveMember(Object.assign({}, this.data.member, { gender }))
        this.setData({ member })
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
          const member = state.saveMember(Object.assign({}, this.data.member, { phone: res.content }))
          this.setData({ member })
        }
      }
    })
  }
})
