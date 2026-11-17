import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppData } from '../hooks/useAppData'
import { useNow } from '../hooks/useNow'
import { getStats } from '../lib/stats'
import { Icon, type IconName } from './Icon'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

const primaryNav: NavItem[] = [
  { to: '/', label: '今日', icon: 'today', end: true },
  { to: '/chapters', label: '全篇', icon: 'book' },
  { to: '/memorize', label: '背诵', icon: 'spark' },
  { to: '/review', label: '复习', icon: 'repeat' },
  { to: '/practice', label: '实践', icon: 'leaf' },
  { to: '/concepts', label: '概念', icon: 'compass' },
  { to: '/settings', label: '我的', icon: 'user' },
]

const bottomNav: NavItem[] = [
  { to: '/', label: '今日', icon: 'today', end: true },
  { to: '/chapters', label: '全篇', icon: 'book' },
  { to: '/memorize', label: '背诵', icon: 'spark' },
  { to: '/review', label: '复习', icon: 'repeat' },
  { to: '/practice', label: '实践', icon: 'leaf' },
]

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link is-active' : 'nav-link'
}

export function Layout() {
  const data = useAppData()
  const now = useNow()
  const stats = getStats(data, now)
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到正文
      </a>

      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-seal" aria-hidden="true">
            道
          </span>
          <span className="brand-copy">
            <strong>道德经</strong>
            <small>日课 · 背诵 · 实践</small>
          </span>
        </NavLink>

        <nav className="sidebar-nav" aria-label="主导航">
          {primaryNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <Icon name={item.icon} size={19} />
              <span className="nav-label">{item.label}</span>
              {item.to === '/review' && stats.due > 0 ? <span className="nav-count">{stats.due}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-progress">
            <div className="sidebar-progress-head">
              <span>已读</span>
              <span>
                {stats.read} / {stats.total}
              </span>
            </div>
            <div className="progress">
              <div className="progress-fill" style={{ width: `${(stats.read / stats.total) * 100}%` }} />
            </div>
          </div>
          <p className="sidebar-quote">千里之行，始于足下。</p>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <NavLink to="/" className="brand brand-mobile">
            <span className="brand-seal" aria-hidden="true">
              道
            </span>
            <span className="brand-copy">
              <strong>道德经</strong>
              <small>日课</small>
            </span>
          </NavLink>
          <div className="mobile-topbar-actions">
            {stats.streak > 0 ? (
              <NavLink className="streak-chip" to="/settings" aria-label={`连续学习 ${stats.streak} 天`}>
                <Icon name="flame" size={15} />
                <span>{stats.streak}</span>
              </NavLink>
            ) : null}
            <NavLink className="icon-button" to="/chapters" aria-label="搜索全篇">
              <Icon name="search" size={19} />
            </NavLink>
            <NavLink className="icon-button" to="/settings" aria-label="设置与我的数据">
              <Icon name="user" size={19} />
            </NavLink>
          </div>
        </header>

        <main className="content" id="main-content">
          <Outlet />
        </main>

        <nav className="bottom-nav" aria-label="底部导航">
          {bottomNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="bottom-nav-item">
              <span className="bottom-nav-icon">
                <Icon name={item.icon} size={21} />
                {item.to === '/review' && stats.due > 0 ? <span className="bottom-dot" aria-hidden="true" /> : null}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
