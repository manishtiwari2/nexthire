import fs from 'fs';
import path from 'path';
import { IStorageProvider, UploadResult } from './IStorageProvider';

export class LocalStorageProvider implements IStorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor(uploadDir?: string, baseUrl?: string) {
    this.uploadDir = uploadDir || path.join(process.cwd(), 'uploads');
    this.baseUrl = baseUrl || 'http://localhost:5000/uploads';

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(fileBuffer: Buffer, fileName: string, _mimeType: string): Promise<UploadResult> {
    const ext = path.extname(fileName) || '.bin';
    const key = `file-${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
    const filePath = path.join(this.uploadDir, key);

    await fs.promises.writeFile(filePath, fileBuffer);

    return {
      url: `${this.baseUrl}/${key}`,
      key,
      size: fileBuffer.length
    };
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, fileKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  getFileUrl(fileKey: string): string {
    return `${this.baseUrl}/${fileKey}`;
  }
}
