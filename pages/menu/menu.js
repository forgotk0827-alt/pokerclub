const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    store: data.stores[0],
    categories: [],
    products: [],
    activeCategory: '',
    onlySale: false,
    keyword: '',
    scrollIntoView: '',
    groupedProducts: [],
    filteredCount: 0,
    tableContext: null,
    cartSummary: { count: 0, total: 0 }
  },
  onLoad(options) {
    state.applyTablePayload(options, { toast: false })
  },
  onShow() {
    this.refreshProducts()
    state.fetchProducts(() => this.refreshProducts())
  },
  refreshProducts() {
    const store = state.getStore()
    const products = state.getProducts()
    const visibleProducts = products.filter((item) => state.isProductVisibleInStore(item, store.id))
    this.setData({
      store,
      tableContext: state.getTableContext(),
      products: visibleProducts,
      categories: state.getProductCategories(visibleProducts, { includeEmpty: false }),
      cartSummary: state.getCartSummary()
    })
    this.buildList()
  },
  buildList() {
    const keyword = this.data.keyword.trim().toLowerCase()
    const saleProducts = this.data.products.filter((item) => !this.data.onlySale || item.sale)
    const visibleProducts = saleProducts.filter((item) => {
      const name = String(item.name || '').toLowerCase()
      const desc = String(item.desc || '').toLowerCase()
      const inKeyword = !keyword || name.includes(keyword) || desc.includes(keyword)
      return inKeyword
    })
    const categories = state.getProductCategories(visibleProducts, { includeEmpty: false })
    const activeCategory = categories.some((category) => category.id === this.data.activeCategory)
      ? this.data.activeCategory
      : (categories[0] && categories[0].id) || ''
    const activeCategoryName = (categories.find((category) => category.id === activeCategory) || {}).name || activeCategory
    const activeItems = activeCategory ? visibleProducts.filter((item) => item.categoryId === activeCategory) : []
    const groupedProducts = activeCategory
      ? [
          {
            categoryId: activeCategory,
            categoryName: activeCategoryName,
            items: activeItems
          }
        ]
      : []

    this.setData({
      categories,
      filteredCount: activeItems.length,
      groupedProducts,
      activeCategory,
      scrollIntoView: ''
    })
  },
  selectCategory(event) {
    const activeCategory = event.currentTarget.dataset.id
    this.setData({ activeCategory }, () => this.buildList())
  },
  toggleSale() {
    this.setData({ onlySale: !this.data.onlySale }, () => this.buildList())
  },
  onSearch(event) {
    this.setData({ keyword: event.detail.value }, () => this.buildList())
  },
  switchStore() {
    const stores = state.getStores()
    wx.showActionSheet({
      itemList: stores.map((item) => item.shortName),
      success: (res) => {
        const store = stores[res.tapIndex]
        state.clearTableContext()
        state.setStore(store.id)
        this.refreshProducts()
      }
    })
  },
  addCart(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product) {
      return
    }
    if (!product.sale) {
      wx.showToast({ title: '当前不可售', icon: 'none' })
      return
    }
    state.requireLogin('加入购物车', () => {
      const cart = state.addToCart(product)
      this.setData({ cartSummary: state.getCartSummary(cart) })
    })
  },
  handleCartChange(event) {
    this.setData({ cartSummary: event.detail.summary })
  }
})
