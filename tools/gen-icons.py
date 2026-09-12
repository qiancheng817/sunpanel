import math
import os
import struct
import zlib

# 太阳 + 光芒，深色底
BG = (26, 27, 30)
FG = (245, 168, 40)
SS = 3  # 超采样


def sun_alpha(dx, dy):
    r = math.hypot(dx, dy)
    if r < 0.150:
        return 1.0
    if r < 0.205:
        return 0.0
    if r < 0.255:
        return 1.0
    if r < 0.400:
        a = math.atan2(dy, dx)
        seg = math.pi / 4
        k = abs((a % seg) - seg / 2)
        if k < 0.115:
            return 1.0
    return 0.0


def gen(size, path):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            acc = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = (x + (sx + 0.5) / SS) / size - 0.5
                    py = (y + (sy + 0.5) / SS) / size - 0.5
                    acc += sun_alpha(px, py)
            a = acc / (SS * SS)
            raw += bytes(int(BG[i] + (FG[i] - BG[i]) * a) for i in range(3))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, s in sizes.items():
    folder = os.path.join(base, 'assets', 'mipmap-' + d)
    os.makedirs(folder, exist_ok=True)
    n = gen(s, os.path.join(folder, 'ic_launcher.png'))
    print('mipmap-%s %dx%d %d bytes' % (d, s, s, n))
