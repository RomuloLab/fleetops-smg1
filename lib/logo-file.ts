export function inspectLogo(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  let width = 0, height = 0, mime = "", extension = "";
  if (bytes.length >= 45 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value) && ascii(12,4) === "IHDR" && ascii(bytes.length-8,4) === "IEND") {
    width = view.getUint32(16); height = view.getUint32(20); mime = "image/png"; extension = "png";
  } else if (bytes.length >= 30 && ascii(0,4) === "RIFF" && ascii(8,4) === "WEBP" && view.getUint32(4,true) + 8 === bytes.length) {
    const kind = ascii(12,4);
    if (kind === "VP8X") { width = 1 + bytes[24] + (bytes[25]<<8) + (bytes[26]<<16); height = 1 + bytes[27] + (bytes[28]<<8) + (bytes[29]<<16); }
    else if (kind === "VP8L" && bytes[20] === 0x2f) { width = 1 + bytes[21] + ((bytes[22]&63)<<8); height = 1 + (bytes[22]>>6) + (bytes[23]<<2) + ((bytes[24]&15)<<10); }
    else if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) { width = view.getUint16(26,true)&0x3fff; height = view.getUint16(28,true)&0x3fff; }
    mime = "image/webp"; extension = "webp";
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++]; if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset); if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) { height = view.getUint16(offset+3); width = view.getUint16(offset+5); break; }
      offset += length;
    }
    mime = "image/jpeg"; extension = "jpg";
  }
  if (!width || !height || width > 8000 || height > 8000 || width * height > 24000000) return null;
  return { width, height, mime, extension };
}
