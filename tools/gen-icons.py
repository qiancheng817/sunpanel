# -*- coding: utf-8 -*-
"""从用户提供的 S logo (logo-src.jpg) 生成全套启动图标 + PWA 图标。

设计：青色底 (#48B8C0) + 白色 S logo（比原白底在桌面上更醒目）。
产出：
  assets/android-res/mipmap-{mdpi..xxxhdpi}/ic_launcher.png          传统图标（48dp 基准）
  assets/android-res/mipmap-{...}/ic_launcher_foreground.png         自适应前景层（108dp 基准，S 缩到安全区）
  assets/android-res/mipmap-anydpi-v26/ic_launcher{,_round}.xml      自适应图标定义
  assets/android-res/values/ic_launcher_background.xml               背景色
  assets/icon-{192,512}.png                                          PWA / 网页版用
"""
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'assets', 'logo-src.jpg')
RES = os.path.join(BASE, 'assets', 'android-res')

TEAL = (72, 184, 192, 255)        # 用户 logo 主色
TEAL_DARK = (58, 166, 174, 255)   # 背景色（略深一点更沉稳）

DENSITIES = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}


def extract_logo_alpha(target=1024):
    """把 JPG 里的青色 S 抽成高分辨率 alpha 蒙版（0~255）。"""
    im = Image.open(SRC).convert('RGB')
    # 裁掉白边
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not (r > 235 and g > 235 and b > 235):
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    im = im.crop((minx, miny, maxx + 1, maxy + 1))
    # 按"青色度"提取：S 是青色(r 远小于 g/b)，白底 r=g=b → 越青越不透明
    px = im.load()
    w, h = im.size
    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            t = min(g, b) - r          # 白底≈0，青色≈112
            ap[x, y] = max(0, min(255, int((t - 15) * 255 // 85)))
    # 放大到统一高分辨率
    side = max(alpha.size)
    canvas = Image.new('L', (side, side), 0)
    canvas.paste(alpha, ((side - alpha.size[0]) // 2, (side - alpha.size[1]) // 2))
    return canvas.resize((target, target), Image.LANCZOS)


LOGO = extract_logo_alpha()


def compose(size, logo_ratio, bg, fg):
    """生成 size×size 图标：bg 背景 + 以 logo_ratio 比例居中绘制白色 logo。"""
    img = Image.new('RGBA', (size, size), bg)
    logo_size = int(size * logo_ratio)
    logo = Image.new('RGBA', (logo_size, logo_size), fg)
    mask = LOGO.resize((logo_size, logo_size), Image.LANCZOS)
    img.paste(logo, ((size - logo_size) // 2, (size - logo_size) // 2), mask)
    return img


def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert('RGB').save(path, 'PNG', optimize=True)
    return os.path.getsize(path)


def save_rgba(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    return os.path.getsize(path)


ADAPTIVE_XML = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''

BG_XML = '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#3AA6AE</color>
</resources>
'''

# 传统启动图标：48dp 基准
for d, k in DENSITIES.items():
    n = save_png(compose(int(48 * k), 0.78, TEAL, (255, 255, 255, 255)),
                 os.path.join(RES, 'mipmap-' + d, 'ic_launcher.png'))
    print('mipmap-%-7s ic_launcher %3dpx %5dB' % (d, int(48 * k), n))

# 自适应前景：108dp 基准，logo 占 56%（安全区约为中心 66 直径圆）
for d, k in DENSITIES.items():
    n = save_rgba(compose(int(108 * k), 0.56, (0, 0, 0, 0), (255, 255, 255, 255)),
                  os.path.join(RES, 'mipmap-' + d, 'ic_launcher_foreground.png'))
    print('mipmap-%-7s foreground %3dpx %5dB' % (d, int(108 * k), n))

# 自适应图标定义 + 背景色
os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    with open(os.path.join(RES, 'mipmap-anydpi-v26', name), 'w', encoding='utf-8') as f:
        f.write(ADAPTIVE_XML)
os.makedirs(os.path.join(RES, 'values'), exist_ok=True)
with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8') as f:
    f.write(BG_XML)
print('adaptive xml + color written')

# PWA / 网页版图标（青色底白 logo，方形）
for size in (192, 512):
    n = save_png(compose(size, 0.72, TEAL, (255, 255, 255, 255)),
                 os.path.join(BASE, 'assets', 'icon-%d.png' % size))
    print('PWA icon-%d %dB' % (size, n))

# 预览图
preview = Image.new('RGBA', (480, 260), (245, 245, 247, 255))
preview.paste(compose(220, 0.78, TEAL, (255, 255, 255, 255)), (15, 20))
circle = Image.new('RGBA', (220, 220), (0, 0, 0, 0))
ImageDraw.Draw(circle).ellipse((0, 0, 219, 219), fill=TEAL_DARK)
lg = compose(220, 0.62, (0, 0, 0, 0), (255, 255, 255, 255))
circle.paste(lg, (0, 0), lg)
preview.paste(circle, (255, 20), circle)
preview.convert('RGB').save(os.path.join(BASE, 'assets', 'icon-preview.png'), 'PNG')
print('preview saved')
