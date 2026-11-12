import { Link } from 'react-router-dom'
import type { Chapter } from '../data/chapters'
import type { ReciteRecord, ReviewRecord } from '../lib/store'
import { Icon } from './Icon'

interface ChapterCardProps {
  chapter: Chapter
  read?: boolean
  favorite?: boolean
  recite?: ReciteRecord
  review?: ReviewRecord
  compact?: boolean
  /** 当前时间，由页面统一传入，避免渲染中读取时钟 */
  now: number
}

/** 目录卡片只露开头一小句，遇到标点即停，避免半截话 */
function shortExcerpt(text: string, limit = 9): string {
  const first = text.split(/(?<=[，。；：！？])/)[0] ?? text
  const chars = Array.from(first.replace(/[。；]$/, ''))
  if (chars.length <= limit) return chars.join('')
  return `${chars.slice(0, limit).join('')}…`
}

export function ChapterCard({ chapter, read, favorite, recite, review, compact = false, now }: ChapterCardProps) {
  const excerpt = chapter.text[0].replace(/[。；]$/, '')
  return (
    <Link className={compact ? 'chapter-card is-compact' : 'chapter-card'} to={`/chapters/${chapter.number}`}>
      <span className="chapter-card-top">
        <span className="chapter-card-no">
          <span className="chapter-card-index">{chapter.number}</span>
          <span className="chapter-card-label">章</span>
        </span>
        <span className="chapter-card-badges">
          {favorite ? (
            <span className="badge badge-heart" title="已收藏">
              <Icon name="heart" size={13} filled />
            </span>
          ) : null}
          {read ? (
            <span className="badge badge-read" title="已读">
              <Icon name="check" size={13} />
            </span>
          ) : null}
          {recite?.mastered ? (
            <span className="badge badge-mastered" title="已背熟">
              <Icon name="spark" size={13} />
            </span>
          ) : null}
        </span>
      </span>
      <span className="chapter-card-title">{chapter.title}</span>
      {compact ? (
        <span className="chapter-card-excerpt">{shortExcerpt(chapter.text[0])}</span>
      ) : (
        <span className="chapter-card-excerpt">{excerpt}</span>
      )}
      <span className="chapter-card-foot">
        {review?.dueAt !== undefined && review.dueAt <= now ? (
          <span className="chapter-card-status is-due">待复习</span>
        ) : recite ? (
          <span className="chapter-card-status">背 {recite.bestScore} 分</span>
        ) : read ? (
          <span className="chapter-card-status">读</span>
        ) : (
          <span className="chapter-card-status is-muted">{chapter.section === 'dao' ? '道经' : '德经'}</span>
        )}
      </span>
    </Link>
  )
}
