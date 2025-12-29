import React from 'react';

export interface ProcessedImage {
  id: string;
  data: string; // Base64 string
  mimeType: string;
  timestamp: number;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface PresetAction {
  id: string;
  label: string;
  prompt: string;
  icon: React.ReactNode;
  description: string;
  isSpecial?: boolean; // For handling aspect ratio logic
}
