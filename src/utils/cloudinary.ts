import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadImage = async (filePath: string): Promise<string> => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: "homestay",
    transformation: [{ width: 1200, height: 800, crop: "fill", quality: "auto" }],
  });
  return result.secure_url;
};

export const deleteImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};

export const getPublicIdFromUrl = (url: string): string => {
  const parts = url.split("/");
  const filename = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  return `${folder}/${filename.split(".")[0]}`;
};

export default cloudinary;
