const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    store: data.stores[0],
    categories: data.categories,
    products: data.products,
    activeCategory: 'packages',
    onlySale: false,
    keyword: '',
    groupedProducts: [],
    filteredCount: 0
  },
  onShow() {
    this.setData({ store: state.getStore() })
    this.buildList()
  },
  buildList() {
    const keyword = this.data.keyword.trim().toLowerCase()
    const matched = this.data.products.filter((item) => {
      const inCategory = item.categoryId === this.data.activeCategory
      const inSale = !this.data.onlySale || item.sale
      const inKeyword = !keyword || item.name.toLowerCase().includes(keyword) || item.desc.toLowerCase().includes(keyword)
      return inCategory && inSale && inKeyword
    })
    const category = data.categories.find((item) => item.id === this.data.activeCategory)
    this.setData({
      filteredCount: data.products.filter((item) => (!this.data.onlySale || item.sale)).length,
      groupedProducts: matched.length
        ? [
            {
              categoryId: category.id,
              categoryName: category.name,
              items: matched
            }
          ]
        : []
    })
  },
  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.id }, () => this.buildList())
  },
  toggleSale() {
    this.setData({ onlySale: !this.data.onlySale }, () => this.buildList())
  },
  onSearch(event) {
    this.setData({ keyword: event.detail.value }, () => this.buildList())
  },
  switchStore() {
    wx.showActionSheet({
      itemList: data.stores.map((item) => item.shortName),
      success: (res) => {
        const store = data.stores[res.tapIndex]
        state.setStore(store.id)
        this.setData({ store })
      }
    })
  },
  addCart(event) {
    const product = data.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product.sale) {
      wx.showToast({ title: '当前不可售', icon: 'none' })
      return
    }
    state.addToCart(product)
    wx.showToast({ title: '已加入购物车' })
  }
})
