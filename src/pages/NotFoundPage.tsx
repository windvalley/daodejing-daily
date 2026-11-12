import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { usePageTitle } from '../hooks/usePageTitle'

export function NotFoundPage() {
  usePageTitle('页面不存在')
  return (
    <div className="page">
      <div className="empty-state standalone">
        <span className="empty-icon">
          <Icon name="compass" size={26} />
        </span>
        <h3>这里没有内容</h3>
        <p>可能是地址写错了，也可能是页面已经移走。</p>
        <Link className="button button-primary" to="/">
          回到今日
        </Link>
      </div>
    </div>
  )
}
