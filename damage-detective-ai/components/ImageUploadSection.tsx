import React, { useRef, useState } from 'react';
import { UploadedImage, UploadType } from '../types';
import { UploadCloud, X, Image as ImageIcon, Plus } from 'lucide-react';

interface ImageUploadSectionProps {
  type: UploadType;
  images: UploadedImage[];
  setImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
}

export const ImageUploadSection: React.FC<ImageUploadSectionProps> = ({ type, images, setImages }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    const newImages: UploadedImage[] = files
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const isBefore = type === UploadType.BEFORE;
  const title = isBefore ? "Before Condition" : "After Condition";
  const subTitle = isBefore ? "Upload photos taken prior to rental" : "Upload photos taken after return";
  const borderColor = isDragging ? (isBefore ? 'border-blue-500 bg-blue-50' : 'border-rose-500 bg-rose-50') : 'border-slate-300 hover:border-slate-400 bg-white';
  const iconColor = isBefore ? 'text-blue-500' : 'text-rose-500';

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className={`text-xl font-bold ${isBefore ? 'text-blue-700' : 'text-rose-700'} flex items-center gap-2`}>
          <ImageIcon className="w-5 h-5" />
          {title}
        </h2>
        <p className="text-slate-500 text-sm">{subTitle}</p>
      </div>

      <div
        className={`flex-1 border-2 border-dashed rounded-xl transition-all duration-200 p-6 flex flex-col items-center justify-center cursor-pointer min-h-[200px] ${borderColor}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="image/*"
          className="hidden"
        />

        {images.length === 0 ? (
          <div className="text-center">
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isBefore ? 'bg-blue-100' : 'bg-rose-100'}`}>
              <UploadCloud className={`w-6 h-6 ${iconColor}`} />
            </div>
            <p className="text-slate-700 font-medium">Click or drag images here</p>
            <p className="text-slate-400 text-xs mt-1">Supports JPG, PNG, WEBP</p>
          </div>
        ) : (
          <div className="w-full h-full">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full" onClick={(e) => e.stopPropagation()}>
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
                  <img src={img.previewUrl} alt="preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 bg-white/90 p-1 rounded-full text-slate-700 hover:text-red-600 hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div
                onClick={triggerFileInput}
                className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${isBefore ? 'border-blue-200 hover:bg-blue-50 text-blue-400' : 'border-rose-200 hover:bg-rose-50 text-rose-400'}`}
              >
                <Plus className="w-8 h-8" />
                <span className="text-xs font-medium mt-1">Add More</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
