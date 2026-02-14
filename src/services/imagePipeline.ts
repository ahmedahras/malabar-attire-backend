import sharp from "sharp";

type ImagePipelineResult = {
  buffer: Buffer;
  contentType: string;
};

export const processProductImage = async (
  inputBuffer: Buffer
): Promise<ImagePipelineResult> => {
  const buffer = await sharp(inputBuffer)
    .resize({ width: 1080, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return { buffer, contentType: "image/webp" };
};
