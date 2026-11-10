# shared style: eyedecide + sloverb

eyedecide and sloverb will sit on the same site, so they share one base. The source of truth is `~/sloverb/src/styles.css` (branch `remake`). If one changes, change the other.

## shared, keep identical

| token | value |
| --- | --- |
| `--bg` | `#000` |
| `--card` | `#111113` |
| `--raised` | `rgb(28 28 30 / 0.78)` |
| `--line` | `rgb(255 255 255 / 0.1)` |
| `--text` | `#f5f5f7` |
| `--mute` | `#8e8e93` |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

- font: `500 17px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Roboto", system-ui, sans-serif`, `letter-spacing: -0.01em`, antialiased, no tap highlight
- `.head`: 600, `line-height: 1.1`, `letter-spacing: -0.035em`, lowercase
- `.wordmark`: 600, `clamp(56px, 16vw, 92px)`, `line-height: 1`, `letter-spacing: -0.05em`
- `.btn`: white pill, black text, 600, lowercase, `opacity .86` on hover, `scale(.97)` on press
- `.link`: grey, 15px, lowercase, pill, at least 44px tall, white on hover or press
- hover styles only inside `@media (hover: hover)` so they don't stick after a tap on phones
- meta: `theme-color #000`, `color-scheme dark`, `viewport-fit=cover`, `format-detection telephone=no`, favicon is a black rounded square with a white mark

## each keeps its own

- colour. sloverb uses blue, purple, pink as light (wordmark, aura, borders). eyedecide stays white, its only colour is heat inside a game plus green and red for right and wrong. the eyedecide wordmark is not gradient
- `--r`: sloverb `28px`, eyedecide `clamp(22px, 2.6vw, 36px)` because its cards fill half a screen
- layout. eyedecide is centred on `--eye`, sloverb is one column
