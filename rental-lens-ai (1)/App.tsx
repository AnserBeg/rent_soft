import React, { useState } from 'react';
import { 
  Wand2, 
  Sparkles, 
  Eraser, 
  Download, 
  ChevronRight, 
  Home, 
  Layout, 
  RefreshCw,
  Zap,
  Undo2,
  Upload,
  Crop,
  Ratio
} from 'lucide-react';
import ImageUploader from './components/ImageUploader';
import Button from './components/Button';
import { editImageWithGemini } from './services/geminiService';
import { ProcessedImage, ProcessingStatus, PresetAction } from './types';

const PRESETS: PresetAction[] = [
  {
    id: "thumbnail-26-27",
    label: "Smart Thumbnail (26:27)",
    prompt: "The image has been placed on a canvas with a 26:27 aspect ratio. Isolate the main subject completely and place it on a clean, pure white background. Remove all original background elements and distractions. Ensure the subject is well-lit, sharp, and professional.",
    icon: <Ratio className="w-4 h-4" />,
    description: "Object on white background (26:27)",
    isSpecial: true
  },
  {
    id: "enhance",
    label: "Enhance Listing",
    prompt: "Enhance this image to look like a high-end architectural photography real estate listing. Improve lighting, vibrancy, and sharpness. Make it look spacious and inviting.",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Perfect for main thumbnails"
  },
  {
    id: "remove-bg",
    label: "Remove Background",
    prompt: "Remove the background from the main subject and replace it with a transparent background.",
    icon: <Eraser className="w-4 h-4" />,
    description: "Isolate furniture or exterior"
  },
  {
    id: "declutter",
    label: "Declutter Room",
    prompt: "Remove small clutter, personal items, and mess from the room while keeping the furniture and layout intact. Make it look staged.",
    icon: <Layout className="w-4 h-4" />,
    description: "Clean up messy rentals"
  },
  {
    id: "twilight",
    label: "Twilight Mode",
    prompt: "Transform this exterior shot into a beautiful twilight evening photography shot with warm interior lights glowing.",
    icon: <Zap className="w-4 h-4" />,
    description: "Luxury evening aesthetic"
  }
];

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<ProcessedImage | null>(null);
  const [generatedImage, setGeneratedImage] = useState<ProcessedImage | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImageSelect = (base64: string, mimeType: string) => {
    setOriginalImage({
      id: crypto.randomUUID(),
      data: base64,
      mimeType,
      timestamp: Date.now()
    });
    setGeneratedImage(null);
    setPrompt("");
    setErrorMessage(null);
    setStatus(ProcessingStatus.IDLE);
  };

  /**
   * Resizes/Pads the image to a 26:27 aspect ratio.
   * Instead of cropping (losing data), it fits the image and adds whitespace.
   * The AI is then asked to fill that whitespace.
   */
  const prepareImageForRatio = async (base64Data: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const targetRatio = 26 / 27;
        const currentRatio = img.width / img.height;

        let canvasWidth, canvasHeight;

        // We want high resolution, so base it on the largest dimension of the source
        // but enforce the ratio.
        if (currentRatio > targetRatio) {
          // Image is wider than target. Width is the limiting factor.
          canvasWidth = img.width;
          canvasHeight = img.width / targetRatio;
        } else {
          // Image is taller than target. Height is the limiting factor.
          canvasHeight = img.height;
          canvasWidth = img.height * targetRatio;
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Fill with white (or a neutral color) for the AI to overwrite
        ctx.fillStyle = '#FFFFFF'; 
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Center the image
        const x = (canvasWidth - img.width) / 2;
        const y = (canvasHeight - img.height) / 2;
        
        ctx.drawImage(img, x, y);

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = base64Data;
    });
  };

  const handleGenerate = async (preset?: PresetAction) => {
    const activePrompt = preset?.prompt || prompt;
    if (!originalImage || !activePrompt) return;

    setStatus(ProcessingStatus.PROCESSING);
    setErrorMessage(null);

    try {
      // Determine source image. If we are editing a generated image, use that.
      // EXCEPT if we are applying the 26:27 preset, we always go back to original
      // (or current state) but apply the canvas resize first.
      let sourceData = generatedImage ? generatedImage.data : originalImage.data;
      let mimeType = generatedImage ? generatedImage.mimeType : originalImage.mimeType;

      // Special handling for 26:27 ratio preset
      if (preset?.id === 'thumbnail-26-27') {
         sourceData = await prepareImageForRatio(sourceData);
         // The prepare function returns PNG
         mimeType = 'image/png';
      }

      const resultBase64 = await editImageWithGemini(sourceData, mimeType, activePrompt);
      
      setGeneratedImage({
        id: crypto.randomUUID(),
        data: resultBase64,
        mimeType: 'image/png', // Gemini typically returns PNG for edits
        timestamp: Date.now()
      });
      setStatus(ProcessingStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      setErrorMessage(err.message || "Failed to process image. Please try again.");
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage.data;
    link.download = `rental-lens-${generatedImage.timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRevert = () => {
    setGeneratedImage(null);
    setStatus(ProcessingStatus.IDLE);
  };

  const handleUseAsSource = () => {
    if (generatedImage) {
        setOriginalImage(generatedImage);
        setGeneratedImage(null);
        setPrompt("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Home className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Rental Lens AI</h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                Gemini 2.5 Flash Image
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro / Empty State */}
        {!originalImage && (
          <div className="max-w-2xl mx-auto mt-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Make your property stand out.
            </h2>
            <p className="text-lg text-slate-600 mb-8">
              Upload photos of your rental property to instantly enhance lighting, remove clutter, or swap backgrounds using advanced AI.
            </p>
            <ImageUploader onImageSelected={handleImageSelect} />
            
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
               <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                  <Sparkles className="w-8 h-8 text-indigo-500 mb-3 mx-auto" />
                  <h3 className="font-semibold text-slate-900">Auto Enhance</h3>
                  <p className="text-sm text-slate-500 mt-1">Perfect lighting and color for thumbnails.</p>
               </div>
               <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                  <Ratio className="w-8 h-8 text-teal-500 mb-3 mx-auto" />
                  <h3 className="font-semibold text-slate-900">Smart Ratio</h3>
                  <p className="text-sm text-slate-500 mt-1">Auto-fit and extend to 26:27 ratio.</p>
               </div>
               <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                  <Wand2 className="w-8 h-8 text-amber-500 mb-3 mx-auto" />
                  <h3 className="font-semibold text-slate-900">Magic Edits</h3>
                  <p className="text-sm text-slate-500 mt-1">Use text to change anything in the photo.</p>
               </div>
            </div>
          </div>
        )}

        {/* Editor Interface */}
        {originalImage && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            
            {/* Left Column: Image Canvas */}
            <div className="lg:col-span-8 flex flex-col gap-4">
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[500px] flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                  
                  {/* Status Overlay */}
                  {status === ProcessingStatus.PROCESSING && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                       <div className="relative">
                         <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                         <Wand2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-indigo-600 w-6 h-6 animate-pulse" />
                       </div>
                       <p className="mt-4 text-slate-600 font-medium animate-pulse">Enhancing & Reframing...</p>
                    </div>
                  )}

                  {/* Main Image Display */}
                  <img 
                    src={generatedImage ? generatedImage.data : originalImage.data} 
                    alt="Rental Property" 
                    className="max-w-full max-h-[70vh] object-contain transition-all duration-300"
                  />
                  
                  {/* Compare / Revert Button (Only if generated) */}
                  {generatedImage && status !== ProcessingStatus.PROCESSING && (
                     <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                          onClick={handleRevert}
                          className="bg-black/50 hover:bg-black/70 text-white px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-md transition-colors flex items-center"
                        >
                          <Undo2 className="w-4 h-4 mr-1.5" />
                          Revert to Original
                        </button>
                     </div>
                  )}
                  
                  {/* Badge */}
                  <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">
                     {generatedImage ? 'Enhanced with Gemini' : 'Original Image'}
                  </div>
               </div>
               
               {/* New Upload Button */}
               <div className="flex justify-between items-center">
                  <button 
                    onClick={() => setOriginalImage(null)}
                    className="text-slate-500 hover:text-slate-800 text-sm font-medium flex items-center"
                  >
                    <Upload className="w-4 h-4 mr-2" /> Upload Different Photo
                  </button>

                  {generatedImage && (
                    <div className="flex gap-2">
                         <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleUseAsSource}
                            leftIcon={<RefreshCw className="w-4 h-4" />}
                          >
                            Keep Editing
                        </Button>
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleDownload}
                            leftIcon={<Download className="w-4 h-4" />}
                          >
                            Download
                        </Button>
                    </div>
                  )}
               </div>
            </div>

            {/* Right Column: Controls */}
            <div className="lg:col-span-4 flex flex-col gap-6">
               
               {/* Panel */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-24">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                    <Sparkles className="w-5 h-5 text-indigo-500 mr-2" />
                    AI Tools
                  </h3>

                  {errorMessage && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                      {errorMessage}
                    </div>
                  )}

                  {/* Custom Prompt */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Custom Prompt
                    </label>
                    <div className="relative">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Make the sky bluer, remove the trash can..."
                        className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 h-24 resize-none"
                      />
                      <div className="absolute bottom-2 right-2">
                         <Button 
                            size="sm" 
                            disabled={!prompt.trim()} 
                            onClick={() => handleGenerate()}
                            isLoading={status === ProcessingStatus.PROCESSING}
                          >
                            Generate
                         </Button>
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-2 bg-white text-xs font-medium text-slate-500 uppercase tracking-wider">Or choose a preset</span>
                    </div>
                  </div>

                  {/* Presets Grid */}
                  <div className="mt-6 space-y-3">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setPrompt(preset.prompt);
                          handleGenerate(preset);
                        }}
                        disabled={status === ProcessingStatus.PROCESSING}
                        className={`w-full flex items-start p-3 rounded-lg border transition-all text-left group
                            ${preset.isSpecial 
                                ? 'border-teal-200 bg-teal-50 hover:bg-teal-100 hover:border-teal-300' 
                                : 'border-slate-200 hover:border-indigo-500 hover:bg-indigo-50'
                            }`}
                      >
                        <div className={`p-2 rounded-md mr-3 transition-colors
                            ${preset.isSpecial 
                                ? 'bg-teal-200 text-teal-700 group-hover:bg-white' 
                                : 'bg-indigo-100 text-indigo-600 group-hover:bg-white'
                            }`}>
                           {preset.icon}
                        </div>
                        <div className="flex-1">
                           <div className="font-medium text-slate-900 text-sm flex items-center justify-between">
                              {preset.label}
                              <ChevronRight className={`w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity ${preset.isSpecial ? 'text-teal-600' : 'text-indigo-400'}`} />
                           </div>
                           <div className="text-xs text-slate-500 mt-0.5">{preset.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                     <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wide mb-2">Pro Tip</h4>
                     <p className="text-xs text-slate-600">
                       The "Smart Thumbnail" tool will auto-resize your image to 26:27 and use AI to fill in any gaps, ensuring the perfect shape without cropping your subject.
                     </p>
                  </div>

               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;