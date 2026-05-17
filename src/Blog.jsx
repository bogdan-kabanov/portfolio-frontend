import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from './LangContext'
import { t } from './i18n'
import { usePortfolio } from './PortfolioContext'
import { useUser } from './UserContext'
import { renderMarkdown, readingTimeMinutes } from './markdown'
import { api } from './api'
import AuthModal from './AuthModal'
import './Blog.css'

function pickLocalized(obj, lang) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj
  return obj[lang] || obj.ru || obj.en || ''
}

function formatDate(s, lang) {
  if (!s) return ''
  try {
    return new Date(s).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatRelative(s, lang) {
  if (!s) return ''
  const now = Date.now()
  const ts = new Date(s).getTime()
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return lang === 'ru' ? 'только что' : 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return lang === 'ru' ? `${min} мин назад` : `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return lang === 'ru' ? `${hr} ч назад` : `${hr} h ago`
  return formatDate(s, lang)
}

function BlogCard({ post, lang, onOpen, onShare }) {
  const title = pickLocalized(post.title, lang)
  const excerpt = pickLocalized(post.excerpt, lang)
  const date = formatDate(post.publishedAt || post.createdAt, lang)

  return (
    <article
      className="blog-card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      tabIndex={0}
      role="button"
      aria-label={title}
    >
      <div
        className="blog-card__cover"
        style={post.cover ? { backgroundImage: `url(${post.cover})` } : undefined}
      >
        {!post.cover && (
          <div className="blog-card__cover-placeholder" aria-hidden="true">
            {(title || '?').slice(0, 2).toUpperCase()}
          </div>
        )}
        {onShare && (
          <button
            type="button"
            className="blog-card__share"
            onClick={(e) => { e.stopPropagation(); onShare(post) }}
            aria-label={t(lang, 'blogShare')}
            title={t(lang, 'blogShare')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        )}
      </div>
      <div className="blog-card__body">
        <h3 className="blog-card__title">{title}</h3>
        {excerpt && <p className="blog-card__excerpt">{excerpt}</p>}
        <div className="blog-card__meta">
          {date && <span>{date}</span>}
          {post.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="blog-card__meta-tag">#{tag}</span>
          ))}
          <span className="blog-card__stats">
            <span title={t(lang, 'blogViews')}>👁 {post.views || 0}</span>
            <span title={t(lang, 'blogLikes')}>♥ {post.likes || 0}</span>
            <span title={t(lang, 'blogComments')}>💬 {post.commentsCount || 0}</span>
          </span>
        </div>
      </div>
    </article>
  )
}

function CommentsSection({ postId, lang, requestAuth }) {
  const { user } = useUser()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState(null)

  async function refresh() {
    try {
      const data = await api.listComments(postId)
      setComments(data)
    } catch {
      // silent — comments will remain empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  // When auth state changes the "delete" buttons need to re-evaluate ownership.
  // The comment list itself doesn't need to be re-fetched, but the rendered
  // controls depend on `user`, which React handles for free.

  async function submit(e) {
    e.preventDefault()
    if (!user) {
      requestAuth()
      return
    }
    const value = text.trim()
    if (!value) return
    setPosting(true)
    setError(null)
    try {
      const created = await api.createComment(postId, value)
      setComments((prev) => [...prev, created])
      setText('')
    } catch (er) {
      setError(er.message)
    } finally {
      setPosting(false)
    }
  }

  async function remove(id) {
    if (!window.confirm(lang === 'ru' ? 'Удалить комментарий?' : 'Delete this comment?')) return
    try {
      await api.deleteComment(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch (er) {
      setError(er.message)
    }
  }

  function canDelete(c) {
    if (!user) return false
    if (user.role === 'admin') return true
    return c.author?.id === user.id
  }

  return (
    <section className="blog-comments" aria-label={t(lang, 'blogComments')}>
      <h3 className="blog-comments__title">
        {t(lang, 'blogComments')} <span className="blog-comments__count">{comments.length}</span>
      </h3>

      {loading ? null : comments.length === 0 ? (
        <p className="blog-comments__empty">{t(lang, 'blogCommentsEmpty')}</p>
      ) : (
        <ul className="blog-comments__list">
          {comments.map((c) => (
            <li key={c.id} className="blog-comments__item">
              <div className="blog-comments__avatar" aria-hidden="true">
                {(c.author?.displayName || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="blog-comments__body">
                <div className="blog-comments__head">
                  <span className="blog-comments__author">{c.author?.displayName || '—'}</span>
                  {c.author?.role === 'admin' && (
                    <span className="blog-comments__badge">{t(lang, 'authAdminBadge')}</span>
                  )}
                  <span className="blog-comments__time">{formatRelative(c.createdAt, lang)}</span>
                </div>
                <p className="blog-comments__text">{c.text}</p>
                {canDelete(c) && (
                  <button
                    type="button"
                    className="blog-comments__delete"
                    onClick={() => remove(c.id)}
                  >
                    {t(lang, 'blogCommentDelete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="blog-comments__form" onSubmit={submit}>
        {!user && (
          <p className="blog-comments__login-hint">
            {t(lang, 'blogLoginToComment')}
            {' · '}
            <button type="button" className="blog-comments__login-link" onClick={requestAuth}>
              {t(lang, 'authLogin')}
            </button>
          </p>
        )}
        <textarea
          className="blog-comments__textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(lang, 'blogCommentPlaceholder')}
          disabled={posting}
          maxLength={2000}
        />
        {error && <div className="blog-comments__error">{error}</div>}
        <div className="blog-comments__form-row">
          <button
            type="submit"
            className="blog-comments__submit"
            disabled={posting || !text.trim()}
          >
            {posting ? '...' : t(lang, 'blogCommentSend')}
          </button>
        </div>
      </form>
    </section>
  )
}

function BlogDetail({ post, lang, onBack, requestAuth, onShare }) {
  const { user } = useUser()
  const title = pickLocalized(post.title, lang)
  const content = pickLocalized(post.content, lang)
  const date = formatDate(post.publishedAt || post.createdAt, lang)
  const html = useMemo(() => renderMarkdown(content), [content])
  const readMin = useMemo(() => readingTimeMinutes(content), [content])

  const [likes, setLikes] = useState(post.likes || 0)
  const [liked, setLiked] = useState(post.liked || false)
  const [views, setViews] = useState(post.views || 0)
  const [busy, setBusy] = useState(false)

  // Register a view once per opened post
  const viewedRef = useRef(false)
  useEffect(() => {
    if (viewedRef.current) return
    viewedRef.current = true
    api.registerView(post.id)
      .then((r) => {
        if (typeof r.views === 'number') setViews(r.views)
      })
      .catch(() => {})
  }, [post.id])

  // Refresh liked state when user logs in/out — server only knows our state with a token
  useEffect(() => {
    let cancelled = false
    api.getPost(post.slug)
      .then((p) => {
        if (cancelled) return
        if (typeof p.likes === 'number') setLikes(p.likes)
        if (typeof p.liked === 'boolean') setLiked(p.liked)
        if (typeof p.views === 'number') setViews(p.views)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [post.slug, user?.id])

  async function toggleLike() {
    if (!user) { requestAuth(); return }
    setBusy(true)
    try {
      const r = await api.toggleLike(post.id)
      setLikes(r.likes)
      setLiked(r.liked)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="blog-detail">
      <button className="blog-detail__back" onClick={onBack} type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
          <path d="M19 12H5" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        {t(lang, 'blogBack')}
      </button>

      {post.cover && (
        <div
          className="blog-detail__cover"
          style={{ backgroundImage: `url(${post.cover})` }}
          role="img"
          aria-label={title}
        />
      )}

      <h1 className="blog-detail__title">{title}</h1>

      <div className="blog-detail__meta">
        {date && <span>{date}</span>}
        <span>· {readMin} {t(lang, 'blogReadingTime')}</span>
        {post.tags?.map((tag) => (
          <span key={tag} className="blog-detail__meta-tag">#{tag}</span>
        ))}
      </div>

      <div className="blog-detail__engagement">
        <button
          type="button"
          className={`blog-detail__like ${liked ? 'liked' : ''}`}
          onClick={toggleLike}
          disabled={busy}
          title={user ? '' : t(lang, 'blogLoginToLike')}
        >
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{likes}</span>
        </button>
        <span className="blog-detail__stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{views}</span>
        </span>
        {onShare && (
          <button
            type="button"
            className="blog-detail__share"
            onClick={() => onShare(post)}
            title={t(lang, 'blogShare')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>{t(lang, 'blogShare')}</span>
          </button>
        )}
      </div>

      <div
        className="blog-detail__content"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <CommentsSection postId={post.id} lang={lang} requestAuth={requestAuth} />
    </article>
  )
}

function BlogOverlay({ initialSlug, onClose }) {
  const { lang } = useLang()
  const { posts } = usePortfolio()
  const { user, logout } = useUser()
  const [activeTag, setActiveTag] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Open the post pointed to by the URL once posts are loaded.
  useEffect(() => {
    if (!initialSlug) return
    const found = posts.find((p) => p.slug === initialSlug)
    if (found) setOpenId(found.id)
  }, [initialSlug, posts])

  // Keep the URL in sync with the currently open post so users can copy/share it.
  useEffect(() => {
    const url = new URL(window.location.href)
    const post = openId ? posts.find((p) => p.id === openId) : null
    if (post) {
      url.searchParams.set('post', post.slug)
    } else {
      url.searchParams.delete('post')
    }
    const next = url.pathname + (url.search ? url.search : '') + url.hash
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState({}, '', next)
    }
  }, [openId, posts])

  // Lock background scroll while overlay is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes — go back to list first if a post is open
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (authOpen) return // AuthModal handles its own Esc
        if (openId) setOpenId(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openId, onClose, authOpen])

  const allTags = useMemo(() => {
    const set = new Set()
    for (const p of posts) (p.tags || []).forEach((tg) => set.add(tg))
    return Array.from(set).sort()
  }, [posts])

  const filtered = activeTag
    ? posts.filter((p) => (p.tags || []).includes(activeTag))
    : posts

  // Reset if open post disappears
  useEffect(() => {
    if (openId && !posts.some((p) => p.id === openId)) setOpenId(null)
  }, [posts, openId])

  // Reset scroll when switching between list and detail
  useEffect(() => {
    const root = document.querySelector('.blog-overlay')
    if (root) root.scrollTo({ top: 0, behavior: 'auto' })
  }, [openId])

  const openPost = openId ? posts.find((p) => p.id === openId) : null

  function buildPostUrl(post) {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('post', post.slug)
    return url.toString()
  }

  async function sharePost(post) {
    const url = buildPostUrl(post)
    const title = pickLocalized(post.title, lang)
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // user cancelled or share failed — fall through to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // clipboard blocked — show the URL in a prompt as a last resort
      window.prompt(t(lang, 'blogShareCopy'), url)
    }
  }

  return (
    <div className="blog-overlay" role="dialog" aria-modal="true" aria-label={t(lang, 'blogTitle')}>
      <div className="blog-overlay__topbar">
        {user ? (
          <div className="blog-overlay__user">
            <span className="blog-overlay__user-name">
              {t(lang, 'authHello')}, {user.displayName || user.username}
              {user.role === 'admin' && <span className="blog-overlay__user-badge">{t(lang, 'authAdminBadge')}</span>}
            </span>
            <button className="blog-overlay__user-btn" onClick={logout} type="button">
              {t(lang, 'authLogout')}
            </button>
          </div>
        ) : (
          <button
            className="blog-overlay__user-btn"
            onClick={() => setAuthOpen(true)}
            type="button"
          >
            {t(lang, 'authLogin')}
          </button>
        )}
        <button
          className="blog-overlay__close"
          onClick={onClose}
          aria-label={t(lang, 'close')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="blog-overlay__inner">
        {!openPost ? (
          <>
            <h2 className="blog-overlay__title">{t(lang, 'blogTitle')}</h2>
            <p className="blog-overlay__subtitle">{t(lang, 'blogSubtitle')}</p>

            {allTags.length > 0 && (
              <div className="blog-overlay__tags">
                <button
                  type="button"
                  className={`blog-overlay__tag ${activeTag === null ? 'active' : ''}`}
                  onClick={() => setActiveTag(null)}
                >
                  {t(lang, 'blogAllTags')}
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`blog-overlay__tag ${activeTag === tag ? 'active' : ''}`}
                    onClick={() => setActiveTag(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="blog-overlay__empty">{t(lang, 'blogEmpty')}</p>
            ) : (
              <div className="blog-overlay__grid">
                {filtered.map((post) => (
                  <BlogCard
                    key={post.id}
                    post={post}
                    lang={lang}
                    onOpen={() => setOpenId(post.id)}
                    onShare={sharePost}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <BlogDetail
            post={openPost}
            lang={lang}
            onBack={() => setOpenId(null)}
            requestAuth={() => setAuthOpen(true)}
            onShare={sharePost}
          />
        )}
      </div>

      {shareCopied && (
        <div className="blog-overlay__toast" role="status">
          {t(lang, 'blogShareCopied')}
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

export default function Blog() {
  const { lang } = useLang()
  const { posts } = usePortfolio()
  const [open, setOpen] = useState(false)
  const [initialSlug, setInitialSlug] = useState(null)

  // If the page was opened with ?post=<slug>, auto-open the blog overlay on
  // that post once it becomes available in the portfolio data.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const slug = params.get('post')
    if (!slug) return
    setInitialSlug(slug)
    setOpen(true)
  }, [])

  // Strip the `?post=` param from the URL when the overlay closes.
  function handleClose() {
    setOpen(false)
    setInitialSlug(null)
    const url = new URL(window.location.href)
    if (url.searchParams.has('post')) {
      url.searchParams.delete('post')
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
    }
  }

  if (!posts || posts.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="blog-fab"
        onClick={() => setOpen(true)}
        aria-label={t(lang, 'blogTitle')}
      >
        <span className="blog-fab__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
            <line x1="8" y1="9" x2="16" y2="9" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
        </span>
        <span className="blog-fab__label">{t(lang, 'blogTitle')}</span>
      </button>

      {open && <BlogOverlay initialSlug={initialSlug} onClose={handleClose} />}
    </>
  )
}
