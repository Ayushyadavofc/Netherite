import DOMPurify from 'dompurify'

const SANDBOXED_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: https: local-file:",
  "media-src data: https: local-file:",
  "style-src 'unsafe-inline'",
  "script-src 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ')

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const sanitizeSandboxMarkup = (content: string) =>
  DOMPurify.sanitize(content, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })

const createSandboxedDocument = (body: string, title: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${SANDBOXED_PREVIEW_CSP}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }

      html, body {
        margin: 0;
        background: #111111;
        color: #d7d2ce;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: 16px;
      }

      .preview-shell {
        overflow: auto;
        border-radius: 12px;
      }

      svg {
        display: block;
        max-width: 100%;
        height: auto;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }
    </style>
  </head>
  <body>
    <div class="preview-shell">${body}</div>
  </body>
</html>`

export const buildMermaidPreviewDocument = (svg: string) =>
  createSandboxedDocument(sanitizeSandboxMarkup(svg), 'Mermaid preview')

export const buildCodePreviewDocument = (source: string) =>
  createSandboxedDocument(`<pre>${escapeHtml(source)}</pre>`, 'Code preview')

export const estimateMermaidPreviewHeight = (source: string) =>
  Math.max(200, Math.min(640, source.split('\n').length * 28 + 140))
