export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface AnalysisResult {
  markdown: string;
  timestamp: string;
}

export enum UploadType {
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
}
