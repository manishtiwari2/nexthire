export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

export interface IStorageProvider {
  uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadResult>;
  deleteFile(fileKey: string): Promise<boolean>;
  getFileUrl(fileKey: string): string;
}
