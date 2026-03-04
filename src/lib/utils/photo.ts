import imageCompression from "browser-image-compression";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_PHOTOS = 5;
export const BUCKET_NAME = "order-photos";
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export async function compressImage(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    fileType: "image/webp",
    useWebWorker: true,
  });
  return compressed;
}

export async function uploadPhoto(
  supabase: SupabaseClient,
  orderId: string,
  file: File
): Promise<string> {
  const compressed = await compressImage(file);
  const id = crypto.randomUUID();
  const path = `${orderId}/${id}.webp`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, compressed, { contentType: "image/webp" });

  if (error) throw error;
  return path;
}

export function getPhotoUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
}

export async function deletePhotos(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET_NAME).remove(paths);
  if (error) throw error;
}
