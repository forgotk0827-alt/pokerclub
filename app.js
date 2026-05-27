const state = require('./utils/state')

const DEFAULT_SHARE_TITLE = '破壳派酒吧'

function buildSharePath(page) {
  const route = page && page.route ? page.route : 'pages/home/home'
  const options = page && page.__shareOptions ? page.__shareOptions : {}
  const query = Object.keys(options)
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`)
    .join('&')
  return `/${route}${query ? `?${query}` : ''}`
}

function installDefaultShare() {
  if (typeof Page !== 'function' || Page.__defaultShareInstalled) return
  const originalPage = Page
  const wrappedPage = function (config = {}) {
    const originalOnLoad = config.onLoad
    const originalOnShow = config.onShow
    config.onLoad = function (options) {
      this.__shareOptions = options || {}
      if (originalOnLoad) return originalOnLoad.call(this, options)
      return undefined
    }
    config.onShow = function (...args) {
      if (wx.showShareMenu) {
        wx.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        })
      }
      if (originalOnShow) return originalOnShow.apply(this, args)
      return undefined
    }
    if (!config.onShareAppMessage) {
      config.onShareAppMessage = function () {
        return {
          title: DEFAULT_SHARE_TITLE,
          path: buildSharePath(this)
        }
      }
    }
    if (!config.onShareTimeline) {
      config.onShareTimeline = function () {
        return {
          title: DEFAULT_SHARE_TITLE,
          query: buildSharePath(this).split('?')[1] || ''
        }
      }
    }
    return originalPage(config)
  }
  wrappedPage.__defaultShareInstalled = true
  Page = wrappedPage
}

installDefaultShare()

App({
  onLaunch(options) {
    state.resetUserSession()
    state.ensureSeed()
    state.syncServerData()
    if (options && options.query) state.applyTablePayload(options.query, { toast: false })
  },
  onShow() {
    state.syncServerData()
  },
  globalData: {
    brand: '破壳派酒吧'
  }
})
