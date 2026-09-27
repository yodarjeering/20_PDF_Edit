# Embedded Japanese fonts

Six families, each in Regular and Bold. All originals are unmodified and
redistributed under SIL Open Font License 1.1 with their copyright notices.

| Family | Official source | License file |
| --- | --- | --- |
| Noto Sans JP | https://github.com/notofonts/noto-cjk/tree/main/Sans/SubsetOTF/JP | LICENSE.txt |
| Noto Serif JP | https://github.com/notofonts/noto-cjk/tree/main/Serif/SubsetOTF/JP | NotoSerifJP-LICENSE.txt |
| M PLUS Rounded 1c | https://github.com/google/fonts/tree/main/ofl/mplusrounded1c | MPLUSRounded1c-LICENSE.txt |
| BIZ UDPGothic | https://github.com/google/fonts/tree/main/ofl/bizudpgothic | BIZUDPGothic-LICENSE.txt |
| BIZ UDPMincho | https://github.com/google/fonts/tree/main/ofl/bizudpmincho | BIZUDPMincho-LICENSE.txt |
| Zen Kaku Gothic New | https://github.com/google/fonts/tree/main/ofl/zenkakugothicnew | ZenKakuGothicNew-LICENSE.txt |

Noto Sans JP downloaded 2026-09-26; additional fonts downloaded 2026-09-27.
M PLUS Rounded 1c's copyright and OFL declaration are in the original font's
name table; its bundled license reproduces that copyright and the OFL 1.1 text.

Run `node scripts/embed-fonts.mjs` to regenerate all `.base64.js` files from
the original OTF/TTF binaries. The catalog in `js/fonts.js` controls selection.
Both browser rendering and PDF export decode the same embedded bytes. Each
font/weight is loaded only on first use. Original OTF/TTF files are not fetched
at runtime, and no external font requests are made. Export embeds only glyphs
used by each font/weight. The base64 module and its license are required for
distribution; original binaries are retained for reproducible generation.
