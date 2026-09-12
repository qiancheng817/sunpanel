import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { InAppBrowser, DefaultWebViewOptions } from '@capacitor/inappbrowser'

/* ============================================================
 * Sunpanel 移动端 / 安卓客户端
 *
 * 原生环境（APK）下：
 *   - 用 CapacitorHttp 发请求（走 OkHttp，绕过 CORS）
 *   - 用 InAppBrowser.openInWebView 在应用内打开卡片（WebView，Cookie 持久保存在 App 里）
 *   - 长按卡片可选「用系统浏览器打开」（Chrome Custom Tabs，共享 Chrome 登录态）
 * 浏览器环境下自动降级为 fetch / location.href
 * ============================================================ */

const isNative = Capacitor.isNativePlatform()

const K = {
  BASE: 'SPM_BASE',
  BASE_LAN: 'SPM_BASE_LAN',
  USERNAME: 'SPM_USERNAME',
  TOKEN: 'AUTH_TOKEN',      // 与官方前端一致
  USER: 'SPM_USER',
  CACHE: 'SPM_CACHE',
  CONF: 'SPM_CONF',
  MODE: 'SPM_NETMODE'       // auto | lan | wan
}

const state = {
  view: 'login',            // login | home
  base: localStorage.getItem(K.BASE) || '',
  baseLan: localStorage.getItem(K.BASE_LAN) || '',
  username: localStorage.getItem(K.USERNAME) || '',
  token: localStorage.getItem(K.TOKEN) || '',
  user: null,
  groups: [],
  items: {},
  config: null,
  mode: localStorage.getItem(K.MODE) || 'auto',
  activeBase: '',
  keyword: '',
  loading: false
}

/* ---------------- 工具 ---------------- */
function normalizeBase(s) {
  s = (s || '').trim().replace(/\/+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  return s
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function absUrl(u, base) {
  if (!u) return ''
  if (/^(https?:)?\/\//i.test(u)) return u
  if (u.charAt(0) === '/') return (base || state.activeBase || state.base) + u
  return u
}

/* ---------------- HTTP ---------------- */
async function httpPost(url, data) {
  const headers = { 'Content-Type': 'application/json' }
  if (state.token) {
    headers['token'] = state.token
    headers['Authorization'] = 'Bearer ' + state.token
  }

  let res
  if (isNative) {
    const r = await CapacitorHttp.request({
      url, method: 'POST', headers, data: data || {}
    })
    // CapacitorHttp 返回的 data 已解析为对象
    res = (r && r.data) || {}
  } else {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data || {})
    })
    res = await r.json()
  }

  if (res.code === 1000 || res.code === 1001) {
    forceRelogin()
    throw new Error('登录已失效，请重新登录')
  }
  return res
}

async function api(base, path, data) {
  return httpPost(base + '/api' + path, data)
}

function pick(res) {
  const d = res && res.data
  if (d == null) return []
  if (Array.isArray(d)) return d
  if (Array.isArray(d.list)) return d.list
  return []
}

/* ---------------- 登录 ---------------- */
async function doLogin() {
  const baseRaw = document.getElementById('base').value.trim()
  const lanRaw = document.getElementById('baseLan').value.trim()
  const username = document.getElementById('u').value.trim()
  const password = document.getElementById('p').value
  const hint = document.getElementById('hint')

  const base = normalizeBase(baseRaw)
  if (!base) { showHint('请填写 Sunpanel 面板地址', true); return }
  if (!username || !password) { showHint('请填写账号和密码', true); return }

  const btn = document.getElementById('loginBtn')
  btn.disabled = true
  showHint('正在连接 ' + base + ' …')

  state.base = base
  state.baseLan = normalizeBase(lanRaw)
  state.activeBase = base

  try {
    const res = await api(base, '/login', { username, password })
    if (res.code === 0 && res.data && res.data.token) {
      state.token = res.data.token
      state.user = res.data
      state.username = username
      localStorage.setItem(K.BASE, base)
      localStorage.setItem(K.BASE_LAN, state.baseLan)
      localStorage.setItem(K.USERNAME, username)
      localStorage.setItem(K.TOKEN, state.token)
      localStorage.setItem(K.USER, JSON.stringify(res.data))
      state.view = 'home'
      render()
      await resolveBase()
      await loadAll()
    } else {
      throw new Error(res.msg || ('登录失败（' + res.code + '）'))
    }
  } catch (e) {
    btn.disabled = false
    showHint(describeError(e), true)
  }
}

function describeError(e) {
  const m = (e && e.message) || String(e)
  if (/Failed to fetch|NetworkError|network|SSL|ssl/i.test(m)) {
    return '连接失败：\n地址写错、证书不受信、或手机连不上该服务'
  }
  return m
}

function showHint(msg, isErr) {
  const h = document.getElementById('hint')
  if (!h) return
  h.className = 'hint' + (isErr ? ' err' : '')
  h.textContent = msg || ''
}

function forceRelogin() {
  state.token = ''
  state.groups = []
  state.items = {}
  localStorage.removeItem(K.TOKEN)
  localStorage.removeItem(K.USER)
  state.view = 'login'
  render()
}

function logout() {
  state.token = ''
  state.groups = []
  state.items = {}
  state.config = null
  localStorage.removeItem(K.TOKEN)
  localStorage.removeItem(K.USER)
  state.view = 'login'
  render()
}

/* ---------------- 网络环境：决定用内网还是外网地址 ---------------- */
async function resolveBase() {
  if (!state.baseLan) { state.activeBase = state.base; return }

  if (state.mode === 'lan') { state.activeBase = state.baseLan; return }
  if (state.mode === 'wan') { state.activeBase = state.base; return }

  // auto：先试着连内网，连不上就用外网
  const ok = await probe(state.baseLan)
  state.activeBase = ok ? state.baseLan : state.base
}

async function probe(base) {
  try {
    const r = await withTimeout(api(base, '/panel/itemIconGroup/getList', {}), 2500)
    return !!(r && r.code === 0)
  } catch (e) {
    return false
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ])
}

/* ---------------- 数据加载 ---------------- */
async function loadAll() {
  state.loading = true
  render()

  try {
    const [gres, cres] = await Promise.all([
      api(state.activeBase, '/panel/itemIconGroup/getList', {}).catch(() => null),
      api(state.activeBase, '/panel/userConfig/get', {}).catch(() => null)
    ])

    if (cres && cres.code === 0 && cres.data) {
      state.config = cres.data.panel || cres.data || {}
      localStorage.setItem(K.CONF, JSON.stringify(state.config))
      applyWallpaper()
    }

    state.groups = pick(gres)

    if (state.groups.length) {
      await Promise.all(state.groups.map(async (g) => {
        try {
          const r = await api(state.activeBase, '/panel/itemIcon/getListByGroupId', { itemIconGroupId: g.id })
          state.items[g.id] = pick(r)
        } catch (e) {
          state.items[g.id] = []
        }
      }))
    }

    localStorage.setItem(K.CACHE, JSON.stringify({ groups: state.groups, items: state.items }))
  } catch (e) {
    toast(describeError(e))
  }

  state.loading = false
  render()
  restoreScroll()
}

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(K.CACHE) || 'null')
    if (c) { state.groups = c.groups || []; state.items = c.items || {} }
    const conf = JSON.parse(localStorage.getItem(K.CONF) || 'null')
    if (conf) { state.config = conf; applyWallpaper() }
  } catch (e) {}
}

function applyWallpaper() {
  const el = document.getElementById('wallpaper')
  const bg = state.config && state.config.backgroundImageSrc
  el.style.backgroundImage = bg ? 'url("' + absUrl(bg) + '")' : ''
}

/* ---------------- 打开链接 ---------------- */
async function openUrl(url, external) {
  if (!url) { toast('该卡片没有配置地址'); return }
  localStorage.setItem('SPM_SCROLL', String(window.scrollY || 0))
  if (!isNative) { window.location.href = url; return }

  if (external) {
    // 系统浏览器（Chrome Custom Tabs，共享 Chrome 的 Cookie）
    try {
      await Browser.open({ url, toolbarColor: '#121212' })
    } catch (e) {
      window.open(url, '_blank')
    }
    return
  }

  // 默认：应用内 WebView 打开，Cookie 持久保存在 App 内，登录一次长期有效
  try {
    await InAppBrowser.openInWebView({
      url,
      options: DefaultWebViewOptions || {
        showURL: true, showToolbar: true, clearCache: false, clearSessionCache: false,
        mediaPlaybackRequiresUserAction: true, closeButtonText: '关闭',
        showNavigationButtons: true, leftToRight: false,
        android: { allowZoom: true, hardwareBack: true, pauseMedia: true },
        iOS: { allowOverScroll: true, enableViewportScale: true, allowInLineMediaPlayback: false,
               surpressIncrementalRendering: false, viewStyle: 0, animationEffect: 2 }
      }
    })
  } catch (e) {
    // 插件异常时退回 Custom Tabs
    try { await Browser.open({ url, toolbarColor: '#121212' }) } catch (e2) {}
  }
}

async function openItem(item) {
  const lan = useLan()
  let url = (lan && item.lanUrl) ? item.lanUrl : (item.url || item.lanUrl)
  // 卡片里填的是相对路径时补上当前 base
  if (url && !/^(https?:)?\/\//i.test(url)) url = absUrl(url)
  await openUrl(url)
}

function useLan() {
  if (state.mode === 'lan') return true
  if (state.mode === 'wan') return false
  return !!state.baseLan && state.activeBase === state.baseLan
}

/* ---------------- 渲染 ---------------- */
const ICON = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  net: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M2 8.5a15 15 0 0 1 20 0"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>',
  more: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
}

function render() {
  const app = document.getElementById('app')
  if (state.view === 'login') {
    app.innerHTML = loginTpl()
    bindLogin()
  } else {
    app.innerHTML = homeTpl()
    bindHome()
  }
}

function loginTpl() {
  const hasSaved = !!state.base
  return '' +
  '<div class="form">' +
    '<div class="form-title">Sunpanel</div>' +
    '<div class="form-sub">连接你的导航面板</div>' +
    '<div class="field">' +
      '<label>面板地址（外网 / 域名）</label>' +
      '<input id="base" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://panel.example.com" value="' + esc(state.base) + '">' +
      '<div class="tip">就是你在 Lucky 反代后访问 sun-panel 的那个 https 地址</div>' +
    '</div>' +
    '<div class="field">' +
      '<label>内网地址（选填）</label>' +
      '<input id="baseLan" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="http://192.168.1.10:3002" value="' + esc(state.baseLan) + '">' +
      '<div class="tip">填了之后回到家会自动优先走内网，速度更快</div>' +
    '</div>' +
    '<div class="field">' +
      '<label>账号</label>' +
      '<input id="u" type="text" autocomplete="username" autocapitalize="off" placeholder="用户名" value="' + esc(state.username) + '">' +
    '</div>' +
    '<div class="field">' +
      '<label>密码</label>' +
      '<input id="p" type="password" autocomplete="current-password" placeholder="密码">' +
    '</div>' +
    '<button class="btn" id="loginBtn">登 录</button>' +
    (hasSaved ? '<button class="btn ghost" id="clearBtn">清除已保存的配置</button>' : '') +
    '<div class="hint" id="hint"></div>' +
  '</div>'
}

function bindLogin() {
  document.getElementById('loginBtn').onclick = doLogin
  document.getElementById('p').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin()
  })
  const cb = document.getElementById('clearBtn')
  if (cb) cb.onclick = () => {
    ;[K.BASE, K.BASE_LAN, K.USERNAME, K.TOKEN, K.USER, K.CACHE, K.CONF].forEach(k => localStorage.removeItem(k))
    state.base = state.baseLan = state.username = state.token = ''
    render()
    toast('已清除')
  }
}

function iconHtml(item) {
  const ic = item.icon
  const first = esc((item.title || '?').charAt(0))
  if (!ic) return '<div class="thumb">' + first + '</div>'

  const bg = ic.backgroundColor ? 'background:' + esc(ic.backgroundColor) + ';' : ''

  if (ic.itemType === 1) {
    return '<div class="thumb" style="' + bg + '">' + esc(ic.text || (item.title || '?').charAt(0)) + '</div>'
  }
  if (ic.itemType === 2) {
    const src = absUrl(ic.src)
    return '<div class="thumb" style="' + bg + '"><img src="' + esc(src) + '" alt="" onerror="this.remove()"></div>'
  }
  if (ic.itemType === 3) {
    const n = (ic.text || '').split(':')
    if (n.length === 2) {
      const url = 'https://api.iconify.design/' + n[0] + '/' + n[1] + '.svg?color=white'
      return '<div class="thumb iconify" style="' + bg + '"><img src="' + esc(url) + '" alt="" onerror="this.remove()"></div>'
    }
  }
  return '<div class="thumb" style="' + bg + '">' + first + '</div>'
}

function homeTpl() {
  const kw = state.keyword.trim().toLowerCase()
  const title = (state.config && state.config.logoText) || 'Sunpanel'
  const lan = useLan()

  let html = '' +
  '<div class="topbar">' +
    '<div class="brand">' + esc(title) + '</div>' +
    '<div class="search">' + ICON.search +
      '<input id="kw" type="search" placeholder="搜索" value="' + esc(state.keyword) + '">' +
    '</div>' +
    (state.baseLan ? '<button class="icon-btn' + (lan ? ' active' : '') + '" id="btnNet">' + ICON.net + '</button>' : '') +
    '<button class="icon-btn" id="btnMore">' + ICON.more + '</button>' +
  '</div>' +
  '<div class="pull" id="pull">下拉刷新</div>' +
  '<div class="content" id="content">'

  if (state.loading && !state.groups.length) {
    html += '<div class="center"><div class="spinner"></div>加载中…</div>'
  } else if (!state.groups.length) {
    html += '<div class="center">还没有数据<br><span style="font-size:12px">下拉刷新，或去网页版添加卡片</span></div>'
  } else {
    let total = 0
    state.groups.forEach((g) => {
      let list = state.items[g.id] || []
      if (kw) {
        list = list.filter(it =>
          ((it.title || '') + ' ' + (it.description || '') + ' ' + (it.url || '')).toLowerCase().includes(kw))
      }
      if (!list.length) return
      total += list.length
      html += '<div class="group">'
      if (g.title) html += '<div class="group-title">' + esc(g.title) + '</div>'
      html += '<div class="grid">'
      list.forEach((it) => {
        html += '<div class="card" data-id="' + it.id + '" data-gid="' + g.id + '">' +
                  iconHtml(it) +
                  '<div class="name">' + esc(it.title || '') + '</div>' +
                '</div>'
      })
      html += '</div></div>'
    })
    if (!total && kw) html += '<div class="center">没有匹配「' + esc(state.keyword) + '」的卡片</div>'
  }

  html += '</div>'
  return html
}

function findItem(el) {
  const gid = el.getAttribute('data-gid')
  const id = parseInt(el.getAttribute('data-id'), 10)
  const list = state.items[gid] || []
  return list.find(x => x.id === id) || null
}

function bindHome() {
  const kw = document.getElementById('kw')
  if (kw) {
    kw.addEventListener('input', () => {
      state.keyword = kw.value
      const c = document.getElementById('content')
      const tmp = document.createElement('div')
      tmp.innerHTML = homeTpl()
      c.innerHTML = tmp.querySelector('#content').innerHTML
    })
  }

  const btnNet = document.getElementById('btnNet')
  if (btnNet) btnNet.onclick = async () => {
    const order = ['auto', 'lan', 'wan']
    state.mode = order[(order.indexOf(state.mode) + 1) % 3]
    localStorage.setItem(K.MODE, state.mode)
    await resolveBase()
    render()
    await loadAll()
    toast(state.mode === 'auto' ? '自动（当前：' + (useLan() ? '内网' : '外网') + '）'
        : state.mode === 'lan' ? '已切到内网地址' : '已切到外网地址')
  }

  document.getElementById('btnMore').onclick = showMore

  const content = document.getElementById('content')

  content.addEventListener('click', (e) => {
    const card = e.target.closest ? e.target.closest('.card') : null
    if (!card) return
    const item = findItem(card)
    if (item) openItem(item)
  })

  // 长按菜单
  let timer = null
  content.addEventListener('touchstart', (e) => {
    const card = e.target.closest ? e.target.closest('.card') : null
    if (!card) return
    const item = findItem(card)
    if (!item) return
    timer = setTimeout(() => { timer = null; showItemSheet(item) }, 520)
  }, { passive: true })
  ;['touchend', 'touchmove', 'touchcancel'].forEach(ev => {
    content.addEventListener(ev, () => { if (timer) { clearTimeout(timer); timer = null } }, { passive: true })
  })
  content.addEventListener('contextmenu', (e) => {
    const card = e.target.closest ? e.target.closest('.card') : null
    if (!card) return
    e.preventDefault()
    const item = findItem(card)
    if (item) showItemSheet(item)
  })

  bindPullRefresh()
}

function bindPullRefresh() {
  let startY = 0, pulling = false, moved = 0
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY <= 0) { startY = e.touches[0].clientY; pulling = true; moved = 0 }
  }, { passive: true })
  document.addEventListener('touchmove', (e) => {
    if (!pulling || state.loading) return
    moved = e.touches[0].clientY - startY
    const el = document.getElementById('pull')
    if (moved > 0 && window.scrollY <= 0) {
      el.style.height = Math.min(moved / 2, 60) + 'px'
      el.textContent = moved > 120 ? '松开刷新' : '下拉刷新'
      if (moved > 40) e.preventDefault()
    }
  }, { passive: false })
  document.addEventListener('touchend', () => {
    if (!pulling) return
    pulling = false
    const el = document.getElementById('pull')
    if (el) el.style.height = '0'
    if (moved > 120 && !state.loading) loadAll()
  })
}

/* ---------------- 弹层 ---------------- */
const mask = document.getElementById('mask')
const sheetEl = document.getElementById('sheet')
mask.addEventListener('click', (e) => { if (e.target === mask) closeSheet() })
function closeSheet() { mask.classList.remove('show') }

function sheet(html, onPick) {
  sheetEl.innerHTML = html
  sheetEl.onclick = (e) => {
    const el = e.target.closest ? e.target.closest('.sheet-item') : null
    if (!el) return
    const a = el.getAttribute('data-a')
    closeSheet()
    if (a && a !== 'cancel' && onPick) onPick(a)
  }
  mask.classList.add('show')
}

function showMore() {
  const lan = useLan()
  let html = '<div class="sheet-title">当前：' + (lan ? '内网' : '外网') + ' · ' + esc(state.activeBase || state.base) + '</div>'
  if (state.baseLan) {
    html += '<div class="sheet-item" data-a="auto">自动选择</div>' +
            '<div class="sheet-item" data-a="lan">用内网地址</div>' +
            '<div class="sheet-item" data-a="wan">用外网地址</div>' +
            '<div class="sheet-sep"></div>'
  }
  html += '<div class="sheet-item" data-a="refresh">刷新数据</div>' +
          '<div class="sheet-item" data-a="web">打开网页版</div>' +
          '<div class="sheet-item" data-a="settings">服务器设置</div>' +
          '<div class="sheet-sep"></div>' +
          '<div class="sheet-item danger" data-a="logout">退出登录</div>' +
          '<div class="sheet-item" data-a="cancel">取消</div>'

  sheet(html, async (a) => {
    if (a === 'auto' || a === 'lan' || a === 'wan') {
      state.mode = a
      localStorage.setItem(K.MODE, a)
      await resolveBase(); render(); await loadAll()
    } else if (a === 'refresh') {
      await loadAll()
    } else if (a === 'web') {
      await openUrl(state.activeBase || state.base, true)
    } else if (a === 'settings') {
      state.view = 'login'; render()
    } else if (a === 'logout') {
      logout()
    }
  })
}

function showItemSheet(item) {
  const url = item.url ? absUrl(item.url) : ''
  const lanUrl = item.lanUrl ? absUrl(item.lanUrl) : ''
  let html = '<div class="sheet-title">' + esc(item.title || '') + '</div>'
  html += '<div class="sheet-item" data-a="open">应用内打开（' + (useLan() ? '内网' : '外网') + '）</div>'
  if (lanUrl && lanUrl !== url) html += '<div class="sheet-item" data-a="openLan">应用内打开内网地址</div>'
  if (url && lanUrl && url !== lanUrl) html += '<div class="sheet-item" data-a="openWan">应用内打开外网地址</div>'
  if (url || lanUrl) html += '<div class="sheet-item" data-a="openExt">用系统浏览器打开</div>'
  html += '<div class="sheet-item" data-a="copy">复制地址</div>'
  html += '<div class="sheet-sep"></div><div class="sheet-item" data-a="cancel">取消</div>'

  sheet(html, async (a) => {
    if (a === 'open') await openItem(item)
    else if (a === 'openLan') await openUrl(lanUrl)
    else if (a === 'openWan') await openUrl(url)
    else if (a === 'openExt') await openUrl(useLan() && lanUrl ? lanUrl : url, true)
    else if (a === 'copy') copyText(useLan() && lanUrl ? lanUrl : url)
  })
}

function copyText(t) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t).then(() => toast('已复制'), () => fallbackCopy(t))
  } else fallbackCopy(t)
}
function fallbackCopy(t) {
  const ta = document.createElement('textarea')
  ta.value = t
  ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy'); toast('已复制') } catch (e) { toast('复制失败') }
  document.body.removeChild(ta)
}

/* ---------------- 滚动 / 提示 ---------------- */
function restoreScroll() {
  const y = parseInt(localStorage.getItem('SPM_SCROLL') || '0', 10)
  if (y > 0) { window.scrollTo(0, y); localStorage.removeItem('SPM_SCROLL') }
}

let toastTimer = null
function toast(msg) {
  const old = document.getElementById('toast')
  if (old) old.remove()
  const d = document.createElement('div')
  d.id = 'toast'
  d.textContent = msg
  d.style.cssText = 'position:fixed;left:50%;bottom:calc(var(--safe-b) + 80px);transform:translateX(-50%);' +
    'background:rgba(0,0,0,.85);color:#fff;padding:10px 18px;border-radius:20px;font-size:13.5px;' +
    'z-index:99;pointer-events:none;opacity:0;transition:opacity .2s;max-width:82%;text-align:center;white-space:pre-wrap'
  document.body.appendChild(d)
  requestAnimationFrame(() => { d.style.opacity = '1' })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    d.style.opacity = '0'
    setTimeout(() => d.remove(), 250)
  }, 1900)
}

/* ---------------- 启动 ---------------- */
;(function boot() {
  document.addEventListener('backbutton', () => { /* 交给系统处理 */ })

  // 回到前台时重新探测内外网：从外面回家连上 WiFi 后，不用手动刷新
  if (isNative && App && App.addListener) {
    try {
      App.addListener('appStateChange', (s) => {
        if (s.isActive && state.view === 'home' && state.mode === 'auto' && state.baseLan) {
          const before = state.activeBase
          resolveBase().then(() => {
            if (state.activeBase !== before) {
              loadAll()
              toast('网络环境变化，已切换到' + (useLan() ? '内网' : '外网'))
            }
          })
        }
      })
    } catch (e) { /* 忽略 */ }
  }

  if (state.token && state.base) {
    try { state.user = JSON.parse(localStorage.getItem(K.USER) || 'null') } catch (e) {}
    state.activeBase = state.base
    state.view = 'home'
    loadCache()
    render()
    resolveBase().then(() => loadAll())
  } else {
    render()
  }
})()
