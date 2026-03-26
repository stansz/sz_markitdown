import { useCallback, useState } from 'react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  scientificMode: boolean;
  onScientificModeChange: (enabled: boolean) => void;
  webgpuSupported: boolean;
}

export function FileUpload({
  onFilesSelected,
  scientificMode,
  onScientificModeChange,
  webgpuSupported,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onFilesSelected]
  );

  return (
    <div
      className={`relative group border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
        isDragging
          ? 'border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10'
          : 'border-border/50 hover:border-primary/30 hover:bg-muted/20'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.xls,.pptx,.html,.htm,.msg"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center gap-4">
        <div className={`relative p-4 rounded-2xl transition-all duration-300 ${
          isDragging 
            ? 'bg-primary/15 scale-110 shadow-lg shadow-primary/20' 
            : 'bg-muted/60 group-hover:bg-muted group-hover:scale-105'
        }`}>
          {isDragging ? (
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          )}
          {/* Animated ring on drag */}
          {isDragging && (
            <div className="absolute inset-0 rounded-2xl animate-ping bg-primary/30" />
          )}
        </div>

        <div>
          <p className="text-lg font-semibold text-foreground">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            or click to browse
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {['PDF', 'DOCX', 'XLSX', 'PPTX', 'HTML', 'MSG'].map(format => (
            <span
              key={format}
              className="px-2.5 py-1 text-xs font-medium rounded-full bg-muted/50 text-muted-foreground/70 border border-border/30 group-hover:border-primary/20 group-hover:bg-muted/70 transition-colors"
            >
              {format}
            </span>
          ))}
        </div>

        {/* Scientific Paper Mode Toggle */}
        <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={scientificMode && webgpuSupported}
                  onChange={(e) => onScientificModeChange(e.target.checked)}
                  disabled={!webgpuSupported}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground">
                  Scientific Paper Mode
                </span>
                {!webgpuSupported && (
                  <p className="text-xs text-destructive">
                    WebGPU not supported in this browser
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Enhanced conversion for research papers with tables, figures, and
            complex layouts
          </p>
        </div>
      </div>
    </div>
  );
}
