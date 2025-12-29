import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelected: (base64: string, mimeType: string) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas to convert image to PNG
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            
            // ALWAYS convert to PNG to ensure Gemini compatibility
            // This fixes issues with AVIF, HEIC, etc. where the browser can read it but API cannot.
            const dataUrl = canvas.toDataURL('image/png');
            onImageSelected(dataUrl, 'image/png');
        }
        setIsProcessing(false);
      };
      
      img.onerror = () => {
          alert('Failed to load image. The format might be unsupported by your browser.');
          setIsProcessing(false);
      }
      
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
        alert('Error reading file.');
        setIsProcessing(false);
    }
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`w-full h-64 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 transition-colors flex flex-col items-center justify-center p-6 group ${isProcessing ? 'cursor-wait opacity-70' : 'cursor-pointer hover:bg-slate-100'}`}
      onClick={() => !isProcessing && fileInputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        disabled={isProcessing}
      />
      
      {isProcessing ? (
          <div className="flex flex-col items-center animate-pulse">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4">
               <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
                Optimizing image...
            </h3>
            <p className="text-slate-500 text-sm">Preparing for Gemini...</p>
          </div>
      ) : (
        <>
            <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
                Click to upload or drag and drop
            </h3>
            <p className="text-slate-500 text-sm text-center max-w-xs">
                Supports all standard image formats
            </p>
            <div className="mt-4 flex items-center text-xs text-slate-400">
                <ImageIcon className="w-3 h-3 mr-1" />
                <span>Auto-converted for best results</span>
            </div>
        </>
      )}
    </div>
  );
};

export default ImageUploader;