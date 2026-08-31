/**
 * Compresses an image file on an offscreen HTML5 canvas to under 400KB
 * and stamps a high-contrast audit watermark with timestamp and GPS info.
 * @param {File|Blob} file - Raw image file from device camera
 * @param {number} maxWidth - Maximum bounding dimension (default 1280px)
 * @param {number} quality - JPEG compression factor (0.0 to 1.0, default 0.75)
 * @param {object|null} metadata - Optional GPS metadata { latitude, longitude }
 * @returns {Promise<{ blob: Blob, dataUrl: string, sizeBytes: number, width: number, height: number }>}
 */
export function compressImage(file, maxWidth = 1280, quality = 0.75, metadata = null) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('No file provided for compression'));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width >= height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to obtain 2D canvas rendering context'));
        }

        // Draw the resized image
        ctx.drawImage(img, 0, 0, width, height);

        // Watermark Banner at bottom
        const barHeight = Math.max(36, Math.round(height * 0.06));
        ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
        ctx.fillRect(0, height - barHeight, width, barHeight);

        // Watermark text
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 13px "Inter", -apple-system, sans-serif';
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        let watermarkText = `⚡ KASI PoD • ${now}`;
        if (metadata && metadata.latitude && metadata.longitude) {
          watermarkText += ` • GPS: ${metadata.latitude.toFixed(5)}, ${metadata.longitude.toFixed(5)}`;
        }
        ctx.fillText(watermarkText, 12, height - Math.round(barHeight / 2) + 5);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                dataUrl,
                sizeBytes: blob.size,
                width,
                height,
              });
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = (err) => reject(new Error('Failed to load image into canvas: ' + err));
    };

    reader.onerror = (err) => reject(new Error('Failed to read file: ' + err));
  });
}