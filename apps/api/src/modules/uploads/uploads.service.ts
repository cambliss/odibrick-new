import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class UploadsService {
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot = path.resolve(process.env.STORAGE_LOCAL_ROOT || './uploads');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  async saveUploadedFile(file: Express.Multer.File, folder = 'properties') {
    if (!file) {
      throw new BadRequestException('No file provided for upload.');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size ${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds maximum limit of 10 MB.`,
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type (${file.mimetype}). Accepted formats are JPEG, PNG, and WebP (up to 10 MB).`,
      );
    }

    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '') || 'properties';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const sanitizedName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const relativeKey = `${sanitizedFolder}/${Date.now()}_${randomSuffix}_${sanitizedName}${ext}`;
    
    const targetPath = path.join(this.storageRoot, relativeKey);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await fs.promises.writeFile(targetPath, file.buffer);

    return {
      storageKey: relativeKey,
      fileName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      url: `/api/storage/${relativeKey}`,
    };
  }

  resolveFilePath(storageKey: string): { fullPath: string | null; mimeType: string } {
    const sanitizedKey = storageKey.replace(/\.\./g, '');
    const fullPath = path.join(this.storageRoot, sanitizedKey);

    const ext = path.extname(sanitizedKey).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return { fullPath, mimeType };
    }

    return { fullPath: null, mimeType };
  }
}
