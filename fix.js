const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/renderer/src/components/notes/ObsidianMarkdownEditor.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Find the line index of `const completionSource = useMemo(`
const startIndex = lines.findIndex(l => l.includes('    const completionSource = useMemo('));
// Find the exact line index of the end of the duplicate block
const endIndex = lines.findIndex(l => l.includes('    }, [compact, completionSource, hideScrollbar, interactionHandlers, minHeight, placeholderText, previewDecorationsField, syncWikilinkMenu, wikilinkInteractionHandlers])'));

if (startIndex !== -1 && endIndex !== -1) {
    const before = lines.slice(0, startIndex);
    const after = lines.slice(endIndex + 1);

    const injected = `    const completionSource = useMemo(
      () => buildCompletionSource(() => noteTitlesRef.current, () => attachmentItemsRef.current),
      []
    )

    useEffect(() => {
      if (!hostRef.current) return

      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab
          ]),
          markdown(),
          headingFoldService,
          foldGutter({
            markerDOM(open) {
              const marker = document.createElement('span')
              marker.className = \`cm-fold-marker \${open ? 'is-open' : 'is-closed'}\`
              marker.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m9 18 6-6-6-6"/></svg>\`
              return marker
            }
          }),
          placeholder(placeholderText),
          autocompletion({ override: [completionSource] }),
          previewDecorationsField,
          headingDecorationsField,
          interactionHandlers,
          wikilinkInteractionHandlers,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextValue = update.state.doc.toString()
              onChangeRef.current(nextValue)

              const selection = update.state.selection.main
              if (selection.empty) {
                const textBeforeCursor = nextValue.slice(Math.max(0, selection.head - 120), selection.head)
                if (getActiveWikilinkQuery(textBeforeCursor)) {
                  window.requestAnimationFrame(() => startCompletion(update.view))
                }
              }
            }

            if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
              syncWikilinkMenu(update.view)
              const activeLineIndex = update.state.doc.lineAt(update.state.selection.main.head).number - 1
              onActiveLineChangeRef.current?.(activeLineIndex)
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'var(--nv-bg)',
              color: 'color-mix(in srgb, var(--nv-foreground) 88%, var(--nv-bg) 12%)',
              fontSize: '14px',
              maxWidth: compact ? 'none' : '960px',
              margin: compact ? '0' : '0 auto',
              paddingLeft: compact ? '0' : '20px'
            },
            '.cm-scroller': {
              overflow: 'auto',
              height: '100%',
              fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
              scrollbarWidth: hideScrollbar ? 'none' : 'auto'
            },
            '.cm-content': {
              minHeight,
              padding: compact ? '12px 15px 20px 4px' : '22px 30px 60px 4px',
              lineHeight: '1.7'
            },
            '.cm-focused': {
              outline: 'none'
            },
            '.cm-cursor': {
              borderLeftColor: 'var(--nv-secondary)'
            },
            '.cm-activeLine': {
              backgroundColor: 'var(--nv-secondary-soft)'
            },
            '.cm-selectionBackground, ::selection': {
              backgroundColor: 'var(--nv-primary-soft-strong) !important'
            },
            '.cm-gutters': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'transparent',
              width: compact ? '18px' : '22px',
              minWidth: compact ? '18px' : '22px',
              overflow: 'visible',
              paddingRight: compact ? '2px' : '4px',
              pointerEvents: 'auto'
            },
            '.cm-gutterElement': {
              width: compact ? '18px' : '22px',
              minWidth: compact ? '18px' : '22px',
              padding: '0',
              overflow: 'visible',
              position: 'relative',
              pointerEvents: 'auto'
            },
            '.cm-foldGutter .cm-gutterElement': {
              cursor: 'pointer'
            },
            '.cm-fold-marker': {
              position: 'absolute',
              right: '2px',
              top: '50%',
              display: 'inline-flex',
              width: '16px',
              height: '18px',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--nv-secondary)',
              opacity: '0',
              transform: 'translateY(-50%)',
              transition: 'color 0.2s ease, opacity 0.2s ease, transform 0.2s ease'
            },
            '.cm-fold-marker.is-open': {
              transform: 'translateY(-50%) rotate(90deg)'
            },
            '.cm-fold-marker.is-closed': {
              transform: 'translateY(-50%) rotate(0deg)'
            },
            '.cm-foldGutter .cm-gutterElement:hover .cm-fold-marker': {
              color: 'var(--nv-primary)',
              opacity: '1'
            },
            '.cm-foldPlaceholder': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--nv-muted)',
              margin: '0 4px',
              padding: '0',
              cursor: 'pointer'
            },
            '.cm-foldPlaceholder:hover': {
              color: 'var(--nv-foreground)'
            },
            '.cm-tooltip': {
              backgroundColor: 'var(--nv-surface)',
              border: '1px solid var(--nv-border)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            },
            '.cm-mermaid-widget': {
              margin: '16px 0',
              padding: '16px',
              borderRadius: '14px',
              border: '1px solid var(--nv-border)',
              backgroundColor: 'var(--nv-surface)'
            },
            '.cm-mermaid-graph': {
              overflow: 'auto'
            },
            '.cm-tooltip-autocomplete': {
              backgroundColor: 'var(--nv-surface-strong)',
              border: '1px solid var(--nv-border)',
              color: 'var(--nv-foreground)'
            },
            '.cm-tooltip-autocomplete ul li[aria-selected]': {
              backgroundColor: 'var(--nv-primary-soft)',
              color: 'var(--nv-primary)'
            },
            '.cm-scroller::-webkit-scrollbar': {
              display: hideScrollbar ? 'none' : 'block'
            },
            '.cm-formatting-header': {
              color: 'var(--nv-subtle)'
            },
            '.cm-heading-line .cm-formatting-header': {
              display: 'inline-block',
              width: '0',
              opacity: '0',
              overflow: 'hidden',
              color: 'transparent',
              transition: 'opacity 0.15s ease'
            },
            '.cm-activeLine .cm-formatting-header': {
              width: 'auto',
              opacity: '1',
              color: 'var(--nv-subtle)'
            },
            '.cm-line': {
              padding: '0'
            },
            '.cm-heading-line': {
              color: 'color-mix(in srgb, var(--nv-foreground) 92%, var(--nv-bg) 8%)',
              fontFamily: 'Inter, sans-serif',
              fontWeight: '700'
            },
            '.cm-heading-1': {
              fontSize: '2.25rem',
              lineHeight: '1.2',
              fontWeight: '800',
              marginTop: '0.45rem',
              marginBottom: '0.2rem'
            },
            '.cm-heading-2': {
              fontSize: '1.75rem',
              lineHeight: '1.28',
              fontWeight: '750',
              marginTop: '0.4rem',
              marginBottom: '0.15rem'
            },
            '.cm-heading-3': {
              fontSize: '1.35rem',
              lineHeight: '1.35',
              fontWeight: '700',
              marginTop: '0.35rem'
            }
          })
        ]
      })

      const view = new EditorView({
        state,
        parent: hostRef.current
      })

      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [compact, completionSource, hideScrollbar, interactionHandlers, minHeight, placeholderText, previewDecorationsField, syncWikilinkMenu, wikilinkInteractionHandlers])`.split('\n');

    const result = before.concat(injected).concat(after);
    fs.writeFileSync(file, result.join('\n'));
    console.log("Successfully fixed " + file);
} else {
    console.error("Could not find start or end index:", startIndex, endIndex);
}
