"""Generate the requested local Base64 fonts from installed Windows fonts."""
from pathlib import Path
import base64
import shutil
from fontTools.ttLib import TTCollection, TTFont

target = Path(__file__).resolve().parent.parent / 'vendor' / 'fonts'
source = Path('C:/Windows/Fonts')
for filename, weight, postscript in [('meiryo.ttc', 'Regular', 'MeiryoUI'), ('meiryob.ttc', 'Bold', 'MeiryoUI-Bold')]:
    collection = TTCollection(source / filename)
    try:
        font = next(font for font in collection.fonts if font['name'].getDebugName(6) == postscript)
        if font['OS/2'].fsType & 0x0302:
            raise ValueError('Font embedding/subsetting is restricted')
        font.save(target / f'MeiryoUI-{weight}.ttf')
    finally:
        collection.close()
for filename, weight in [('times.ttf', 'Regular'), ('timesbd.ttf', 'Bold')]:
    with TTFont(source / filename) as font:
        if font['OS/2'].fsType & 0x0302:
            raise ValueError('Font embedding/subsetting is restricted')
    shutil.copyfile(source / filename, target / f'TimesNewRoman-{weight}.ttf')
for family in ['MeiryoUI', 'TimesNewRoman']:
    for weight in ['Regular', 'Bold']:
        binary = target / f'{family}-{weight}.ttf'
        encoded = base64.b64encode(binary.read_bytes()).decode('ascii')
        (target / f'{family}-{weight}.base64.js').write_text(
            '// Microsoft Windows font; see Windows-Fonts-NOTICE.md.\nexport default "' + encoded + '";\n', encoding='utf-8')
        with TTFont(binary) as font:
            print(font['name'].getDebugName(6), binary.stat().st_size, 'bytes', 'fsType:', font['OS/2'].fsType)
