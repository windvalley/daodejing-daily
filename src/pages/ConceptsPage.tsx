import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/common'
import { chapterLabel, getChapter } from '../data/chapters'
import { concepts, getConcept } from '../data/concepts'
import { usePageTitle } from '../hooks/usePageTitle'

export function ConceptsPage() {
  usePageTitle('概念')
  return (
    <div className="page concepts-page">
      <PageHeader
        eyebrow="概念"
        title="十四个关键词"
        description="《道德经》的话头反复回到这些词。按概念串读，比按章号顺读更容易看清一贯之处。"
      />

      <div className="concept-grid">
        {concepts.map((concept) => (
          <Link className="concept-card" to={`/concepts/${concept.slug}`} key={concept.slug}>
            <span className="concept-name">{concept.name}</span>
            <span className="concept-subtitle">{concept.subtitle}</span>
            <p className="concept-summary">{concept.summary}</p>
            <span className="concept-meta">
              {concept.chapters.length} 章
              <Icon name="arrowRight" size={15} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function ConceptPage() {
  const { slug } = useParams<{ slug: string }>()
  const concept = slug ? getConcept(slug) : undefined
  usePageTitle(concept ? concept.name : '概念不存在')

  if (!concept) {
    return (
      <div className="page">
        <div className="empty-state standalone">
          <span className="empty-icon">
            <Icon name="compass" size={26} />
          </span>
          <h3>没有找到这个概念</h3>
          <Link className="button button-primary" to="/concepts">
            回到概念索引
          </Link>
        </div>
      </div>
    )
  }

  const list = concept.chapters.map((number) => getChapter(number)).filter((chapter) => chapter !== undefined)

  return (
    <div className="page concept-page">
      <nav className="crumbs" aria-label="面包屑">
        <Link to="/concepts" className="crumb-back">
          <Icon name="chevronLeft" size={16} />
          概念
        </Link>
        <span className="crumb-divider">/</span>
        <span>{concept.name}</span>
      </nav>

      <header className="concept-header">
        <div>
          <p className="page-eyebrow">{concept.subtitle}</p>
          <h1 className="concept-heading">{concept.name}</h1>
          <p className="concept-lead">{concept.summary}</p>
        </div>
        <span className="concept-count">{concept.chapters.length} 章</span>
      </header>

      <section className="quote-strip">
        {concept.quotes.map((quote) => (
          <Link className="quote-card" key={quote.chapter} to={`/chapters/${quote.chapter}`}>
            <p>{quote.text}</p>
            <span>{chapterLabel(quote.chapter)}</span>
          </Link>
        ))}
      </section>

      <section className="chapter-section">
        <div className="section-heading section-heading-large">
          <h2>相关章节</h2>
        </div>
        <ul className="concept-chapter-list">
          {list.map((chapter) => (
            <li key={chapter.number}>
              <Link to={`/chapters/${chapter.number}`} className="concept-chapter-item">
                <span className="compact-no">{chapter.number}</span>
                <span className="concept-chapter-copy">
                  <strong>
                    {chapter.title}
                    <em>{chapter.gist}</em>
                  </strong>
                  <span>{chapter.text.join('')}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav className="concept-nav" aria-label="其他概念">
        {concepts
          .filter((item) => item.slug !== concept.slug)
          .slice(0, 6)
          .map((item) => (
            <Link className="tag" key={item.slug} to={`/concepts/${item.slug}`}>
              {item.name}
            </Link>
          ))}
      </nav>
    </div>
  )
}
