export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const downloadText = (name: string, text: string, mime: string): void =>
  downloadBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));

/** Растеризует SVG (с заданными width/height) в PNG. */
export function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext('2d');
      if (!g) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas недоступен'));
        return;
      }
      g.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось собрать PNG'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Браузер не смог прочитать SVG'));
    };
    img.src = url;
  });
}

/** Имя файла из произвольной строки. */
export const fileName = (name: string, fallback: string): string =>
  (name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || fallback).slice(0, 60);
