import { adminAPI } from './api/client';

export async function uploadToCloudinary(file: File): Promise<{ url: string; public_id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return adminAPI('/upload/image', {
    method: 'POST',
    body: formData,
  });
}