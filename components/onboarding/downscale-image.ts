// Phone photos are often 4–12 MB; shrink before upload so the scan stays fast
// and under the API route's body limit. 1568px is plenty to read a label.

const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.85;

export interface EncodedImage {
  base64: string;
  mediaType: "image/jpeg";
}

export async function downscaleToJpeg(file: File): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that photo");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}
