"""Build a self-contained Pages artifact using verified, pinned BILT2 models."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import urllib.request
import rotate_hdri

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '_site'
SOURCE_COMMIT = '888c107f91eed8b635882032377b3a39eaa8c7a0'
ASSETS = {
    'BILT_Blue_HighRes.glb': 'd2b466b52b35bbe8a1695405c94f15c62e3c68e4',
    'obsidian_front.gltf': 'cca0df89e37b6a3dee8b9b5a09e2a83379bca4c1',
    'obsidian_shared.bin': 'ca7d3bcd639a1a80c54f2cfab695c1cef630f58a',
    'HDR_Light_Studio_Free_HDRI_Design_07_down30.hdr': '26916356fbd87b0b40bd9324104989562ad2f529',
}

def main():
    SITE.mkdir(exist_ok=True)
    for name in ('index.html', 'app.js', 'styles.css', 'stickers.js'):
        shutil.copyfile(ROOT / name, SITE / name)
    shutil.copytree(ROOT / 'stickers', SITE / 'stickers', dirs_exist_ok=True)
    for name, expected in ASSETS.items():
        request = urllib.request.Request(
            f'https://raw.githubusercontent.com/keithgmcleod/BILT2/{SOURCE_COMMIT}/{name}',
            headers={'User-Agent': 'BILT2-stickers-build'},
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
        digest = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        if digest != expected:
            raise ValueError(f'Asset checksum mismatch: {name}')
        (SITE / name).write_bytes(data)
        print(f'Verified {name}: {len(data):,} bytes')

    # The source GLB selects its mixed work scene. Select its dedicated Blue
    # scene without changing any geometry, images, or binary buffer offsets.
    filename = SITE / 'BILT_Blue_HighRes.glb'
    data = bytearray(filename.read_bytes())
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length])
    assert document['scenes'][0]['name'] == 'BILT_BLUE_HIGH_RES'
    document['scene'] = 0
    encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    if len(encoded) > length:
        raise ValueError('Updated GLB metadata exceeds its original JSON chunk')
    data[20:20 + length] = encoded.ljust(length, b' ')
    filename.write_bytes(data)

    rotate_hdri.SOURCE = SITE / 'HDR_Light_Studio_Free_HDRI_Design_07_down30.hdr'
    rotate_hdri.OUTPUT = SITE / 'HDR_Light_Studio_Free_HDRI_Design_07_down30_left60.hdr'
    rotate_hdri.main()
    (SITE / '.nojekyll').touch()
    print(f'Site ready: {SITE}')

if __name__ == '__main__':
    main()
