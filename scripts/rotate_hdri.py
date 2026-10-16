#!/usr/bin/env python3
"""Generate the website's -60 degree HDR environment from its down-tilted source."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "HDR_Light_Studio_Free_HDRI_Design_07_down30.hdr"
OUTPUT = ROOT / "HDR_Light_Studio_Free_HDRI_Design_07_down30_left60.hdr"
ANGLE_DEGREES = -60


def read_header(data):
    lines = data.splitlines(keepends=True)
    header = bytearray()
    for index, line in enumerate(lines):
        header.extend(line)
        match = re.fullmatch(rb"([-+])Y\s+(\d+)\s+([-+])X\s+(\d+)\s*\r?\n?", line)
        if match:
            return bytes(header), int(match.group(2)), int(match.group(4)), match.group(3).decode()
    raise ValueError("HDR resolution line was not found")


def decode_scanline(data, offset, width):
    if width < 8 or width > 0x7FFF or data[offset:offset + 2] != b"\x02\x02":
        raise ValueError("Expected Radiance per-scanline RLE HDR data")
    encoded_width = (data[offset + 2] << 8) | data[offset + 3]
    if encoded_width != width:
        raise ValueError("HDR scanline width does not match its header")
    offset += 4
    channels = [bytearray(width) for _ in range(4)]
    for channel in channels:
        column = 0
        while column < width:
            count = data[offset]
            offset += 1
            if count > 128:
                run = count - 128
                if run == 0 or column + run > width:
                    raise ValueError("Invalid repeated HDR run")
                channel[column:column + run] = bytes([data[offset]]) * run
                offset += 1
                column += run
            else:
                if count == 0 or column + count > width:
                    raise ValueError("Invalid literal HDR run")
                channel[column:column + count] = data[offset:offset + count]
                offset += count
                column += count
    return [bytes((channels[0][x], channels[1][x], channels[2][x], channels[3][x])) for x in range(width)], offset


def encode_channel(channel):
    result = bytearray()
    index = 0
    length = len(channel)
    while index < length:
        run = 1
        while index + run < length and run < 127 and channel[index + run] == channel[index]:
            run += 1
        if run >= 4:
            result.extend((128 + run, channel[index]))
            index += run
            continue

        start = index
        index += run
        while index < length and index - start < 128:
            next_run = 1
            while index + next_run < length and next_run < 127 and channel[index + next_run] == channel[index]:
                next_run += 1
            if next_run >= 4:
                break
            index += min(next_run, 128 - (index - start))
        literal_length = index - start
        result.append(literal_length)
        result.extend(channel[start:index])
    return result


def encode_scanline(pixels):
    width = len(pixels)
    result = bytearray((2, 2, width >> 8, width & 255))
    for component in range(4):
        channel = bytes(pixel[component] for pixel in pixels)
        result.extend(encode_channel(channel))
    return result


def main():
    source_data = SOURCE.read_bytes()
    header, height, width, x_direction = read_header(source_data)
    offset = len(header)
    shift = round(ANGLE_DEGREES * width / 360)
    if x_direction == "-":
        shift = -shift
    left = -shift
    output = bytearray(header)
    for _ in range(height):
        row, offset = decode_scanline(source_data, offset, width)
        if left:
            left_mod = left % width
            row = row[left_mod:] + row[:left_mod]
        output.extend(encode_scanline(row))
    OUTPUT.write_bytes(output)
    print(f"Created {OUTPUT.name}: {width}x{height}, horizontal rotation {ANGLE_DEGREES} degrees")


if __name__ == "__main__":
    main()
