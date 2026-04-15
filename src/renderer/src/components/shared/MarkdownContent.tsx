import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { getAttachmentUrl, openAttachmentPreview, resolveAttachment, type AttachmentItem } from '@/lib/attachments'
import {
  buildCodePreviewDocument,
  buildMermaidPreviewDocument,
  estimateMermaidPreviewHeight
} from '@/lib/sandboxed-preview'

let mermaidInitialized = false

if (!mermaidInitialized) {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict'
  })
  mermaidInitialized = true
}

interface MarkdownContentProps {
  content: string
  attachmentItems?: AttachmentItem[]
  onOpenNote?: (title: string) => void
  className?: string
}

function isProbablyHtmlContent(content: string) {
  return /<\s*(div|span|p|img|audio|video|br|strong|em|ul|ol|li|table|h[1-6])[\s>]/i.test(content)
}

const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

function preprocessMarkdown(content: string, attachmentItems: AttachmentItem[]) {
  return content
    .replace(/!\[\[([^\n]*?)\]\]/g, (_match, rawName: string) => {
      const name = rawName.trim()
      const attachment = resolveAttachment(attachmentItems, name)
      if (!attachment) return `![[${name}]]`
      if (attachment.kind === 'image') {
        return `![${name}](${getAttachmentUrl(attachment.fullPath)})`
      }
      return `[${name}](attachment://${encodeURIComponent(name)})`
    })
    .replace(/\[\[([^\n]*?)\]\]/g, (_match, rawTitle: string) => {
      const title = rawTitle.trim()
      return `[${title}](note://${encodeURIComponent(title)})`
    })
}

function resolveAttachmentFromHref(href: string, attachmentItems: AttachmentItem[]) {
  if (href.startsWith('attachment://')) {
    return resolveAttachment(attachmentItems, decodeURIComponent(href.slice('attachment://'.length)))
  }

  if (/^attachments\//i.test(href)) {
    return resolveAttachment(attachmentItems, href)
  }

  if (href.startsWith('file:///') || href.startsWith('local-file://')) {
    return (
      attachmentItems.find((item) => getAttachmentUrl(item.fullPath) === href) ||
      attachmentItems.find((item) => decodeURI(getAttachmentUrl(item.fullPath)) === decodeURI(href)) ||
      null
    )
  }

  return null
}

function renderAttachment(attachment: AttachmentItem) {
  if (attachment.kind === 'image') {
    return (
      <img
        src={getAttachmentUrl(attachment.fullPath)}
        alt={attachment.name}
        className="my-4 max-h-[340px] max-w-full rounded-xl border border-[var(--nv-border)]"
        onClick={() => openAttachmentPreview(attachment)}
      />
    )
  }

  if (attachment.kind === 'video') {
    return (
      <video
        controls
        autoPlay
        src={getAttachmentUrl(attachment.fullPath)}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        onError={(e) => console.error('Video load error:', e.currentTarget.error)}
        className="my-4 block max-h-[420px] w-full max-w-[760px] rounded-xl border border-[var(--nv-border)] bg-black"
      />
    )
  }

  if (attachment.kind === 'audio') {
    return (
      <audio
        controls
        src={getAttachmentUrl(attachment.fullPath)}
        preload="metadata"
        className="my-4 block w-full max-w-[520px]"
        onClick={() => openAttachmentPreview(attachment)}
      />
    )
  }

  return (
    <a
      href={getAttachmentUrl(attachment.fullPath)}
      target="_blank"
      rel="noreferrer"
      className="my-3 inline-flex rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-3 py-1.5 text-sm text-[var(--nv-secondary)] underline-offset-4 hover:underline"
    >
      {attachment.name}
    </a>
  )
}

function MermaidBlock({ source }: { source: string }) {
  const [previewDocument, setPreviewDocument] = useState<string | null>(null)
  const frameHeight = useMemo(() => estimateMermaidPreviewHeight(source), [source])

  useEffect(() => {
    let active = true
    const renderId = `mermaid-${Math.random().toString(36).slice(2)}`

    void mermaid
      .render(renderId, source)
      .then(({ svg: nextSvg }) => {
        if (active) {
          setPreviewDocument(buildMermaidPreviewDocument(nextSvg))
        }
      })
      .catch(() => {
        if (active) {
          setPreviewDocument(buildCodePreviewDocument(source))
        }
      })

    return () => {
      active = false
    }
  }, [source])

  if (!previewDocument) {
    return (
      <pre className="my-4 overflow-x-auto rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4 text-sm text-[#d7d2ce]">
        <code>{source}</code>
      </pre>
    )
  }

  return (
    <iframe
      sandbox=""
      referrerPolicy="no-referrer"
      title="Mermaid preview"
      srcDoc={previewDocument}
      className="my-4 block w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)]"
      style={{ height: frameHeight }}
    />
  )
}

export function extractMarkdownPreviewText(content: string) {
  const normalized = isProbablyHtmlContent(content)
    ? content.replace(/<[^>]+>/g, ' ')
    : content
        .replace(/!\[\[([^\n]*?)\]\]/g, ' $1 ')
        .replace(/\[\[([^\n]*?)\]\]/g, ' $1 ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, ' $1 ')
        .replace(/[>*_~|#-]/g, ' ')

  return normalized.replace(/\s+/g, ' ').trim()
}

export function MarkdownContent({
  content,
  attachmentItems = [],
  onOpenNote,
  className = ''
}: MarkdownContentProps) {
  const preparedContent = useMemo(
    () => preprocessMarkdown(content, attachmentItems),
    [attachmentItems, content]
  )

  if (!content.trim()) return null

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 text-3xl font-bold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-bold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-5 text-xl font-semibold text-white">{children}</h3>,
          p: ({ children }) => <p className="mb-4 leading-7 text-inherit">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-[var(--nv-primary)] pl-4 text-[var(--nv-muted)]">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-[var(--nv-border)]">
              <table className="min-w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--nv-surface-strong)]">{children}</thead>,
          th: ({ children }) => <th className="border-b border-[var(--nv-border)] px-4 py-3 font-semibold text-[var(--nv-secondary)]">{children}</th>,
          td: ({ children }) => <td className="border-b border-[var(--nv-border)] px-4 py-3 align-top">{children}</td>,
          hr: () => <hr className="my-6 border-[var(--nv-border)]" />,
          a: ({ href = '', children }) => {
            if (href.startsWith('note://')) {
              const title = decodeURIComponent(href.slice('note://'.length))
              return (
                <button
                  type="button"
                  onClick={() => onOpenNote?.(title)}
                  className="text-[var(--nv-secondary)] underline decoration-[var(--nv-secondary)]/40 underline-offset-4 hover:text-[var(--nv-foreground)]"
                >
                  {children}
                </button>
              )
            }

            const attachment = resolveAttachmentFromHref(href, attachmentItems)
            if (attachment) {
              return renderAttachment(attachment)
            }

            if (!isSafeUrl(href)) {
              return <span>{children}</span>
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--nv-secondary)] underline decoration-[var(--nv-secondary)]/40 underline-offset-4 hover:text-[var(--nv-foreground)]"
              >
                {children}
              </a>
            )
          },
          img: ({ src = '', alt = '' }) => {
            const attachment = resolveAttachmentFromHref(src, attachmentItems)
            const resolvedSrc = attachment ? getAttachmentUrl(attachment.fullPath) : src
            return (
              <img
                src={resolvedSrc}
                alt={alt}
                className="my-4 max-h-[340px] max-w-full rounded-xl border border-[var(--nv-border)]"
                onClick={() => attachment && openAttachmentPreview(attachment)}
              />
            )
          },
          code: ({
            inline,
            className: codeClassName,
            children
          }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
            const source = String(children).replace(/\n$/, '')
            const language = codeClassName?.replace('language-', '') || ''

            if (!inline && language === 'mermaid') {
              return <MermaidBlock source={source} />
            }

            if (inline) {
              return (
                <code className="rounded bg-[var(--nv-surface-strong)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--nv-secondary)]">
                  {children}
                </code>
              )
            }

            return (
              <pre className="my-4 overflow-x-auto rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4 text-sm text-[#d7d2ce]">
                <code>{children}</code>
              </pre>
            )
          }
        }}
      >
        {preparedContent}
      </ReactMarkdown>
    </div>
  )
}
