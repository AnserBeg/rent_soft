import React, { useState } from 'react';
import { ImageUploadSection } from './components/ImageUploadSection';
import { ReportDisplay } from './components/ReportDisplay';
import { UploadedImage, UploadType } from './types';
import { generateDamageReport } from './services/geminiService';
import { ScanSearch, Loader2, AlertCircle, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [beforeImages, setBeforeImages] = useState<UploadedImage[]>([]);
  const [afterImages, setAfterImages] = useState<UploadedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (beforeImages.length === 0 || afterImages.length === 0) {
      setError("Please upload at least one image for both 'Before' and 'After' conditions.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      const result = await generateDamageReport(beforeImages, afterImages);
      setReport(result);
    } catch (err: any) {
      setError(err.message || "Failed to analyze images. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAll = () => {
    setBeforeImages([]);
    setAfterImages([]);
    setReport(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ScanSearch className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Damage Detective <span className="text-indigo-600">AI</span></h1>
          </div>
          <div className="text-xs font-medium px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
             Powered by Gemini Pro
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-fade-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!report ? (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl mb-3">Compare & Detect</h2>
              <p className="text-lg text-slate-600">
                Upload images from before and after the rental period. Our AI will analyze the differences and generate a comprehensive damage report.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Before Section */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                <ImageUploadSection
                  type={UploadType.BEFORE}
                  images={beforeImages}
                  setImages={setBeforeImages}
                />
              </div>

              {/* After Section */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                <ImageUploadSection
                  type={UploadType.AFTER}
                  images={afterImages}
                  setImages={setAfterImages}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 z-30">
               <div className="max-w-7xl mx-auto flex justify-center">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || beforeImages.length === 0 || afterImages.length === 0}
                    className={`
                      relative overflow-hidden group
                      px-8 py-4 rounded-full font-bold text-lg shadow-xl shadow-indigo-500/30 transition-all duration-300 transform
                      ${isAnalyzing || beforeImages.length === 0 || afterImages.length === 0
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 active:scale-95'
                      }
                    `}
                  >
                    <span className="relative z-10 flex items-center gap-3">
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analyzing Images...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Generate Damage Report
                        </>
                      )}
                    </span>
                    {/* Shimmer effect */}
                    {!isAnalyzing && (
                      <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
                    )}
                  </button>
               </div>
            </div>
            
            {/* Bottom spacer for fixed button */}
            <div className="h-24"></div>

          </div>
        ) : (
          <ReportDisplay markdown={report} onReset={resetAll} />
        )}
      </main>
    </div>
  );
};

export default App;
