const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32Bytes(value: number) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value);
  return bytes;
}

function createChunk(type: string, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  return concatBytes([uint32Bytes(data.length), typeBytes, data, uint32Bytes(crc32(crcInput))]);
}

function deflateStored(input: Uint8Array) {
  const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  let offset = 0;

  while (offset < input.length) {
    const remaining = input.length - offset;
    const length = Math.min(remaining, 0xffff);
    const isLast = offset + length === input.length;
    const header = new Uint8Array(5);
    header[0] = isLast ? 0x01 : 0x00;
    header[1] = length & 0xff;
    header[2] = (length >>> 8) & 0xff;
    header[3] = ~length & 0xff;
    header[4] = (~length >>> 8) & 0xff;
    chunks.push(header, input.subarray(offset, offset + length));
    offset += length;
  }

  return concatBytes(chunks);
}

function encodePng(width: number, height: number, rgb: Uint8Array) {
  const expectedLength = width * height * 3;
  if (rgb.length !== expectedLength) {
    throw new Error('RGB 像素数据长度不匹配');
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const rowLength = width * 3 + 1;
  const raw = new Uint8Array(rowLength * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * rowLength] = 0;
    raw.set(rgb.subarray(row * width * 3, (row + 1) * width * 3), row * rowLength + 1);
  }

  const png = concatBytes([
    PNG_SIGNATURE,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', deflateStored(raw)),
    createChunk('IEND')
  ]);

  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < png.length; offset += chunkSize) {
    binary += String.fromCharCode(...png.subarray(offset, offset + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export function base64FromDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export function rawRgbToImageUrl(
  imageBase64: string,
  width: number,
  height: number
): Promise<string> {
  const rgb = Uint8Array.from(atob(imageBase64), char => char.charCodeAt(0));
  return Promise.resolve(encodePng(width, height, rgb));
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
